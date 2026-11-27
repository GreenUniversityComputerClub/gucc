import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuizRoomClient, QuizRoomInitPayload, QuizStateSnapshot } from "@/lib/quiz/types";
import { readPublicQuizByJoinCode, readPublicQuizBySlug, readPublicQuizResults, readPublicQuizzes } from "@/lib/public/quiz";
import { verifyQuizTicket } from "@/lib/server/quiz-live";
import { verifyPass } from "@/lib/server/live";
import { decideApproval } from "@/lib/server/services/approvals";
import { certificateOptions, importPreview } from "@/lib/server/services/certificates";
import { quizHostView, quizView } from "@/lib/server/views/admin";
import {
  createQuiz,
  createQuizSession,
  exportQuizCsv,
  finalizeSession,
  getQuizAdmin,
  getQuizResults,
  hostAction,
  issueQuizCertificates,
  issueQuizTicket,
  joinQuiz,
  kickParticipant,
  publishQuiz,
  reportIncident,
  resolveIncident,
  saveQuizQuestions,
  setQuizModerators,
} from "@/lib/server/services/quizzes";
import { resetGuard } from "../../workers/api/src/guard";
import { createWorld, type TestWorld } from "../support/d1";

// Loaded dynamically so root tsc (DOM types) does not traverse Workers-only globals
// (@cloudflare/workers-types is checked separately by `tsc -p workers/api --noEmit`).
const QUIZ_ROOM_MOD = "../../workers/api/src/quiz-room";
const QUIZ_EDGE_MOD = "../../workers/api/src/quiz";
type QuizRoomInstance = { fetch(req: Request): Promise<Response>; webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void>; alarm(): Promise<void> };
let QuizRoomClass: new (state: never, env: never) => QuizRoomInstance;
let handleQuizWsFn: (env: never, req: Request) => Promise<Response>;

/**
 * In-memory DurableObjectState mock backed by node:sqlite so we exercise the
 * actual QuizRoom Durable Object implementation end-to-end inside Vitest.
 */
function createMockRoom() {
  const sqlite = new DatabaseSync(":memory:");
  let alarmAt: number | null = null;
  const sockets = new Set<FakeWebSocket>();
  const socketTags = new Map<FakeWebSocket, string[]>();

  class FakeWebSocket {
    readyState = 1;
    sent: string[] = [];
    closed: { code: number; reason: string } | null = null;
    private attachment: unknown = null;
    send(data: string) {
      this.sent.push(data);
    }
    close(code = 1000, reason = "") {
      this.readyState = 3;
      this.closed = { code, reason };
    }
    serializeAttachment(v: unknown) {
      this.attachment = v;
    }
    deserializeAttachment() {
      return this.attachment;
    }
  }

  const sql = {
    exec(query: string, ...bindings: unknown[]) {
      const trimmed = query.trim();
      if (/^(CREATE|DROP|ALTER)/i.test(trimmed) && bindings.length === 0) {
        sqlite.exec(trimmed);
        return { toArray: () => [], one: () => undefined, [Symbol.iterator]: function* () {} };
      }
      const stmt = sqlite.prepare(trimmed);
      const isSelect = /^(SELECT|WITH)\b/i.test(trimmed) || /\bRETURNING\b/i.test(trimmed);
      const rows = isSelect ? (stmt.all(...(bindings as never[])) as Record<string, unknown>[]) : (stmt.run(...(bindings as never[])), []);
      return {
        toArray: () => rows,
        one: () => rows[0],
        *[Symbol.iterator]() {
          for (const r of rows) yield r;
        },
      };
    },
  };

  const state = {
    storage: {
      sql,
      async setAlarm(ts: number | Date) {
        alarmAt = typeof ts === "number" ? ts : ts.getTime();
      },
      async deleteAlarm() {
        alarmAt = null;
      },
      async getAlarm() {
        return alarmAt;
      },
    },
    acceptWebSocket(ws: FakeWebSocket, tags: string[] = []) {
      sockets.add(ws);
      socketTags.set(ws, tags);
    },
    getWebSockets(tag?: string) {
      const arr = [...sockets];
      return tag ? arr.filter((ws) => (socketTags.get(ws) ?? []).includes(tag)) : arr;
    },
  };

  const room = new QuizRoomClass(state as never, {} as never);

  function attachFakeSocket(opts: { pid: string; uid?: string | null; name: string; role: "host" | "player"; exp?: number }) {
    const ws = new FakeWebSocket();
    state.acceptWebSocket(ws, [`r:${opts.role}`, `p:${opts.pid}`]);
    ws.serializeAttachment({
      pid: opts.pid,
      uid: opts.uid ?? null,
      name: opts.name,
      role: opts.role,
      exp: opts.exp ?? Date.now() + 600_000,
    });
    return ws;
  }

  const client: QuizRoomClient = {
    async ensureInitialized(payload: QuizRoomInitPayload) {
      await room.fetch(new Request("https://quiz/init", { method: "POST", body: JSON.stringify(payload) }));
    },
    async syncParticipant(sessionId, p) {
      void sessionId;
      await room.fetch(new Request("https://quiz/sync-participant", { method: "POST", body: JSON.stringify(p) }));
    },
    async hostAction(sessionId, action, opts = {}) {
      void sessionId;
      const res = await room.fetch(new Request("https://quiz/host", { method: "POST", body: JSON.stringify({ action, ...opts }) }));
      const body = (await res.json()) as { ok: boolean; data?: QuizStateSnapshot; error?: string };
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "failed");
      return body.data;
    },
    async getState(sessionId, opts = {}) {
      void sessionId;
      const qs = new URLSearchParams();
      if (opts.role) qs.set("role", opts.role);
      if (opts.participantId) qs.set("pid", opts.participantId);
      const res = await room.fetch(new Request(`https://quiz/state?${qs.toString()}`));
      if (res.status === 404) return null;
      return ((await res.json()) as { data: QuizStateSnapshot }).data;
    },
    async finalizeExport() {
      const res = await room.fetch(new Request("https://quiz/finalize-export", { method: "POST" }));
      return ((await res.json()) as { data: Awaited<ReturnType<QuizRoomClient["finalizeExport"]>> }).data;
    },
    async markFinalized() {
      await room.fetch(new Request("https://quiz/mark-finalized", { method: "POST" }));
    },
  };

  return { room, client, attachFakeSocket, getAlarm: () => alarmAt };
}

let w: TestWorld;
let pres: string;
let member: string;
let exec: string;

beforeEach(async () => {
  QuizRoomClass ??= ((await import(/* @vite-ignore */ QUIZ_ROOM_MOD)) as { QuizRoom: typeof QuizRoomClass }).QuizRoom;
  handleQuizWsFn ??= ((await import(/* @vite-ignore */ QUIZ_EDGE_MOD)) as { handleQuizWs: typeof handleQuizWsFn }).handleQuizWs;
  resetGuard();
  w = await createWorld();
  pres = await w.user({ email: "pres@x.bd", roles: ["member"], positions: ["president"], name: "President" });
  member = await w.user({ email: "member@green.edu.bd", roles: ["member"], name: "Student One" });
  exec = await w.user({ email: "exec@x.bd", roles: ["member"], positions: ["executive-member"], name: "Exec" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Quiz Arena authoring, permissions & approval", () => {
  it("enforces permissions via governance engine and allows assigned quiz moderators", async () => {
    await expect(createQuiz(await w.ctx(member), { title: "Hackathon Trivia" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const { id, slug } = await createQuiz(await w.ctx(pres), {
      title: "Spring CSE Showdown",
      topic: "technical",
      themePreset: "CYBER_ARENA",
      scoringMode: "SPEED_BONUS",
      scoringConfig: { speedBonusMax: 500, incorrectPenalty: 0 },
    });
    expect(slug).toBe("spring-cse-showdown");

    const saved = await saveQuizQuestions(await w.ctx(pres), id, [
      {
        kind: "MCQ",
        promptMarkdown: "Which data structure uses LIFO?",
        options: [{ id: "a", text: "Queue" }, { id: "b", text: "Stack" }],
        answerKey: ["b"],
        points: 1000,
        timeLimitSec: 15,
      },
      {
        kind: "MULTI_SELECT",
        promptMarkdown: "Select valid HTTP methods:",
        options: [{ id: "get", text: "GET" }, { id: "post", text: "POST" }, { id: "foo", text: "FOO" }],
        answerKey: ["get", "post"],
        points: 1000,
        timeLimitSec: 20,
      },
    ]);
    expect(saved.count).toBe(2);

    // Executive member without moderator assignment cannot read or host, unless granted & assigned.
    await expect(getQuizAdmin(await w.ctx(exec), id)).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Grant ASSIGNED quizzes permissions to executive role in test DB, then assign exec to quiz
    w.sqlite.exec(`INSERT INTO role_permissions (role_id, permission_id, scope, scope_value) VALUES
      ('role:executive', 'perm:quizzes.read', 'ASSIGNED', ''),
      ('role:executive', 'perm:quizzes.update', 'ASSIGNED', ''),
      ('role:executive', 'perm:quizzes.host', 'ASSIGNED', '')`);
    await setQuizModerators(await w.ctx(pres), id, [{ userId: exec, canEdit: false, canHost: true }]);
    const execView = await getQuizAdmin(await w.ctx(exec), id);
    expect(execView.capabilities.host).toBe(true);
    expect(execView.capabilities.publish).toBe(false);

    // Assigned executive attempts to publish -> routes through approval workflow
    const sub = await publishQuiz(await w.ctx(exec), id);
    expect(sub.outcome).toBe("PENDING_APPROVAL");
    expect(sub.requestId).toBeTruthy();

    await decideApproval(await w.ctx(pres), sub.requestId!, "APPROVE", "Looks good");
    const pub = await readPublicQuizBySlug(w.db, slug);
    expect(pub).not.toBeNull();
    expect(pub!.questionCount).toBe(2);
    expect(JSON.stringify(pub)).not.toContain("answerKey");
  });
});

describe("Quiz Arena registration, live QuizRoom DO, finalize & certificates", () => {
  it("runs a complete 500-ready live quiz flow without answer-key leaks, duplicates, or late answers", async () => {
    const mock = createMockRoom();
    const ctxWithDo = async (uid: string | null) => ({ ...(await w.ctx(uid)), quizRoom: mock.client });

    const { id: quizId, slug } = await createQuiz(await ctxWithDo(pres), {
      title: "Orientation Live Quiz",
      scoringMode: "SPEED_BONUS",
      scoringConfig: { speedBonusMax: 500, incorrectPenalty: 100 },
    });
    await saveQuizQuestions(await ctxWithDo(pres), quizId, [
      {
        kind: "MCQ",
        promptMarkdown: "What year was GUCC founded?",
        options: [{ id: "a", text: "2014" }, { id: "b", text: "2015" }, { id: "c", text: "2016" }],
        answerKey: ["c"],
        explanationMarkdown: "Founded in 2016!",
        points: 1000,
        timeLimitSec: 15,
      },
      {
        kind: "TRUE_FALSE",
        promptMarkdown: "D1 is SQLite.",
        options: [{ id: "t", text: "True" }, { id: "f", text: "False" }],
        answerKey: ["t"],
        points: 1000,
        timeLimitSec: 15,
      },
    ]);
    await publishQuiz(await ctxWithDo(pres), quizId);

    const session = await createQuizSession(await ctxWithDo(pres), quizId, { maxParticipants: 3 });

    // Student & guest joins
    const aliceJoin = await joinQuiz(await ctxWithDo(member), { joinCode: session.joinCode, participantType: "STUDENT" });
    const bobJoin = await joinQuiz(await ctxWithDo(null), {
      joinCode: session.joinCode,
      participantType: "GUEST",
      displayName: "Bob Guest",
      email: "bob@example.edu",
      institution: "DU",
    });
    const carolJoin = await joinQuiz(await ctxWithDo(null), {
      joinCode: session.joinCode,
      participantType: "STUDENT",
      displayName: "Carol Student",
      email: "carol@green.edu.bd",
      studentId: "232002011",
    });

    // Fourth join rejected at capacity (maxParticipants = 3)
    await expect(
      joinQuiz(await ctxWithDo(null), {
        joinCode: session.joinCode,
        participantType: "GUEST",
        displayName: "Late Dave",
        email: "dave@example.edu",
        institution: "BRACU",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Duplicate email rejected when not presenting matching cookie/session
    await expect(
      joinQuiz(await ctxWithDo(null), {
        joinCode: session.joinCode,
        participantType: "GUEST",
        displayName: "Bob Spoof",
        email: "BOB@EXAMPLE.EDU",
        institution: "BUET",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Matching token reconnect succeeds cleanly
    const aliceReconnect = await joinQuiz(await ctxWithDo(null), {
      joinCode: session.joinCode,
      participantToken: aliceJoin.participantToken,
    });
    expect(aliceReconnect.participantId).toBe(aliceJoin.participantId);

    // WebSocket ticket domain isolation: quiz ticket must NOT pass live-hub verifyPass
    const verifiedQuizTicket = await verifyQuizTicket((await w.ctx(null)).env, aliceJoin.ticket);
    expect(verifiedQuizTicket).toMatchObject({ pid: aliceJoin.participantId, role: "player", sid: session.sessionId });
    expect(await verifyPass((await w.ctx(null)).env, aliceJoin.ticket, "live")).toBeNull();

    // Public listing & code resolution omit answer keys
    const list = await readPublicQuizzes(w.db);
    expect(list.some((q) => q.slug === slug && q.activeSession?.joinCode === session.joinCode)).toBe(true);
    const byCode = await readPublicQuizByJoinCode(w.db, session.joinCode);
    expect(byCode?.session.participantCount).toBe(3);

    // Pin clock before creating sockets so socket attachments have valid future exp
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-01T10:00:00.000Z"));

    // Connect fake sockets into DO
    const hostWs = mock.attachFakeSocket({ pid: `host:${pres}`, uid: pres, name: "President", role: "host" });
    const aliceWs = mock.attachFakeSocket({ pid: aliceJoin.participantId, uid: member, name: aliceJoin.displayName, role: "player" });
    const bobWs = mock.attachFakeSocket({ pid: bobJoin.participantId, name: bobJoin.displayName, role: "player" });
    const carolWs = mock.attachFakeSocket({ pid: carolJoin.participantId, name: carolJoin.displayName, role: "player" });

    // Host starts question 0
    const startSnap = await hostAction(await ctxWithDo(pres), session.sessionId, { action: "start" });
    expect(startSnap.status).toBe("QUESTION");
    expect(startSnap.currentQuestionIdx).toBe(0);
    expect(mock.getAlarm()).toBe(Date.now() + 15_000);

    // Player broadcast must NOT contain answerKey or explanation
    const aliceQFrame = JSON.parse(aliceWs.sent.at(-1)!);
    expect(aliceQFrame.t).toBe("question");
    expect(aliceQFrame.data.answerKey).toBeNull();
    expect(aliceQFrame.data.question.options).toHaveLength(3);

    // Alice answers correctly at +2000ms
    vi.advanceTimersByTime(2000);
    await mock.room.webSocketMessage(aliceWs as unknown as WebSocket, JSON.stringify({ t: "answer", qIdx: 0, selected: ["c"] }));
    const aliceAck = JSON.parse(aliceWs.sent.at(-1)!);
    expect(aliceAck).toEqual({ t: "ack", ok: true, qIdx: 0 });
    expect(aliceAck.isCorrect).toBeUndefined(); // not leaked before REVEAL

    // Duplicate answer rejected
    await mock.room.webSocketMessage(aliceWs as unknown as WebSocket, JSON.stringify({ t: "answer", qIdx: 0, selected: ["b"] }));
    expect(JSON.parse(aliceWs.sent.at(-1)!)).toMatchObject({ t: "ack", ok: false, code: "ALREADY_ANSWERED" });

    // Host pauses for 5s and resumes -> timer extended proportionally
    await hostAction(await ctxWithDo(pres), session.sessionId, { action: "pause" });
    vi.advanceTimersByTime(5000);
    await hostAction(await ctxWithDo(pres), session.sessionId, { action: "resume" });

    // Bob submits invalid option -> rejected; then submits wrong option -> accepted
    await mock.room.webSocketMessage(bobWs as unknown as WebSocket, JSON.stringify({ t: "answer", qIdx: 0, selected: ["bogus"] }));
    expect(JSON.parse(bobWs.sent.at(-1)!)).toMatchObject({ t: "ack", ok: false, code: "INVALID_OPTION" });
    await mock.room.webSocketMessage(bobWs as unknown as WebSocket, JSON.stringify({ t: "answer", qIdx: 0, selected: ["a"] }));
    expect(JSON.parse(bobWs.sent.at(-1)!)).toEqual({ t: "ack", ok: true, qIdx: 0 });

    // Advance past deadline + 200ms -> Carol's answer rejected as TOO_LATE
    vi.advanceTimersByTime(13_300);
    await mock.room.webSocketMessage(carolWs as unknown as WebSocket, JSON.stringify({ t: "answer", qIdx: 0, selected: ["c"] }));
    expect(JSON.parse(carolWs.sent.at(-1)!)).toMatchObject({ t: "ack", ok: false, code: "TOO_LATE" });

    // Alarm fires -> REVEAL broadcasts answerKey, optionCounts, leaderboard, and individual score
    await mock.room.alarm();
    const revealFrame = JSON.parse(aliceWs.sent.find((s) => JSON.parse(s).t === "reveal")!);
    expect(revealFrame.data.answerKey).toEqual(["c"]);
    expect(revealFrame.data.optionCounts).toEqual({ a: 1, b: 0, c: 1 });
    const scoreFrame = JSON.parse(aliceWs.sent.at(-1)!);
    expect(scoreFrame.t).toBe("score");
    expect(scoreFrame.isCorrect).toBe(true);
    expect(scoreFrame.pointsAwarded).toBeGreaterThan(1000);
    expect(scoreFrame.rank).toBe(1);

    vi.useRealTimers();

    // Host kicks Carol -> closes Carol's socket 4003 & marks KICKED in D1
    await kickParticipant(await ctxWithDo(pres), session.sessionId, carolJoin.participantId, "KICKED", "Disruptive");
    expect(carolWs.closed?.code).toBe(4003);
    await expect(issueQuizTicket(await ctxWithDo(null), { sessionId: session.sessionId, participantToken: carolJoin.participantToken })).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Host finalizes -> flushes DO answers & standings to D1 cleanly
    const fin = await finalizeSession(await ctxWithDo(pres), session.sessionId);
    expect(fin.status).toBe("FINALIZED");
    expect(hostWs.sent.some((s) => JSON.parse(s).t === "finalized")).toBe(true);

    // Public results work and expose ZERO PII (no email, phone, token_hash)
    const pubResults = await readPublicQuizResults(w.db, session.sessionId);
    expect(pubResults).not.toBeNull();
    expect(pubResults!.leaderboard).toHaveLength(2); // Alice + Bob (Carol was KICKED)
    expect(pubResults!.leaderboard[0]!.displayName).toBe(aliceJoin.displayName);
    expect(JSON.stringify(pubResults)).not.toContain("bob@example.edu");
    expect(JSON.stringify(pubResults)).not.toContain("member@green.edu.bd");

    // Personal breakdown via participant token
    const myRes = await getQuizResults(await ctxWithDo(null), session.sessionId, bobJoin.participantToken);
    expect(myRes.me?.answers[0]?.pointsAwarded).toBe(-100);

    // Certificates bridge: issue top 1 ACHIEVEMENT certificate without burning email quota
    const certBatch = await issueQuizCertificates(await ctxWithDo(pres), session.sessionId, { topN: 1 });
    expect(certBatch.issued).toBe(1);
    expect(w.emails).toHaveLength(0);

    // Incident reporting & resolution
    const inc = await reportIncident(await ctxWithDo(member), session.sessionId, { kind: "BUG", reason: "Option C flickered briefly" });
    await resolveIncident(await ctxWithDo(pres), inc.id, { status: "DISMISSED", note: "Verified cache" });
    expect(w.sqlite.prepare("SELECT status FROM quiz_incidents WHERE id = ?").get(inc.id)).toEqual({ status: "DISMISSED" });

    // Phase 3 dashboard views, CSV export & certificate wizard bridge
    const qView = await quizView(await ctxWithDo(pres), quizId);
    expect(qView.sessions.some((s) => s.id === session.sessionId)).toBe(true);
    expect(qView.incidents).toHaveLength(1);

    const hView = await quizHostView(await ctxWithDo(pres), session.sessionId);
    expect(hView.participants).toHaveLength(3);
    expect(hView.questions).toHaveLength(2);
    expect(hView.state?.status).toBe("FINALIZED");

    const exported = await exportQuizCsv(await w.ctx(pres), session.sessionId);
    expect(exported.filename).toMatch(/^quiz-orientation-live-quiz-.*\.csv$/);
    expect(exported.csv).toContain('"Rank","Display Name","Type"');
    expect(exported.csv).toContain(aliceJoin.displayName);
    expect(exported.csv).toContain("bob@example.edu");

    const certOpts = await certificateOptions(await w.ctx(pres));
    expect(certOpts.quizSessions.some((qs) => qs.id === session.sessionId)).toBe(true);
    const certPreview = await importPreview(await w.ctx(pres), { kind: "quiz", sessionId: session.sessionId, topN: 1 });
    expect(certPreview.rows).toHaveLength(1);
    expect(certPreview.rows[0]?.name).toBe(aliceJoin.displayName);
    expect(certPreview.rows[0]?.rank).toBe("#1");

    // Phase 4 public read model extensions (latestFinalizedSession + slug-based results lookup)
    const afterFinQuiz = await readPublicQuizBySlug(w.db, slug);
    expect(afterFinQuiz?.activeSession).toBeNull();
    expect(afterFinQuiz?.latestFinalizedSession?.id).toBe(session.sessionId);
    const bySlugResults = await readPublicQuizResults(w.db, slug);
    expect(bySlugResults?.sessionId).toBe(session.sessionId);
    expect(bySlugResults?.leaderboard[0]?.displayName).toBe(aliceJoin.displayName);
  });
});

describe("Quiz Arena NAT-tolerant /v1/quiz/ws edge guard", () => {
  it("protects campus NAT IPs for valid tickets while blocking invalid ticket floods", async () => {
    const mockEnv = {
      DB: w.db.raw as never,
      QUIZ_ROOM: {} as never,
      APP_ENV: "production",
      FRONTEND_ORIGIN: "https://gucc.green.edu.bd",
      AUTH_SECRET: "test-auth-secret-0123456789abcdef",
    };

    // Attacker sends 30 invalid tickets -> 31st hits 429 RATE_LIMITED
    for (let i = 0; i < 30; i++) {
      const r = await handleQuizWsFn(
        mockEnv as never,
        new Request("https://api.test/v1/quiz/ws?t=bogus.token", {
          headers: { Upgrade: "websocket", Origin: "https://gucc.green.edu.bd", "cf-connecting-ip": "203.0.113.99" },
        }),
      );
      expect(r.status).toBe(401);
    }
    const blocked = await handleQuizWsFn(
      mockEnv as never,
      new Request("https://api.test/v1/quiz/ws?t=bogus.token", {
        headers: { Upgrade: "websocket", Origin: "https://gucc.green.edu.bd", "cf-connecting-ip": "203.0.113.99" },
      }),
    );
    expect(blocked.status).toBe(429);

    // Meanwhile 50 distinct students sharing 1 GUB auditorium NAT IP pass without 429
    const stubFetch = vi.fn(async () => new Response(null, { status: 200 }));
    const campusEnv = {
      ...mockEnv,
      QUIZ_ROOM: { idFromName: () => "room_id", get: () => ({ fetch: stubFetch }) } as never,
    };
    const ctx = await w.ctx(null);
    for (let i = 0; i < 50; i++) {
      const ticket = await verifyPassFakeSign(ctx, i);
      const res = await handleQuizWsFn(
        campusEnv as never,
        new Request(`https://api.test/v1/quiz/ws?t=${encodeURIComponent(ticket)}`, {
          headers: { Upgrade: "websocket", Origin: "https://gucc.green.edu.bd", "cf-connecting-ip": "103.99.0.1" },
        }),
      );
      expect(res.status).toBe(200);
    }
    expect(stubFetch).toHaveBeenCalledTimes(50);
  });
});

async function verifyPassFakeSign(ctx: Awaited<ReturnType<TestWorld["ctx"]>>, idx: number) {
  const { signQuizTicket } = await import("@/lib/server/quiz-live");
  return signQuizTicket(ctx, { sid: "qses_1", qid: "qiz_1", pid: `qp_${idx}`, uid: null, name: `P${idx}`, role: "player" });
}
