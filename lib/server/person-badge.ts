/**
 * What a person is in the club, the same wherever members see each other (messages, the
 * new-message picker, group members): their position in their latest committee, short and with the
 * year ("GS-2026", "JIS-2025", "CSS VP-2026"; the full title on hover), otherwise "Moderator",
 * "Faculty", "Alumni" or "Member". Positions come from the committees' listings, the same source
 * as the executives page, so a label is never made up. The SQL sits inside the caller's SELECT.
 */

/**
 * The account's position in its latest committee (the current one first, then the most recent
 * year), as "rank|title|unit|year|current".
 */
export const positionOfUserSql = (userIdExpr: string) => `(
  SELECT bp.rank || '|' || COALESCE(NULLIF(bcm.position_title, ''), bp.name) || '|' || COALESCE(bcm.unit_key, '') || '|' || bc.slug || '|' || (bc.status = 'CURRENT')
  FROM profiles bpr
  JOIN committee_members bcm ON bcm.profile_id = bpr.id AND bcm.deleted_at IS NULL
  JOIN committees bc ON bc.id = bcm.committee_id AND bc.status <> 'UPCOMING' AND bc.deleted_at IS NULL
  JOIN positions bp ON bp.id = bcm.position_id AND bp.deleted_at IS NULL
  WHERE bpr.user_id = ${userIdExpr} AND bpr.deleted_at IS NULL AND (bc.status <> 'CURRENT' OR bcm.is_active = 1)
  ORDER BY bc.status = 'CURRENT' DESC, CAST(bc.slug AS INTEGER) DESC, bp.rank, bcm.display_order LIMIT 1)`;

/** Whether the account holds the Moderator role now. */
export const moderatorOfUserSql = (userIdExpr: string) => `EXISTS (
  SELECT 1 FROM user_roles bur JOIN roles br ON br.id = bur.role_id AND br.key = 'moderator'
  WHERE bur.user_id = ${userIdExpr} AND bur.revoked_at IS NULL AND (bur.expires_at IS NULL OR bur.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')))`;

/** Everything needed for a badge, as columns `badge_pos`, `badge_mod`, `badge_type` (profile alias `p`). */
export const badgeColumnsSql = (userIdExpr: string, profileAlias = "p") =>
  `${positionOfUserSql(userIdExpr)} AS badge_pos, ${moderatorOfUserSql(userIdExpr)} AS badge_mod, ${profileAlias}.person_type AS badge_type`;

/** leader: Moderators and the club's senior leadership; executive: other positions; former: a past committee; then faculty and members. */
export type BadgeTier = "leader" | "executive" | "former" | "faculty" | "member";
export interface Badge {
  /** In full: "General Secretary · 2026". */
  label: string;
  /** As shown: "GS-2026". */
  short: string;
  tier: BadgeTier;
  /** Lower is more senior (for sorting group members). */
  rank: number;
}

/** Positions up to this rank (Moderators, President, Vice-Presidents, General Secretary, Joint General Secretaries) read as leadership. */
const LEADER_RANK = 21;
/** Units whose positions carry club authority; other units' titles say which unit they are. */
const GOVERNING = new Set(["", "gucc"]);

const MINOR = new Set(["of", "and", "the", "for", "to", "in", "&"]);
const SINGLE: Record<string, string> = {
  president: "PRES", treasurer: "TREAS", moderator: "MOD", chair: "CHAIR", chairperson: "CHAIR", chairman: "CHAIR",
  advisor: "ADV", adviser: "ADV", coordinator: "COORD", convener: "CONV", secretary: "SEC", member: "MEM", head: "HEAD", lead: "LEAD", captain: "CAPT",
};

/**
 * A position's short form: the initials of its words ("General Secretary" → GS, "Joint
 * Information Secretary" → JIS, "Vice-president (technical)" → VP), or a known short word for
 * one-word titles ("President" → PRES, "Treasurer" → TREAS).
 */
export function positionShort(title: string): string {
  const words = title.replace(/\([^)]*\)/g, " ").split(/[\s\-–—/]+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter((w) => w && !MINOR.has(w.toLowerCase()));
  if (!words.length) return title.slice(0, 6).toUpperCase();
  if (words.length === 1) {
    const w = words[0]!.toLowerCase();
    return SINGLE[w] ?? w.slice(0, 4).toUpperCase();
  }
  return words.map((w) => w[0]!.toUpperCase()).join("");
}

export function badgeOf(row: { badge_pos?: unknown; badge_mod?: unknown; badge_type?: unknown }): Badge {
  if (typeof row.badge_pos === "string" && row.badge_pos) {
    const [rankText, title = "", unit = "", slug = "", current = "1"] = row.badge_pos.split("|");
    const rank = Number(rankText) || 100;
    const governing = GOVERNING.has(unit.toLowerCase());
    const year = slug.match(/^\d{4}/)?.[0] ?? slug;
    const now = current === "1";
    const unitText = governing ? "" : unit.toUpperCase();
    const short = `${unitText ? `${unitText} ` : ""}${positionShort(title)}${year ? `-${year}` : ""}`;
    const label = `${title}${unitText ? ` · ${unitText}` : ""}${year ? ` · ${year}` : ""}${now ? "" : " (former)"}`;
    const tier: BadgeTier = !now ? "former" : rank <= LEADER_RANK && governing ? "leader" : "executive";
    // Past positions sort after current ones.
    return { label, short, tier, rank: now ? rank : rank + 200 };
  }
  if (row.badge_mod) return { label: "Moderator", short: "Moderator", tier: "leader", rank: 1 };
  if (row.badge_type === "FACULTY") return { label: "Faculty", short: "Faculty", tier: "faculty", rank: 500 };
  if (row.badge_type === "ALUMNI") return { label: "Alumni", short: "Alumni", tier: "member", rank: 900 };
  return { label: "Member", short: "Member", tier: "member", rank: 1000 };
}

/** Replace a row's badge columns with `badge`. */
export function withBadge<T extends { badge_pos?: unknown; badge_mod?: unknown; badge_type?: unknown }>(row: T): Omit<T, "badge_pos" | "badge_mod" | "badge_type"> & { badge: Badge } {
  const { badge_pos: _p, badge_mod: _m, badge_type: _t, ...rest } = row;
  return { ...rest, badge: badgeOf(row) };
}
