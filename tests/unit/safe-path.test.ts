import { describe, expect, it } from "vitest";
import { safeLocalPath, safeMediaSrc } from "@/lib/safe-path";
import { safeUrl } from "@/lib/markdown";
import { sanitizeQuizSnapshot, type QuizStateSnapshot } from "@/lib/quiz/types";

describe("safe local paths (redirects, notification links, markdown links)", () => {
  it("keeps paths on this site", () => {
    expect(safeLocalPath("/dashboard/chat/cnv_1?x=1#end", "/")).toBe("/dashboard/chat/cnv_1?x=1#end");
    expect(safeLocalPath("/events", "/")).toBe("/events");
  });

  it("refuses anything that a browser would send elsewhere", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "/\tevil.com", "/\t/evil.com", "/\n/evil.com", "https://evil.com", "javascript:alert(1)", "evil.com", "", "/%0a/evil"]) {
      const out = safeLocalPath(bad, "/fallback");
      expect(out === "/fallback" || out.startsWith("/%0a"), bad).toBe(true);
    }
    expect(safeLocalPath(123, "/f")).toBe("/f");
    expect(safeLocalPath("/" + "a".repeat(600), "/f")).toBe("/f");
  });

  it("markdown links never become protocol-relative", () => {
    expect(safeUrl("/\\evil.com")).toBeNull();
    expect(safeUrl("/\tevil.com")).toBeNull();
    expect(safeUrl("/blog/post")).toBe("/blog/post");
  });

  it("safeMediaSrc allows relative paths and configured origins while rejecting XSS/redirection payloads", () => {
    expect(safeMediaSrc("/media/quiz/q1.webp?v=2", "https://api.gucc.example")).toBe("/media/quiz/q1.webp?v=2");
    expect(safeMediaSrc("https://api.gucc.example/media/q1.webp?w=800", "https://api.gucc.example")).toBe(
      "https://api.gucc.example/media/q1.webp?w=800",
    );
    expect(safeMediaSrc("http://localhost:8787/media/q1.webp", "http://localhost:8787")).toBe(
      "http://localhost:8787/media/q1.webp",
    );
    for (const bad of [
      null,
      undefined,
      "",
      123,
      "//evil.com/x.png",
      "/\\evil.com/x.png",
      "/\tevil.com/x.png",
      "javascript:alert(1)",
      "data:image/svg+xml,<svg onload=alert(1)>",
      "https://evil.com/x.png",
      "https://api.gucc.example@evil.com/x.png",
      "/" + "a".repeat(600),
    ]) {
      expect(safeMediaSrc(bad, "https://api.gucc.example")).toBeNull();
    }
  });

  it("sanitizeQuizSnapshot scrubs untrusted question mediaUrl values", () => {
    const baseSnap: QuizStateSnapshot = {
      sessionId: "s1",
      quizId: "q1",
      joinCode: "123456",
      title: "Test Quiz",
      status: "QUESTION",
      currentQuestionIdx: 0,
      totalQuestions: 1,
      questionStartedAt: null,
      questionEndsAt: null,
      participantCount: 1,
      question: {
        id: "qq1",
        index: 0,
        kind: "MCQ",
        promptMarkdown: "Q1?",
        mediaUrl: "javascript:alert(1)",
        options: [{ id: "a", text: "A" }],
        timeLimitSec: 20,
        points: 100,
      },
      answerKey: null,
      explanationMarkdown: null,
      optionCounts: null,
      answeredCount: 0,
      leaderboard: [],
      me: null,
    };
    expect(sanitizeQuizSnapshot(baseSnap, "https://api.gucc.example").question?.mediaUrl).toBeNull();
    expect(
      sanitizeQuizSnapshot(
        { ...baseSnap, question: { ...baseSnap.question!, mediaUrl: "/media/q1.png" } },
        "https://api.gucc.example",
      ).question?.mediaUrl,
    ).toBe("/media/q1.png");
  });
});
