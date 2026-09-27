/**
 * Runtime checks for the API responses the dashboard depends on. TypeScript already shares
 * the types at build time; these guard against a website and an API from different releases
 * (every deploy briefly runs both). Missing fields get safe defaults and a warning, never a
 * crash. `tests/integration/api-contract.test.ts` runs the real procedures and fails when a
 * field the website needs is absent, so a regression is caught before it ships.
 */
import type { SessionView } from "@/lib/server/views/admin";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const bool = (v: unknown) => v === true;
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Fields of session.me the website reads, with the value used when an older API omits them. */
export const SESSION_FIELDS = ["user", "profile", "roles", "positions", "isModerator", "adminAccess", "caps", "unread", "unreadMessages", "openTasks", "security", "apiVersion"] as const;

const warned = new Set<string>();
function warn(what: string, missing: string[]) {
  const key = `${what}:${missing.join(",")}`;
  if (missing.length === 0 || warned.has(key)) return;
  warned.add(key);
  console.warn(`[api-contract] ${what} is missing ${missing.join(", ")}; the API is probably older than this website.`);
}

export function normalizeSession(raw: unknown): SessionView | null {
  if (!isObj(raw) || !isObj(raw.user) || typeof raw.user.id !== "string") return null;
  warn("session.me", SESSION_FIELDS.filter((f) => !(f in raw)));
  const sec = isObj(raw.security) ? raw.security : {};
  return {
    ...(raw as unknown as SessionView),
    profile: isObj(raw.profile) ? (raw.profile as SessionView["profile"]) : null,
    roles: arr<string>(raw.roles),
    positions: arr<SessionView["positions"][number]>(raw.positions),
    isModerator: bool(raw.isModerator),
    adminAccess: bool(raw.adminAccess),
    caps: isObj(raw.caps) ? (raw.caps as Record<string, boolean>) : {},
    unread: num(raw.unread),
    unreadMessages: num(raw.unreadMessages),
    openTasks: num(raw.openTasks),
    security: {
      mfaEnabled: bool(sec.mfaEnabled),
      mfaRequired: bool(sec.mfaRequired),
      mfaDeadline: typeof sec.mfaDeadline === "string" ? sec.mfaDeadline : null,
      mfaBlocked: bool(sec.mfaBlocked),
    },
    apiVersion: typeof raw.apiVersion === "string" ? raw.apiVersion : null,
  };
}

/** Fields of views.home the dashboard home reads. */
export const HOME_LISTS = ["attention", "approvals", "myWork", "myRequests", "expiring", "upcoming", "myRegistrations", "notifications", "tasks", "meetings", "recentActivity"] as const;

export function normalizeHome<T extends Obj>(raw: T): T {
  const out: Obj = { ...raw };
  warn("views.home", HOME_LISTS.filter((f) => !(f in raw)));
  for (const f of HOME_LISTS) out[f] = arr(raw[f]);
  out.unread = num(raw.unread);
  out.emailEnabled = bool(raw.emailEnabled);
  if (!("health" in raw)) out.health = null;
  if (!("campaign" in raw)) out.campaign = null;
  if (!("account" in raw)) out.account = null;
  return out as T;
}

/** notifications.list: rows, unread count and the paging cursor. */
export function normalizeNotifications<T extends Obj>(raw: T): T {
  warn("notifications.list", ["rows", "unread", "next"].filter((f) => !(f in raw)));
  return { ...raw, rows: arr(raw.rows), unread: num(raw.unread), next: typeof raw.next === "string" ? raw.next : null } as T;
}
