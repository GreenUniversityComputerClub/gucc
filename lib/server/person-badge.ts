/**
 * What a person is in the club, in one short label, the same wherever members see each other
 * (messages, the new-message picker, group members): their position in the current committee
 * ("President", "General Secretary", "Chair · CSS"), otherwise "Moderator", "Faculty", "Alumni"
 * or "Member". Positions come from the current committee's listings, the same source as the
 * executives page, so a label is never made up. The SQL sits inside the caller's SELECT.
 */

/** Highest current-committee position of the account `userIdExpr`, as "rank|title|unit". */
export const positionOfUserSql = (userIdExpr: string) => `(
  SELECT bp.rank || '|' || COALESCE(NULLIF(bcm.position_title, ''), bp.name) || '|' || COALESCE(bcm.unit_key, '')
  FROM profiles bpr
  JOIN committee_members bcm ON bcm.profile_id = bpr.id AND bcm.deleted_at IS NULL AND bcm.is_active = 1
  JOIN committees bc ON bc.id = bcm.committee_id AND bc.status = 'CURRENT' AND bc.deleted_at IS NULL
  JOIN positions bp ON bp.id = bcm.position_id AND bp.deleted_at IS NULL
  WHERE bpr.user_id = ${userIdExpr} AND bpr.deleted_at IS NULL
  ORDER BY bp.rank, bcm.display_order LIMIT 1)`;

/** Whether the account holds the Moderator role now. */
export const moderatorOfUserSql = (userIdExpr: string) => `EXISTS (
  SELECT 1 FROM user_roles bur JOIN roles br ON br.id = bur.role_id AND br.key = 'moderator'
  WHERE bur.user_id = ${userIdExpr} AND bur.revoked_at IS NULL AND (bur.expires_at IS NULL OR bur.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')))`;

/** Everything needed for a badge, as columns `badge_pos`, `badge_mod`, `badge_type` (profile alias `p`). */
export const badgeColumnsSql = (userIdExpr: string, profileAlias = "p") =>
  `${positionOfUserSql(userIdExpr)} AS badge_pos, ${moderatorOfUserSql(userIdExpr)} AS badge_mod, ${profileAlias}.person_type AS badge_type`;

/** leader: Moderators and the club's senior leadership; executive: other positions; then faculty and members. */
export type BadgeTier = "leader" | "executive" | "faculty" | "member";
export interface Badge {
  label: string;
  tier: BadgeTier;
  /** Lower is more senior (for sorting group members). */
  rank: number;
}

/** Positions up to this rank (Moderators, President, Vice-Presidents, General Secretary, Joint General Secretaries) read as leadership. */
const LEADER_RANK = 21;
/** Units whose positions carry club authority; other units' titles say which unit they are. */
const GOVERNING = new Set(["", "gucc"]);

export function badgeOf(row: { badge_pos?: unknown; badge_mod?: unknown; badge_type?: unknown }): Badge {
  if (typeof row.badge_pos === "string" && row.badge_pos) {
    const [rankText, title, unit = ""] = row.badge_pos.split("|");
    const rank = Number(rankText) || 100;
    const label = `${title}${GOVERNING.has(unit.toLowerCase()) ? "" : ` · ${unit.toUpperCase()}`}`;
    return { label, tier: rank <= LEADER_RANK && GOVERNING.has(unit.toLowerCase()) ? "leader" : "executive", rank };
  }
  if (row.badge_mod) return { label: "Moderator", tier: "leader", rank: 1 };
  if (row.badge_type === "FACULTY") return { label: "Faculty", tier: "faculty", rank: 500 };
  if (row.badge_type === "ALUMNI") return { label: "Alumni", tier: "member", rank: 900 };
  return { label: "Member", tier: "member", rank: 1000 };
}

/** Replace a row's badge columns with `badge`. */
export function withBadge<T extends { badge_pos?: unknown; badge_mod?: unknown; badge_type?: unknown }>(row: T): Omit<T, "badge_pos" | "badge_mod" | "badge_type"> & { badge: Badge } {
  const { badge_pos: _p, badge_mod: _m, badge_type: _t, ...rest } = row;
  return { ...rest, badge: badgeOf(row) };
}
