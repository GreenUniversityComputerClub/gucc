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
  // Without a model key the assistant still answers the common questions from the club's own data.
  if (!key) return { response: await answerFromData(ctx, message) };
  // A daily ceiling on AI answers (atomic), so a paid key can never run up a bill.
  const dailyLimit = await getSetting(ctx, "assistant.daily_limit", 300);
  if (!(await reserve(ctx, "ai.answers", 1, dailyLimit))) return { response: await answerFromData(ctx, message) };
  const history = (Array.isArray(input.history) ? input.history : [])
    .filter((t): t is Turn => Boolean(t) && typeof t === "object" && ["user", "model"].includes((t as Turn).role) && typeof (t as Turn).text === "string")
    .slice(-10)
    .map((t) => ({ role: t.role, parts: [{ text: t.text.slice(0, 2000) }] }));
  const data = await publicContext(ctx);
  const system = `You are the GUCC Assistant for the Green University Computer Club (Green University of Bangladesh).
Answer professionally in at most three short sentences. Use only this public information; if you don't know, say so and suggest contacting gucc@green.edu.bd. Never share phone numbers, emails or social media IDs of individuals.
Knowledge: ${JSON.stringify(data.predefined)}
Recent events: ${JSON.stringify(data.events)}
Executive committees: ${JSON.stringify(data.executives)}`;
  const model = ctx.env.GEMINI_MODEL || "gemini-2.5-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [...history, { role: "user", parts: [{ text: message }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 512 },
      safetySettings: ["HARM_CATEGORY_HARASSMENT", "HARM_CATEGORY_HATE_SPEECH", "HARM_CATEGORY_SEXUALLY_EXPLICIT", "HARM_CATEGORY_DANGEROUS_CONTENT"].map((category) => ({ category, threshold: "BLOCK_MEDIUM_AND_ABOVE" })),
    }),
  });
  if (!res.ok) {
    console.error(`[${ctx.meta.requestId}] assistant upstream status ${res.status}`);
    await release(ctx, "ai.answers", 1).catch(() => undefined);
    const fallback = await answerFromData(ctx, message).catch(() => null);
    if (fallback) return { response: fallback };
    throw new AppError(502, "ASSISTANT_UNAVAILABLE", res.status === 429 ? "The assistant is busy. Try again in a minute." : "The assistant is unavailable right now. Please try again later.");
  }
  const out = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = out.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  return { response: text || "Sorry, I couldn't find an answer to that." };
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
export async function answerFromData(ctx: Ctx, message: string): Promise<string> {
  const q = message.toLowerCase();
  const has = (...words: string[]) => words.some((w) => q.includes(w));
  const data = await publicContext(ctx);
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