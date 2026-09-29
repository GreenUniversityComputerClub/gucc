"use server";

/**
 * Server actions for the admin. Each is a thin adapter: read the form, call
 * the API procedure (which authenticates, authorizes, validates and audits),
 * and refresh the caches it reports. No authorization logic lives here.
 */
import { runAction } from "@/lib/api/session";

type Fd = FormData;
const obj = (fd: Fd): Record<string, string> => {
  const o: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === "string" && !k.startsWith("$ACTION")) o[k] = v;
  });
  return o;
};
const s = (fd: Fd, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
const json = <T,>(fd: Fd, k: string, fallback: T): T => {
  try {
    return JSON.parse(s(fd, k) || "null") ?? fallback;
  } catch {
    return fallback;
  }
};
const applied = (r: { applied?: boolean; message?: string } | undefined, done: string) => ({
  message: r?.applied === false ? (r.message ?? "Sent to a Moderator for approval. You'll be notified.") : done,
});

// ── members ───────────────────────────────────────────────
export async function approveMemberAction(userId: string, _fd: Fd) {
  return runAction("members.approve", { userId }, { message: "Approved." });
}
/** Approve and attach the account to the existing profile it claimed, in one step. */
export async function approveAndLinkAction(userId: string, profileId: string, _fd: Fd) {
  return runAction("members.approve", { userId, linkProfileId: profileId }, { message: "Approved and linked to their existing profile." });
}
export async function reviewNoteAction(userId: string, fd: Fd) {
  return runAction("members.reviewNote", { userId, note: s(fd, "note") || null }, { message: "Note saved." });
}
export async function rejectMemberAction(userId: string, fd: Fd) {
  return runAction("members.reject", { userId, reason: s(fd, "reason") }, { message: "Rejected." });
}
export async function requestCorrectionAction(userId: string, fd: Fd) {
  return runAction("members.requestCorrection", { userId, note: s(fd, "note") }, { message: "Correction requested." });
}
export async function suspendUserAction(userId: string, fd: Fd) {
  return runAction("members.suspend", { userId, reason: s(fd, "reason") }, { message: "Suspended." });
}
export async function reactivateUserAction(userId: string, _fd: Fd) {
  return runAction("members.reactivate", { userId }, { message: "Reactivated." });
}
export async function linkProfileAction(userId: string, fd: Fd) {
  return runAction("members.linkProfile", { userId, profileId: s(fd, "profileId") }, { message: "Profile linked." });
}

// ── people ────────────────────────────────────────────────
export async function createPersonAction(fd: Fd) {
  return runAction<{ id: string }>("people.create", { input: obj(fd) });
}
export async function updatePersonAction(id: string, fd: Fd) {
  return runAction("people.update", { id, input: obj(fd) }, { message: "Profile saved." });
}
export async function mergePeopleAction(keepId: string, fd: Fd) {
  return runAction<{ message: string }>("people.merge", { keepId, dropId: s(fd, "dropId"), reason: s(fd, "reason") });
}
export async function deletePersonAction(id: string, fd: Fd) {
  return runAction("people.delete", { id, reason: s(fd, "reason") }, { message: "Deleted." });
}
export async function invitePersonAction(profileId: string, fd: Fd) {
  const r = await runAction<{ message: string }>("people.invite", { profileId, email: s(fd, "email") });
  return r.ok ? { ...r, data: { message: r.data?.message ?? "Invitation sent." } } : r;
}

// ── roles, positions, permissions ─────────────────────────
export async function grantRoleAction(fd: Fd) {
  const r = await runAction<{ applied: boolean; message?: string }>("roles.grant", { userId: s(fd, "userId"), roleKey: s(fd, "roleKey"), reason: s(fd, "reason") || null, expiresAt: s(fd, "expiresAt") || null });
  return r.ok ? { ...r, data: applied(r.data, "Role granted.") } : r;
}
export async function revokeRoleAction(userRoleId: string, fd: Fd) {
  const r = await runAction<{ applied: boolean }>("roles.revoke", { userRoleId, reason: s(fd, "reason") || null });
  return r.ok ? { ...r, data: applied(r.data, "Role revoked.") } : r;
}
export async function createRoleAction(fd: Fd) {
  return runAction("roles.create", { input: obj(fd) }, { message: "Role created." });
}
export async function roleGrantAction(roleId: string, add: boolean, fd: Fd) {
  const r = await runAction<{ applied: boolean; message?: string }>("roles.setGrant", { roleId, add, permission: s(fd, "permission"), scope: s(fd, "scope") || "ALL", scopeValue: s(fd, "scopeValue") });
  return r.ok ? { ...r, data: applied(r.data, add ? "Permission added." : "Permission removed.") } : r;
}
/** One cell of the permission matrix (roles and positions). */
export async function setGrantAction(kind: "role" | "position", id: string, grant: { permission: string; scope: string; scopeValue: string }, add: boolean) {
  const r = await runAction<{ applied: boolean; message?: string }>(kind === "role" ? "roles.setGrant" : "positions.setGrant",
    { ...(kind === "role" ? { roleId: id } : { positionId: id }), add, ...grant });
  return r.ok ? { ...r, data: applied(r.data, add ? "Permission added." : "Permission removed.") } : r;
}
export async function copyGrantsAction(target: string, fd: Fd) {
  return runAction("grants.copy", { target, source: s(fd, "source") });
}
export async function updateRoleAction(roleId: string, fd: Fd) {
  return runAction("roles.update", { roleId, input: obj(fd) }, { message: "Role saved." });
}
export async function archiveRoleAction(roleId: string, _fd: Fd) {
  return runAction("roles.archive", { roleId }, { message: "Role archived." });
}
export async function grantDirectAction(fd: Fd) {
  const r = await runAction<{ applied: boolean; message?: string }>("permissions.grantDirect", { input: obj(fd) });
  return r.ok ? { ...r, data: applied(r.data, "Permission granted.") } : r;
}
export async function revokeDirectAction(id: string, fd: Fd) {
  return runAction("permissions.revokeDirect", { id, reason: s(fd, "reason") || null }, { message: "Permission removed." });
}
export async function trustAuthorAction(userId: string, kind: "posts" | "events", fd: Fd) {
  const r = await runAction<{ applied: boolean; message?: string }>("permissions.trustAuthor", { input: { userId, kind, expiresAt: s(fd, "expiresAt") || null, reason: s(fd, "reason") || null } });
  return r.ok ? { ...r, data: applied(r.data, kind === "posts" ? "Their own posts now publish without approval." : "Their own events now publish without approval.") } : r;
}
/** Create a position and, optionally, give it another role's or position's permissions. */
export async function createPositionAction(fd: Fd) {
  const input = { ...obj(fd), isActive: true };
  const source = s(fd, "copyFrom");
  const created = await runAction<{ id: string }>("positions.save", { id: null, input });
  if (!created.ok || !source) return created.ok ? { ...created, message: "Position created." } : created;
  const copied = await runAction<{ message: string }>("grants.copy", { target: `position:${created.data!.id}`, source });
  return { ok: true as const, data: { id: created.data!.id, message: `Position created. ${copied.ok ? copied.data!.message : `Permissions weren't copied: ${copied.error}`}` } };
}
export async function archivePositionAction(positionId: string, _fd: Fd) {
  return runAction("positions.archive", { positionId }, { message: "Position archived." });
}
export async function savePositionAction(id: string | null, fd: Fd) {
  return runAction("positions.save", { id, input: { ...obj(fd), isActive: fd.get("isActive") === "on" } }, { message: "Position saved." });
}
export async function positionGrantAction(positionId: string, add: boolean, fd: Fd) {
  const r = await runAction<{ applied: boolean; message?: string }>("positions.setGrant", { positionId, add, permission: s(fd, "permission"), scope: s(fd, "scope") || "ALL", scopeValue: s(fd, "scopeValue") });
  return r.ok ? { ...r, data: applied(r.data, add ? "Permission added." : "Permission removed.") } : r;
}

// ── rules, policies, settings ─────────────────────────────
function ruleFromForm(fd: Fd) {
  return {
    name: s(fd, "name"),
    description: s(fd, "description") || undefined,
    effect: s(fd, "effect"),
    permission: s(fd, "permission"),
    resourceType: s(fd, "resourceType") || null,
    scope: s(fd, "scope") || "ALL",
    scopeValue: s(fd, "scopeValue"),
    priority: Number(s(fd, "priority") || 100),
    approvalPolicyKey: s(fd, "approvalPolicyKey") || null,
    isProtected: fd.get("isProtected") === "on",
    conditions: json(fd, "conditions", [] as unknown[]),
    expectedUpdatedAt: s(fd, "expectedUpdatedAt") || undefined,
  };
}
/** A notification rule: WHEN something happens THEN notify these people (starts as a draft). */
export async function createNotifyRuleAction(fd: Fd) {
  return runAction<{ id: string }>("rules.createNotify", {
    input: { name: s(fd, "name"), event: s(fd, "event"), message: s(fd, "message") || undefined, targets: json(fd, "targets", []), conditions: json(fd, "conditions", []) },
  }, { message: "Draft notification rule created. Activate it when you're ready." });
}
export async function createRuleAction(fd: Fd) {
  return runAction<{ id: string }>("rules.create", { input: ruleFromForm(fd) });
}
export async function updateRuleAction(id: string, fd: Fd) {
  return runAction("rules.update", { id, input: ruleFromForm(fd) }, { message: "Rule saved." });
}
export async function ruleStatusAction(id: string, status: "ACTIVE" | "INACTIVE" | "ARCHIVED", _fd: Fd) {
  const r = await runAction<{ applied: boolean }>("rules.setStatus", { id, status });
  return r.ok ? { ...r, data: { message: r.data?.applied === false ? "Protected rule: sent to a second Moderator for approval." : `Rule ${status.toLowerCase()}.` } } : r;
}
export async function simulateAccessAction(fd: Fd) {
  return runAction<Awaited<ReturnType<typeof import("@/lib/server/services/access").simulateAccess>>>("access.simulate", {
    userId: s(fd, "userId"), permission: s(fd, "permission"), resourceType: s(fd, "resourceType") || undefined, resourceId: s(fd, "resourceId") || undefined,
  });
}
export async function explainAction(fd: Fd) {
  const resource = s(fd, "resourceType") ? { type: s(fd, "resourceType"), category: s(fd, "category") || undefined, status: s(fd, "status") || undefined } : undefined;
  return runAction("rules.explain", { userId: s(fd, "userId"), permission: s(fd, "permission"), resource });
}
export async function savePolicyAction(id: string | null, fd: Fd) {
  return runAction("policies.save", { id, input: { ...obj(fd), approvers: s(fd, "approvers") } });
}
export async function systemSettingAction(key: string, fd: Fd) {
  const r = await runAction<{ applied: boolean }>("settings.system", { key, value: s(fd, "value"), expectedUpdatedAt: s(fd, "expectedUpdatedAt") || undefined });
  return r.ok ? { ...r, data: { message: r.data?.applied === false ? "Protected setting: sent to a second Moderator for approval." : "Saved." } } : r;
}
export async function orgSettingAction(key: string, fd: Fd) {
  return runAction("settings.org", { key, value: s(fd, "value"), expectedUpdatedAt: s(fd, "expectedUpdatedAt") || undefined });
}
/** Uploads or email on/off from System health (off applies at once; on is a Moderator's protected change). */
export async function switchAction(key: string, on: boolean, _fd: Fd) {
  const r = await runAction<{ applied: boolean; message: string }>("system.switch", { key, on });
  return r.ok ? { ...r, data: { message: r.data?.message } } : r;
}
export async function testEmailAction(_fd: Fd) {
  return runAction<{ ok: boolean; message: string }>("email.test", {});
}

// ── approvals ─────────────────────────────────────────────
export async function decideAction(id: string, decision: "APPROVE" | "REJECT", fd: Fd) {
  const r = await runAction<{ status: string }>("approvals.decide", { id, decision, comment: s(fd, "comment") || null });
  return r.ok ? { ...r, data: { message: r.data?.status === "PENDING" ? "Recorded. More approvals are needed." : `Request ${String(r.data?.status ?? "").toLowerCase()}.` } } : r;
}
/** Approve several requests at once; each is decided separately (and audited) by the API. */
const BULK_APPROVE_MAX = 20;

export async function bulkApproveAction(fd: Fd) {
  const ids = [...new Set(fd.getAll("ids").filter((v): v is string => typeof v === "string" && v.length > 0))];
  if (ids.length === 0) return { ok: false as const, error: "Tick the requests to approve.", code: "VALIDATION" };
  if (ids.length > BULK_APPROVE_MAX) return { ok: false as const, error: `Approve at most ${BULK_APPROVE_MAX} at a time.`, code: "VALIDATION" };
  // Each approval is its own API call (the API's per-call database budget), a few at a time so
  // the whole batch finishes well within the website's time limit. Access changes are never
  // approved in bulk: each is opened and decided on its own.
  let done = 0;
  const failed: string[] = [];
  for (let i = 0; i < ids.length; i += 4) {
    const results = await Promise.all(ids.slice(i, i + 4).map((id) => runAction<{ status: string }>("approvals.decide", { id, decision: "APPROVE", comment: null, bulk: true })));
    for (const r of results) {
      if (r.ok) done++;
      else failed.push(r.error);
    }
  }
  return { ok: true as const, data: { message: `Approved ${done} of ${ids.length}.${failed.length ? ` Not approved: ${[...new Set(failed)].join("; ")}` : ""}` } };
}
/** Approve, and let the author publish their own posts or events directly from now on. */
export async function approveAndTrustAction(id: string, authorId: string, kind: "posts" | "events", fd: Fd) {
  const r = await runAction<{ status: string }>("approvals.decide", { id, decision: "APPROVE", comment: s(fd, "comment") || null });
  if (!r.ok) return r;
  const t = await runAction<{ applied: boolean; message?: string }>("permissions.trustAuthor", { input: { userId: authorId, kind } });
  const trusted = t.ok ? (t.data?.applied === false ? t.data.message ?? "Trust sent for approval." : `Their own ${kind} now publish without approval.`) : `Not trusted: ${t.error}`;
  return { ok: true as const, data: { message: `Approved. ${trusted}` } };
}
export async function cancelApprovalAction(id: string, _fd: Fd) {
  return runAction("approvals.cancel", { id }, { message: "Withdrawn." });
}

// ── committees & executives ───────────────────────────────
export async function createCommitteeAction(fd: Fd) {
  return runAction<{ id: string }>("committees.create", { input: obj(fd) });
}
export async function startNextCommitteeAction(fd: Fd) {
  return runAction<{ id: string }>("committees.startNext", { input: obj(fd) });
}
export async function updateCommitteeAction(id: string, fd: Fd) {
  return runAction("committees.update", { id, input: obj(fd) }, { message: "Committee saved." });
}
export async function assignExecutiveAction(committeeId: string, fd: Fd) {
  const input = obj(fd);
  const r = await runAction<{ id: string; profileId: string; hasAccount: boolean }>("executives.assign", { committeeId, input });
  if (!r.ok) return r;
  // Optional invitation in the same step for someone without an account.
  if (input.inviteEmail && r.data && !r.data.hasAccount) {
    const inv = await runAction<{ message: string }>("people.invite", { profileId: r.data.profileId, email: input.inviteEmail });
    return { ok: true as const, data: { ...r.data, message: inv.ok ? `Added. ${inv.data?.message ?? "Invitation sent."}` : `Added, but the invitation failed: ${inv.error}` } };
  }
  return { ...r, data: { ...r.data!, message: "Added to the committee." } };
}
export async function updateAssignmentAction(id: string, fd: Fd) {
  return runAction("executives.update", { id, input: obj(fd) }, { message: "Saved." });
}
export async function endAssignmentAction(id: string, mode: "end" | "remove", fd: Fd) {
  return runAction("executives.end", { id, mode, reason: s(fd, "reason") || null }, { message: mode === "end" ? "Assignment ended." : "Removed." });
}
export async function moveAssignmentAction(id: string, direction: "up" | "down", _fd: Fd) {
  return runAction("executives.move", { id, direction });
}

// ── executive import (JSON / CSV) ─────────────────────────
export interface ImportPayload {
  text: string;
  format: "json" | "csv";
  mode: "insert" | "update" | "upsert";
  defaultCommitteeId?: string | null;
  resolutions?: { positions?: Record<string, string>; rows?: Record<string, { skip?: boolean; profileId?: string }> };
}
/** Step 1: what the file would do. Changes nothing. */
export async function previewImportAction(input: ImportPayload) {
  return runAction<import("@/lib/server/services/executive-import").ImportPlan>("executives.importPreview", input);
}
/** Step 2: import what the preview showed (refused if the data changed since). */
export async function applyImportAction(input: ImportPayload & { planHash: string }) {
  return runAction<import("@/lib/server/services/executive-import").ImportResult>("executives.import", input, { message: "Imported." });
}

// ── bulk executive changes ────────────────────────────────
export interface BulkPayload {
  committeeId: string;
  ids: string[];
  action: { op: "end" | "remove" | "restore" | "reactivate" | "position" | "copy" | "sort"; positionId?: string; keepTitles?: boolean; targetCommitteeId?: string };
}
export async function bulkPreviewAction(input: BulkPayload) {
  return runAction<import("@/lib/server/services/executive-bulk").BulkPlan>("executives.bulkPreview", input);
}
/** "Change position" on one listing: the bulk change for a single row (same checks and audit). */
export async function changePositionAction(committeeId: string, assignmentId: string, fd: Fd) {
  const r = await runAction<{ message: string }>("executives.bulk", { committeeId, ids: [assignmentId], action: { op: "position", positionId: s(fd, "positionId"), keepTitles: fd.get("keepTitle") === "on" } });
  return r.ok ? { ...r, data: { message: r.data?.message } } : r;
}
export async function bulkApplyAction(input: BulkPayload) {
  return runAction<{ changed: number; blocked: number; message: string }>("executives.bulk", input);
}
export async function restoreListingsAction(committeeId: string, ids: string[], _fd: Fd) {
  return runAction<{ message: string }>("executives.bulk", { committeeId, ids, action: { op: "restore" } });
}
export async function importApplicationsAction(campaignId: string, rows: unknown[], apply: boolean) {
  return runAction<{ rows: import("@/lib/server/services/recruitment").ImportOutcome[]; added: number; message: string }>("recruitment.import", { campaignId, rows, apply });
}
export async function grantRoleBulkAction(input: { userIds: string[]; roleKey: string; reason: string; expiresAt?: string; apply: boolean }) {
  return runAction<{ plan: { title: string; items: Array<{ id: string; name: string; change: string | null; blocked: string | null }>; changes: number; blocked: number; canApply: boolean }; message: string | null }>("roles.grantBulk", input);
}
export async function quickEditAction(committeeId: string, rows: Array<{ id: string; title: string; displayName: string; order: number; stamp?: string }>) {
  return runAction<{ changed: number; message: string }>("executives.quickEdit", { committeeId, rows });
}
export async function deleteCommitteeAction(id: string, fd: Fd) {
  return runAction("committees.delete", { id, reason: s(fd, "reason") }, { message: "Committee deleted." });
}

// ── events ────────────────────────────────────────────────
export async function createEventAction(fd: Fd) {
  return runAction<{ id: string }>("events.create", { input: obj(fd) });
}
export async function updateEventAction(id: string, fd: Fd) {
  return runAction("events.update", { id, input: obj(fd) }, { message: "Saved." });
}
export async function publishEventAction(id: string, _fd: Fd) {
  const r = await runAction<{ message: string }>("events.publish", { id });
  return r.ok ? { ...r, data: { message: r.data?.message } } : r;
}
export async function eventStatusAction(id: string, status: "CANCELLED" | "COMPLETED" | "ONGOING" | "ARCHIVED" | "DRAFT", fd: Fd) {
  return runAction("events.setStatus", { id, status, reason: s(fd, "reason") || null }, { message: "Updated." });
}
export async function eventPeopleAction(id: string, fd: Fd) {
  return runAction("events.setPeople", { id, people: json(fd, "people", [] as unknown[]) }, { message: "People saved." });
}
export async function registrationStatusAction(id: string, status: "REGISTERED" | "WAITLISTED" | "CANCELLED" | "ATTENDED" | "REJECTED", _fd: Fd) {
  return runAction("events.registrationStatus", { id, status });
}
export async function removeEventMediaAction(eventId: string, mediaId: string, _fd: Fd) {
  return runAction("events.removeMedia", { eventId, mediaId }, { message: "Removed from the gallery." });
}

// ── posts ─────────────────────────────────────────────────
export async function createPostAction(fd: Fd) {
  return runAction<{ id: string }>("posts.create", { input: obj(fd) });
}
export async function updatePostAction(id: string, fd: Fd) {
  return runAction("posts.update", { id, input: obj(fd) }, { message: "New version saved." });
}
export async function publishPostAction(id: string, _fd: Fd) {
  const r = await runAction<{ message: string }>("posts.publish", { id });
  return r.ok ? { ...r, data: { message: r.data?.message } } : r;
}
export async function unpublishPostAction(id: string, fd: Fd) {
  return runAction("posts.unpublish", { id, reason: s(fd, "reason") || null }, { message: "Unpublished." });
}
export async function archivePostAction(id: string, fd: Fd) {
  return runAction("posts.archive", { id, reason: s(fd, "reason") || null }, { message: "Archived." });
}
export async function restoreRevisionAction(postId: string, revisionId: string, _fd: Fd) {
  return runAction("posts.restoreRevision", { postId, revisionId }, { message: "Restored as a new version." });
}

// ── media ─────────────────────────────────────────────────
export async function updateMediaAction(id: string, fd: Fd) {
  return runAction("media.update", { id, altText: fd.has("alt") ? s(fd, "alt") : undefined, visibility: s(fd, "visibility") || undefined });
}
export async function archiveMediaAction(id: string, fd: Fd) {
  return runAction("media.archive", { id, reason: s(fd, "reason") || null });
}
export async function purgeMediaAction(id: string, fd: Fd) {
  return runAction<{ message: string }>("media.purge", { id, reason: s(fd, "reason") || null });
}

// ── forms, contests, notifications ────────────────────────
export async function saveFormAction(id: string | null, fd: Fd) {
  return runAction("forms.save", { id, input: obj(fd) });
}
export async function archiveFormAction(id: string, _fd: Fd) {
  return runAction("forms.archive", { id });
}
export async function saveContestAction(id: string | null, fd: Fd) {
  return runAction("contests.save", { id, input: obj(fd) });
}
export async function broadcastAction(fd: Fd) {
  const r = await runAction<{ sent: number }>("notifications.broadcast", { title: s(fd, "title"), body: s(fd, "body"), link: s(fd, "link") || undefined, audience: s(fd, "audience") });
  return r.ok ? { ...r, data: { message: `Sent to ${r.data?.sent ?? 0} people.` } } : r;
}
export async function markAllReadAction(_fd: Fd) {
  return runAction("notifications.markRead", { ids: "all" });
}

export async function markReadAction(id: string, _fd: Fd) {
  return runAction("notifications.markRead", { ids: [id] });
}

// ── contact inbox ─────────────────────────────────────────
export async function messageStatusAction(id: string, status: "NEW" | "READ" | "ARCHIVED", _fd: Fd) {
  return runAction("messages.setStatus", { id, status });
}

// ── recruitment ───────────────────────────────────────────
export async function saveCampaignAction(id: string | null, fd: Fd) {
  return runAction<{ id: string }>("recruitment.saveCampaign", { id, input: { ...obj(fd), positionIds: fd.getAll("positionIds").map(String) } }, { message: "Saved." });
}
export async function reviewApplicationAction(id: string, status: string, fd: Fd) {
  return runAction<{ message: string }>("recruitment.review", { id, status, note: s(fd, "note") || null, notify: fd.get("notify") === "on" });
}
export async function assignReviewerAction(id: string, fd: Fd) {
  return runAction<{ message: string }>("recruitment.assign", { id, reviewerId: s(fd, "reviewerId") || null });
}
export async function addApplicationNoteAction(id: string, fd: Fd) {
  return runAction("recruitment.note", { id, note: s(fd, "note") }, { message: "Note added." });
}
/** A one-time reset link for a member who can't receive email (shown once). */
export async function resetLinkAction(userId: string) {
  return runAction<{ url: string; expiresAt: string; message: string }>("members.resetLink", { userId });
}

export async function resetMfaAction(userId: string, reason: string) {
  return runAction("members.resetMfa", { userId, reason }, { message: "Two-factor sign-in was reset. They set it up again at their next sign-in." });
}

// ── me ────────────────────────────────────────────────────
export async function cancelRegistrationAction(registrationId: string, _fd: Fd) {
  return runAction("events.cancelMine", { id: registrationId });
}

// ── lost & found ──────────────────────────────────────────
export async function lostFoundStatusAction(id: string, status: "active" | "rejected" | "resolved", fd: Fd) {
  return runAction("lostfound.setStatus", { id, status, reason: s(fd, "reason") || null }, { message: status === "active" ? "Approved: it's live." : status === "rejected" ? "Sent back to the author." : "Marked resolved." });
}
export async function lostFoundImageAction(id: string, _fd: Fd) {
  return runAction("lostfound.removeImage", { id }, { message: "Photo removed." });
}
