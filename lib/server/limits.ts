/**
 * Every rate limit in one place, strict where abuse is cheap for an attacker and costly for
 * the club (sign-in, password reset, sign-up, contact, uploads), looser for everyday work.
 * Signed-in accounts also have an overall ceiling on changes, so spreading requests over many
 * IP addresses doesn't get around the per-address limits. Public pages are served from the
 * cache and need no limit here; the Worker's in-memory guard (workers/api/src/guard.ts) and
 * the Vercel Firewall stand in front of all of this.
 */
import type { Ctx } from "./context";
import { rateLimit } from "./security";

export const LIMITS = {
  // Sign-in and account recovery: very strict.
  "auth.login.ip": { limit: 30, windowSeconds: 900, label: "Sign-in attempts per address, 15 minutes" },
  "auth.login.email": { limit: 10, windowSeconds: 900, label: "Sign-in attempts per account, 15 minutes (then lockout)" },
  "auth.passwordReset": { limit: 5, windowSeconds: 3600, label: "Password reset requests per address, hour" },
  "auth.register": { limit: 5, windowSeconds: 3600, label: "Sign-ups per address, hour" },
  "auth.resendVerification": { limit: 5, windowSeconds: 3600, label: "Verification emails per address, hour" },
  "auth.acceptInvite": { limit: 10, windowSeconds: 3600, label: "Invitation acceptances per address, hour" },
  "mfa.login": { limit: 5, windowSeconds: 600, label: "Two-factor codes per pending sign-in, 10 minutes" },
  "mfa.setup": { limit: 10, windowSeconds: 3600, label: "Two-factor setups per account, hour" },
  "mfa.confirm": { limit: 10, windowSeconds: 900, label: "Two-factor confirmations per account, 15 minutes" },
  "account.reauth": { limit: 10, windowSeconds: 900, label: "Password confirmations per account, 15 minutes" },
  // Public forms: strict.
  "contact.submit": { limit: 5, windowSeconds: 3600, label: "Contact messages per address, hour" },
  "recruitment.token": { limit: 10, windowSeconds: 3600, label: "Application upload links per address, hour" },
  "recruitment.submit": { limit: 6, windowSeconds: 3600, label: "Applications per address, hour" },
  "events.register": { limit: 10, windowSeconds: 600, label: "Event registrations per address, 10 minutes" },
  "certificates.verify": { limit: 30, windowSeconds: 600, label: "Certificate checks per address, 10 minutes" },
  "assistant.ip": { limit: 40, windowSeconds: 3600, label: "Assistant questions per address, hour" },
  // Uploads: strict.
  "media.upload": { limit: 60, windowSeconds: 3600, label: "Uploads per account, hour" },
  "media.upload.applicant": { limit: 15, windowSeconds: 3600, label: "Application files per address, hour" },
  "media.upload.lostfound": { limit: 10, windowSeconds: 86_400, label: "Lost & found photos per account, day" },
  "media.upload.avatar": { limit: 10, windowSeconds: 86_400, label: "Profile photos per account, day" },
  // Members' everyday actions: moderate.
  "chat.send": { limit: 30, windowSeconds: 600, label: "Messages per account, 10 minutes" },
  "chat.newConversation": { limit: 10, windowSeconds: 86_400, label: "New conversations per account, day" },
  "report": { limit: 10, windowSeconds: 3600, label: "Reports per account, hour" },
  "lostfound.post": { limit: 10, windowSeconds: 86_400, label: "Lost & found posts per account, day" },
  "people.invite": { limit: 30, windowSeconds: 3600, label: "Invitations per account, hour" },
  "tasks.create": { limit: 60, windowSeconds: 3600, label: "Tasks given per account, hour" },
  "tasks.comment": { limit: 60, windowSeconds: 600, label: "Task comments per account, 10 minutes" },
  "meetings.schedule": { limit: 30, windowSeconds: 3600, label: "Meetings scheduled per account, hour" },
  "email.test": { limit: 5, windowSeconds: 3600, label: "Test emails per account, hour" },
  // Every change by a signed-in account, whatever the address.
  "account.mutations": { limit: 300, windowSeconds: 600, label: "Changes per account, 10 minutes" },
} as const;

export type LimitName = keyof typeof LIMITS;

/** Count one attempt against a named limit for this subject (an account id, an IP hash, …). */
export async function limit(ctx: Ctx, name: LimitName, subject: string | null | undefined): Promise<void> {
  const l = LIMITS[name];
  await rateLimit(ctx, `${name}:${subject ?? "unknown"}`, l.limit, l.windowSeconds);
}
