/**
 * Approval workflow service — one implementation for every resource type.
 *
 * A service that needs approval calls `startApproval()`. Approvers call
 * `decideApproval()`. When a request resolves, the handler registered for its
 * action (e.g. "posts.publish") applies the outcome. Policies are frozen into
 * the request when it opens, so editing a policy later never changes an open
 * request's requirements.
 */
import { assertStmt, assertTransition, batchTransition, newTransition } from "../transition";
import { describePolicy, eligibleGroups, evaluateApproval } from "../../governance/approval";
import type { ApprovalPolicy, ApprovalStep, ApproverSpec } from "../../governance/types";
import { auditStmt } from "../audit";
import { can, requireActor, requirePermission, scopesFor } from "../authz";
import type { Ctx } from "../context";
import { newId, nowIso, type D1StatementLike } from "../db";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { notifyStmts, usersWith, usersWithPermission } from "../notifications";
import { avatarOfUserSql, avatarUrl, withAvatars } from "../avatar";

export interface ApprovalRequestRow {
  id: string;
  policy_id: string;
  policy_snapshot: string;
  rule_id: string | null;
  resource_type: string;
  resource_id: string;
  action: string;
  title: string | null;
  payload_json: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  requested_by: string;
  created_at: string;
}

export interface ApprovalHandler {
  /** Statements to run when approved (committed with the resolution). */
  onApproved(ctx: Ctx, req: ApprovalRequestRow): Promise<D1StatementLike[]>;
  onRejected?(ctx: Ctx, req: ApprovalRequestRow, note: string | null): Promise<D1StatementLike[]>;
  /** Cache tags to refresh after resolution. */
  tags?: (req: ApprovalRequestRow) => string[];
}

/** The note a handler's onRejected gets when the requester withdrew the request. */
export const WITHDRAWN = "Withdrawn";

const handlers = new Map<string, ApprovalHandler>();
export function registerApprovalHandler(action: string, handler: ApprovalHandler) {
  handlers.set(action, handler);
}

export async function loadPolicy(ctx: Ctx, key: string): Promise<{ id: string; policy: ApprovalPolicy }> {
  const row = await ctx.db.first<{ id: string; key: string; name: string; mode: ApprovalPolicy["mode"]; threshold: number | null; approvers_json: string; allow_self_approval: number }>(
    "SELECT id, key, name, mode, threshold, approvers_json, allow_self_approval FROM approval_policies WHERE key = ?1 AND deleted_at IS NULL",
    key,
  );
  if (!row) throw new AppError(500, "POLICY_MISSING", `Approval policy "${key}" does not exist. Ask a Moderator to restore it.`);
  return {
    id: row.id,
    policy: { key: row.key, name: row.name, mode: row.mode, threshold: row.threshold, approvers: JSON.parse(row.approvers_json) as ApproverSpec[], allowSelfApproval: Boolean(row.allow_self_approval) },
  };
}

/** Active users who could approve under this policy (excluding the requester unless self-approval is allowed). */
export async function eligibleApprovers(ctx: Ctx, policy: ApprovalPolicy, requestedBy: string, assigned: string[] = []): Promise<string[]> {
  const roles = policy.approvers.filter((a) => a.type === "role").map((a) => a.value!);
  const positions = policy.approvers.filter((a) => a.type === "position").map((a) => a.value!);
  const users = policy.approvers.filter((a) => a.type === "user").map((a) => a.value!);
  const byPermission = (await Promise.all(policy.approvers.filter((a) => a.type === "permission" && a.value).map((a) => usersWithPermission(ctx, a.value!)))).flat();
  const ids = new Set([...(await usersWith(ctx, { roles, positions })), ...users, ...byPermission, ...(policy.approvers.some((a) => a.type === "assigned") ? assigned : [])]);
  if (!policy.allowSelfApproval) ids.delete(requestedBy);
  return [...ids];
}

/** For each approver group, the people (other than the requester) who could decide for it now. */
async function groupCandidates(ctx: Ctx, policy: ApprovalPolicy, requestedBy: string): Promise<string[][]> {
  const out: string[][] = [];
  for (const a of policy.approvers) {
    const ids = a.type === "role" ? await usersWith(ctx, { roles: [a.value!] })
      : a.type === "position" ? await usersWith(ctx, { positions: [a.value!] })
        : a.type === "permission" && a.value ? await usersWithPermission(ctx, a.value)
          : a.type === "user" && a.value ? [a.value] : [];
    out.push(policy.allowSelfApproval ? ids : ids.filter((id) => id !== requestedBy));
  }
  return out;
}

/** Can the request ever be decided? ALL needs a different person for every group. */
function coverable(policy: ApprovalPolicy, groups: string[][]): boolean {
  if (policy.mode !== "ALL") return groups.some((g) => g.length > 0);
  const taken = new Map<string, number>();
  const assign = (g: number, seen: Set<string>): boolean => {
    for (const person of groups[g] ?? []) {
      if (seen.has(person)) continue;
      seen.add(person);
      const holder = taken.get(person);
      if (holder === undefined || assign(holder, seen)) {
        taken.set(person, g);
        return true;
      }
    }
    return false;
  };
  return groups.every((_, g) => assign(g, new Set()));
}

/** Content falls back to this policy when its own can't be decided by anyone else right now. */
const FALLBACK_POLICY = "leadership-any";

export interface StartApprovalInput {
  policyKey: string;
  resourceType: string;
  resourceId: string;
  action: string;
  title: string;
  payload?: unknown;
  ruleId?: string | null;
  /** Statements committed together with opening the request (e.g. set status PENDING_APPROVAL). */
  alongside?: D1StatementLike[];
}

export async function startApproval(ctx: Ctx, input: StartApprovalInput): Promise<{ requestId: string; created: boolean }> {
  const actor = requireActor(ctx);
  const existing = await ctx.db.first<{ id: string; payload_json: string | null }>(
    "SELECT id, payload_json FROM approval_requests WHERE resource_type = ?1 AND resource_id = ?2 AND action = ?3 AND status = 'PENDING'",
    input.resourceType, input.resourceId, input.action,
  );
  if (existing) {
    // The same change asked again joins the open request; a different change to the same thing
    // must wait, instead of silently being dropped.
    const payload = input.payload === undefined ? null : JSON.stringify(input.payload);
    if (input.resourceType === "governance" && existing.payload_json !== payload) {
      throw new AppError(409, "REQUEST_PENDING", `A request about this is already waiting for approval (/dashboard/approvals/${existing.id}). Wait for it, or withdraw it first.`);
    }
    return { requestId: existing.id, created: false };
  }

  let { id: policyId, policy } = await loadPolicy(ctx, input.policyKey);
  // A request nobody else can decide would wait forever. Content moves to club leadership; when
  // the requester's own position is what's missing (e.g. the President asking "President and
  // General Secretary"), it's refused with the reason. An empty position is fine: whoever is
  // appointed to it later can decide.
  if (!coverable(policy, await groupCandidates(ctx, policy, actor.user.id))) {
    const fallback = input.resourceType !== "governance" && policy.key !== FALLBACK_POLICY ? await loadPolicy(ctx, FALLBACK_POLICY).catch(() => null) : null;
    if (fallback && coverable(fallback.policy, await groupCandidates(ctx, fallback.policy, actor.user.id))) {
      ({ id: policyId, policy } = fallback);
    } else if (coverable(policy, await groupCandidates(ctx, { ...policy, allowSelfApproval: true }, actor.user.id))) {
      throw new AppError(409, "NO_APPROVER", `Under "${policy.name}" you would have to approve your own request, which isn't allowed. Ask a Moderator to decide it another way or change the approval policy.`);
    }
  }
  const approvers = await eligibleApprovers(ctx, policy, actor.user.id);
  const requestId = newId("apr");
  const now = nowIso();
  await ctx.db.batch([
    ...(input.alongside ?? []),
    ctx.db.stmt(
      `INSERT INTO approval_requests (id, policy_id, policy_snapshot, rule_id, resource_type, resource_id, action, title, payload_json, status, requested_by, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'PENDING', ?10, ?11, ?11)`,
      requestId, policyId, JSON.stringify(policy), input.ruleId ?? null, input.resourceType, input.resourceId, input.action, input.title.slice(0, 200),
      input.payload === undefined ? null : JSON.stringify(input.payload), actor.user.id, now,
    ),
    auditStmt(ctx, { action: "approval.requested", resourceType: input.resourceType, resourceId: input.resourceId, after: { requestId, policy: policy.key, action: input.action } }),
    ...notifyStmts(ctx, approvers, {
      type: "approval.requested", title: `Approval needed: ${input.title}`.slice(0, 200),
      body: `${actor.profile?.full_name ?? "A member"} asked. Needs ${describePolicy(policy)}.`,
      link: `/dashboard/approvals/${requestId}`, resourceType: "approval_request", resourceId: requestId,
    }),
  ]);
  return { requestId, created: true };
}

async function loadRequest(ctx: Ctx, id: string): Promise<ApprovalRequestRow> {
  const row = await ctx.db.first<ApprovalRequestRow>("SELECT * FROM approval_requests WHERE id = ?1", id);
  if (!row) throw new NotFoundError("Approval request");
  return row;
}

async function loadSteps(ctx: Ctx, requestId: string): Promise<ApprovalStep[]> {
  const rows = await ctx.db.all<{ actor_id: string; decision: "APPROVE" | "REJECT"; matched_group: string | null }>(
    "SELECT actor_id, decision, matched_group FROM approval_steps WHERE request_id = ?1 ORDER BY created_at",
    requestId,
  );
  return rows.map((r) => ({ actorId: r.actor_id, decision: r.decision, matchedGroups: r.matched_group ? (JSON.parse(r.matched_group) as number[]) : [] }));
}

/**
 * An approver group "anyone who can <permission>" is itself the authority to review (leaders put
 * e.g. the Publication Secretary there on purpose); every other group also needs approvals.decide.
 */
const viaPermissionGroup = (policy: ApprovalPolicy, groups: number[]) => groups.some((g) => policy.approvers[g]?.type === "permission");

function mayDecide(ctx: Ctx, policy: ApprovalPolicy, groups: number[], requestId: string): boolean {
  return groups.length > 0 && (viaPermissionGroup(policy, groups) || can(ctx, "approvals.decide", { type: "approval_request", id: requestId }));
}

export async function decideApproval(ctx: Ctx, requestId: string, decision: "APPROVE" | "REJECT", comment?: string | null, opts: { bulk?: boolean } = {}): Promise<{ status: string }> {
  const actor = requireActor(ctx);
  const req = await loadRequest(ctx, requestId);
  const policy = JSON.parse(req.policy_snapshot) as ApprovalPolicy;
  const groups = eligibleGroups(policy, actor.subject, { requestedBy: req.requested_by });
  if (!viaPermissionGroup(policy, groups)) requirePermission(ctx, "approvals.decide", { type: "approval_request", id: requestId });
  if (req.status !== "PENDING") throw new AppError(409, "RESOLVED", `This request is already ${req.status.toLowerCase()}.`);
  // Changes to who may do what are read and decided one at a time, never ticked in a list.
  if (opts.bulk && req.resource_type === "governance") throw new AppError(409, "ONE_AT_A_TIME", `"${req.title ?? req.action}" changes access: open it and decide it on its own.`);
  if (groups.length === 0) {
    const reason = actor.user.id === req.requested_by && !policy.allowSelfApproval ? "You cannot approve your own request." : `You are not an approver under "${policy.name}".`;
    throw new ForbiddenError(reason);
  }
  if (decision === "REJECT" && !comment?.trim()) throw new AppError(400, "REASON_REQUIRED", "Give a reason so the author knows what to change.");

  const steps = [...(await loadSteps(ctx, requestId)).filter((s) => s.actorId !== actor.user.id), { actorId: actor.user.id, decision, matchedGroups: groups }];
  const eligibleCount = (await eligibleApprovers(ctx, policy, req.requested_by)).length;
  const effective = policy.mode === "THRESHOLD" ? Math.max(1, Math.min(policy.threshold ?? 1, eligibleCount)) : undefined;
  const result = evaluateApproval(policy, steps, effective);
  const now = nowIso();

  const token = newTransition();
  const stmts: D1StatementLike[] = [
    // Still pending when this batch runs (another decision may have resolved it meanwhile).
    assertStmt(ctx, "EXISTS (SELECT 1 FROM approval_requests WHERE id = ?1 AND status = 'PENDING')", requestId),
    ctx.db.stmt(
      `INSERT INTO approval_steps (id, request_id, actor_id, decision, matched_group, comment, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(request_id, actor_id) DO UPDATE SET decision = excluded.decision, matched_group = excluded.matched_group, comment = excluded.comment, created_at = excluded.created_at`,
      newId("aps"), requestId, actor.user.id, decision, JSON.stringify(groups), comment ?? null, now,
    ),
    auditStmt(ctx, { action: `approval.${decision.toLowerCase()}`, resourceType: req.resource_type, resourceId: req.resource_id, reason: comment ?? null, after: { requestId, status: result.status } }),
  ];
  if (result.status !== "PENDING") {
    // Guarded and stamped: only one concurrent decision resolves the request; for any other the
    // assertion aborts the whole batch, so the change it approves is never applied twice.
    stmts.push(ctx.db.stmt("UPDATE approval_requests SET status = ?2, resolved_at = ?3, resolution_note = ?4, updated_at = ?3, last_transition = ?5 WHERE id = ?1 AND status = 'PENDING'",
      requestId, result.status, now, comment ?? null, token));
    stmts.push(assertTransition(ctx, "approval_requests", requestId, token));
    const handler = handlers.get(req.action);
    if (handler) {
      stmts.push(...(result.status === "APPROVED" ? await handler.onApproved(ctx, req) : ((await handler.onRejected?.(ctx, req, comment ?? null)) ?? [])));
    }
    stmts.push(...notifyStmts(ctx, [req.requested_by], {
      type: `approval.${result.status.toLowerCase()}`,
      title: `${result.status === "APPROVED" ? "Approved" : "Changes requested"}: ${req.title ?? req.action}`,
      body: comment ?? undefined,
      link: `/dashboard/approvals/${requestId}`,
      resourceType: req.resource_type,
      resourceId: req.resource_id,
    }));
  }
  await batchTransition(ctx, stmts, async () => {
    const now2 = await ctx.db.first<{ status: string }>("SELECT status FROM approval_requests WHERE id = ?1", requestId);
    return new AppError(409, "RESOLVED", `Someone else decided this request a moment ago (it's ${String(now2?.status ?? "resolved").toLowerCase()}). Reload to see it.`);
  });
  if (result.status !== "PENDING") ctx.revalidate?.(handlers.get(req.action)?.tags?.(req) ?? []);
  return { status: result.status };
}

/** How long a request waits before its reviewers get one reminder. */
export const REMIND_AFTER_MS = 48 * 3600_000;

/**
 * The hourly job: one reminder to the people who can decide a request that has waited two days.
 * At most three requests a run (each needs its approvers looked up), so the job stays well inside
 * the free plan's statements per run; the rest are reminded in the following hours.
 */
export async function remindStaleApprovals(ctx: Ctx, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - REMIND_AFTER_MS).toISOString();
  const stale = await ctx.db.all<ApprovalRequestRow>(
    "SELECT * FROM approval_requests WHERE status = 'PENDING' AND reminded_at IS NULL AND created_at < ?1 ORDER BY created_at LIMIT 3", cutoff);
  if (stale.length === 0) return 0;
  const stmts: D1StatementLike[] = [];
  for (const r of stale) {
    const policy = JSON.parse(r.policy_snapshot) as ApprovalPolicy;
    const people = await eligibleApprovers(ctx, policy, r.requested_by);
    stmts.push(...notifyStmts(ctx, people, {
      type: "approval.reminder", title: `Still waiting for a decision: ${r.title ?? r.action}`.slice(0, 200),
      body: "It has waited two days. Open it to approve or ask for changes.", link: `/dashboard/approvals/${r.id}`, resourceType: "approval_request", resourceId: r.id,
    }));
  }
  stmts.push(ctx.db.stmt("UPDATE approval_requests SET reminded_at = ?2 WHERE id IN (SELECT value FROM json_each(?1))", JSON.stringify(stale.map((r) => r.id)), now.toISOString()));
  await ctx.db.batch(stmts);
  return stale.length;
}

export async function cancelApproval(ctx: Ctx, requestId: string): Promise<void> {
  const actor = requireActor(ctx);
  const req = await loadRequest(ctx, requestId);
  if (req.status !== "PENDING") throw new AppError(409, "RESOLVED", "Only pending requests can be withdrawn.");
  if (req.requested_by !== actor.user.id) requirePermission(ctx, "approvals.policies");
  const handler = handlers.get(req.action);
  const token = newTransition();
  await batchTransition(ctx, [
    ctx.db.stmt("UPDATE approval_requests SET status = 'CANCELLED', resolved_at = ?2, updated_at = ?2, last_transition = ?3 WHERE id = ?1 AND status = 'PENDING'", requestId, nowIso(), token),
    assertTransition(ctx, "approval_requests", requestId, token),
    ...((await handler?.onRejected?.(ctx, req, WITHDRAWN)) ?? []),
    auditStmt(ctx, { action: "approval.cancelled", resourceType: req.resource_type, resourceId: req.resource_id, after: { requestId } }),
  ], () => new AppError(409, "RESOLVED", "This request was decided a moment ago, so it can't be withdrawn. Reload to see it."));
}

/** What a reviewer reads without leaving the page: the post or event as it will appear. */
export type ApprovalPreview =
  | { kind: "post"; type: string; title: string; subtitle: string | null; excerpt: string | null; body: string | null; category: string | null; coverUrl: string | null; status: string; publishedBefore: boolean }
  | { kind: "event"; title: string; description: string | null; startAt: string | null; endAt: string | null; venue: string | null; mode: string | null; organizer: string | null;
      category: string | null; bannerUrl: string | null; capacity: number | null; registrationEnabled: boolean; status: string; publishedBefore: boolean };

export interface ApprovalView extends ApprovalRequestRow {
  requester_name: string | null;
  requester_avatar: string | null;
  /** The requester's earlier submissions: published and sent back. */
  requester_history: { published: number; changesRequested: number };
  policy: ApprovalPolicy;
  steps: Array<{ actor_id: string; actor_name: string | null; decision: string; comment: string | null; created_at: string; avatarUrl: string | null }>;
  canDecide: boolean;
  whyNot: string | null;
  preview: ApprovalPreview | null;
}

/**
 * Who may see a request: its requester always (to follow and withdraw it); otherwise holders of
 * approvals.read, except that changes to who may do what are shown only to the people who can
 * decide them (and those who manage approval policies).
 */
function maySee(ctx: Ctx, req: ApprovalRequestRow, policy: ApprovalPolicy): boolean {
  const actor = requireActor(ctx);
  if (req.requested_by === actor.user.id) return true;
  // Reviewers the policy names (for example anyone who publishes posts club-wide) see what they
  // may decide, even without the general approvals.read.
  if (req.resource_type !== "governance" && eligibleGroups(policy, actor.subject, { requestedBy: req.requested_by }).length > 0) return true;
  if (!can(ctx, "approvals.read")) return false;
  if (req.resource_type !== "governance") return true;
  return can(ctx, "approvals.policies") || eligibleGroups(policy, actor.subject, { requestedBy: req.requested_by }).length > 0;
}

export async function getApproval(ctx: Ctx, id: string): Promise<ApprovalView> {
  const actor = requireActor(ctx);
  const req = await loadRequest(ctx, id);
  const policy = JSON.parse(req.policy_snapshot) as ApprovalPolicy;
  if (!maySee(ctx, req, policy)) requirePermission(ctx, req.resource_type === "governance" ? "approvals.policies" : "approvals.read");
  const [steps, requester, preview] = await Promise.all([
    ctx.db.all<Omit<ApprovalView["steps"][number], "avatarUrl"> & { avatar_json: string | null }>(
      `SELECT s.actor_id, COALESCE(p.full_name, 'Member') AS actor_name, s.decision, s.comment, s.created_at, ${avatarOfUserSql("s.actor_id")} AS avatar_json
       FROM approval_steps s JOIN users u ON u.id = s.actor_id LEFT JOIN profiles p ON p.user_id = u.id WHERE s.request_id = ?1 ORDER BY s.created_at`,
      id,
    ),
    ctx.db.first<{ name: string; avatar_json: string | null; published: number; returned: number }>(
      `SELECT COALESCE(p.full_name, 'Member') AS name, ${avatarOfUserSql("u.id")} AS avatar_json,
              (SELECT COUNT(*) FROM approval_requests x WHERE x.requested_by = u.id AND x.status = 'APPROVED' AND x.resource_type IN ('post', 'event')) AS published,
              (SELECT COUNT(*) FROM approval_requests x WHERE x.requested_by = u.id AND x.status = 'REJECTED' AND x.resource_type IN ('post', 'event')) AS returned
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?1`, req.requested_by),
    previewOf(ctx, req),
  ]);
  const groups = eligibleGroups(policy, actor.subject, { requestedBy: req.requested_by });
  const whyNot = req.status !== "PENDING" ? "Already resolved."
    : groups.length === 0 ? (actor.user.id === req.requested_by ? "You requested this; someone else must decide." : `Only ${policy.name} can decide.`)
      : !mayDecide(ctx, policy, groups, id) ? "Your access doesn't include deciding approvals." : null;
  return {
    ...req, requester_name: requester?.name ?? null, requester_avatar: avatarUrl(requester?.avatar_json),
    requester_history: { published: requester?.published ?? 0, changesRequested: requester?.returned ?? 0 },
    policy, steps: withAvatars(steps), canDecide: !whyNot, whyNot, preview,
  };
}

/** The post or event behind a request, as the public page will show it. */
async function previewOf(ctx: Ctx, req: ApprovalRequestRow): Promise<ApprovalPreview | null> {
  if (req.resource_type === "post") {
    const p = await ctx.db.first<{ type: string; title: string; subtitle: string | null; excerpt: string | null; body_markdown: string | null; category: string | null; status: string; published_at: string | null; cover: string | null }>(
      `SELECT p.type, p.title, p.subtitle, p.excerpt, p.body_markdown, c.name AS category, p.status, p.published_at,
              (SELECT json_object('storage', m.storage, 'object_key', m.object_key, 'legacy_path', m.legacy_path, 'external_url', m.external_url, 'variants_json', m.variants_json)
                 FROM media m WHERE m.id = p.featured_media_id AND m.deleted_at IS NULL) AS cover
       FROM posts p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?1`, req.resource_id);
    if (!p) return null;
    // An edit of a live post: show the edit, not what's live now.
    if (req.action === "posts.update_live") {
      const { revisionId } = JSON.parse(req.payload_json ?? "{}") as { revisionId?: string };
      const snap = revisionId ? await ctx.db.value<string>("SELECT snapshot_json FROM post_revisions WHERE id = ?1", revisionId) : null;
      if (snap) {
        const d = JSON.parse(snap) as { title: string; subtitle: string | null; excerpt: string | null; body: string | null; category: string | null };
        return { kind: "post", type: p.type, title: d.title, subtitle: d.subtitle, excerpt: d.excerpt, body: d.body, category: d.category,
          coverUrl: avatarUrl(p.cover, "lg"), status: p.status, publishedBefore: true };
      }
    }
    return { kind: "post", type: p.type, title: p.title, subtitle: p.subtitle, excerpt: p.excerpt, body: p.body_markdown, category: p.category,
      coverUrl: avatarUrl(p.cover, "lg"), status: p.status, publishedBefore: Boolean(p.published_at) };
  }
  if (req.resource_type === "event") {
    const e = await ctx.db.first<{ title: string; description: string | null; start_at: string | null; end_at: string | null; venue: string | null; mode: string | null; organizer: string | null;
      category: string | null; capacity: number | null; registration_enabled: number; status: string; published_at: string | null; banner: string | null }>(
      `SELECT e.title, e.description, e.start_at, e.end_at, e.venue, e.mode, e.organizer, c.name AS category, e.capacity, e.registration_enabled, e.status,
              (SELECT MIN(created_at) FROM audit_logs a WHERE a.resource_type = 'event' AND a.resource_id = e.id AND a.action = 'event.publish') AS published_at,
              (SELECT json_object('storage', m.storage, 'object_key', m.object_key, 'legacy_path', m.legacy_path, 'external_url', m.external_url, 'variants_json', m.variants_json)
                 FROM media m WHERE m.id = e.banner_media_id AND m.deleted_at IS NULL) AS banner
       FROM events e LEFT JOIN categories c ON c.id = e.category_id WHERE e.id = ?1`, req.resource_id);
    if (!e) return null;
    return { kind: "event", title: e.title, description: e.description, startAt: e.start_at, endAt: e.end_at, venue: e.venue, mode: e.mode, organizer: e.organizer,
      category: e.category, bannerUrl: avatarUrl(e.banner, "lg"), capacity: e.capacity, registrationEnabled: Boolean(e.registration_enabled), status: e.status, publishedBefore: Boolean(e.published_at) };
  }
  return null;
}

/**
 * Requests you may see. Pending ones are listed oldest first (a queue); `forMe` keeps only the
 * ones you can decide now. Each row carries the requester's photo and plain-words policy.
 */
/** Publishes posts or events club-wide: such people review members' submissions. */
export const isContentReviewer = (ctx: Ctx) =>
  ["posts.publish", "events.publish"].some((p) => can(ctx, p) && scopesFor(ctx, p).some((g) => g.scope === "ALL"));

export async function listApprovals(ctx: Ctx, opts: { status?: string; mine?: boolean; page?: number; forMe?: boolean }) {
  const actor = requireActor(ctx);
  // Without approvals.read, people see (and can withdraw) their own requests, plus, for anyone who
  // publishes club-wide, what they may review ("permission" approvers of member submissions).
  if (!can(ctx, "approvals.read") && !isContentReviewer(ctx)) opts = { ...opts, mine: true, forMe: false };
  const status = opts.status ?? "PENDING";
  const page = Math.max(1, opts.page ?? 1);
  const rows = await ctx.db.all<ApprovalRequestRow & { requester_name: string | null; avatar_json: string | null }>(
    `SELECT r.*, COALESCE(p.full_name, 'Member') AS requester_name, ${avatarOfUserSql("r.requested_by")} AS avatar_json FROM approval_requests r
     JOIN users u ON u.id = r.requested_by LEFT JOIN profiles p ON p.user_id = u.id
     WHERE (?1 = 'ALL' OR r.status = ?1) AND (?2 = 0 OR r.requested_by = ?3)
     ORDER BY CASE WHEN ?1 = 'PENDING' THEN r.created_at END ASC, r.created_at DESC LIMIT ?4`,
    status, opts.mine ? 1 : 0, actor.user.id, Math.min(page * 50 + 1, 1000) * 4,
  );
  // Who may see or decide each request is known only after reading its policy, so the page is cut
  // after filtering: page 2 and "approve next" never skip or repeat requests.
  const visible = rows.flatMap(({ avatar_json, ...r }) => {
    const policy = JSON.parse(r.policy_snapshot) as ApprovalPolicy;
    if (!maySee(ctx, r, policy)) return [];
    const canDecide = r.status === "PENDING" && mayDecide(ctx, policy, eligibleGroups(policy, actor.subject, { requestedBy: r.requested_by }), r.id);
    if (opts.forMe && !canDecide) return [];
    return [{ ...r, requester_avatar: avatarUrl(avatar_json), policy, policyText: describePolicy(policy), canDecide }];
  });
  return visible.slice((page - 1) * 50, page * 50);
}
