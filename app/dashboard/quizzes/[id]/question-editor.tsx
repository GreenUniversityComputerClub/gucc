"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QUIZ_QUESTION_KINDS, type QuizOption, type QuizQuestionKind } from "@/lib/quiz/types";

export interface DraftQuestion {
  id?: string;
  kind: QuizQuestionKind;
  promptMarkdown: string;
  options: QuizOption[];
  answerKey: string[];
  explanationMarkdown?: string | null;
  timeLimitSec?: number | null;
  points: number;
  negativePoints: number;
}

const makeBlankQuestion = (): DraftQuestion => ({
  kind: "MCQ",
  promptMarkdown: "",
  options: [
    { id: "opt_1", text: "" },
    { id: "opt_2", text: "" },
    { id: "opt_3", text: "" },
    { id: "opt_4", text: "" },
  ],
  answerKey: ["opt_1"],
  explanationMarkdown: "",
  timeLimitSec: null,
  points: 1000,
  negativePoints: 0,
});

export function QuestionEditor({ initial }: { initial: DraftQuestion[] }) {
  const [items, setItems] = useState<DraftQuestion[]>(initial.length ? initial : [makeBlankQuestion()]);

  const update = (idx: number, patch: Partial<DraftQuestion>) =>
    setItems((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));

  const changeKind = (idx: number, kind: QuizQuestionKind) => {
    const cur = items[idx]!;
    if (kind === "TRUE_FALSE") {
      update(idx, {
        kind,
        options: [{ id: "true", text: "True" }, { id: "false", text: "False" }],
        answerKey: cur.answerKey[0] === "false" ? ["false"] : ["true"],
      });
    } else if (kind === "MCQ") {
      update(idx, {
        kind,
        options: cur.options.length < 2 ? [{ id: "opt_1", text: "" }, { id: "opt_2", text: "" }] : cur.options,
        answerKey: cur.answerKey.length ? [cur.answerKey[0]!] : [cur.options[0]?.id ?? "opt_1"],
      });
    } else {
      update(idx, { kind });
    }
  };

  const move = (idx: number, dir: -1 | 1) => {
    const to = idx + dir;
    if (to < 0 || to >= items.length) return;
    setItems((prev) => {
      const next = [...prev];
      const [row] = next.splice(idx, 1);
      next.splice(to, 0, row!);
      return next;
    });
  };

  const toggleAnswer = (qIdx: number, optId: string) => {
    const q = items[qIdx]!;
    if (q.kind === "MULTI_SELECT") {
      const has = q.answerKey.includes(optId);
      const next = has ? q.answerKey.filter((x) => x !== optId) : [...q.answerKey, optId];
      update(qIdx, { answerKey: next });
    } else {
      update(qIdx, { answerKey: [optId] });
    }
  };

  return (
    <div className="space-y-4">
      <input type="hidden" name="questions" value={JSON.stringify(items)} />

      {items.map((q, idx) => (
        <div key={idx} className="rounded-xl border bg-background p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">Question {idx + 1}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                aria-label={`Question ${idx + 1} type`}
                value={q.kind}
                onChange={(e) => changeKind(idx, e.target.value as QuizQuestionKind)}
                className="h-9 rounded-md border border-input bg-background px-2 text-xs font-medium"
              >
                {QUIZ_QUESTION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k === "MCQ" ? "Single Choice" : k === "MULTI_SELECT" ? "Multi-Select" : "True / False"}
                  </option>
                ))}
              </select>
              <Button type="button" variant="outline" size="sm" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="Move question up">
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => move(idx, 1)} disabled={idx === items.length - 1} aria-label="Move question down">
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))}
                disabled={items.length <= 1}
                aria-label={`Remove question ${idx + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <textarea
            value={q.promptMarkdown}
            onChange={(e) => update(idx, { promptMarkdown: e.target.value })}
            rows={2}
            placeholder="Write the question prompt (supports **bold** and ```code``` blocks)…"
            aria-label={`Question ${idx + 1} prompt`}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Options ({q.kind === "MULTI_SELECT" ? "check all correct answers" : "select the single correct answer"})
              </span>
              {q.kind !== "TRUE_FALSE" && q.options.length < 6 && (
                <button
                  type="button"
                  onClick={() =>
                    update(idx, {
                      options: [...q.options, { id: `opt_${q.options.length + 1}_${Date.now().toString(36).slice(-3)}`, text: "" }],
                    })
                  }
                  className="text-xs font-medium text-primary hover:underline"
                >
                  + Add option
                </button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {q.options.map((opt, oIdx) => {
                const checked = q.answerKey.includes(opt.id);
                return (
                  <div key={opt.id} className="flex items-center gap-2 rounded-lg border p-2">
                    <input
                      type={q.kind === "MULTI_SELECT" ? "checkbox" : "radio"}
                      name={`correct_${idx}`}
                      checked={checked}
                      onChange={() => toggleAnswer(idx, opt.id)}
                      aria-label={`Mark option ${oIdx + 1} correct`}
                      className="h-4 w-4 shrink-0"
                    />
                    <input
                      type="text"
                      value={opt.text}
                      readOnly={q.kind === "TRUE_FALSE"}
                      onChange={(e) =>
                        update(idx, {
                          options: q.options.map((x) => (x.id === opt.id ? { ...x, text: e.target.value } : x)),
                        })
                      }
                      placeholder={`Option ${oIdx + 1}`}
                      className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
                    />
                    {q.kind !== "TRUE_FALSE" && q.options.length > 2 && (
                      <button
                        type="button"
                        onClick={() =>
                          update(idx, {
                            options: q.options.filter((x) => x.id !== opt.id),
                            answerKey: q.answerKey.filter((a) => a !== opt.id),
                          })
                        }
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Delete option"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-xs font-medium">
              Points
              <input
                type="number"
                value={q.points}
                min={0}
                max={10000}
                onChange={(e) => update(idx, { points: Number(e.target.value) || 0 })}
                className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Incorrect penalty override
              <input
                type="number"
                value={q.negativePoints}
                min={0}
                max={10000}
                onChange={(e) => update(idx, { negativePoints: Number(e.target.value) || 0 })}
                className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Timer override (seconds)
              <input
                type="number"
                value={q.timeLimitSec ?? ""}
                min={5}
                max={300}
                placeholder="Use quiz default"
                onChange={(e) => update(idx, { timeLimitSec: e.target.value ? Number(e.target.value) : null })}
                className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
              />
            </label>
          </div>

          <input
            type="text"
            value={q.explanationMarkdown ?? ""}
            onChange={(e) => update(idx, { explanationMarkdown: e.target.value })}
            placeholder="Optional explanation shown on reveal & results…"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
          />
        </div>
      ))}

      {items.length < 100 && (
        <Button type="button" variant="outline" onClick={() => setItems((prev) => [...prev, makeBlankQuestion()])} className="gap-1.5">
          <Plus className="h-4 w-4" aria-hidden />Add question
        </Button>
      )}
    </div>
  );
}
