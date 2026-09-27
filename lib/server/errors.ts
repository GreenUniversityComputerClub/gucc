/**
 * Errors that are safe to show to users. Anything else is logged server-side
 * and surfaced as a generic message, so internals never leak.
 */
import type { Decision } from "../governance/types";

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, readonly fields: Record<string, string> = {}) {
    super(400, "VALIDATION", message, { fields });
  }
}

export class AuthRequiredError extends AppError {
  constructor(message = "Please sign in to continue.") {
    super(401, "AUTH_REQUIRED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string, readonly decision?: Decision) {
    super(403, "FORBIDDEN", message, decision ? { trace: decision.trace, permission: decision.permission } : undefined);
  }
}

export class NotFoundError extends AppError {
  constructor(what = "Record") {
    super(404, "NOT_FOUND", `${what} not found.`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, "CONFLICT", message);
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterSeconds: number) {
    super(429, "RATE_LIMITED", `Too many attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`, { retryAfterSeconds });
  }
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; code: string; fields?: Record<string, string>; trace?: string[] };

/** What a unique constraint means to the person, by the table (and column) SQLite names. */
const CONFLICTS: Array<[RegExp, string]> = [
  [/users\.email/, "An account with that email already exists."],
  [/profiles\.student_id/, "Another profile already has that student ID."],
  [/profiles\.user_id/, "That account is already linked to a profile."],
  [/user_roles/, "They already have that role."],
  [/committees_one_current|committees\.status/, "Another committee is already the current one. Mark it as past first."],
  [/committee_members/, "This person already holds that position in this committee."],
  [/committees\./, "A committee with that name or year already exists."],
  [/approval_requests/, "This is already waiting for approval."],
  [/approval_steps/, "You've already decided this request."],
  [/event_registrations/, "This person is already registered for the event."],
  [/recruitment_applications(\.campaign_id, recruitment_applications)?\.student_id|recruitment_applications_student/, "An application with this student ID already exists for this recruitment."],
  [/recruitment_applications/, "An application with this email already exists for this recruitment."],
  [/user_permissions/, "They already have that permission."],
  [/reports/, "You've already reported this."],
  [/roles\./, "A role with that name already exists."],
  [/positions\./, "A position with that name already exists."],
  [/approval_policies/, "An approval policy with that name already exists."],
  [/rules\./, "A rule with that name already exists."],
  [/categories/, "A category with that name already exists."],
  [/tags/, "A tag with that name already exists."],
  [/posts\./, "Another post already uses that web address (slug)."],
  [/events\./, "Another event already uses that web address (slug)."],
  [/external_forms/, "Another form already uses that web address."],
  [/media/, "That file is already in the library."],
];

export function conflictMessage(msg: string): string {
  const detail = msg.split(/UNIQUE constraint failed:/i)[1] ?? "";
  return CONFLICTS.find(([re]) => re.test(detail))?.[1] ?? "That record already exists.";
}

/** Convert any thrown value into a user-safe result, logging the unexpected. */
export function toActionResult(e: unknown, requestId?: string): ActionResult<never> {
  if (e instanceof AppError) {
    return {
      ok: false,
      error: e.message,
      code: e.code,
      fields: e instanceof ValidationError ? e.fields : undefined,
      trace: e instanceof ForbiddenError ? e.decision?.trace : undefined,
    };
  }
  if (e && typeof e === "object" && "name" in e && (e as Error).name === "GovernanceViolation") {
    return { ok: false, error: (e as Error).message, code: "GOVERNANCE" };
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (/UNIQUE constraint failed/i.test(msg)) return { ok: false, error: conflictMessage(msg), code: "CONFLICT" };
  // A guarded change lost a race and nothing caught it (lib/server/transition.ts): nothing was changed.
  if (/transition_lost/.test(msg)) return { ok: false, error: "Someone changed this a moment ago, so nothing was saved. Reload and try again.", code: "CONFLICT" };
  if (/FOREIGN KEY constraint failed/i.test(msg)) return { ok: false, error: "A referenced record does not exist or is still in use.", code: "CONFLICT" };
  console.error(`[${requestId ?? "no-request-id"}]`, e);
  return { ok: false, error: `Something went wrong. Reference: ${requestId ?? "n/a"}`, code: "INTERNAL" };
}

export function jsonError(e: unknown, requestId?: string): Response {
  const r = toActionResult(e, requestId);
  const status = e instanceof AppError ? e.status : r.ok ? 200 : r.code === "CONFLICT" ? 409 : r.code === "GOVERNANCE" ? 403 : 500;
  return Response.json(r, { status });
}
