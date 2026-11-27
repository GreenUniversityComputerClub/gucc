import { describe, expect, it } from "vitest";
import { cleanScoringConfig, cleanThemeConfig, rankParticipants, scoreQuestionAnswer } from "@/lib/quiz/types";

describe("Quiz Arena scoring engine", () => {
  it("scores single-choice MCQ with FIXED vs SPEED_BONUS and penalty", () => {
    const fixedCfg = cleanScoringConfig({ incorrectPenalty: 200, speedBonusMax: 500 }, "FIXED");
    expect(fixedCfg.speedBonusMax).toBe(0);

    expect(
      scoreQuestionAnswer({
        kind: "MCQ",
        basePoints: 1000,
        scoringMode: "FIXED",
        scoringConfig: fixedCfg,
        timeLimitSec: 20,
        responseMs: 1000,
        selectedIds: ["b"],
        correctIds: ["b"],
      }),
    ).toEqual({ isCorrect: true, pointsAwarded: 1000 });

    expect(
      scoreQuestionAnswer({
        kind: "MCQ",
        basePoints: 1000,
        scoringMode: "FIXED",
        scoringConfig: fixedCfg,
        timeLimitSec: 20,
        responseMs: 1000,
        selectedIds: ["a"],
        correctIds: ["b"],
      }),
    ).toEqual({ isCorrect: false, pointsAwarded: -200 });

    const speedCfg = cleanScoringConfig({ incorrectPenalty: 0, speedBonusMax: 500, maxPointsPerQuestion: 1400 }, "SPEED_BONUS");
    // Instant answer (0 ms) would be 1500, capped cleanly at maxPointsPerQuestion = 1400
    expect(
      scoreQuestionAnswer({
        kind: "TRUE_FALSE",
        basePoints: 1000,
        scoringMode: "SPEED_BONUS",
        scoringConfig: speedCfg,
        timeLimitSec: 20,
        responseMs: 0,
        selectedIds: ["true"],
        correctIds: ["true"],
      }),
    ).toEqual({ isCorrect: true, pointsAwarded: 1400 });

    // Half-time answer (10s / 20s): 1000 + floor(500 * 0.5) = 1250
    expect(
      scoreQuestionAnswer({
        kind: "MCQ",
        basePoints: 1000,
        scoringMode: "SPEED_BONUS",
        scoringConfig: speedCfg,
        timeLimitSec: 20,
        responseMs: 10_000,
        selectedIds: ["b"],
        correctIds: ["b"],
      }),
    ).toEqual({ isCorrect: true, pointsAwarded: 1250 });
  });

  it("supports MULTI_SELECT with and without partial credit", () => {
    const partialCfg = cleanScoringConfig({ partialCredit: true, speedBonusMax: 0, incorrectPenalty: 100 }, "FIXED");
    expect(
      scoreQuestionAnswer({
        kind: "MULTI_SELECT",
        basePoints: 1000,
        scoringMode: "FIXED",
        scoringConfig: partialCfg,
        timeLimitSec: 20,
        responseMs: 4000,
        selectedIds: ["a"],
        correctIds: ["a", "b"],
      }),
    ).toEqual({ isCorrect: false, pointsAwarded: 500 });

    const strictCfg = cleanScoringConfig({ partialCredit: false, speedBonusMax: 0, incorrectPenalty: 100 }, "FIXED");
    expect(
      scoreQuestionAnswer({
        kind: "MULTI_SELECT",
        basePoints: 1000,
        scoringMode: "FIXED",
        scoringConfig: strictCfg,
        timeLimitSec: 20,
        responseMs: 4000,
        selectedIds: ["a"],
        correctIds: ["a", "b"],
      }),
    ).toEqual({ isCorrect: false, pointsAwarded: -100 });
  });

  it("ranks participants deterministically and assigns shared ranks on exact ties", () => {
    const ranked = rankParticipants([
      { participantId: "p1", scoreTotal: 2000, correctCount: 2, avgResponseMs: 3000 },
      { participantId: "p2", scoreTotal: 2000, correctCount: 2, avgResponseMs: 2500 },
      { participantId: "p3", scoreTotal: 2000, correctCount: 2, avgResponseMs: 3000 },
      { participantId: "p4", scoreTotal: 1500, correctCount: 2, avgResponseMs: 1000 },
    ]);
    expect(ranked.map((r) => [r.participantId, r.rank])).toEqual([
      ["p2", 1],
      ["p1", 2],
      ["p3", 2],
      ["p4", 4],
    ]);
  });

  it("sanitizes theme configurations and rejects invalid colors/CSS", () => {
    const theme = cleanThemeConfig("ACADEMIC", {
      primaryColor: "url(javascript:alert(1))",
      accentColor: "#FF5500",
      surfaceStyle: "hacked",
    });
    expect(theme.primaryColor).toBe("#1e3a8a"); // preset fallback
    expect(theme.accentColor).toBe("#ff5500");
    expect(theme.surfaceStyle).toBe("light");
  });
});
