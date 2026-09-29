/**
 * A person's photo, the same everywhere: chat, notifications, lists, pickers, bylines. The profile
 * is the one source (committee listings follow the rule in lib/public/queries.ts). Only a public,
 * ready, not-deleted image is ever returned, the same filter as the public site, so a photo shown
 * to members is one that is already public. The SQL sits inside the caller's SELECT: no extra
 * D1 statement anywhere.
 */
import { mediaUrl, type MediaRow, type Variant } from "../public/shapes";

const MEDIA_JSON = "json_object('storage', am.storage, 'object_key', am.object_key, 'legacy_path', am.legacy_path, 'external_url', am.external_url, 'variants_json', am.variants_json)";
const USABLE = "am.deleted_at IS NULL AND am.visibility = 'PUBLIC' AND am.status = 'READY'";

/** The photo of the profile aliased `profile` in the caller's query, as JSON (or NULL). */
export const avatarOfProfileSql = (profile: string) =>
  `(SELECT ${MEDIA_JSON} FROM media am WHERE am.id = ${profile}.avatar_media_id AND ${USABLE})`;

/** The photo of the account whose id is `userIdExpr`, as JSON (or NULL). */
export const avatarOfUserSql = (userIdExpr: string) =>
  `(SELECT ${MEDIA_JSON} FROM profiles ap JOIN media am ON am.id = ap.avatar_media_id AND ${USABLE} WHERE ap.user_id = ${userIdExpr} AND ap.deleted_at IS NULL)`;

/** The URL of a photo selected with one of the fragments above ("thumb" for lists and chat). */
export function avatarUrl(json: unknown, variant: Variant = "thumb"): string | null {
  if (typeof json !== "string" || !json) return null;
  try {
    return mediaUrl({ id: "", ...(JSON.parse(json) as Omit<MediaRow, "id">) }, variant) ?? null;
  } catch {
    return null;
  }
}

/** Replace each row's `avatar_json` column with `avatarUrl`. */
export function withAvatars<T extends { avatar_json?: unknown }>(rows: T[], variant: Variant = "thumb"): Array<Omit<T, "avatar_json"> & { avatarUrl: string | null }> {
  return rows.map(({ avatar_json, ...r }) => ({ ...r, avatarUrl: avatarUrl(avatar_json, variant) }));
}
