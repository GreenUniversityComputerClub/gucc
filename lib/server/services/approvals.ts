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
import { eligibleGroups, evaluateApproval } from "../../governance/approval";
import type { ApprovalPolicy, ApprovalStep, ApproverSpec } from "../../governance/types";
import { auditStmt } from "../audit";
import { can, requireActor, requirePermission } from "../authz";
import type { Ctx } from "../context";
import { newId, nowIso, type D1StatementLike } from "../db";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { notifyStmts, usersWith } from "../notifications";

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
  const ids = new Set([...(await usersWith(ctx, { roles, positions })), ...users, ...(policy.approvers.some((a) => a.type === "assigned") ? assigned : [])]);
  if (!policy.allowSelfApproval) ids.delete(requestedBy);
  return [...ids];
}

/** For each approver group, the people (other than the requester) who could decide for it now. */
async function groupCandidates(ctx: Ctx, policy: ApprovalPolicy, requestedBy: string): Promise<string[][]> {
  const out: string[][] = [];
  for (const a of policy.approvers) {
    const ids = a.type === "role" ? await usersWith(ctx, { roles: [a.value!] })
      : a.type === "position" ? await usersWith(ctx, { positions: [a.value!] })
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
    ...notifyStmts(ctx, approvers, { type: "approval.requested", title: `Approval needed: ${input.title}`, body: `Policy: ${policy.name}.`, link: `/dashboard/approvals/${requestId}`, resourceType: "approval_request", resourceId: requestId }),
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

export async function decideApproval(ctx: Ctx, requestId: string, decision: "APPROVE" | "REJECT", comment?: string | null, opts: { bulk?: boolean } = {}): Promise<{ status: string }> {
  const actor = requireActor(ctx);
  requirePermission(ctx, "approvals.decide", { type: "approval_request", id: requestId });
  const req = await loadRequest(ctx, requestId);
  if (req.status !== "PENDING") throw new AppError(409, "RESOLVED", `This request is already ${req.status.toLowerCase()}.`);
  // Changes to who may do what are read and decided one at a time, never ticked in a list.
  if (opts.bulk && req.resource_type === "governance") throw new AppError(409, "ONE_AT_A_TIME", `"${req.title ?? req.action}" changes access: open it and decide it on its own.`);
  const policy = JSON.parse(req.policy_snapshot) as ApprovalPolicy;
  const groups = eligibleGroups(policy, actor.subject, { requestedBy: req.requested_by });
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

export interface ApprovalView extends ApprovalRequestRow {
  requester_name: string | null;
  policy: ApprovalPolicy;
  steps: Array<{ actor_id: string; actor_name: string | null; decision: string; comment: string | null; created_at: string }>;
  canDecide: boolean;
  whyNot: string | null;
}

/**
 * Who may see a request: its requester always (to follow and withdraw it); otherwise holders of
 * approvals.read, except that changes to who may do what are shown only to the people who can
 * decide them (and those who manage approval policies).
 */
function maySee(ctx: Ctx, req: ApprovalRequestRow, policy: ApprovalPolicy): boolean {
  const actor = requireActor(ctx);
  if (req.requested_by === actor.user.id) return true;
  if (!can(ctx, "approvals.read")) return false;
  if (req.resource_type !== "governance") return true;
  return can(ctx, "approvals.policies") || eligibleGroups(policy, actor.subject, { requestedBy: req.requested_by }).length > 0;
}

export async function getApproval(ctx: Ctx, id: string): Promise<ApprovalView> {
  const actor = requireActor(ctx);
  const req = await loadRequest(ctx, id);
  const policy = JSON.parse(req.policy_snapshot) as ApprovalPolicy;
  if (!maySee(ctx, req, policy)) requirePermission(ctx, req.resource_type === "governance" ? "approvals.policies" : "approvals.read");
  const steps = await ctx.db.all<ApprovalView["steps"][number]>(
    `SELECT s.actor_id, COALESCE(p.full_name, u.email) AS actor_name, s.decision, s.comment, s.created_at
     FROM approval_steps s JOIN users u ON u.id = s.actor_id LEFT JOIN profiles p ON p.user_id = u.id WHERE s.request_id = ?1 ORDER BY s.created_at`,
    id,
  );
  const requester = await ctx.db.first<{ name: string }>("SELECT COALESCE(p.full_name, u.email) AS name FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?1", req.requested_by);
  const groups = eligibleGroups(policy, actor.subject, { requestedBy: req.requested_by });
  const whyNot = req.status !== "PENDING" ? "Already resolved."
    : groups.length === 0 ? (actor.user.id === req.requested_by ? "You requested this; someone else must decide." : `Only ${policy.name} can decide.`)
      : !can(ctx, "approvals.decide", { type: "approval_request", id }) ? "Your access doesn't include deciding approvals." : null;
  return { ...req, requester_name: requester?.name ?? null, policy, steps, canDecide: !whyNot, whyNot };
}

export async function listApprovals(ctx: Ctx, opts: { status?: string; mine?: boolean; page?: number }) {
  const actor = requireActor(ctx);
  // Without approvals.read, people see (and can withdraw) their own requests.
  if (!can(ctx, "approvals.read")) opts = { ...opts, mine: true };
  const status = opts.status ?? "PENDING";
  const page = Math.max(1, opts.page ?? 1);
  const rows = await ctx.db.all<ApprovalRequestRow & { requester_name: string | null }>(
    `SELECT r.*, COALESCE(p.full_name, u.email) AS requester_name FROM approval_requests r
     JOIN users u ON u.id = r.requested_by LEFT JOIN profiles p ON p.user_id = u.id
     WHERE (?1 = 'ALL' OR r.status = ?1) AND (?2 = 0 OR r.requested_by = ?3)
     ORDER BY r.created_at DESC LIMIT 50 OFFSET ?4`,
    status, opts.mine ? 1 : 0, actor.user.id, (page - 1) * 50,
  );
  const decides = can(ctx, "approvals.decide");
  return rows.flatMap((r) => {
    const policy = JSON.parse(r.policy_snapshot) as ApprovalPolicy;
    if (!maySee(ctx, r, policy)) return [];
    return [{ ...r, policy, canDecide: r.status === "PENDING" && decides && eligibleGroups(policy, actor.subject, { requestedBy: r.requested_by }).length > 0 }];
  });
}
