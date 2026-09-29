/**
 * The activity log as leaders read it: plain sentences ("Bakul Ahmed approved Rafi's
 * membership"), grouped by area, filterable by person, area and date, with a field-by-field
 * view of what changed. Built on the append-only audit_logs table; keyset pagination keeps
 * every page one small query however long the history grows.
 */
import { requireActor, requirePermission } from "../authz";
import { avatarOfUserSql, avatarUrl } from "../avatar";
import type { Ctx } from "../context";

import { ACTIVITY_AREAS, type ActivityArea } from "../../governance/activity-areas";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** The first and last instant (UTC) of a calendar day in Dhaka. */
const dhakaDayStart = (day?: string | null) => (day && DAY_RE.test(day) ? new Date(`${day}T00:00:00.000+06:00`).toISOString() : null);
const dhakaDayEnd = (day?: string | null) => (day && DAY_RE.test(day) ? new Date(`${day}T23:59:59.999+06:00`).toISOString() : null);


export { ACTIVITY_AREAS, type ActivityArea };

const AREA_PREFIXES: Record<ActivityArea, string[]> = {
  Members: ["member.", "members.", "user.register", "user.email_verified", "user.suspend", "user.reactivate", "profile."],
  Security: ["auth.", "account.", "session.", "user.reset_link"],
  Content: ["post.", "posts."],
  Events: ["event.", "events."],
  Executives: ["executive.", "executives.", "committee.", "position."],
  Governance: ["role.", "permission.", "rule.", "policy.", "settings.", "governance.", "approval."],
  Media: ["media."],
  Recruitment: ["recruitment."],
  Services: ["lostfound.", "message.", "report.", "notification.", "form.", "contact."],
  "Tasks & meetings": ["task.", "meeting."],
};

export function areaOfAction(action: string): ActivityArea {
  for (const area of ACTIVITY_AREAS) if (AREA_PREFIXES[area].some((p) => action.startsWith(p))) return area;
  return "Governance";
}

type Row = {
  id: string; actor_user_id: string | null; actor_label: string | null; action: string; resource_type: string | null; resource_id: string | null;
  reason: string | null; request_id: string | null; created_at: string; before_json: string | null; after_json: string | null; decision_json: string | null;
  actor_avatar_json?: string | null;
};

/** What a resource is called, for sentences and links. */
interface Label { name: string; link?: string }

async function labels(ctx: Ctx, rows: Row[]): Promise<Map<string, Label>> {
  const ids = (type: string) => [...new Set(rows.filter((r) => r.resource_type === type && r.resource_id).map((r) => r.resource_id!))];
  const out = new Map<string, Label>();
  const q = async (type: string, sql: string, link: (id: string, row: { link?: string | null }) => string | undefined) => {
    const list = ids(type);
    if (!list.length) return;
    for (const r of await ctx.db.all<{ id: string; name: string; link?: string | null }>(sql, JSON.stringify(list))) out.set(`${type}:${r.id}`, { name: r.name, link: link(r.id, r) });
  };
  await Promise.all([
    q("user", `SELECT u.id, COALESCE(p.full_name, u.email) AS name FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id IN (SELECT value FROM json_each(?1))`,
      (id) => `/dashboard/access/${encodeURIComponent(id)}`),
    q("profile", "SELECT id, full_name AS name FROM profiles WHERE id IN (SELECT value FROM json_each(?1))", (id) => `/dashboard/people/${encodeURIComponent(id)}`),
    q("post", "SELECT id, title AS name FROM posts WHERE id IN (SELECT value FROM json_each(?1))", (id) => `/dashboard/posts/${id}`),
    q("event", "SELECT id, title AS name FROM events WHERE id IN (SELECT value FROM json_each(?1))", (id) => `/dashboard/events/${id}`),
    q("role", "SELECT id, name FROM roles WHERE id IN (SELECT value FROM json_each(?1))", (id) => `/dashboard/roles/${encodeURIComponent(id)}`),
    q("position", "SELECT id, name FROM positions WHERE id IN (SELECT value FROM json_each(?1))", (id) => `/dashboard/positions/${encodeURIComponent(id)}`),
    q("committee", "SELECT id, name FROM committees WHERE id IN (SELECT value FROM json_each(?1))", (id) => `/dashboard/committees/${id}`),
    q("committee_member",
      `SELECT cm.id, COALESCE(cm.display_name, pr.full_name) || ' (' || cm.position_title || ', ' || c.name || ')' AS name, cm.committee_id AS link
       FROM committee_members cm JOIN profiles pr ON pr.id = cm.profile_id JOIN committees c ON c.id = cm.committee_id WHERE cm.id IN (SELECT value FROM json_each(?1))`,
      (_id, row) => (row.link ? `/dashboard/committees/${row.link}` : undefined)),
    q("rule", "SELECT id, name FROM rules WHERE id IN (SELECT value FROM json_each(?1))", (id) => `/dashboard/rules/${encodeURIComponent(id)}`),
    q("task", "SELECT id, title AS name FROM tasks WHERE id IN (SELECT value FROM json_each(?1))", (id) => `/dashboard/tasks/${id}`),
    q("meeting", "SELECT id, title AS name FROM meetings WHERE id IN (SELECT value FROM json_each(?1))", (id) => `/dashboard/meetings/${id}`),
  ]);
  return out;
}

const VERBS: Record<string, string> = {
  "member.approve": "approved the membership of", "member.reject": "turned down the application of", "member.request_correction": "asked for corrections from",
  "member.link_profile": "linked a profile to", "member.review_note": "noted on the application of", "user.register": "signed up", "user.email_verified": "verified their email",
  "user.suspend": "suspended", "user.reactivate": "reactivated", "user.reset_link": "made a password-reset link for",
  "profile.update": "updated the profile of", "profile.merge": "merged a duplicate into the profile of", "profile.delete": "deleted the duplicate profile", "profile.create": "added the profile of", "profile.avatar": "changed the photo of", "profile.invite": "invited",
  "auth.login": "signed in", "auth.locked": "was locked out after failed sign-ins", "auth.password_changed": "changed their password", "auth.password_reset": "reset their password",
  "auth.invite_accepted": "accepted an invitation", "account.email_change": "changed their sign-in email", "account.delete": "deleted their account",
  "session.revoke": "signed out a device", "session.revoke_others": "signed out their other devices",
  "account.mfa_enabled": "turned on two-factor sign-in", "account.mfa_disabled": "turned off two-factor sign-in", "account.mfa_recovery_codes": "made new two-factor recovery codes",
  "account.mfa_reset": "reset two-factor sign-in for",
  "post.create": "drafted", "post.update": "edited", "post.publish": "published", "posts.publish": "published", "post.unpublish": "unpublished", "post.archive": "archived",
  "event.create": "created the event", "event.update": "edited the event", "event.publish": "published the event", "events.publish": "published the event",
  "event.people": "updated the people of", "event.registration": "registered for", "event.registration_cancel": "cancelled a registration for",
  "event.registration_status": "changed a registration for", "event.registrations_export": "exported registrations of", "event.gallery_remove": "removed a photo from",
  "executive.assign": "listed", "executive.update": "edited the listing of", "executive.end": "ended the listing of",
  "executive.reactivate": "reactivated the listing of", "executive.reorder": "reordered executives in", "executives.bulk": "made a bulk change to",
  "executives.import": "imported executives into", "executive.avatar_crop": "reframed the portrait of",
  "executive.remove": "removed, as a mistake, the listing of", "executive.restore": "restored the listing of", "executives.export": "exported the executives of",
  "committee.create": "created the committee", "committee.update": "updated the committee", "committee.delete": "deleted the committee",
  "position.create": "created the position", "position.update": "edited the position", "position.archive": "archived the position", "position.move": "moved the position",
  "position.grant_add": "gave a permission to", "position.grant_remove": "removed a permission from", "position.grants_copy": "copied permissions into",
  "role.create": "created the role", "role.update": "edited the role", "role.archive": "archived the role", "role.grant": "gave a role to", "role.grant_bulk": "gave several members the role", "role.revoke": "removed a role from",
  "role.grant_add": "gave a permission to", "role.grant_remove": "removed a permission from", "role.grants_copy": "copied permissions into",
  "permission.grant_direct": "gave a permission to", "permission.revoke_direct": "removed a permission from",
  "rule.create": "created the rule", "rule.update": "changed the rule", "policy.create": "created an approval policy", "policy.update": "changed an approval policy",
  "settings.update": "changed a setting", "settings.system_update": "changed a protected setting", "settings.org_update": "changed page content",
  "approval.requested": "asked for approval on", "approval.approve": "approved", "approval.reject": "requested changes on", "approval.cancelled": "withdrew a request on",
  "governance.protected_applied_alone": "made a protected change as the only Moderator", "governance.sensitive_grant": "requested a sensitive permission for",
  "media.upload": "uploaded a file", "media.upload_deduplicated": "reused a file already in the library", "media.update": "edited a file's details",
  "media.replace": "replaced an image", "media.archive": "archived a file",
  "recruitment.create": "opened a recruitment campaign", "recruitment.update": "changed a recruitment campaign", "recruitment.apply": "applied for recruitment",
  "recruitment.review": "reviewed an application", "recruitment.assign": "assigned an application", "recruitment.note": "noted on an application",
  "members.export": "exported the member list", "recruitment.view": "opened an application's documents", "recruitment.export": "exported recruitment applications", "recruitment.import": "imported recruitment applications from a spreadsheet",
  "lostfound.create": "posted in lost & found", "lostfound.status": "moderated a lost & found post", "lostfound.delete": "removed a lost & found post",
  "event.cancelled": "cancelled the event", "event.completed": "marked as finished the event", "event.ongoing": "marked as started the event",
  "event.archived": "archived the event", "event.draft": "moved back to draft the event",
  "rule.active": "switched on the rule", "rule.inactive": "switched off the rule", "rule.archived": "archived the rule",
  "governance.protected_change": "requested a protected change to",
  "lostfound.image_removed": "removed a photo from a lost & found post", "lostfound.report": "reported a lost & found post",
  "message.report": "reported a message", "report.resolve": "handled a report",
  "task.create": "gave the task", "task.update": "edited the task", "task.status": "updated the status of the task",
  "meeting.schedule": "scheduled the meeting", "meeting.update": "changed the meeting", "meeting.cancel": "cancelled the meeting", "meeting.notes": "wrote notes for the meeting",
  "message.status": "handled a contact message", "notification.broadcast": "sent an announcement", "form.create": "added a form", "form.update": "changed a form", "form.archive": "archived a form",
};

const HIDDEN = new Set(["password", "password_hash", "token", "phone", "secret", "ip_hash"]);

/** Field-by-field changes between two audit snapshots (one level deep, secrets hidden). */
export function diffSnapshots(beforeJson: string | null, afterJson: string | null): Array<{ field: string; before: string; after: string }> {
  const parse = (s: string | null): Record<string, unknown> => {
    try {
      const v = s ? JSON.parse(s) : {};
      return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : { value: v };
    } catch {
      return {};
    }
  };
  const a = parse(beforeJson);
  const b = parse(afterJson);
  const show = (v: unknown) => (v === undefined || v === null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)).slice(0, 300);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((k) => !HIDDEN.has(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .map((k) => ({ field: k.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase(), before: show(a[k]), after: show(b[k]) }));
}

export interface ActivityEntry {
  id: string;
  at: string;
  area: ActivityArea;
  action: string;
  actor: { id: string | null; name: string; avatarUrl: string | null };
  /** "approved the membership of" — the actor comes before, the target (if shown) after. */
  verb: string;
  showTarget: boolean;
  sentence: string;
  target: Label | null;
  reason: string | null;
  requestId: string | null;
  changes: Array<{ field: string; before: string; after: string }>;
  decision: string | null;
}

export interface ActivityFilter {
  actor?: string;
  area?: string;
  q?: string;
  from?: string;
  to?: string;
  /** Keyset cursor: "<created_at>|<id>" of the last entry already shown. */
  before?: string;
  /** Everything recorded in one request (e.g. a bulk change). */
  request?: string;
  /** Page size, at most 40 (the dashboard home shows a few). */
  limit?: number;
}

/** One page of the activity log (40 entries), newest first. */
export async function activityFeed(ctx: Ctx, f: ActivityFilter = {}): Promise<{ entries: ActivityEntry[]; next: string | null }> {
  const actor = requireActor(ctx);
  // Everyone may read their own activity; the whole log needs audit.read.
  if (!(f.actor && f.actor === actor.user.id)) requirePermission(ctx, "audit.read");
  const area = ACTIVITY_AREAS.find((a) => a === f.area);
  const prefixes = area ? AREA_PREFIXES[area] : [];
  const [cursorAt, cursorId] = (f.before ?? "").split("|");
  const q = f.q?.trim() ? `%${f.q.trim().replace(/[%_]/g, "")}%` : null;
  const size = Math.min(Math.max(Math.floor(Number(f.limit) || 40), 1), 40);
  const rows = await ctx.db.all<Row>(
    `SELECT id, actor_user_id, actor_label, action, resource_type, resource_id, reason, request_id, created_at, before_json, after_json, decision_json,
            ${avatarOfUserSql("audit_logs.actor_user_id")} AS actor_avatar_json
     FROM audit_logs
     WHERE (?1 IS NULL OR actor_user_id = ?1 OR resource_id = ?1 OR resource_id IN (SELECT id FROM profiles WHERE user_id = ?1))
       AND (?2 = '[]' OR EXISTS (SELECT 1 FROM json_each(?2) p WHERE audit_logs.action LIKE p.value || '%'))
       AND (?3 IS NULL OR actor_label LIKE ?3 OR action LIKE ?3 OR reason LIKE ?3 OR after_json LIKE ?3)
       AND (?4 IS NULL OR created_at >= ?4) AND (?5 IS NULL OR created_at <= ?5)
       AND (?6 IS NULL OR created_at < ?6 OR (created_at = ?6 AND id < ?7))
       AND (?8 IS NULL OR request_id = ?8)
     ORDER BY created_at DESC, id DESC LIMIT ?9`,
    // Dates are days in Dhaka (UTC+6), as the page shows them.
    f.actor ?? null, JSON.stringify(prefixes), q, dhakaDayStart(f.from), dhakaDayEnd(f.to), cursorAt || null, cursorId ?? "", f.request ?? null, size + 1,
  );
  const page = rows.slice(0, size);
  const names = await labels(ctx, page);
  const entries = page.map((r): ActivityEntry => {
    const target = r.resource_type && r.resource_id ? names.get(`${r.resource_type}:${r.resource_id}`) ?? null : null;
    const who = r.actor_label ?? "Someone";
    const verb = VERBS[r.action] ?? r.action.replace(/[._]/g, " ");
    const selfOnly = /^(signed in|signed up|verified|changed their|reset their|accepted|deleted their|was locked|uploaded|reused|sent an|opened a recruitment|applied|posted|exported recruitment|reported|removed a photo from a lost|handled a report|turned on two|turned off two|made new two|exported the member|imported recruitment)/.test(verb);
    const showTarget = Boolean(target) && !selfOnly;
    const sentence = showTarget ? `${who} ${verb} ${target!.name}` : `${who} ${verb}`;
    let decision: string | null = null;
    try {
      const d = r.decision_json ? (JSON.parse(r.decision_json) as { summary?: string }) : null;
      decision = d?.summary ?? null;
    } catch {
      decision = null;
    }
    return {
      id: r.id, at: r.created_at, area: areaOfAction(r.action), action: r.action, actor: { id: r.actor_user_id, name: who, avatarUrl: avatarUrl(r.actor_avatar_json) },
      verb, showTarget, sentence, target, reason: r.reason, requestId: r.request_id, changes: diffSnapshots(r.before_json, r.after_json), decision,
    };
  });
  const last = page[page.length - 1];
  return { entries, next: rows.length > size && last ? `${last.created_at}|${last.id}` : null };
}

