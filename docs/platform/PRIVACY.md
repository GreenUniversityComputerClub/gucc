# Privacy and data retention

What personal data the platform keeps, who can see it, how long it stays, and how it's removed.
Retention is enforced by the Worker's daily job (`lib/server/services/retention.ts`, 03:43 Dhaka
time) and the hourly one (`maintenance.ts`); System health shows when each last ran.

## What is kept

| Data                                                                                | Where                                         | Why                                                            |
| ----------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| Account: email, password hash (PBKDF2 with a server-side pepper), status            | `users`                                       | Sign-in and membership                                         |
| Profile: name, student ID, department, batch, bio, links, photo; phone (private)    | `profiles`                                    | The member directory and committee pages                       |
| Sessions: a hash of the session token, device description, a hash of the IP address | `sessions`                                    | Staying signed in; the device list on the Security page        |
| Two-factor: the authenticator secret (AES-GCM encrypted), hashed recovery codes     | `user_mfa`                                    | Two-factor sign-in                                             |
| Sign-in events: time, outcome, email, hashed IP, device                             | `authentication_events`                       | Security (lockouts, new-device notices, System health figures) |
| Activity log: who changed what, when (hashed IP)                                    | `audit_logs`                                  | Accountability; sealed hourly against tampering                |
| Notifications and messages                                                          | `notifications`, `messages`                   | The dashboard                                                  |
| Email log: recipient, type, Resend's answer                                         | `email_log`                                   | Proof of what was (not) sent                                   |
| Event registrations: name, email, student ID, phone, answers                        | `event_registrations`                         | Running events                                                 |
| Recruitment applications: contact details, grades, documents (private files)        | `recruitment_applications`, R2 private bucket | Selection                                                      |
| Contact messages                                                                    | `contact_messages`                            | Replying                                                       |
| Lost & found posts, photos, messages                                                | `lost_found_*`, R2                            | The service                                                    |
| Diagnostics: unexpected errors (procedure, message; no request data)                | `error_events`                                | Fixing faults                                                  |

IP addresses are never stored: only a keyed hash (HMAC with `AUTH_SECRET`), enough to spot abuse
from one address.

## Who can see it

- **Everyone:** published pages only: committee listings, events, posts, public photos.
- **Members:** their own account, registrations, tasks, messages; other members' names (and
  department and batch) when starting a conversation, never their email.
- **Leaders by permission**, not by title (see "Who can do what" in the dashboard):
  `members.read` shows account emails and applications; `recruitment.manage` shows applicants and
  their documents (signed links that expire in 10 minutes); `audit.read` shows the activity log;
  `system.health` shows System health (email addresses there are masked).
- **Exports** of personal data (members, registrations, applications) need the password entered
  in the last 10 minutes, and each export is in the activity log.

## How long it stays

| Data                                                        | Kept for                                  | Then                                                                                                               |
| ----------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Error events                                                | 30 days                                   | deleted                                                                                                            |
| Email log                                                   | 90 days                                   | deleted                                                                                                            |
| Idempotency keys (repeat protection)                        | 1 day                                     | deleted                                                                                                            |
| Rate-limit counters                                         | 2 days                                    | deleted (hourly)                                                                                                   |
| Expired or revoked sessions, used tokens                    | 30 days                                   | deleted (hourly)                                                                                                   |
| Read notifications                                          | 180 days (`notifications.retention_days`) | deleted (hourly)                                                                                                   |
| Sign-in events                                              | 1 year                                    | deleted                                                                                                            |
| Usage counters                                              | 13 months                                 | deleted                                                                                                            |
| Contact messages                                            | 12 months                                 | deleted                                                                                                            |
| Rejected or withdrawn applications, with their documents    | 12 months after the recruitment closed    | deleted, files removed from R2                                                                                     |
| Event registrations                                         | 24 months after the event                 | anonymised: name "Former participant", email, phone, student ID, answers and account link removed; the count stays |
| Archived lost & found posts, with photos and messages       | 12 months after archiving                 | deleted, photos removed from R2                                                                                    |
| Activity log                                                | 2 years                                   | deleted in whole sealed ranges (the database refuses to delete anything younger)                                   |
| Accepted applications, committee history, published content | kept                                      | the club's history                                                                                                 |
| Files nothing uses                                          | marked after a day unused                 | a Moderator may delete them permanently after 30 days; nothing is deleted automatically                            |

## Deleting an account

Dashboard → Security → _Delete my account_ (password and typing DELETE). Immediately:

- signed out everywhere; reset and invitation links, roles and direct permissions revoked;
- two-factor secret, email choices and notifications deleted;
- the email address replaced, the password hash removed, the account archived;
- a profile with no committee history is anonymised ("Deleted member", personal fields cleared);
  an executive's profile keeps the name and committee history (the club's public record) but
  loses the private details and the link to the account;
- event registrations are detached from the account; lost & found posts removed; conversations
  archived;
- the email log and sign-in events keep the event but drop the address and device.

The last Moderator can't delete their account before appointing another.

## Services that process data

| Service                                           | What it receives                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Cloudflare (Workers, D1, R2, Turnstile)           | Everything above; hosted in Cloudflare's network (D1 primary in Singapore)                             |
| Vercel                                            | Page requests; server functions pass data between the browser and the API without storing it           |
| Resend (only when email is switched on)           | Recipient address, subject and text of each email                                                      |
| Google Gemini (only when `GOOGLE_API_KEY` is set) | The visitor's question and the recent chat turns, plus public club information; nothing about accounts |

## Cookies

| Cookie                                              | Purpose                                                                                  |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `__Host-gucc_session` (production) / `gucc_session` | The session token. HttpOnly, Secure, SameSite=Lax, this host only.                       |
| `gucc_signed_in`                                    | Not a secret: "a session may exist", so pages ask who is signed in only when it's there. |
| `gucc_mfa_pending`                                  | A sign-in waiting for its two-factor code (10 minutes, `/auth` only).                    |

No analytics or advertising cookies.
