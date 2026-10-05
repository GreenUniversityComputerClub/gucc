/**
 * @mentions in chat messages. The text stays plain ("@Rafi Ahmed, can you…"); the message also
 * carries who each "@Name" is, so it links to their profile and notifies them. Pure, shared by
 * the composer, the message bubbles and the API.
 */

/** A person a message mentions; `u` is "*" for "@everyone" (group admins). */
export interface Mention {
  u: string;
  /** The name as written after "@". */
  n: string;
  /** Their profile handle (/members/<h>), when they have one. */
  h?: string | null;
}

export const EVERYONE = "*";
export const EVERYONE_NAME = "everyone";
export const MAX_MENTIONS = 20;

const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;
const ID_RE = /^(?:\*|[A-Za-z0-9_-]{1,64})$/;
// A name ends where a letter or digit can't continue it ("@Rafi" in "@Rafi's" but not in "@Rafiq").
const WORD = /[\p{L}\p{N}_]/u;

/** The people a client says it mentioned (ids only; the API looks up who they are). */
export function mentionIdsOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw.map((x) => (typeof x === "string" ? x : x && typeof x === "object" && typeof (x as { u?: unknown }).u === "string" ? (x as { u: string }).u : ""))
    .filter((id) => ID_RE.test(id));
  return [...new Set(ids)].slice(0, MAX_MENTIONS);
}

/** Where "@name" appears in `text` as a whole name, from `from` on; -1 when it doesn't. */
function find(text: string, name: string, from = 0): number {
  const needle = `@${name}`;
  for (let i = text.indexOf(needle, from); i !== -1; i = text.indexOf(needle, i + 1)) {
    const after = text[i + needle.length];
    const before = text[i - 1];
    if ((!after || !WORD.test(after)) && (!before || !WORD.test(before))) return i;
  }
  return -1;
}

/** Only the mentions whose "@Name" is still in the text (someone may have deleted it). */
export function presentIn(body: string, mentions: Mention[]): Mention[] {
  const seen = new Set<string>();
  return mentions.filter((m) => m.n && !seen.has(m.u) && find(body, m.n) !== -1 && seen.add(m.u));
}

export type Segment =
  | { t: "text"; v: string }
  | { t: "url"; v: string }
  | { t: "mention"; v: string; m: Mention };

/** A message's text as plain parts, web addresses and mentions (longest names first, never inside an address). */
export function segment(body: string, mentions: Mention[] = []): Segment[] {
  const taken: Array<{ start: number; end: number; s: Segment }> = [];
  for (const m of body.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    taken.push({ start, end: start + m[0].length, s: { t: "url", v: m[0] } });
  }
  const free = (a: number, b: number) => taken.every((x) => b <= x.start || a >= x.end);
  for (const men of [...mentions].filter((x) => x.n).sort((a, b) => b.n.length - a.n.length)) {
    for (let i = find(body, men.n); i !== -1; i = find(body, men.n, i + 1)) {
      const end = i + men.n.length + 1;
      if (free(i, end)) taken.push({ start: i, end, s: { t: "mention", v: body.slice(i, end), m: men } });
    }
  }
  taken.sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let last = 0;
  for (const x of taken) {
    if (x.start > last) out.push({ t: "text", v: body.slice(last, x.start) });
    out.push(x.s);
    last = x.end;
  }
  if (last < body.length) out.push({ t: "text", v: body.slice(last) });
  return out;
}

/**
 * The "@query" being typed just before the caret, if any: "@" at the start or after a space or
 * punctuation (so emails don't count), then up to 30 characters with at most two spaces, no new line.
 */
export function mentionQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const upto = text.slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at === -1) return null;
  const before = upto[at - 1];
  if (before && WORD.test(before)) return null;
  const query = upto.slice(at + 1);
  if (query.length > 30 || /[\n@]/.test(query) || /^\s/.test(query) || (query.match(/ /g) ?? []).length > 2) return null;
  return { start: at, query };
}

/**
 * Put "@Name" in place of the query typed at start..caret (and the rest of a word the caret was
 * in), with a space after it unless a space or punctuation follows already.
 */
export function insertMention(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
  const rest = text.slice(caret).replace(/^[\p{L}\p{N}_]+/u, "");
  const inserted = `@${name}${/^[\s,.!?;:)\]]/.test(rest) ? "" : " "}`;
  return { text: `${text.slice(0, start)}${inserted}${rest}`, caret: start + inserted.length };
}

/** People whose name matches what's typed: a word starting with it first, then anywhere in the name. */
export function matchPeople<T extends { name: string }>(people: T[], query: string, max = 8): T[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return people.slice(0, max);
  const starts: T[] = [];
  const contains: T[] = [];
  for (const p of people) {
    const name = p.name.toLocaleLowerCase();
    if (name.startsWith(q) || name.split(/\s+/).some((w) => w.startsWith(q))) starts.push(p);
    else if (name.includes(q)) contains.push(p);
  }
  return [...starts, ...contains].slice(0, max);
}

/** Read stored mentions (never trusting the shape). */
export function parseMentions(json: string | null | undefined): Mention[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v)
      ? v.filter((m): m is Mention => Boolean(m) && typeof m.u === "string" && typeof m.n === "string").map((m) => ({ u: m.u, n: m.n, h: typeof m.h === "string" ? m.h : null }))
      : [];
  } catch {
    return [];
  }
}
