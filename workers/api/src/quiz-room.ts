/**
 * Dedicated SQLite-backed Durable Object for a single Quiz Arena live session.
 *
 * Designed for ~500 concurrent players + host:
 *   - Uses WebSocket Hibernation API (`acceptWebSocket` + `setWebSocketAutoResponse("ping"/"pong")`).
 *   - Stores room state, answer keys, participant standings, and answers inside DO SQLite
 *     so zero D1 writes happen during live play and evictions never lose state.
 *   - Drives authoritative question deadlines via `state.storage.setAlarm(questionEndsAtMs)`
 *     with a 150 ms network grace window on answer receipts.
 *   - Pre-serializes shared broadcast payloads outside the WebSocket loop to keep CPU minimal.
 */
import {
  cleanScoringConfig,
  rankParticipants,
  scoreQuestionAnswer,
  type LeaderboardEntry,
  type QuizOption,
  type QuizParticipantStatus,
  type QuizParticipantType,
  type QuizQuestionKind,
  type QuizRoomFinalizeExport,
  type QuizRoomInitPayload,
  type QuizScoringConfig,
  type QuizScoringMode,
  type QuizSessionStatus,
  type QuizStateSnapshot,
} from "../../../lib/quiz/types";
import type { Env } from "./env";

interface SocketAttachment {
  pid: string;
  uid: string | null;
  name: string;
  role: "host" | "player";
  exp: number;
}

interface RoomMetaRow {
  session_id: string;
  quiz_id: string;
  join_code: string;
  title: string;
  scoring_mode: QuizScoringMode;
  scoring_config_json: string;
  default_time_limit_sec: number;
  max_participants: number;
  status: QuizSessionStatus;
  current_question_idx: number;
  question_started_at_ms: number | null;
  question_ends_at_ms: number | null;
  remaining_ms: number;
  started_at: string | null;
  ended_at: string | null;
}

interface RoomQuestionRow {
  sort_idx: number;
  id: string;
  kind: QuizQuestionKind;
  prompt_markdown: string;
  media_url: string | null;
  options_json: string;
  answer_key_json: string;
  explanation_markdown: string | null;
  time_limit_sec: number;
  points: number;
  negative_points: number;
}

interface RoomParticipantRow {
  id: string;
  display_name: string;
  participant_type: QuizParticipantType;
  status: QuizParticipantStatus;
  score_total: number;
  correct_count: number;
  avg_response_ms: number;
  answer_count: number;
  total_response_ms: number;
}

const GRACE_MS = 150;
const MAX_FRAME_BYTES = 4096;
const HOST_PROGRESS_THROTTLE_MS = 400;

export class QuizRoom {
  private schemaReady = false;
  private lastHostProgressAt = 0;
  private msgRates = new WeakMap<WebSocket, { sec: number; n: number }>();

  constructor(private readonly state: DurableObjectState, private readonly env: Env) {
    if (typeof WebSocketRequestResponsePair !== "undefined") {
      state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    }
  }

  private get sql() {
    return this.state.storage.sql;
  }

  private ensureSchema(): void {
    if (this.schemaReady) return;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS room_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        session_id TEXT NOT NULL,
        quiz_id TEXT NOT NULL,
        join_code TEXT NOT NULL,
        title TEXT NOT NULL,
        scoring_mode TEXT NOT NULL,
        scoring_config_json TEXT NOT NULL,
        default_time_limit_sec INTEGER NOT NULL,
        max_participants INTEGER NOT NULL,
        status TEXT NOT NULL,
        current_question_idx INTEGER NOT NULL DEFAULT -1,
        question_started_at_ms INTEGER,
        question_ends_at_ms INTEGER,
        remaining_ms INTEGER NOT NULL DEFAULT 0,
        started_at TEXT,
        ended_at TEXT
      );
      CREATE TABLE IF NOT EXISTS room_questions (
        sort_idx INTEGER PRIMARY KEY,
        id TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        prompt_markdown TEXT NOT NULL,
        media_url TEXT,
        options_json TEXT NOT NULL,
        answer_key_json TEXT NOT NULL,
        explanation_markdown TEXT,
        time_limit_sec INTEGER NOT NULL,
        points INTEGER NOT NULL,
        negative_points INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS room_participants (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        participant_type TEXT NOT NULL,
        status TEXT NOT NULL,
        score_total INTEGER NOT NULL DEFAULT 0,
        correct_count INTEGER NOT NULL DEFAULT 0,
        avg_response_ms INTEGER NOT NULL DEFAULT 0,
        answer_count INTEGER NOT NULL DEFAULT 0,
        total_response_ms INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS room_answers (
        id TEXT PRIMARY KEY,
        participant_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        question_idx INTEGER NOT NULL,
        selected_json TEXT NOT NULL,
        is_correct INTEGER NOT NULL,
        points_awarded INTEGER NOT NULL,
        response_ms INTEGER NOT NULL,
        answered_at TEXT NOT NULL,
        UNIQUE(participant_id, question_id)
      );
    `);
    this.schemaReady = true;
  }

  private meta(): RoomMetaRow | null {
    this.ensureSchema();
    const rows = this.sql.exec<Record<string, SqlStorageValue>>("SELECT * FROM room_meta WHERE id = 1").toArray();
    return (rows[0] as unknown as RoomMetaRow | undefined) ?? null;
  }

  private questionAt(idx: number): RoomQuestionRow | null {
    if (idx < 0) return null;
    const rows = this.sql.exec<Record<string, SqlStorageValue>>("SELECT * FROM room_questions WHERE sort_idx = ?", idx).toArray();
    return (rows[0] as unknown as RoomQuestionRow | undefined) ?? null;
  }

  private questionCount(): number {
    const row = this.sql.exec<{ c: number }>("SELECT COUNT(*) AS c FROM room_questions").one();
    return Number(row?.c ?? 0);
  }

  private participantCount(): number {
    const row = this.sql.exec<{ c: number }>("SELECT COUNT(*) AS c FROM room_participants WHERE status = 'JOINED'").one();
    return Number(row?.c ?? 0);
  }

  private answeredCount(questionId: string): number {
    const row = this.sql.exec<{ c: number }>("SELECT COUNT(*) AS c FROM room_answers WHERE question_id = ?", questionId).one();
    return Number(row?.c ?? 0);
  }

  private leaderboard(limit = 20): LeaderboardEntry[] {
    const rows = this.sql
      .exec<Record<string, SqlStorageValue>>(
        `SELECT id, display_name, participant_type, score_total, correct_count, avg_response_ms
         FROM room_participants WHERE status = 'JOINED'
         ORDER BY score_total DESC, correct_count DESC, avg_response_ms ASC LIMIT ?`,
        limit,
      )
      .toArray() as unknown as RoomParticipantRow[];
    const ranked = rankParticipants(
      rows.map((r) => ({
        participantId: r.id,
        displayName: r.display_name,
        participantType: r.participant_type,
        scoreTotal: Number(r.score_total),
        correctCount: Number(r.correct_count),
        avgResponseMs: Number(r.avg_response_ms),
      })),
    );
    return ranked;
  }

  private optionCounts(questionId: string, options: QuizOption[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const o of options) counts[o.id] = 0;
    const rows = this.sql
      .exec<{ selected_json: string }>("SELECT selected_json FROM room_answers WHERE question_id = ?", questionId)
      .toArray();
    for (const r of rows) {
      try {
        const picked = JSON.parse(r.selected_json) as string[];
        for (const id of picked) if (id in counts) counts[id]!++;
      } catch {
        // ignore malformed row
      }
    }
    return counts;
  }

  private buildSnapshot(role: "host" | "player", participantId?: string | null): QuizStateSnapshot | null {
    const m = this.meta();
    if (!m) return null;
    const q = this.questionAt(m.current_question_idx);
    const totalQuestions = this.questionCount();
    const canSeeAnswer = role === "host" || m.status === "REVEAL" || m.status === "FINALIZED";
    const options = q ? (JSON.parse(q.options_json) as QuizOption[]) : [];
    const answerKey = q && canSeeAnswer ? (JSON.parse(q.answer_key_json) as string[]) : null;
    const answeredCount = q ? this.answeredCount(q.id) : 0;

    let me: QuizStateSnapshot["me"] = null;
    if (participantId && role === "player") {
      const pr = this.sql
        .exec<Record<string, SqlStorageValue>>("SELECT * FROM room_participants WHERE id = ?", participantId)
        .toArray()[0] as unknown as RoomParticipantRow | undefined;
      if (pr) {
        const answeredCurrent = q
          ? Boolean(this.sql.exec<{ c: number }>("SELECT COUNT(*) AS c FROM room_answers WHERE participant_id = ? AND question_id = ?", pr.id, q.id).one()?.c)
          : false;
        const higher = this.sql
          .exec<{ c: number }>(
            `SELECT COUNT(*) AS c FROM room_participants WHERE status = 'JOINED' AND (
               score_total > ? OR (score_total = ? AND correct_count > ?)
               OR (score_total = ? AND correct_count = ? AND avg_response_ms < ?)
             )`,
            pr.score_total, pr.score_total, pr.correct_count, pr.score_total, pr.correct_count, pr.avg_response_ms,
          )
          .one();
        me = {
          participantId: pr.id,
          displayName: pr.display_name,
          scoreTotal: Number(pr.score_total),
          correctCount: Number(pr.correct_count),
          avgResponseMs: Number(pr.avg_response_ms),
          rank: Number(higher?.c ?? 0) + 1,
          answeredCurrent,
        };
      }
    }

    return {
      sessionId: m.session_id,
      quizId: m.quiz_id,
      joinCode: m.join_code,
      title: m.title,
      status: m.status,
      currentQuestionIdx: m.current_question_idx,
      totalQuestions,
      questionStartedAt: m.question_started_at_ms ? new Date(m.question_started_at_ms).toISOString() : null,
      questionEndsAt: m.question_ends_at_ms ? new Date(m.question_ends_at_ms).toISOString() : null,
      participantCount: this.participantCount(),
      question: q
        ? {
            id: q.id,
            index: q.sort_idx,
            kind: q.kind,
            promptMarkdown: q.prompt_markdown,
            mediaUrl: q.media_url,
            options,
            timeLimitSec: q.time_limit_sec,
            points: q.points,
          }
        : null,
      answerKey,
      explanationMarkdown: q && canSeeAnswer ? q.explanation_markdown : null,
      optionCounts: q && canSeeAnswer ? this.optionCounts(q.id, options) : null,
      answeredCount,
      leaderboard: m.status === "REVEAL" || m.status === "FINALIZED" || role === "host" ? this.leaderboard(20) : [],
      me,
    };
  }

  private att(ws: WebSocket): SocketAttachment | null {
    try {
      return ws.deserializeAttachment() as SocketAttachment | null;
    } catch {
      return null;
    }
  }

  private send(ws: WebSocket, payload: string): void {
    try {
      ws.send(payload);
    } catch {
      // socket already closing
    }
  }

  private broadcastAll(playerData: string, hostData?: string): void {
    for (const ws of this.state.getWebSockets("r:player")) {
      if (ws.readyState === 1) this.send(ws, playerData);
    }
    const hd = hostData ?? playerData;
    for (const ws of this.state.getWebSockets("r:host")) {
      if (ws.readyState === 1) this.send(ws, hd);
    }
  }

  private initRoom(payload: QuizRoomInitPayload): void {
    this.ensureSchema();
    const existing = this.meta();
    if (!existing) {
      this.sql.exec(
        `INSERT INTO room_meta (id, session_id, quiz_id, join_code, title, scoring_mode, scoring_config_json,
                                default_time_limit_sec, max_participants, status, current_question_idx)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, -1)`,
        payload.sessionId,
        payload.quizId,
        payload.joinCode,
        payload.title,
        payload.scoringMode,
        JSON.stringify(payload.scoringConfig),
        payload.defaultTimeLimitSec,
        payload.maxParticipants,
        payload.status,
      );
      payload.questions.forEach((q, idx) => {
        this.sql.exec(
          `INSERT INTO room_questions (sort_idx, id, kind, prompt_markdown, media_url, options_json, answer_key_json,
                                       explanation_markdown, time_limit_sec, points, negative_points)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(sort_idx) DO NOTHING`,
          idx,
          q.id,
          q.kind,
          q.promptMarkdown,
          q.mediaUrl,
          JSON.stringify(q.options),
          JSON.stringify(q.answerKey),
          q.explanationMarkdown,
          q.timeLimitSec,
          q.points,
          q.negativePoints,
        );
      });
    }
    for (const p of payload.participants) {
      this.sql.exec(
        `INSERT INTO room_participants (id, display_name, participant_type, status)
         VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, status = excluded.status`,
        p.id,
        p.displayName,
        p.participantType,
        p.status,
      );
    }
  }

  private async runHostAction(action: string, opts: { questionIdx?: number; participantId?: string; status?: QuizParticipantStatus } = {}): Promise<QuizStateSnapshot> {
    const m = this.meta();
    if (!m) throw new Error("Quiz room is not initialized.");

    if (action === "kick" && opts.participantId) {
      const nextStatus = opts.status ?? "KICKED";
      this.sql.exec("UPDATE room_participants SET status = ? WHERE id = ?", nextStatus, opts.participantId);
      for (const ws of this.state.getWebSockets(`p:${opts.participantId}`)) {
        try {
          ws.close(4003, nextStatus.toLowerCase());
        } catch {
          // ignore
        }
      }
      return this.buildSnapshot("host")!;
    }

    if (action === "start" || action === "next") {
      if (m.status === "FINALIZING" || m.status === "FINALIZED") throw new Error("Session has already ended.");
      const nextIdx = opts.questionIdx ?? (action === "start" && m.current_question_idx < 0 ? 0 : m.current_question_idx + 1);
      const q = this.questionAt(nextIdx);
      if (!q) throw new Error("No more questions available.");
      const nowMs = Date.now();
      const endsMs = nowMs + q.time_limit_sec * 1000;
      const startedAt = m.started_at ?? new Date(nowMs).toISOString();

      this.sql.exec(
        `UPDATE room_meta SET status = 'QUESTION', current_question_idx = ?, question_started_at_ms = ?,
                              question_ends_at_ms = ?, remaining_ms = 0, started_at = ? WHERE id = 1`,
        nextIdx,
        nowMs,
        endsMs,
        startedAt,
      );
      await this.state.storage.setAlarm(endsMs);

      const playerSnap = this.buildSnapshot("player")!;
      const hostSnap = this.buildSnapshot("host")!;
      this.broadcastAll(JSON.stringify({ t: "question", data: playerSnap }), JSON.stringify({ t: "question", data: hostSnap }));
      return hostSnap;
    }

    if (action === "pause") {
      if (m.status !== "QUESTION") throw new Error("Pause is only valid while a question is active.");
      const rem = Math.max(1000, (m.question_ends_at_ms ?? Date.now()) - Date.now());
      await this.state.storage.deleteAlarm();
      this.sql.exec("UPDATE room_meta SET status = 'PAUSED', remaining_ms = ? WHERE id = 1", rem);
      this.broadcastAll(JSON.stringify({ t: "paused", remainingMs: rem }));
      return this.buildSnapshot("host")!;
    }

    if (action === "resume") {
      if (m.status !== "PAUSED") throw new Error("Resume is only valid while paused.");
      const nowMs = Date.now();
      const endsMs = nowMs + Math.max(1000, m.remaining_ms);
      this.sql.exec("UPDATE room_meta SET status = 'QUESTION', question_ends_at_ms = ?, remaining_ms = 0 WHERE id = 1", endsMs);
      await this.state.storage.setAlarm(endsMs);
      this.broadcastAll(JSON.stringify({ t: "resumed", questionEndsAt: new Date(endsMs).toISOString() }));
      return this.buildSnapshot("host")!;
    }

    if (action === "reveal") {
      await this.triggerReveal();
      return this.buildSnapshot("host")!;
    }

    throw new Error(`Unsupported host action: ${action}`);
  }

  private async triggerReveal(): Promise<void> {
    const m = this.meta();
    if (!m || m.status === "REVEAL" || m.status === "FINALIZING" || m.status === "FINALIZED") return;
    await this.state.storage.deleteAlarm();
    this.sql.exec("UPDATE room_meta SET status = 'REVEAL' WHERE id = 1");

    const hostSnap = this.buildSnapshot("host")!;
    const revealFrame = JSON.stringify({ t: "reveal", data: hostSnap });
    this.broadcastAll(revealFrame, revealFrame);

    // Push individual score deltas once per question to connected players.
    const q = this.questionAt(m.current_question_idx);
    if (!q) return;
    const answers = new Map<string, { isCorrect: boolean; pointsAwarded: number }>();
    for (const r of this.sql.exec<{ participant_id: string; is_correct: number; points_awarded: number }>(
      "SELECT participant_id, is_correct, points_awarded FROM room_answers WHERE question_id = ?",
      q.id,
    )) {
      answers.set(r.participant_id, { isCorrect: r.is_correct === 1, pointsAwarded: Number(r.points_awarded) });
    }
    const ranked = new Map(
      rankParticipants(
        (this.sql
          .exec<Record<string, SqlStorageValue>>("SELECT id, score_total, correct_count, avg_response_ms FROM room_participants WHERE status = 'JOINED'")
          .toArray() as unknown as RoomParticipantRow[]
        ).map((r) => ({
          participantId: r.id,
          scoreTotal: Number(r.score_total),
          correctCount: Number(r.correct_count),
          avgResponseMs: Number(r.avg_response_ms),
        })),
      ).map((r) => [r.participantId, r]),
    );

    for (const ws of this.state.getWebSockets("r:player")) {
      if (ws.readyState !== 1) continue;
      const a = this.att(ws);
      if (!a) continue;
      const p = ranked.get(a.pid);
      if (!p) continue;
      const ans = answers.get(a.pid);
      this.send(
        ws,
        JSON.stringify({
          t: "score",
          qIdx: m.current_question_idx,
          isCorrect: ans?.isCorrect ?? false,
          pointsAwarded: ans?.pointsAwarded ?? 0,
          scoreTotal: p.scoreTotal,
          rank: p.rank,
        }),
      );
    }
  }

  private async exportForFinalize(): Promise<QuizRoomFinalizeExport> {
    const m = this.meta();
    if (!m) throw new Error("Quiz room not initialized.");
    await this.state.storage.deleteAlarm();
    const endedAt = m.ended_at ?? new Date().toISOString();
    if (m.status !== "FINALIZED") {
      this.sql.exec("UPDATE room_meta SET status = 'FINALIZING', ended_at = COALESCE(ended_at, ?) WHERE id = 1", endedAt);
    }

    const pRows = this.sql
      .exec<Record<string, SqlStorageValue>>("SELECT * FROM room_participants")
      .toArray() as unknown as RoomParticipantRow[];
    const rankedJoined = rankParticipants(
      pRows
        .filter((p) => p.status === "JOINED")
        .map((p) => ({
          participantId: p.id,
          scoreTotal: Number(p.score_total),
          correctCount: Number(p.correct_count),
          avgResponseMs: Number(p.avg_response_ms),
        })),
    );
    const rankMap = new Map(rankedJoined.map((r) => [r.participantId, r.rank]));

    const aRows = this.sql
      .exec<{ id: string; participant_id: string; question_id: string; selected_json: string; is_correct: number; points_awarded: number; response_ms: number; answered_at: string }>(
        "SELECT id, participant_id, question_id, selected_json, is_correct, points_awarded, response_ms, answered_at FROM room_answers",
      )
      .toArray();

    return {
      sessionId: m.session_id,
      status: m.status,
      startedAt: m.started_at,
      endedAt,
      participants: pRows.map((p) => ({
        participantId: p.id,
        scoreTotal: Number(p.score_total),
        correctCount: Number(p.correct_count),
        avgResponseMs: Number(p.avg_response_ms),
        rank: rankMap.get(p.id) ?? 0,
      })),
      answers: aRows.map((a) => ({
        id: a.id,
        participantId: a.participant_id,
        questionId: a.question_id,
        selected: JSON.parse(a.selected_json) as string[],
        isCorrect: a.is_correct === 1,
        pointsAwarded: Number(a.points_awarded),
        responseMs: Number(a.response_ms),
        answeredAt: a.answered_at,
      })),
    };
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

    if (path === "/health") {
      return json({ ok: true, connections: this.state.getWebSockets().length });
    }

    if (path === "/init" && req.method === "POST") {
      const payload = (await req.json()) as QuizRoomInitPayload;
      this.initRoom(payload);
      return json({ ok: true });
    }

    if (path === "/sync-participant" && req.method === "POST") {
      const p = (await req.json()) as { id: string; displayName: string; participantType: QuizParticipantType; status: QuizParticipantStatus };
      this.ensureSchema();
      if (this.meta()) {
        this.sql.exec(
          `INSERT INTO room_participants (id, display_name, participant_type, status)
           VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, status = excluded.status`,
          p.id, p.displayName, p.participantType, p.status,
        );
        const count = this.participantCount();
        const ping = JSON.stringify({ t: "participants", count });
        for (const ws of this.state.getWebSockets("r:host")) if (ws.readyState === 1) this.send(ws, ping);
      }
      return json({ ok: true });
    }

    if (path === "/host" && req.method === "POST") {
      const body = (await req.json()) as { action: string; questionIdx?: number; participantId?: string; status?: QuizParticipantStatus };
      try {
        const snap = await this.runHostAction(body.action, body);
        return json({ ok: true, data: snap });
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message : "Host action failed." }, 400);
      }
    }

    if (path === "/state" && req.method === "GET") {
      const role = url.searchParams.get("role") === "host" ? "host" : "player";
      const pid = url.searchParams.get("pid");
      const snap = this.buildSnapshot(role, pid);
      return snap ? json({ ok: true, data: snap }) : json({ ok: false, error: "Uninitialized" }, 404);
    }

    if (path === "/finalize-export" && req.method === "POST") {
      return json({ ok: true, data: await this.exportForFinalize() });
    }

    if (path === "/mark-finalized" && req.method === "POST") {
      const m = this.meta();
      if (m) {
        this.sql.exec("UPDATE room_meta SET status = 'FINALIZED' WHERE id = 1");
        const top = this.leaderboard(20);
        const frame = JSON.stringify({ t: "finalized", leaderboard: top });
        this.broadcastAll(frame, frame);
      }
      return json({ ok: true });
    }

    if (path === "/connect") {
      if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return json({ ok: false }, 426);
      const m = this.meta();
      if (!m) return json({ ok: false, error: "Session room not initialized." }, 404);
      const pid = req.headers.get("x-quiz-pid");
      const uid = req.headers.get("x-quiz-uid") || null;
      const name = req.headers.get("x-quiz-name") || "Participant";
      const role = req.headers.get("x-quiz-role") === "host" ? "host" : "player";
      const exp = Number(req.headers.get("x-quiz-exp") || 0) * 1000;
      if (!pid || !exp) return json({ ok: false }, 400);

      if (role === "player") {
        const p = this.sql.exec<{ status: string }>("SELECT status FROM room_participants WHERE id = ?", pid).toArray()[0];
        if (!p || p.status !== "JOINED") return json({ ok: false, error: "Not permitted." }, 403);
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.state.acceptWebSocket(server, [`r:${role}`, `p:${pid}`]);
      server.serializeAttachment({ pid, uid, name, role, exp } satisfies SocketAttachment);

      const snap = this.buildSnapshot(role, pid);
      if (snap) this.send(server, JSON.stringify({ t: "state", data: snap }));
      return new Response(null, { status: 101, webSocket: client });
    }

    return json({ ok: false }, 404);
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const att = this.att(ws);
    if (!att) return ws.close(4003, "unknown");
    const now = Date.now();
    if (now > att.exp) return ws.close(4001, "renew");
    if (typeof raw !== "string" || raw.length > MAX_FRAME_BYTES) return;

    // Max 5 frames per second per socket.
    const sec = Math.floor(now / 1000);
    const rate = this.msgRates.get(ws);
    if (!rate || rate.sec !== sec) {
      this.msgRates.set(ws, { sec, n: 1 });
    } else {
      rate.n++;
      if (rate.n > 5) return;
    }

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    if (msg.t === "answer" && att.role === "player") {
      const m = this.meta();
      const qIdx = Number(msg.qIdx);
      if (!m || m.status !== "QUESTION" || !Number.isInteger(qIdx) || qIdx !== m.current_question_idx) {
        return this.send(ws, JSON.stringify({ t: "ack", ok: false, code: "QUESTION_NOT_ACTIVE", qIdx }));
      }
      if (!m.question_ends_at_ms || now > m.question_ends_at_ms + GRACE_MS) {
        return this.send(ws, JSON.stringify({ t: "ack", ok: false, code: "TOO_LATE", qIdx }));
      }
      const pRow = this.sql
        .exec<Record<string, SqlStorageValue>>("SELECT * FROM room_participants WHERE id = ?", att.pid)
        .toArray()[0] as unknown as RoomParticipantRow | undefined;
      if (!pRow || pRow.status !== "JOINED") {
        ws.close(4003, "removed");
        return;
      }
      const q = this.questionAt(qIdx);
      if (!q) return;

      const existing = this.sql
        .exec<{ c: number }>("SELECT COUNT(*) AS c FROM room_answers WHERE participant_id = ? AND question_id = ?", att.pid, q.id)
        .one();
      if (Number(existing?.c ?? 0) > 0) {
        return this.send(ws, JSON.stringify({ t: "ack", ok: false, code: "ALREADY_ANSWERED", qIdx }));
      }

      const opts = JSON.parse(q.options_json) as QuizOption[];
      const validIds = new Set(opts.map((o) => o.id));
      const rawSel = Array.isArray(msg.selected) ? msg.selected : typeof msg.selected === "string" ? [msg.selected] : [];
      const selected = [...new Set(rawSel.map((x) => String(x)).filter((id) => validIds.has(id)))];
      if (!selected.length) {
        return this.send(ws, JSON.stringify({ t: "ack", ok: false, code: "INVALID_OPTION", qIdx }));
      }

      const answerKey = JSON.parse(q.answer_key_json) as string[];
      const scoringConfig = cleanScoringConfig(JSON.parse(m.scoring_config_json) as QuizScoringConfig, m.scoring_mode);
      const durationMs = q.time_limit_sec * 1000;
      const responseMs = Math.max(0, Math.min(durationMs, now - (m.question_started_at_ms ?? now)));
      const scored = scoreQuestionAnswer({
        kind: q.kind,
        basePoints: q.points,
        negativePoints: q.negative_points,
        scoringMode: m.scoring_mode,
        scoringConfig,
        timeLimitSec: q.time_limit_sec,
        responseMs,
        selectedIds: selected,
        correctIds: answerKey,
      });

      this.sql.exec(
        `INSERT INTO room_answers (id, participant_id, question_id, question_idx, selected_json, is_correct, points_awarded, response_ms, answered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(participant_id, question_id) DO NOTHING`,
        `qa_${crypto.randomUUID()}`,
        att.pid,
        q.id,
        qIdx,
        JSON.stringify(selected),
        scored.isCorrect ? 1 : 0,
        scored.pointsAwarded,
        responseMs,
        new Date(now).toISOString(),
      );

      const newAnswerCount = Number(pRow.answer_count) + 1;
      const newTotalMs = Number(pRow.total_response_ms) + responseMs;
      const newAvgMs = Math.round(newTotalMs / newAnswerCount);
      this.sql.exec(
        `UPDATE room_participants
         SET score_total = score_total + ?, correct_count = correct_count + ?,
             answer_count = ?, total_response_ms = ?, avg_response_ms = ?
         WHERE id = ?`,
        scored.pointsAwarded,
        scored.isCorrect ? 1 : 0,
        newAnswerCount,
        newTotalMs,
        newAvgMs,
        att.pid,
      );

      this.send(ws, JSON.stringify({ t: "ack", ok: true, qIdx }));

      if (now - this.lastHostProgressAt >= HOST_PROGRESS_THROTTLE_MS) {
        this.lastHostProgressAt = now;
        const ans = this.answeredCount(q.id);
        const total = this.participantCount();
        const prog = JSON.stringify({ t: "progress", qIdx, answeredCount: ans, participantCount: total });
        for (const h of this.state.getWebSockets("r:host")) if (h.readyState === 1) this.send(h, prog);
      }
      return;
    }

    if (msg.t === "host" && att.role === "host" && typeof msg.action === "string") {
      try {
        await this.runHostAction(msg.action, {
          questionIdx: typeof msg.questionIdx === "number" ? msg.questionIdx : undefined,
          participantId: typeof msg.participantId === "string" ? msg.participantId : undefined,
          status: typeof msg.status === "string" ? (msg.status as QuizParticipantStatus) : undefined,
        });
      } catch (e) {
        this.send(ws, JSON.stringify({ t: "error", error: e instanceof Error ? e.message : "Host command failed." }));
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
    } catch {
      // Already closed.
    }
  }

  async webSocketError(_ws: WebSocket): Promise<void> {
    // No D1 write on disconnect to avoid 500-write storms when a quiz finishes.
  }

  async alarm(): Promise<void> {
    await this.triggerReveal();
  }
}
