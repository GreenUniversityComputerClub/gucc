import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuizRoomClient, QuizRoomInitPayload, QuizStateSnapshot } from "@/lib/quiz/types";
import { readPublicQuizBySlug, readPublicQuizResults } from "@/lib/public/quiz";
import {
  createQuiz,
  createQuizSession,
  finalizeSession,
  hostAction,
  issueQuizCertificates,
  joinQuiz,
  publishQuiz,
  saveQuizQuestions,
} from "@/lib/server/services/quizzes";
import { createWorld, type TestWorld } from "../support/d1";

// Loaded dynamically so root tsc excludes Cloudflare-only globals in workers/api.
const QUIZ_ROOM_MOD = "../../workers/api/src/quiz-room";
const WORKER_ENTRY = "../../workers/api/src/index";
type QuizRoomInstance = { fetch(req: Request): Promise<Response>; webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void>; alarm(): Promise<void> };
let QuizRoomClass: new (state: never, env: never) => QuizRoomInstance;
let worker: { fetch(req: Request, env: Record<string, unknown>): Promise<Response> };

function createScaleRoom() {
  const sqlite = new DatabaseSync(":memory:");
  let alarmAt: number | null = null;
  const sockets = new Set<FakeWebSocket>();
  const socketTags = new Map<FakeWebSocket, string[]>();

  class FakeWebSocket {
    readyState = 1;
    sentCount = 0;
    lastFrame = "";
    framesByType: Record<string, number> = {};
    private attachment: unknown = null;
    send(data: string) {
      this.sentCount++;
      this.lastFrame = data;
      try {
        const parsed = JSON.parse(data) as { t?: string };
        const t = parsed.t ?? "unknown";
        this.framesByType[t] = (this.framesByType[t] ?? 0) + 1;
      } catch {
        // non-JSON frame
      }
    }
    close() {
      this.readyState = 3;
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
      exp: opts.exp ?? Date.now() + 3_600_000,
    });
    return ws;
  }

  const client: QuizRoomClient = {
    async ensureInitialized(payload: QuizRoomInitPayload) {
      await room.fetch(new Request("https://quiz/init", { method: "POST", body: JSON.stringify(payload) }));
    },
    async syncParticipant(_sessionId, p) {
      await room.fetch(new Request("https://quiz/sync-participant", { method: "POST", body: JSON.stringify(p) }));
    },
    async hostAction(_sessionId, action, opts = {}) {
      const res = await room.fetch(new Request("https://quiz/host", { method: "POST", body: JSON.stringify({ action, ...opts }) }));
      const body = (await res.json()) as { ok: boolean; data?: QuizStateSnapshot; error?: string };
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "failed");
      return body.data;
    },
    async getState(_sessionId, opts = {}) {
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

beforeEach(async () => {
  QuizRoomClass ??= ((await import(/* @vite-ignore */ QUIZ_ROOM_MOD)) as { QuizRoom: typeof QuizRoomClass }).QuizRoom;
  worker ??= ((await import(/* @vite-ignore */ WORKER_ENTRY)) as { default: typeof worker }).default;
  w = await createWorld();
});

describe("Quiz Arena 500-player concurrency & chunked D1 pipeline", () => {
  it("handles 500 campus-NAT joins, 500 simultaneous WebSockets across 4 rounds, chunked D1 finalize, and 500 certificates with 0 emails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-01T10:00:00.000Z"));
    try {
      const pres = await w.user({ email: "pres@green.edu.bd", roles: ["member"], positions: ["president"], name: "Quiz Host" });
      const mock = createScaleRoom();
      const ctxWithDo = async (uid: string | null, ipHash?: string) => ({
        ...(await w.ctx(uid, ipHash ? { ipHash } : {})),
        quizRoom: mock.client,
      });

      const { id: quizId, slug } = await createQuiz(await ctxWithDo(pres), {
        title: "Mega GUB CSE Carnival Bowl",
        scoringMode: "SPEED_BONUS",
        scoringConfig: { speedBonusMax: 500, incorrectPenalty: 100, partialCredit: true },
      });

      await saveQuizQuestions(await ctxWithDo(pres), quizId, [
        {
          kind: "MCQ",
          promptMarkdown: "Which complexity class contains problems verifiable in polynomial time?",
          options: [{ id: "p", text: "P" }, { id: "np", text: "NP" }, { id: "exp", text: "EXP" }],
          answerKey: ["np"],
          points: 1000,
          timeLimitSec: 20,
        },
        {
          kind: "TRUE_FALSE",
          promptMarkdown: "Cloudflare Durable Objects execute single-threaded per object ID.",
          options: [{ id: "t", text: "True" }, { id: "f", text: "False" }],
          answerKey: ["t"],
          points: 1000,
          timeLimitSec: 15,
        },
        {
          kind: "MULTI_SELECT",
          promptMarkdown: "Which HTTP status codes indicate 2xx success?",
          options: [{ id: "200", text: "200" }, { id: "201", text: "201" }, { id: "404", text: "404" }],
          answerKey: ["200", "201"],
          points: 1000,
          timeLimitSec: 25,
        },
        {
          kind: "MCQ",
          promptMarkdown: "What port does HTTPS use by default?",
          options: [{ id: "80", text: "80" }, { id: "443", text: "443" }, { id: "22", text: "22" }],
          answerKey: ["443"],
          points: 1000,
          timeLimitSec: 15,
        },
      ]);
      await publishQuiz(await ctxWithDo(pres), quizId);

      const session = await createQuizSession(await ctxWithDo(pres), quizId, { maxParticipants: 600 });

      // 500 distinct players sharing ONE campus auditorium NAT IP pass quizzes.join (limit: 600 / 10min).
      const PLAYER_COUNT = 500;
      const joined: Array<{ participantId: string; displayName: string; participantType: "STUDENT" | "GUEST" }> = [];
      for (let i = 0; i < PLAYER_COUNT; i++) {
        const isStudent = i < 300;
        const j = await joinQuiz(await ctxWithDo(null, "gub-auditorium-nat-ip"), {
          joinCode: session.joinCode,
          participantType: isStudent ? "STUDENT" : "GUEST",
          displayName: `Contestant ${String(i + 1).padStart(3, "0")}`,
          email: `player${i}@${isStudent ? "green.edu.bd" : "guest.edu"}`,
          ...(isStudent ? { studentId: String(232001000 + i) } : { institution: `University ${i % 12}` }),
        });
        joined.push({ participantId: j.participantId, displayName: j.displayName, participantType: isStudent ? "STUDENT" : "GUEST" });
      }
      expect(joined).toHaveLength(500);

      // Attach 500 simultaneous player sockets + 1 host socket to QuizRoom DO.
      const hostWs = mock.attachFakeSocket({ pid: `host:${pres}`, uid: pres, name: "Quiz Host", role: "host" });
      const playerSockets = joined.map((p) =>
        mock.attachFakeSocket({ pid: p.participantId, name: p.displayName, role: "player" }),
      );

      // Simulate 4 full rounds across all 500 simultaneous connections (= 2,000 answers).
      const roundSpecs = [
        { action: "start" as const, correct: ["np"], wrong: ["p"] },
        { action: "next" as const, correct: ["t"], wrong: ["f"] },
        { action: "next" as const, correct: ["200", "201"], wrong: ["404"] },
        { action: "next" as const, correct: ["443"], wrong: ["80"] },
      ];

      for (let qIdx = 0; qIdx < roundSpecs.length; qIdx++) {
        const spec = roundSpecs[qIdx]!;
        const snap = await hostAction(await ctxWithDo(pres), session.sessionId, { action: spec.action });
        expect(snap.status).toBe("QUESTION");
        expect(snap.currentQuestionIdx).toBe(qIdx);

        // Verify all 500 player sockets received non-leaking question frame.
        for (const ws of playerSockets) {
          expect(ws.framesByType.question).toBe(qIdx + 1);
          const qMsg = JSON.parse(ws.lastFrame);
          expect(qMsg.t).toBe("question");
          expect(qMsg.data.answerKey).toBeNull();
        }

        // Advance time slightly and blast 500 concurrent WebSocket answers into DO.
        vi.advanceTimersByTime(1500);
        for (let i = 0; i < PLAYER_COUNT; i++) {
          const picked = i % 5 === 0 ? spec.wrong : spec.correct;
          await mock.room.webSocketMessage(
            playerSockets[i] as unknown as WebSocket,
            JSON.stringify({ t: "answer", qIdx, selected: picked }),
          );
          expect(JSON.parse(playerSockets[i]!.lastFrame)).toEqual({ t: "ack", ok: true, qIdx });
        }

        // Reveal via hostAction (or alarm) -> verifies broadcast to 500 sockets + individualized score delta.
        const rev = await hostAction(await ctxWithDo(pres), session.sessionId, { action: "reveal" });
        expect(rev.status).toBe("REVEAL");
        const optionTotal = Object.values(rev.optionCounts ?? {}).reduce((a, b) => a + b, 0);
        // Question 2 (MULTI_SELECT) selects 2 options per correct voter + 1 per wrong voter; total >= 500.
        expect(optionTotal).toBeGreaterThanOrEqual(500);

        for (const ws of playerSockets) {
          expect(ws.framesByType.reveal).toBe(qIdx + 1);
          expect(ws.framesByType.score).toBe(qIdx + 1);
        }
      }

      // Host progress updates must stay throttled (far fewer than 2,000 individual progress frames).
      expect(hostWs.framesByType.progress ?? 0).toBeLessThan(20);

      // Finalize flushes 2,000 quiz_answers (500-row json_each chunks) + 500 ranked participants (250-row chunks) into D1.
      const fin = await finalizeSession(await ctxWithDo(pres), session.sessionId);
      expect(fin.status).toBe("FINALIZED");

      const answerCountRow = w.sqlite.prepare("SELECT COUNT(*) AS c FROM quiz_answers WHERE session_id = ?").get(session.sessionId) as { c: number };
      expect(answerCountRow.c).toBe(2000);

      const rankCountRow = w.sqlite
        .prepare("SELECT COUNT(*) AS c FROM quiz_participants WHERE session_id = ? AND rank IS NOT NULL AND rank >= 1")
        .get(session.sessionId) as { c: number };
      expect(rankCountRow.c).toBe(500);

      // Issue certificates for ALL 500 participants across two MAX_PER_REQUEST=300 batches (300 + 200) -> 0 emails sent.
      const certRes = await issueQuizCertificates(await ctxWithDo(pres), session.sessionId, { name: "Carnival Quiz 2026" });
      expect(certRes.batchIds).toHaveLength(2);
      expect(certRes.issued).toBe(500);
      expect(w.emails).toHaveLength(0);

      // Public read models & Worker HTTP public routes work cleanly with zero PII leaks.
      const afterFin = await readPublicQuizBySlug(w.db, slug);
      expect(afterFin?.latestFinalizedSession?.id).toBe(session.sessionId);
      const pubResults = await readPublicQuizResults(w.db, slug);
      expect(pubResults?.leaderboard).toHaveLength(100); // top 100 public leaderboard
      expect(JSON.stringify(pubResults)).not.toContain("@green.edu.bd");
      expect(JSON.stringify(pubResults)).not.toContain("@guest.edu");

      const apiKey = "test-shared-secret-0123456789abcdef";
      const workerEnv = {
        DB: w.db.raw as never,
        APP_ENV: "test",
        API_SHARED_SECRET: apiKey,
        AUTH_SECRET: "test-auth-secret-0123456789abcdef",
      };
      const unauth = await worker.fetch(new Request("http://api.test/v1/public/quizzes"), workerEnv);
      expect(unauth.status).toBe(401);

      const byCode = await worker.fetch(new Request(`http://api.test/v1/public/quizzes/by-code/${session.joinCode}`), {
        ...workerEnv,
      });
      expect(byCode.status).toBe(401);
      const byCodeAuth = await worker.fetch(
        new Request(`http://api.test/v1/public/quizzes/by-code/${session.joinCode}`, { headers: { "X-Api-Key": apiKey } }),
        workerEnv,
      );
      expect(byCodeAuth.status).toBe(200);
      expect(byCodeAuth.headers.get("cache-control")).toContain("no-store");

      const resBySlug = await worker.fetch(
        new Request(`http://api.test/v1/public/quizzes/results/${slug}`, { headers: { "X-Api-Key": apiKey } }),
        workerEnv,
      );
      expect(resBySlug.status).toBe(200);
      const resJson = (await resBySlug.json()) as { ok: boolean; data: { sessionId: string } };
      expect(resJson.ok).toBe(true);
      expect(resJson.data.sessionId).toBe(session.sessionId);
    } finally {
      vi.useRealTimers();
    }
  });
});
