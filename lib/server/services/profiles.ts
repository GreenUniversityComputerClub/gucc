/**
 * Profiles people can visit (/members/<handle>) and the members directory.
 *
 * Each member chooses who sees their profile: signed-in members (the default), everyone, or only
 * themselves. The server decides what a viewer gets; the page never trusts the browser. Phone,
 * student ID and the sign-in email are never part of a profile. Someone who has served on a
 * committee is already public on /executives by name, photo, position and links, so those stay
 * visible whatever the choice; bio, skills and batch follow it.
 */
import { isClubExecutive } from "../../governance/engine";
import { authorize } from "../authz";
import { avatarOfProfileSql, avatarUrl } from "../avatar";
import type { Ctx } from "../context";
import { newId } from "../db";
import { NotFoundError, ValidationError } from "../errors";
import { toSlug } from "../validate";

export type ProfileVisibility = "PUBLIC" | "MEMBERS" | "PRIVATE";
export const PROFILE_VISIBILITIES: ProfileVisibility[] = ["PUBLIC", "MEMBERS", "PRIVATE"];

const PUBLIC_EVENT = "e.deleted_at IS NULL AND e.status IN ('PUBLISHED','ONGOING','COMPLETED')";

/** A signed-in, approved member (who may see members-only profiles). */
function viewerIsMember(ctx: Ctx): boolean {
  return ctx.actor?.user.status === "ACTIVE";
}

/** People who manage members or executives see every profile (as they can in the dashboard). */
function viewerManagesPeople(ctx: Ctx): boolean {
  return Boolean(ctx.actor) && ["members.manage", "executives.assign"].some((p) => authorize(ctx, p).outcome === "ALLOW");
}

/**
 * The profile's address: its slug, made from the name the first time it's needed ("nadia-rahman",
 * "nadia-rahman-2" when taken). The unique index makes a clash impossible; a lost race retries.
 */
export async function ensureProfileHandle(ctx: Ctx, profileId: string, name: string): Promise<string> {
  const existing = await ctx.db.value<string>("SELECT slug FROM profiles WHERE id = ?1", profileId);
  if (existing) return existing;
  const base = toSlug(name).slice(0, 60) || "member";
  for (let attempt = 0; attempt < 5; attempt++) {
    const taken = await ctx.db.all<{ slug: string }>("SELECT slug FROM profiles WHERE slug = ?1 OR slug LIKE ?2", base, `${base}-%`);
    const used = new Set(taken.map((t) => t.slug));
    let n = 1;
    let slug = base;
    while (used.has(slug) || /^\d{9}$/.test(slug)) slug = `${base}-${++n}`;
    if (attempt > 0) slug = `${base}-${newId().slice(-6)}`;
    try {
      const done = await ctx.db.run("UPDATE profiles SET slug = ?2 WHERE id = ?1 AND slug IS NULL", profileId, slug);
      if (done) return slug;
      return (await ctx.db.value<string>("SELECT slug FROM profiles WHERE id = ?1", profileId)) ?? slug;
    } catch {
      // Someone took it a moment ago: try again.
    }
  }
  return profileId;
}

interface ProfileRow {
  id: string; slug: string | null; user_id: string | null; full_name: string; person_type: string; department: string | null; batch: string | null; designation: string | null;
  bio: string | null; skills_json: string | null; public_email: string | null; linkedin_url: string | null; github_url: string | null; twitter_url: string | null; facebook_url: string | null;
  website_url: string | null; visibility: ProfileVisibility; avatar_json: string | null; account_status: string | null; member_since: string | null;
  message_privacy: string | null; served: number; student_id: string | null; updated_at: string | null;
}

/**
 * One person's profile for this viewer, or `{ restricted }` when they chose not to show it to
 * this viewer (with what the page may still say).
 */
export async function getProfile(ctx: Ctx, rawHandle: unknown) {
  const handle = String(rawHandle ?? "").trim().toLowerCase().slice(0, 80);
  if (!handle) throw new NotFoundError("Profile");
  const p = await ctx.db.first<ProfileRow>(
    `SELECT pr.id, pr.slug, pr.user_id, pr.full_name, pr.person_type, pr.department, pr.batch, pr.designation, pr.bio, pr.skills_json, pr.public_email,
            pr.linkedin_url, pr.github_url, pr.twitter_url, pr.facebook_url, pr.website_url, pr.visibility, ${avatarOfProfileSql("pr")} AS avatar_json,
            pr.student_id, pr.updated_at,
            u.status AS account_status, COALESCE(u.approved_at, u.created_at) AS member_since, u.message_privacy,
            EXISTS (SELECT 1 FROM committee_members cm JOIN committees c ON c.id = cm.committee_id AND c.status <> 'UPCOMING' AND c.deleted_at IS NULL
                    WHERE cm.profile_id = pr.id AND cm.deleted_at IS NULL) AS served
     FROM profiles pr LEFT JOIN users u ON u.id = pr.user_id AND u.deleted_at IS NULL
     WHERE (pr.slug = ?1 OR pr.id = ?1) AND pr.deleted_at IS NULL AND pr.merged_into_id IS NULL`, handle);
  if (!p) throw new NotFoundError("Profile");
  // Profiles belong to members (approved accounts) and to people who served on a committee.
  if (!p.served && p.account_status !== "ACTIVE") throw new NotFoundError("Profile");

  const self = Boolean(ctx.actor?.profile && ctx.actor.profile.id === p.id);
  const full = self || viewerManagesPeople(ctx) || p.visibility === "PUBLIC" || (p.visibility === "MEMBERS" && viewerIsMember(ctx));
  if (!full && !p.served) {
    return { restricted: true as const, name: p.visibility === "PRIVATE" ? null : p.full_name, visibility: p.visibility, signedIn: Boolean(ctx.actor) };
  }
  const handleOut = p.slug ?? (await ensureProfileHandle(ctx, p.id, p.full_name));
  const [history, posts, events, reach] = await Promise.all([
    ctx.db.all<{ committee: string; year: string; status: string; title: string; campus: string | null; ended: number }>(
      `SELECT c.name AS committee, c.slug AS year, c.status, cm.position_title AS title, cm.campus_label AS campus,
              (cm.end_date IS NOT NULL AND cm.end_date < date('now')) AS ended
       FROM committee_members cm JOIN committees c ON c.id = cm.committee_id AND c.deleted_at IS NULL AND c.status <> 'UPCOMING'
       WHERE cm.profile_id = ?1 AND cm.deleted_at IS NULL ORDER BY CAST(c.slug AS INTEGER) DESC, c.slug DESC, cm.display_order LIMIT 30`, p.id),
    ctx.db.all<{ type: string; slug: string; title: string; excerpt: string | null; published_at: string }>(
      `SELECT type, slug, title, excerpt, published_at FROM posts WHERE author_profile_id = ?1 AND deleted_at IS NULL AND status = 'PUBLISHED'
         AND published_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now') ORDER BY published_at DESC LIMIT 6`, p.id),
    ctx.db.all<{ slug: string; title: string; start_at: string | null; role: string }>(
      `SELECT e.slug, e.title, e.start_at, MIN(ep.role) AS role FROM event_people ep JOIN events e ON e.id = ep.event_id AND ${PUBLIC_EVENT}
       WHERE (ep.profile_id = ?1 OR (?2 IS NOT NULL AND ep.user_id = ?2)) AND ep.role IN ('SPEAKER','COORDINATOR','PHOTOGRAPHER','JUDGE','CHIEF_GUEST','SPECIAL_GUEST','GUEST')
       GROUP BY e.id ORDER BY e.start_at DESC LIMIT 8`, p.id, p.user_id),
    ctx.actor && p.user_id && !self
      ? ctx.db.first<{ blocked: number }>("SELECT EXISTS (SELECT 1 FROM user_blocks WHERE (blocker_id = ?1 AND blocked_id = ?2) OR (blocker_id = ?2 AND blocked_id = ?1)) AS blocked", ctx.actor.user.id, p.user_id)
      : Promise.resolve(null),
  ]);
  const skills = (() => {
    try {
      return p.skills_json ? (JSON.parse(p.skills_json) as unknown[]).map(String).slice(0, 15) : [];
    } catch {
      return [];
    }
  })();
  // Whether "Message" can work: an approved account on both sides, their settings allow it, no block.
  const executiveViewer = ctx.actor ? isClubExecutive(ctx.actor.subject) : false;
  const canMessage = Boolean(
    ctx.actor && !self && viewerIsMember(ctx) && p.user_id && p.account_status === "ACTIVE" && !reach?.blocked
      && p.message_privacy !== "NOBODY" && (p.message_privacy !== "EXECUTIVES" || executiveViewer),
  );
  const current = history.filter((h) => h.status === "CURRENT" && !h.ended);
  return {
    restricted: false as const,
    id: p.id,
    handle: handleOut,
    name: p.full_name,
    avatarUrl: avatarUrl(p.avatar_json, "md"),
    personType: p.person_type as "STUDENT" | "FACULTY" | "ALUMNI" | "EXTERNAL",
    department: p.department,
    designation: p.person_type === "FACULTY" ? p.designation : null,
    // Chosen details: shown only when the member's choice allows this viewer.
    batch: full ? p.batch : null,
    bio: full ? p.bio : null,
    skills: full ? skills : [],
    links: {
      linkedin: p.linkedin_url, github: p.github_url, twitter: p.twitter_url, facebook: p.facebook_url,
      website: full ? p.website_url : null, email: p.public_email,
    },
    memberSince: p.account_status === "ACTIVE" ? p.member_since : null,
    current: current.map((h) => ({ title: h.title, committee: h.committee, year: h.year, campus: h.campus })),
    journey: history.map((h) => ({ title: h.title, committee: h.committee, year: h.year, campus: h.campus, current: h.status === "CURRENT" && !h.ended })),
    posts: posts.map((x) => ({ ...x, href: x.type === "BLOG" ? `/blog/${x.slug}` : x.type === "NEWS" ? `/news/${x.slug}` : `/announcements/${x.slug}` })),
    events: events.map((e) => ({ ...e, href: `/events/${e.slug}` })),
    visibility: p.visibility,
    // Someone who served on a committee also has a public executive page (addressed by student ID,
    // which that page already shows); linked so search engines see one person.
    executivePage: p.served && p.student_id && /^\d{9}$/.test(p.student_id) ? `/executives/${p.student_id}` : null,
    updatedAt: p.updated_at,
    isSelf: self,
    limited: !full,
    canMessage,
    messageUserId: canMessage ? p.user_id : null,
  };
}

export type PublicProfile = Exclude<Awaited<ReturnType<typeof getProfile>>, { restricted: true }>;

/** The members directory: approved members whose profiles are visible to members, and everyone who serves now. */
export async function membersDirectory(ctx: Ctx, input: { q?: unknown; department?: unknown; batch?: unknown; page?: unknown }) {
  if (!viewerIsMember(ctx)) throw new ValidationError("Sign in as an approved member to see the members directory.");
  const q = String(input.q ?? "").trim().replace(/[%_]/g, "").slice(0, 60);
  const department = String(input.department ?? "").trim().slice(0, 60) || null;
  const batch = String(input.batch ?? "").trim().slice(0, 20) || null;
  const page = Math.max(1, Number(input.page) || 1);
  const all = viewerManagesPeople(ctx) ? 1 : 0;
  const rows = await ctx.db.all<{ id: string; slug: string | null; full_name: string; department: string | null; batch: string | null; person_type: string; skills_json: string | null;
    visibility: string; avatar_json: string | null; positions: string | null }>(
    `SELECT pr.id, pr.slug, pr.full_name, pr.department, CASE WHEN pr.visibility <> 'PRIVATE' OR ?6 = 1 THEN pr.batch END AS batch, pr.person_type,
            CASE WHEN pr.visibility <> 'PRIVATE' OR ?6 = 1 THEN pr.skills_json END AS skills_json, pr.visibility, ${avatarOfProfileSql("pr")} AS avatar_json,
            (SELECT group_concat(cm.position_title, ', ') FROM committee_members cm JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT'
               WHERE cm.profile_id = pr.id AND cm.deleted_at IS NULL AND cm.is_active = 1) AS positions
     FROM profiles pr LEFT JOIN users u ON u.id = pr.user_id AND u.deleted_at IS NULL
     WHERE pr.deleted_at IS NULL AND pr.merged_into_id IS NULL
       AND ((u.status = 'ACTIVE' AND (pr.visibility <> 'PRIVATE' OR ?6 = 1))
            OR EXISTS (SELECT 1 FROM committee_members cm JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT' WHERE cm.profile_id = pr.id AND cm.deleted_at IS NULL))
       AND (?1 = '' OR pr.full_name LIKE ?2 OR pr.skills_json LIKE ?2)
       AND (?3 IS NULL OR pr.department LIKE ?3) AND (?4 IS NULL OR pr.batch = ?4)
     ORDER BY (positions IS NULL), pr.full_name LIMIT 25 OFFSET ?5`,
    q, `%${q}%`, department ? `%${department.replace(/[%_]/g, "")}%` : null, batch, (page - 1) * 24, all);
  return {
    rows: rows.slice(0, 24).map((r) => ({
      handle: r.slug ?? r.id, name: r.full_name, avatarUrl: avatarUrl(r.avatar_json), department: r.department, batch: r.batch,
      faculty: r.person_type === "FACULTY", positions: r.positions,
      skills: (() => { try { return r.skills_json ? (JSON.parse(r.skills_json) as unknown[]).map(String).slice(0, 4) : []; } catch { return []; } })(),
    })),
    page,
    hasMore: rows.length > 24,
  };
}
