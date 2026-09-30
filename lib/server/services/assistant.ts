/**
 * The site assistant (chat bubble). Stateless: the browser sends the last few
 * turns, so any Worker isolate can answer. Only public data goes into the
 * prompt — no phone numbers, emails or private profile fields.
 */
import { limit } from "../limits";
import { readCommittees, readEvents, readSetting } from "../../public/read";
import type { Ctx } from "../context";
import { AppError, ValidationError } from "../errors";
import { getSetting } from "../security";
import { release, reserve } from "../usage";
import { publicCampaign } from "./recruitment";

interface Turn {
  role: "user" | "model";
  text: string;
}

async function publicContext(ctx: Ctx) {
  const [predefined, events, { committees, current }] = await Promise.all([readSetting(ctx.db, "chatbot.knowledge"), readEvents(ctx.db), readCommittees(ctx.db)]);
  const recentEvents = [...events].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40)
    .map((e) => ({ name: e.name, date: e.date, location: e.location, category: e.category, link: `/events/${e.slug}` }));
  const people = committees.slice(-3).map((c) => {
    const list: Array<{ name: string; position: string }> = [];
    const walk = (o: Record<string, unknown>) => {
      for (const k of ["facultyMembers", "studentExecutives"]) for (const p of (o[k] as Array<{ name: string; position: string }>) ?? []) list.push({ name: p.name, position: p.position });
      for (const g of ["campuses", "wings"]) for (const u of Object.values((o[g] as Record<string, Record<string, unknown>>) ?? {})) walk(u);
    };
    walk(c);
    return { year: c.year, current: c.year === current, members: list };
  });
  return { predefined, events: recentEvents, executives: people };
}

export async function assistantChat(ctx: Ctx, input: { message?: unknown; history?: unknown }): Promise<{ response: string }> {
  await limit(ctx, "assistant.ip", ctx.meta.ipHash ?? "unknown");
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!message) throw new ValidationError("Type a question.");
  if (message.length > 2000) throw new ValidationError("That message is too long.");
  const key = ctx.env.GOOGLE_API_KEY;
  // Built once per question and shared with the data-only answer below.
  const data = await publicContext(ctx);
  // Without a model key the assistant still answers the common questions from the club's own data.
  if (!key) return { response: await answerFromData(ctx, message, data) };
  // A daily ceiling on AI answers (atomic), so a paid key can never run up a bill.
  const dailyLimit = await getSetting(ctx, "assistant.daily_limit", 300);
  if (!(await reserve(ctx, "ai.answers", 1, dailyLimit))) return { response: await answerFromData(ctx, message, data) };
  const history = (Array.isArray(input.history) ? input.history : [])
    .filter((t): t is Turn => Boolean(t) && typeof t === "object" && ["user", "model"].includes((t as Turn).role) && typeof (t as Turn).text === "string")
    .slice(-10)
    .map((t) => ({ role: t.role, parts: [{ text: t.text.slice(0, 2000) }] }));
  const system = `You are the GUCC Assistant for the Green University Computer Club (Green University of Bangladesh).
Answer professionally and briefly (at most three short sentences, or a short list when listing things), in plain text: no headings or tables. Give site links as paths such as /events or /join. Use only this public information; if you don't know, say so and suggest contacting gucc@green.edu.bd. Never share phone numbers, emails or social media IDs of individuals.
Knowledge: ${JSON.stringify(data.predefined)}
Recent events: ${JSON.stringify(data.events)}
Executive committees: ${JSON.stringify(data.executives)}`;
  const answer = await askGemini(ctx, key, system, [...history, { role: "user", parts: [{ text: message }] }]);
  if (answer.text) return { response: answer.text };
  // No model answered: this question doesn't use the day's AI allowance.
  await release(ctx, "ai.answers", 1).catch(() => undefined);
  const fallback = await answerFromData(ctx, message, data).catch(() => null);
  if (fallback) return { response: fallback };
  throw new AppError(502, "ASSISTANT_UNAVAILABLE", answer.busy ? "The assistant is busy. Try again in a minute." : "The assistant is unavailable right now. Please try again later.");
}

/**
 * The models tried, in order: a GEMINI_MODEL set on the Worker, then the newest stable Flash, then
 * the one before it (so a retired or overloaded model never silences the assistant).
 */
export const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.7-flash"] as const;
export function modelChain(configured?: string | null): string[] {
  return [...new Set([configured?.trim(), ...GEMINI_MODELS].filter((m): m is string => Boolean(m && /^[a-z0-9.-]{3,64}$/i.test(m))))];
}

/** Whether a model uses Gemini 3's thinking levels (older ones take a token budget instead). */
const thinksInLevels = (model: string) => /^gemini-([3-9]|\d{2,})/.test(model);

type Content = { role: string; parts: Array<{ text: string }> };

/**
 * One question to Gemini, trying each model in `modelChain` until one answers with text. A model
 * that's missing, not allowed, rate-limited, failing or slow hands over to the next; a request the
 * model refuses for its content (blocked by the safety filters) doesn't.
 */
export async function askGemini(ctx: Ctx, key: string, system: string, contents: Content[]): Promise<{ text: string | null; model: string | null; busy: boolean }> {
  const deadline = Date.now() + 25_000;
  let busy = false;
  for (const model of modelChain(ctx.env.GEMINI_MODEL)) {
    const left = deadline - Date.now();
    if (left < 3_000) break;
    const generationConfig = thinksInLevels(model)
      // Thinking tokens count against maxOutputTokens: keep thinking low and leave room for the reply.
      ? { maxOutputTokens: 2048, thinkingConfig: { thinkingLevel: "low" } }
      : { temperature: 0.6, maxOutputTokens: 512 };
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      // A slow model must not hold the chat (or the Worker) for long.
      signal: AbortSignal.timeout(Math.min(15_000, left)),
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig,
        safetySettings: ["HARM_CATEGORY_HARASSMENT", "HARM_CATEGORY_HATE_SPEECH", "HARM_CATEGORY_SEXUALLY_EXPLICIT", "HARM_CATEGORY_DANGEROUS_CONTENT"].map((category) => ({ category, threshold: "BLOCK_MEDIUM_AND_ABOVE" })),
      }),
    }).catch((e: unknown) => {
      console.error(`[${ctx.meta.requestId}] assistant ${model} unreachable`, e instanceof Error ? e.name : e);
      return null;
    });
    if (!res || !res.ok) {
      if (res) console.error(`[${ctx.meta.requestId}] assistant ${model} status ${res.status}`);
      if (res?.status === 429) busy = true;
      continue;
    }
    const out = (await res.json().catch(() => null)) as {
      candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
      promptFeedback?: { blockReason?: string };
    } | null;
    const candidate = out?.candidates?.[0];
    // The reply only: never the model's own thinking.
    const text = candidate?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
    if (text) return { text, model, busy };
    // Refused for its content: another model would refuse too.
    if (out?.promptFeedback?.blockReason || candidate?.finishReason === "SAFETY") return { text: null, model, busy };
    console.error(`[${ctx.meta.requestId}] assistant ${model} gave no text (${candidate?.finishReason ?? "no candidate"})`);
  }
  return { text: null, model: null, busy };
}

type Knowledge = {
  aboutUs?: { description?: string };
  university?: { description?: string; cseDepartment?: string };
  vision?: string;
  values?: string[];
  events?: { description?: string };
  location?: { address?: string; email?: string };
};

/**
 * Answers without an AI model: matches the question to a topic and replies from public data
 * (the knowledge setting, events, the current committee and recruitment). Never invents.
 */
export async function answerFromData(ctx: Ctx, message: string, known?: Awaited<ReturnType<typeof publicContext>>): Promise<string> {
  const q = message.toLowerCase();
  const has = (...words: string[]) => words.some((w) => q.includes(w));
  const data = known ?? (await publicContext(ctx));
  const k = (data.predefined ?? {}) as Knowledge;
  const email = k.location?.email ?? "gucc@green.edu.bd";
  const dateText = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00+06:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dhaka" });

  if (has("join", "member", "recruit", "apply", "register", "sign up", "signup")) {
    const campaign = await publicCampaign(ctx).catch(() => null);
    if (campaign?.open) return `Recruitment is open: ${campaign.open.title}. Apply on the Recruitment page (/recruitment)${campaign.open.closesAt ? ` before ${dateText(campaign.open.closesAt)}` : ""}.`;
    if (campaign?.upcoming?.opensAt) return `The next recruitment (${campaign.upcoming.title}) opens on ${dateText(campaign.upcoming.opensAt)}. Meanwhile you can create an account at /auth/sign-up; GUCC reviewers approve memberships.`;
    return `Create an account at /auth/sign-up and GUCC's reviewers will approve your membership. Recruitment for executive roles is announced on the Join page (/join).`;
  }
  if (has("general secretary", "president", "executive", "committee", "who lead", "who runs", "moderator", "panel")) {
    const current = data.executives.find((c) => c.current) ?? data.executives.at(-1);
    if (current) {
      const find = (re: RegExp) => current.members.find((m) => re.test(m.position))?.name;
      const lines = [
        find(/^president\b/i) && `President: ${find(/^president\b/i)}`,
        find(/^general secretary\b/i) && `General Secretary: ${find(/^general secretary\b/i)}`,
        find(/^moderator\b/i) && `Moderator: ${find(/^moderator\b/i)}`,
      ].filter(Boolean);
      return `${lines.length ? `${lines.join(". ")}. ` : ""}The full ${current.year} committee is on the Executives page (/executives).`;
    }
    return "The executive committees are listed on the Executives page (/executives).";
  }
  if (has("event", "workshop", "contest", "hackathon", "seminar", "competition", "upcoming")) {
    const today = new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
    const upcoming = data.events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
    const list = (upcoming.length ? upcoming : data.events.slice(0, 3)).map((e) => `${e.name} (${dateText(e.date)})`).join("; ");
    if (!list) return `${k.events?.description ?? "GUCC runs workshops, contests and hackathons."} See the Events page (/events).`;
    return `${upcoming.length ? "Coming up" : "Recent events"}: ${list}. All events are on the Events page (/events).`;
  }
  if (has("where", "location", "address", "campus")) return k.location?.address ? `GUCC is at ${k.location.address}.` : `Email ${email} for directions.`;
  if (has("contact", "email", "reach", "phone")) return `Email GUCC at ${email}, or use the Contact page (/contact).`;
  if (has("vision", "mission", "value", "goal")) return [k.vision, k.values?.length ? `Values: ${k.values.map((v) => v.split(" - ")[0]).join(", ")}.` : null].filter(Boolean).join(" ") || `Email ${email} to learn more.`;
  if (has("cse", "department", "course")) return k.university?.cseDepartment ?? `Ask the CSE department or email ${email}.`;
  if (has("green university", "gub", "university")) return k.university?.description ?? `Email ${email} to learn more.`;
  if (has("gucc", "club", "about", "who are you")) return k.aboutUs?.description ?? "GUCC is the Green University Computer Club.";
  return `I can help with joining GUCC, events, the executive committee and how to contact the club. For anything else, email ${email}.`;
}