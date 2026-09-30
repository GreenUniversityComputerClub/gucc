/**
 * The reactions people can leave on a message (and, signed in, on a blog post). The database
 * stores the key; pages show the emoji and read the label to screen readers. Shared by the API
 * and the browser, so both always agree.
 */
export const REACTIONS = {
  like: { emoji: "👍", label: "Like" },
  love: { emoji: "❤️", label: "Love" },
  haha: { emoji: "😂", label: "Haha" },
  wow: { emoji: "😮", label: "Wow" },
  sad: { emoji: "😢", label: "Sad" },
  angry: { emoji: "😡", label: "Angry" },
  thanks: { emoji: "🙏", label: "Thanks" },
} as const;

export type ReactionKey = keyof typeof REACTIONS;
export const REACTION_KEYS = Object.keys(REACTIONS) as ReactionKey[];
export const isReaction = (v: unknown): v is ReactionKey => typeof v === "string" && Object.prototype.hasOwnProperty.call(REACTIONS, v);

/** Reactions grouped for display: most used first, with who left them. */
export function groupReactions(list: Array<{ u: string; e: ReactionKey }>): Array<{ e: ReactionKey; count: number; users: string[] }> {
  const by = new Map<ReactionKey, string[]>();
  for (const r of list) by.set(r.e, [...(by.get(r.e) ?? []), r.u]);
  return [...by.entries()].map(([e, users]) => ({ e, count: users.length, users })).sort((a, b) => b.count - a.count || REACTION_KEYS.indexOf(a.e) - REACTION_KEYS.indexOf(b.e));
}
