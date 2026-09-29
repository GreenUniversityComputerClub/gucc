/**
 * The allowlist of procedures the Next.js server may call. Each entry adapts
 * a JSON input to a service function; the services authenticate, authorize
 * (through the governance engine), validate and audit. Nothing here grants
 * access — an unknown name is a 404 and every service re-checks the actor.
 */
import type { Ctx } from "../../../lib/server/context";
import { AppError, ValidationError } from "../../../lib/server/errors";
import { requireActor } from "../../../lib/server/authz";
import "../../../lib/server/services"; // registers approval handlers
import * as approvals from "../../../lib/server/services/approvals";
import { assistantChat } from "../../../lib/server/services/assistant";
import * as auth from "../../../lib/server/services/auth";
import * as committees from "../../../lib/server/services/committees";
import * as community from "../../../lib/server/services/community";
import * as contact from "../../../lib/server/services/contact";
import * as events from "../../../lib/server/services/events";
import * as executiveBulk from "../../../lib/server/services/executive-bulk";
import * as executiveImport from "../../../lib/server/services/executive-import";
import * as governance from "../../../lib/server/services/governance";
import * as access from "../../../lib/server/services/access";
import * as governanceViews from "../../../lib/server/views/governance";
import * as homeViews from "../../../lib/server/views/home";
import * as account from "../../../lib/server/services/account";
import * as activity from "../../../lib/server/services/activity";
import * as messaging from "../../../lib/server/services/messaging";
import * as work from "../../../lib/server/services/work";
import * as mfa from "../../../lib/server/services/mfa";
import * as health from "../../../lib/server/services/health";
import * as systemControls from "../../../lib/server/services/system-controls";
import * as auditSeal from "../../../lib/server/services/audit-seal";
import * as media from "../../../lib/server/services/media";
import * as members from "../../../lib/server/services/members";
import * as people from "../../../lib/server/services/people";
import * as posts from "../../../lib/server/services/posts";
import * as recruitment from "../../../lib/server/services/recruitment";
import * as views from "../../../lib/server/views/admin";
import { requireSecret, signToken } from "../../../lib/server/signing";
import type { UploadTokenPayload } from "../../../lib/server/services/recruitment";
import type { Scope } from "../../../lib/governance/types";

type Input = Record<string, unknown>;
export interface RpcCall {
  ctx: Ctx;
  input: Input;
  /** The raw session token from the Authorization header (for logout). */
  sessionToken: string | null;
}
type Handler = (c: RpcCall) => Promise<unknown>;

const s = (i: Input, k: string, required = true): string => {
  const v = i[k];
  if (typeof v === "string" && v.length <= 10_000) return v;
  if (v === undefined || v === null || v === "") {
    if (required) throw new ValidationError(`Missing ${k}.`);
    return "";
  }
  throw new ValidationError(`Invalid ${k}.`);
};
const o = (i: Input, k: string): Input => {
  const v = i[k];
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Input;
  if (v === undefined || v === null) return {};
  throw new ValidationError(`Invalid ${k}.`);
};
const n = (i: Input, k: string) => (i[k] === undefined || i[k] === null || i[k] === "" ? undefined : Number(i[k]));
const opt = (i: Input, k: string) => (typeof i[k] === "string" && i[k] ? (i[k] as string) : undefined);

const holder = (i: Input, k: string): { kind: "role" | "position"; id: string } => {
  const v = s(i, k);
  const [kind, ...rest] = v.split(":");
  if ((kind !== "role" && kind !== "position") || rest.length === 0) throw new ValidationError(`Choose a role or position for ${k}.`);
  return { kind, id: rest.join(":") };
};/** An import file (larger than ordinary strings; the service enforces its size limit). */
function importRequest(i: Input): executiveImport.ImportRequest {
  const r = i.resolutions && typeof i.resolutions === "object" ? (i.resolutions as Record<string, unknown>) : {};
  const positions: Record<string, string> = {};
  for (const [k, v] of Object.entries((r.positions as Record<string, unknown>) ?? {})) if (typeof v === "string" && v.length <= 80) positions[k.slice(0, 120)] = v;
  const rows: Record<string, { skip?: boolean; profileId?: string }> = {};
  for (const [k, v] of Object.entries((r.rows as Record<string, unknown>) ?? {}).slice(0, 1000)) {
    if (!v || typeof v !== "object") continue;
    const d = v as { skip?: unknown; profileId?: unknown };
    rows[k.slice(0, 8)] = { skip: d.skip === true, profileId: typeof d.profileId === "string" ? d.profileId.slice(0, 80) : undefined };
  }
  return {
    text: typeof i.text === "string" ? i.text : "",
    format: i.format === "csv" ? "csv" : "json",
    mode: i.mode === "update" || i.mode === "upsert" ? i.mode : "insert",
    defaultCommitteeId: typeof i.defaultCommitteeId === "string" && i.defaultCommitteeId ? i.defaultCommitteeId.slice(0, 80) : null,
    resolutions: { positions, rows },
  };
}

function bulkRequest(i: Input): executiveBulk.BulkRequest {
  const a = (i.action && typeof i.action === "object" ? i.action : {}) as Record<string, unknown>;
  const op = ["end", "remove", "restore", "reactivate", "position", "copy", "sort"].includes(String(a.op)) ? (String(a.op) as executiveBulk.BulkAction["op"]) : null;
  if (!op) throw new ValidationError("Choose a bulk action.");
  const str = (k: string) => (typeof a[k] === "string" ? (a[k] as string).slice(0, 80) : "");
  const action: executiveBulk.BulkAction =
    op === "position" ? { op, positionId: str("positionId"), keepTitles: a.keepTitles === true }
      : op === "copy" ? { op, targetCommitteeId: str("targetCommitteeId") }
        : { op };
  const ids = Array.isArray(i.ids) ? i.ids.filter((x): x is string => typeof x === "string").slice(0, 301).map((x) => x.slice(0, 80)) : [];
  return { committeeId: s(i, "committeeId"), ids, action };
}

const oneOf = <T extends string>(i: Input, k: string, allowed: readonly T[]): T => {
  const v = i[k];
  if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T;
  throw new ValidationError(`Invalid ${k}.`);
};
const grant = (i: Input) => ({ permission: s(i, "permission"), scope: (opt(i, "scope") ?? "ALL") as Scope, scopeValue: opt(i, "scopeValue") ?? "" });

const UPLOAD_PURPOSES = ["library", "event", "lostfound", "avatar"] as const;

/**
 * Changes to who may do what, and deletions, need the password (or a two-factor code) entered in
 * the last few minutes when the person holds sensitive permissions (leaders, developers). The
 * dashboard asks for it and repeats the action. Some services also check this themselves.
 */
export const STEP_UP = new Set([
  "roles.create", "roles.update", "roles.archive", "roles.grant", "roles.grantBulk", "roles.revoke", "roles.setGrant",
  "permissions.grantDirect", "permissions.revokeDirect", "permissions.trustAuthor",
  "positions.save", "positions.archive", "positions.setGrant",
  "rules.create", "rules.update", "rules.setStatus", "rules.createNotify", "policies.save",
  "members.suspend", "members.reactivate", "committees.delete", "people.delete", "people.merge", "media.purge", "grants.copy",
]);

export const procedures: Record<string, Handler> = {
  // ── session & authentication ──
  "session.me": ({ ctx }) => views.sessionMe(ctx),
  "auth.login": async ({ ctx, input }) => {
    const r = await auth.login(ctx, { email: s(input, "email"), password: s(input, "password"), turnstileToken: opt(input, "turnstileToken") });
    return { token: r.token, expiresAt: r.expiresAt, status: r.status, mfaRequired: r.mfaRequired === true };
  },
  "auth.mfaVerify": ({ ctx, input }) => mfa.verifyMfaLogin(ctx, input.token, input.code),
  "auth.logout": ({ ctx, sessionToken }) => auth.logout(ctx, sessionToken),
  "auth.register": ({ ctx, input }) => auth.register(ctx, input as never),
  "auth.resendVerification": ({ ctx, input }) => auth.resendVerification(ctx, s(input, "email")),
  "auth.verifyEmail": ({ ctx, input }) => auth.verifyEmail(ctx, s(input, "token")),
  "auth.confirmEmailChange": ({ ctx, input }) => account.confirmEmailChange(ctx, s(input, "token")),
  "auth.requestPasswordReset": ({ ctx, input }) => auth.requestPasswordReset(ctx, { email: s(input, "email"), turnstileToken: opt(input, "turnstileToken") }),
  "auth.resetPassword": ({ ctx, input }) => auth.resetPassword(ctx, { token: s(input, "token"), password: s(input, "password") }),
  "auth.changePassword": ({ ctx, input, sessionToken }) => auth.changePassword(ctx, requireActor(ctx).user.id, s(input, "current"), s(input, "password"), sessionToken),
  "auth.acceptInvite": async ({ ctx, input }) => {
    const r = await auth.acceptInvite(ctx, { token: s(input, "token"), password: s(input, "password") });
    return { token: r.token, expiresAt: r.expiresAt, status: r.status };
  },

  // ── own account ──
  "account.view": ({ ctx }) => views.accountView(ctx),
  "account.updateProfile": ({ ctx, input }) => members.updateOwnProfile(ctx, input),
  "account.setAvatar": ({ ctx, input }) => people.setOwnAvatar(ctx, opt(input, "mediaId") ?? null),
  "notifications.list": ({ ctx, input }) => community.myNotifications(ctx, Math.min(n(input, "limit") ?? 30, 100), { unreadOnly: input.unread === true, before: typeof input.before === "string" ? input.before : null }),
  "notifications.markRead": ({ ctx, input }) => community.markNotificationsRead(ctx, Array.isArray(input.ids) ? input.ids.map(String) : "all"),
  "notifications.open": ({ ctx, input }) => community.openNotification(ctx, s(input, "id"), input.markRead !== false),

  // ── admin views ──
  "views.dashboard": ({ ctx }) => views.dashboardView(ctx),
  "views.home": ({ ctx }) => homeViews.homeView(ctx),
  "account.sessions": ({ ctx, sessionToken }) => account.mySessions(ctx, sessionToken),
  "account.revokeSession": ({ ctx, input }) => account.revokeMySession(ctx, s(input, "ref")),
  "account.revokeOthers": ({ ctx, sessionToken }) => account.revokeOtherSessions(ctx, sessionToken),
  "account.changeEmail": ({ ctx, input }) => account.changeEmail(ctx, input),
  "account.delete": ({ ctx, input }) => account.deleteOwnAccount(ctx, input),
  "account.reauth": ({ ctx, input }) => mfa.reauthenticate(ctx, input),
  "account.mfaStatus": ({ ctx }) => mfa.mfaStatus(ctx),
  "account.mfaStart": ({ ctx }) => mfa.startMfaSetup(ctx),
  "account.mfaConfirm": ({ ctx, input }) => mfa.confirmMfaSetup(ctx, input.code),
  "account.mfaDisable": ({ ctx, input }) => mfa.disableMfa(ctx, input),
  "account.mfaRecoveryCodes": ({ ctx, input }) => mfa.regenerateRecoveryCodes(ctx, input.code),
  "account.mfaReplaceStart": ({ ctx, input }) => mfa.startMfaReplace(ctx, input),
  "account.mfaReplaceConfirm": ({ ctx, input }) => mfa.confirmMfaReplace(ctx, input.code),
  "members.resetMfa": ({ ctx, input }) => mfa.resetUserMfa(ctx, s(input, "userId"), input.reason),
  "members.exportCsv": ({ ctx, input }) => members.exportMembersCsv(ctx, { status: opt(input, "status"), q: opt(input, "q"), batch: opt(input, "batch"), department: opt(input, "department") }),
  "events.cancelMine": ({ ctx, input }) => events.cancelMyRegistration(ctx, s(input, "id")),
  "views.committee": ({ ctx, input }) => views.committeeView(ctx, s(input, "id")),
  "views.event": ({ ctx, input }) => views.eventView(ctx, s(input, "id")),
  "views.post": ({ ctx, input }) => views.postView(ctx, s(input, "id")),
  "views.contests": ({ ctx }) => views.contestsView(ctx),
  "views.rules": ({ ctx }) => views.rulesView(ctx),
  "views.rule": ({ ctx, input }) => views.ruleView(ctx, s(input, "id")),
  "categories.list": ({ ctx, input }) => views.listCategories(ctx, s(input, "kind")),

  // ── members ──
  "members.list": ({ ctx, input }) => members.listMembers(ctx, { status: opt(input, "status"), q: opt(input, "q"), page: n(input, "page"), batch: opt(input, "batch"), department: opt(input, "department") }),
  "members.approve": ({ ctx, input }) => members.approveMember(ctx, s(input, "userId"), { linkProfileId: opt(input, "linkProfileId") ?? null }),
  "members.reviewNote": ({ ctx, input }) => members.setReviewNote(ctx, s(input, "userId"), opt(input, "note") ?? null),
  "members.reject": ({ ctx, input }) => members.rejectMember(ctx, s(input, "userId"), s(input, "reason")),
  "members.requestCorrection": ({ ctx, input }) => members.requestCorrection(ctx, s(input, "userId"), s(input, "note")),
  "members.suspend": ({ ctx, input }) => members.suspendUser(ctx, s(input, "userId"), s(input, "reason")),
  "members.reactivate": ({ ctx, input }) => members.reactivateUser(ctx, s(input, "userId")),
  "members.linkProfile": ({ ctx, input }) => members.linkProfile(ctx, s(input, "userId"), s(input, "profileId")),

  // ── people (profiles) ──
  "people.search": ({ ctx, input }) => people.searchPeople(ctx, { q: opt(input, "q"), withAccount: input.withAccount === true, limit: n(input, "limit") }),
  "people.list": ({ ctx, input }) => people.listPeople(ctx, { q: opt(input, "q"), filter: opt(input, "filter"), page: n(input, "page") }),
  "people.get": ({ ctx, input }) => people.getPerson(ctx, s(input, "id")),
  "people.create": ({ ctx, input }) => people.createPerson(ctx, o(input, "input")),
  "people.update": ({ ctx, input }) => people.updatePerson(ctx, s(input, "id"), o(input, "input")),
  "people.invite": ({ ctx, input }) => people.invitePerson(ctx, s(input, "profileId"), s(input, "email")),

  // ── governance ──
  "roles.list": ({ ctx }) => governance.listRoles(ctx),
  "roles.create": ({ ctx, input }) => governance.createRole(ctx, o(input, "input")),
  "roles.grant": ({ ctx, input }) => governance.grantRole(ctx, s(input, "userId"), s(input, "roleKey"), opt(input, "reason") ?? null, opt(input, "expiresAt") ?? null),
  "roles.grantBulk": ({ ctx, input }) => governance.grantRoleBulk(ctx, input, input.apply === true),
  "roles.revoke": ({ ctx, input }) => governance.revokeRole(ctx, s(input, "userRoleId"), opt(input, "reason") ?? null),
  "roles.setGrant": ({ ctx, input }) => governance.setRoleGrant(ctx, s(input, "roleId"), grant(input), input.add === true),
  "roles.update": ({ ctx, input }) => governance.updateRole(ctx, s(input, "roleId"), o(input, "input")),
  "roles.archive": ({ ctx, input }) => governance.archiveRole(ctx, s(input, "roleId")),
  "grants.copy": ({ ctx, input }) => governance.copyGrants(ctx, holder(input, "target"), holder(input, "source")),
  "permissions.list": ({ ctx }) => governance.listPermissions(ctx),
  "permissions.grantDirect": ({ ctx, input }) => governance.grantDirectPermission(ctx, o(input, "input")),
  "permissions.revokeDirect": ({ ctx, input }) => governance.revokeDirectPermission(ctx, s(input, "id"), opt(input, "reason") ?? null),
  "permissions.trustAuthor": ({ ctx, input }) => governance.trustAuthor(ctx, o(input, "input")),
  "positions.archive": ({ ctx, input }) => governance.archivePosition(ctx, s(input, "positionId")),
  "positions.move": ({ ctx, input }) => governance.movePosition(ctx, s(input, "positionId"), oneOf(input, "direction", ["up", "down"] as const)),
  "access.person": ({ ctx, input }) => access.personAccess(ctx, s(input, "userId")),
  "access.matrix": ({ ctx, input }) => access.accessMatrix(ctx, { q: opt(input, "q") }),
  "access.publishers": ({ ctx }) => access.publishersSummary(ctx),
  "access.options": ({ ctx }) => access.simulatorOptions(ctx),
  "access.simulate": ({ ctx, input }) => access.simulateAccess(ctx, { userId: s(input, "userId"), permission: s(input, "permission"), resourceType: opt(input, "resourceType"), resourceId: opt(input, "resourceId") }),
  "views.roles": ({ ctx }) => governanceViews.rolesOverview(ctx),
  "views.role": ({ ctx, input }) => governanceViews.roleDetail(ctx, s(input, "id")),
  "views.positions": ({ ctx }) => governanceViews.positionsOverview(ctx),
  "views.position": ({ ctx, input }) => governanceViews.positionDetail(ctx, s(input, "id")),
  "views.positionForm": ({ ctx }) => governanceViews.positionFormOptions(ctx),
  "positions.list": ({ ctx }) => governance.listPositions(ctx),
  "positions.save": ({ ctx, input }) => governance.savePosition(ctx, opt(input, "id") ?? null, o(input, "input")),
  "positions.setGrant": ({ ctx, input }) => governance.setPositionGrant(ctx, s(input, "positionId"), grant(input), input.add === true),
  "rules.create": ({ ctx, input }) => governance.createRule(ctx, o(input, "input") as never),
  "rules.update": ({ ctx, input }) => governance.updateRule(ctx, s(input, "id"), o(input, "input") as never),
  "rules.setStatus": ({ ctx, input }) => governance.setRuleStatus(ctx, s(input, "id"), oneOf(input, "status", ["ACTIVE", "INACTIVE", "ARCHIVED"] as const)),
  "rules.createNotify": ({ ctx, input }) => governance.createNotifyRule(ctx, o(input, "input") as never),
  "rules.explain": ({ ctx, input }) => governance.explainDecision(ctx, { userId: s(input, "userId"), permission: s(input, "permission"), resource: input.resource ? (o(input, "resource") as never) : undefined }),
  "policies.list": ({ ctx }) => governance.listPolicies(ctx),
  "policies.save": ({ ctx, input }) => governance.savePolicy(ctx, opt(input, "id") ?? null, o(input, "input")),
  "settings.list": ({ ctx }) => governance.listSettings(ctx),
  "settings.system": ({ ctx, input }) => governance.updateSystemSetting(ctx, s(input, "key"), s(input, "value"), opt(input, "expectedUpdatedAt") ?? null),
  "settings.org": ({ ctx, input }) => governance.updateOrgSetting(ctx, s(input, "key"), s(input, "value"), opt(input, "expectedUpdatedAt") ?? null),

  // ── approvals ──
  "approvals.list": ({ ctx, input }) => approvals.listApprovals(ctx, { status: opt(input, "status"), mine: input.mine === true, page: n(input, "page") }),
  "approvals.get": ({ ctx, input }) => approvals.getApproval(ctx, s(input, "id")),
  "approvals.decide": ({ ctx, input }) => approvals.decideApproval(ctx, s(input, "id"), oneOf(input, "decision", ["APPROVE", "REJECT"] as const), opt(input, "comment") ?? null, { bulk: input.bulk === true }),
  "approvals.cancel": ({ ctx, input }) => approvals.cancelApproval(ctx, s(input, "id")),

  // ── committees & executives ──
  "committees.list": ({ ctx }) => committees.listCommittees(ctx),
  "committees.create": ({ ctx, input }) => committees.createCommittee(ctx, o(input, "input")),
  "committees.update": ({ ctx, input }) => committees.updateCommittee(ctx, s(input, "id"), o(input, "input")),
  "committees.startNext": ({ ctx, input }) => committees.startNextCommittee(ctx, o(input, "input")),
  "executives.assign": ({ ctx, input }) => committees.assignExecutive(ctx, s(input, "committeeId"), o(input, "input")),
  "executives.update": ({ ctx, input }) => committees.updateAssignment(ctx, s(input, "id"), o(input, "input")),
  "executives.end": ({ ctx, input }) => committees.endAssignment(ctx, s(input, "id"), oneOf(input, "mode", ["end", "remove"] as const), opt(input, "reason") ?? null),
  "executives.move": ({ ctx, input }) => committees.moveAssignment(ctx, s(input, "id"), oneOf(input, "direction", ["up", "down"] as const)),
  "executives.avatarCrop": ({ ctx, input }) => committees.updateAvatarCrop(ctx, o(input, "input") as never),
  "executives.bulkPreview": ({ ctx, input }) => executiveBulk.previewBulk(ctx, bulkRequest(input)),
  "executives.bulk": ({ ctx, input }) => executiveBulk.applyBulk(ctx, bulkRequest(input)),
  "executives.quickEdit": ({ ctx, input }) => executiveBulk.quickEditListings(ctx, s(input, "committeeId"), input.rows),
  "executives.export": ({ ctx, input }) => executiveBulk.exportCommittee(ctx, s(input, "committeeId"), oneOf(input, "format", ["json", "csv"] as const)),
  "committees.delete": ({ ctx, input }) => committees.deleteCommittee(ctx, s(input, "id"), input.reason),
  "people.merge": ({ ctx, input }) => people.mergePeople(ctx, s(input, "keepId"), s(input, "dropId"), input.reason),
  "people.delete": ({ ctx, input }) => people.deletePerson(ctx, s(input, "id"), input.reason),
  "executives.importPreview": ({ ctx, input }) => executiveImport.previewExecutiveImport(ctx, importRequest(input)),
  "executives.import": ({ ctx, input }) => executiveImport.applyExecutiveImport(ctx, { ...importRequest(input), planHash: s(input, "planHash") }),

  // ── events ──
  "events.list": ({ ctx, input }) => events.listEventsAdmin(ctx, { status: opt(input, "status"), q: opt(input, "q"), category: opt(input, "category"), page: n(input, "page") }),
  "events.create": ({ ctx, input }) => events.createEvent(ctx, o(input, "input")),
  "events.update": ({ ctx, input }) => events.updateEvent(ctx, s(input, "id"), o(input, "input")),
  "events.publish": ({ ctx, input }) => events.publishEvent(ctx, s(input, "id")),
  "events.setStatus": ({ ctx, input }) => events.setEventStatus(ctx, s(input, "id"), oneOf(input, "status", ["CANCELLED", "COMPLETED", "ONGOING", "ARCHIVED", "DRAFT"] as const), opt(input, "reason") ?? null),
  "events.setPeople": ({ ctx, input }) => {
    if (!Array.isArray(input.people)) throw new ValidationError("Invalid people.");
    return events.setEventPeople(ctx, s(input, "id"), input.people as never);
  },
  "events.registrationStatus": ({ ctx, input }) => events.setRegistrationStatus(ctx, s(input, "id"), oneOf(input, "status", ["REGISTERED", "WAITLISTED", "CANCELLED", "ATTENDED", "REJECTED"] as const)),
  "events.register": ({ ctx, input }) => events.registerForEvent(ctx, s(input, "slug"), o(input, "form")),
  "events.registrations": ({ ctx, input }) => events.listAllRegistrations(ctx, { q: opt(input, "q"), status: opt(input, "status"), eventId: opt(input, "eventId"), page: n(input, "page") }),
  "events.exportRegistrations": ({ ctx, input }) => events.exportRegistrations(ctx, s(input, "id")),
  "events.removeMedia": ({ ctx, input }) => events.removeEventMedia(ctx, s(input, "eventId"), s(input, "mediaId")),

  // ── posts ──
  "posts.list": ({ ctx, input }) => posts.listPostsAdmin(ctx, { type: opt(input, "type"), status: opt(input, "status"), q: opt(input, "q"), category: opt(input, "category"), page: n(input, "page") }),
  "posts.create": ({ ctx, input }) => posts.createPost(ctx, o(input, "input")),
  "posts.update": ({ ctx, input }) => posts.updatePost(ctx, s(input, "id"), o(input, "input")),
  "posts.publish": ({ ctx, input }) => posts.publishPost(ctx, s(input, "id")),
  "posts.unpublish": ({ ctx, input }) => posts.unpublishPost(ctx, s(input, "id"), opt(input, "reason") ?? null),
  "posts.archive": ({ ctx, input }) => posts.archivePost(ctx, s(input, "id"), opt(input, "reason") ?? null),
  "posts.restoreRevision": ({ ctx, input }) => posts.restoreRevision(ctx, s(input, "postId"), s(input, "revisionId")),

  // ── media ──
  "media.list": ({ ctx, input }) => media.listMedia(ctx, { q: opt(input, "q"), type: opt(input, "type"), visibility: opt(input, "visibility"), page: n(input, "page"), unused: input.unused === true, stale: input.stale === true, archived: input.archived === true }),
  "media.purge": ({ ctx, input }) => media.purgeMedia(ctx, s(input, "id"), input.reason),
  "media.update": ({ ctx, input }) => media.updateMedia(ctx, s(input, "id"), { altText: typeof input.altText === "string" ? input.altText : null, visibility: opt(input, "visibility") }),
  "media.details": ({ ctx, input }) => media.mediaDetails(ctx, s(input, "id")),
  "media.archive": ({ ctx, input }) => media.archiveMedia(ctx, s(input, "id"), opt(input, "reason") ?? null),
  "media.signedUrl": ({ ctx, input }) => media.signedMediaUrl(ctx, s(input, "id")),
  /** A 15-minute capability to upload straight to this Worker from the browser (bypasses Vercel's body limit). */
  "media.uploadToken": async ({ ctx, input }) => {
    const actor = requireActor(ctx);
    const purpose = oneOf(input, "purpose", UPLOAD_PURPOSES);
    if (actor.user.status !== "ACTIVE" && purpose !== "avatar") throw new AppError(403, "NOT_ACTIVE", "Your account must be active to upload files.");
    const payload: UploadTokenPayload = { p: "user", s: actor.user.id, purpose, eventId: opt(input, "eventId") ?? null, replaceId: opt(input, "replaceId") ?? null, exp: Math.floor(Date.now() / 1000) + 15 * 60 };
    return { token: await signToken(requireSecret(ctx.env.AUTH_SECRET), payload as never) };
  },

  // ── forms, contests, notifications, audit ──
  "forms.list": ({ ctx }) => community.listForms(ctx),
  "forms.save": ({ ctx, input }) => community.saveForm(ctx, opt(input, "id") ?? null, o(input, "input")),
  "forms.archive": ({ ctx, input }) => community.archiveForm(ctx, s(input, "id")),
  "contests.save": ({ ctx, input }) => community.saveContest(ctx, opt(input, "id") ?? null, o(input, "input")),
  "notifications.broadcast": ({ ctx, input }) => community.broadcast(ctx, { title: s(input, "title"), body: s(input, "body"), link: opt(input, "link"), audience: input.audience === "executives" ? "executives" : "members" }),
  "chat.start": ({ ctx, input }) => messaging.sendToPerson(ctx, input),
  "chat.recipients": ({ ctx, input }) => messaging.searchRecipients(ctx, input.q),
  "chat.send": ({ ctx, input }) => messaging.sendInThread(ctx, s(input, "conversationId"), input.body),
  "chat.list": ({ ctx, input }) => messaging.myConversations(ctx, { archived: input.archived === true }),
  "chat.thread": ({ ctx, input }) => messaging.thread(ctx, s(input, "conversationId"), { before: opt(input, "before") }),
  "chat.edit": ({ ctx, input }) => messaging.editMessage(ctx, s(input, "id"), input.body),
  "chat.delete": ({ ctx, input }) => messaging.deleteMessage(ctx, s(input, "id")),
  "chat.state": ({ ctx, input }) => messaging.setConversationState(ctx, s(input, "conversationId"), { muted: typeof input.muted === "boolean" ? input.muted : undefined, archived: typeof input.archived === "boolean" ? input.archived : undefined }),
  "chat.block": ({ ctx, input }) => messaging.setBlock(ctx, s(input, "userId"), input.block === true),
  "chat.privacy": ({ ctx, input }) => messaging.setMessagePrivacy(ctx, input),
  "chat.report": ({ ctx, input }) => messaging.reportMessage(ctx, s(input, "id"), input.reason),
  "chat.unread": ({ ctx }) => messaging.unreadConversations(ctx),
  "reports.list": ({ ctx, input }) => messaging.listReports(ctx, { status: opt(input, "status") }),
  "reports.resolve": ({ ctx, input }) => messaging.resolveReport(ctx, s(input, "id"), oneOf(input, "outcome", ["DISMISSED", "ACTIONED"] as const), opt(input, "note") ?? null, input.remove === true),
  "activity.feed": ({ ctx, input }) => activity.activityFeed(ctx, { actor: opt(input, "actor"), area: opt(input, "area"), q: opt(input, "q"), from: opt(input, "from"), to: opt(input, "to"), before: opt(input, "before"), request: opt(input, "request") }),
  "activity.related": ({ ctx, input }) => activity.activityRelated(ctx, s(input, "requestId")),
  "tasks.create": ({ ctx, input }) => work.createTask(ctx, input),
  "tasks.update": ({ ctx, input }) => work.updateTask(ctx, s(input, "id"), input),
  "tasks.comment": ({ ctx, input }) => work.commentOnTask(ctx, s(input, "id"), input.body),
  "tasks.list": ({ ctx, input }) => work.listTasks(ctx, { view: opt(input, "view"), status: opt(input, "status"), assignee: opt(input, "assignee") }),
  "tasks.get": ({ ctx, input }) => work.taskDetail(ctx, s(input, "id")),
  "meetings.schedule": ({ ctx, input }) => work.scheduleMeeting(ctx, input),
  "meetings.update": ({ ctx, input }) => work.updateMeeting(ctx, s(input, "id"), input),
  "meetings.cancel": ({ ctx, input }) => work.cancelMeeting(ctx, s(input, "id"), input.reason),
  "meetings.notes": ({ ctx, input }) => work.saveMeetingNotes(ctx, s(input, "id"), input.notes),
  "meetings.respond": ({ ctx, input }) => work.respondToMeeting(ctx, s(input, "id"), input.response),
  "meetings.list": ({ ctx, input }) => work.listMeetings(ctx, { when: opt(input, "when"), all: input.all === true }),
  "meetings.get": ({ ctx, input }) => work.meetingDetail(ctx, s(input, "id")),
  "system.health": ({ ctx }) => health.systemHealth(ctx),
  "system.switch": ({ ctx, input }) => systemControls.setSwitch(ctx, s(input, "key"), input.on === true),
  "email.test": ({ ctx }) => systemControls.sendTestEmail(ctx),
  "email.preferences": ({ ctx }) => systemControls.emailPreferences(ctx),
  "email.savePreferences": ({ ctx, input }) => systemControls.saveEmailPreferences(ctx, o(input, "choices")),
  "audit.verify": ({ ctx }) => auditSeal.verifyAuditLog(ctx),
  "audit.list": ({ ctx, input }) => community.listAudit(ctx, { actor: opt(input, "actor"), action: opt(input, "action"), resource: opt(input, "resource"), from: opt(input, "from"), to: opt(input, "to"), page: n(input, "page") }),
  "audit.authEvents": ({ ctx, input }) => community.listAuthEvents(ctx, { q: opt(input, "q"), event: opt(input, "event"), page: n(input, "page") }),

  // ── lost & found ──
  "lostfound.list": ({ ctx, input }) => community.listLostFound(ctx, { status: opt(input, "status"), type: opt(input, "type"), category: opt(input, "category"), q: opt(input, "q"), location: opt(input, "location"), mine: input.mine === true }),
  "lostfound.create": ({ ctx, input }) => community.createLostFound(ctx, o(input, "input")),
  "lostfound.setStatus": ({ ctx, input }) => community.setLostFoundStatus(ctx, s(input, "id"), oneOf(input, "status", ["pending", "active", "resolved", "rejected"] as const), opt(input, "reason") ?? null),
  "lostfound.removeImage": ({ ctx, input }) => community.removeLostFoundImage(ctx, s(input, "id")),
  "lostfound.report": ({ ctx, input }) => community.reportLostFound(ctx, s(input, "id"), input.reason),
  "lostfound.delete": ({ ctx, input }) => community.deleteLostFound(ctx, s(input, "id")),
  "lostfound.message": ({ ctx, input }) => community.messageLostFound(ctx, s(input, "postId"), s(input, "message")),
  "lostfound.inbox": ({ ctx }) => community.lostFoundInbox(ctx),

  // ── public forms with side effects ──
  "certificates.verify": ({ ctx, input }) => community.verifyCertificate(ctx, s(input, "programKey"), s(input, "teamName"), s(input, "email")),
  "contact.submit": ({ ctx, input }) => contact.submitContact(ctx, input),
  "assistant.chat": ({ ctx, input }) => assistantChat(ctx, input),
  "messages.list": ({ ctx, input }) => contact.listMessages(ctx, { status: opt(input, "status"), page: n(input, "page") }),
  "messages.setStatus": ({ ctx, input }) => contact.setMessageStatus(ctx, s(input, "id"), s(input, "status")),

  // ── recruitment ──
  "recruitment.uploadToken": ({ ctx, input }) => recruitment.recruitmentUploadToken(ctx, { campaignId: s(input, "campaignId") }),
  "recruitment.submit": ({ ctx, input }) => recruitment.submitApplication(ctx, input),
  "recruitment.campaigns": ({ ctx }) => recruitment.listCampaigns(ctx),
  "recruitment.saveCampaign": ({ ctx, input }) => recruitment.saveCampaign(ctx, opt(input, "id") ?? null, o(input, "input")),
  "recruitment.applications": ({ ctx, input }) => recruitment.listApplications(ctx, { campaignId: s(input, "campaignId"), status: opt(input, "status"), positionId: opt(input, "positionId"), q: opt(input, "q"), page: n(input, "page"), mine: input.mine === true }),
  "recruitment.application": ({ ctx, input }) => recruitment.getApplication(ctx, s(input, "id")),
  "recruitment.review": ({ ctx, input }) => recruitment.reviewApplication(ctx, s(input, "id"), { status: s(input, "status"), note: opt(input, "note") ?? null, notify: input.notify === true }),
  "recruitment.assign": ({ ctx, input }) => recruitment.assignReviewer(ctx, s(input, "id"), opt(input, "reviewerId") ?? null),
  "recruitment.note": ({ ctx, input }) => recruitment.addApplicationNote(ctx, s(input, "id"), s(input, "note")),
  "members.resetLink": ({ ctx, input }) => auth.issueResetLink(ctx, s(input, "userId")),
  "recruitment.exportCsv": ({ ctx, input }) => recruitment.applicationsCsv(ctx, s(input, "campaignId")),
  "recruitment.import": ({ ctx, input }) => recruitment.importApplications(ctx, s(input, "campaignId"), input.rows, input.apply === true),
};

export type ProcedureName = keyof typeof procedures;
