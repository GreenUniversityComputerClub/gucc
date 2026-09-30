/**
 * The assistant asks the newest Gemini Flash first and falls back to the one before it; Gemini 3
 * requests use a low thinking level, the model's thinking is never shown, and when no model answers
 * the club's own data does (without using the day's AI allowance).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assistantChat, modelChain } from "@/lib/server/services/assistant";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});
afterEach(() => vi.unstubAllGlobals());

type Call = { model: string; body: { generationConfig: Record<string, unknown> } };
function stubGemini(reply: (model: string) => Response): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const model = decodeURIComponent(String(url).match(/models\/([^:]+):/)![1]!);
    calls.push({ model, body: JSON.parse(String(init.body)) });
    return reply(model);
  }));
  return calls;
}
const ok = (parts: Array<{ text: string; thought?: boolean }>) => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts } }] }), { status: 200 });
const aiAnswers = () => (w.sqlite.prepare("SELECT COALESCE(SUM(count), 0) n FROM usage_counters WHERE key = 'ai.answers' AND day <> 'total'").get() as { n: number }).n;

async function ctxWithKey(model?: string) {
  const c = await w.ctx();
  return { ...c, env: { ...c.env, GOOGLE_API_KEY: "test-key", ...(model ? { GEMINI_MODEL: model } : {}) } };
}

describe("assistant models", () => {
  it("tries gemini-3.8-flash, then gemini-3.7-flash when the newest isn't available", async () => {
    const calls = stubGemini((m) => (m === "gemini-3.8-flash" ? new Response("{}", { status: 404 }) : ok([{ text: "Thinking about events…", thought: true }, { text: "GUCC runs workshops every month." }])));
    const r = await assistantChat(await ctxWithKey(), { message: "What events does GUCC run?" });
    expect(calls.map((c) => c.model)).toEqual(["gemini-3.8-flash", "gemini-3.7-flash"]);
    // The model's thinking is never part of the answer.
    expect(r.response).toBe("GUCC runs workshops every month.");
    // Gemini 3: a low thinking level and room for the reply (thinking counts against the limit).
    expect(calls[0]!.body.generationConfig).toEqual({ maxOutputTokens: 2048, thinkingConfig: { thinkingLevel: "low" } });
    expect(aiAnswers()).toBe(1);
  });

  it("stops at the first model that answers", async () => {
    const calls = stubGemini(() => ok([{ text: "Hello from GUCC." }]));
    expect((await assistantChat(await ctxWithKey(), { message: "Hi" })).response).toBe("Hello from GUCC.");
    expect(calls.map((c) => c.model)).toEqual(["gemini-3.8-flash"]);
  });

  it("a GEMINI_MODEL set on the Worker goes first; an older model gets no thinking level", async () => {
    const calls = stubGemini((m) => (m === "gemini-2.5-flash" ? ok([{ text: "Answer." }]) : new Response("{}", { status: 500 })));
    await assistantChat(await ctxWithKey("gemini-2.5-flash"), { message: "Hi" });
    expect(calls[0]!.model).toBe("gemini-2.5-flash");
    expect(calls[0]!.body.generationConfig).toEqual({ temperature: 0.6, maxOutputTokens: 512 });
    expect(modelChain("gemini-3.8-flash")).toEqual(["gemini-3.8-flash", "gemini-3.7-flash"]);
    expect(modelChain("bad model/../x")).toEqual(["gemini-3.8-flash", "gemini-3.7-flash"]);
  });

  it("when every model is busy or down, the club's data answers and the AI allowance is given back", async () => {
    const calls = stubGemini(() => new Response("{}", { status: 429 }));
    const r = await assistantChat(await ctxWithKey(), { message: "How can I join GUCC?" });
    expect(calls.map((c) => c.model)).toEqual(["gemini-3.8-flash", "gemini-3.7-flash"]);
    expect(r.response).toMatch(/sign-up|Recruitment/);
    expect(aiAnswers()).toBe(0);
  });

  it("a question refused by the safety filters isn't retried on another model", async () => {
    const calls = stubGemini(() => new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 }));
    const r = await assistantChat(await ctxWithKey(), { message: "Tell me about the club" });
    expect(calls).toHaveLength(1);
    expect(r.response.length).toBeGreaterThan(0);
  });
});
