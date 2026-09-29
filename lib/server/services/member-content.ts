/**
 * Blog posts and event proposals by ordinary approved members. Everything they write is private
 * until a reviewer approves it (the President, the General Secretary, a Moderator, or anyone the
 * leaders let publish club-wide). A few limits keep it manageable on the free plan and safe from
 * spam; leaders can pause it with one switch (Settings → content.member_submissions).
 */
import { isAffiliateExecutive, isClubExecutive } from "../../governance/engine";
import { requireActor } from "../authz";
import type { Ctx } from "../context";
import { ForbiddenError, ValidationError } from "../errors";
import { limit } from "../limits";
import { getSetting } from "../security";

/** At most this many of a member's posts and events can wait for approval at once. */
export const MEMBER_PENDING_LIMIT = 3;

/** Writing as an ordinary member: no club or affiliated position and no club-wide right to write. */
export function isMemberAuthor(ctx: Ctx, permission: "posts.create" | "events.create"): boolean {
  const s = requireActor(ctx).subject;
  if (isClubExecutive(s) || isAffiliateExecutive(s)) return false;
  return !s.grants.some((g) => g.scope !== "OWN" && (g.permission === permission || g.permission === "*"));
}

/** Before a member creates a post or an event. */
export async function checkMemberCreate(ctx: Ctx, kind: "post" | "event", postType?: string | null): Promise<void> {
  const actor = requireActor(ctx);
  if (!isMemberAuthor(ctx, kind === "post" ? "posts.create" : "events.create")) return;
  if (!(await getSetting(ctx, "content.member_submissions", true))) {
    throw new ForbiddenError("Club leaders have paused new posts and event proposals from members for now. Please try again later.");
  }
  if (kind === "post" && postType && postType !== "BLOG") {
    throw new ValidationError("Members write blog posts. News and announcements come from the committee.", { type: "Choose Blog." });
  }
  await limit(ctx, "content.create", actor.user.id);
}

/** Before a member sends something for approval. */
export async function checkMemberSubmit(ctx: Ctx, kind: "post" | "event"): Promise<void> {
  const actor = requireActor(ctx);
  if (!isMemberAuthor(ctx, kind === "post" ? "posts.create" : "events.create")) return;
  if (!(await getSetting(ctx, "content.member_submissions", true))) {
    throw new ForbiddenError("Club leaders have paused member submissions for now. Your draft is saved; send it for approval later.");
  }
  const waiting = (await ctx.db.value<number>(
    `SELECT (SELECT COUNT(*) FROM posts WHERE created_by = ?1 AND status = 'PENDING_APPROVAL' AND deleted_at IS NULL)
          + (SELECT COUNT(*) FROM events WHERE created_by = ?1 AND status = 'PENDING_APPROVAL' AND deleted_at IS NULL)`, actor.user.id)) ?? 0;
  if (waiting >= MEMBER_PENDING_LIMIT) {
    throw new ValidationError(`You already have ${waiting} items waiting for approval. Send this one when one of them has been reviewed.`);
  }
  await limit(ctx, "content.submit", actor.user.id);
}
