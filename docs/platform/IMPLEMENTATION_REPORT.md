# GUCC platform — implementation report

Date: 2026-09-30 · Branch: `database` (round 8 uncommitted)

The website is a Next.js frontend on Vercel's free plan, backed by one Cloudflare Worker (free plan)
with D1 and R2. **The production backend is live** at `https://gucc-api.gucc.workers.dev`, with all club
data imported and verified and migrations `0001`–`0009` applied (0009 on 2026-09-29). Once set up, a push to `main` deploys
the database migrations, the API and the website in order (see "Workers"). No DNS change is needed.

## Round 8 (2026-09-30): live everything, groups and reactions, lean database, blog/events/tasks/meetings

Everything below is in the working tree and **not released**. Schema changes are in
`migrations/0011_platform_v7.sql`, `0012_contact_topic.sql` and `0013_profile_cutout_media_indexes.sql` (additive: the round-7 Worker keeps working on a migrated
database). The Worker also gains one Durable Object class, `LiveHub` (`wrangler.jsonc` → `exports`
and `durable_objects` in every environment); releasing the API creates it.

**Live updates.** One hibernating, SQLite-backed Durable Object (`workers/api/src/live-hub.ts`,
available on Workers Free) holds a WebSocket per open dashboard tab. Services describe what changed
(`emit`, `lib/server/live.ts`); after a request succeeds the Worker hands the events to the hub,
which pushes them to the people concerned. Messages, edits, deletions, reactions, read receipts,
"typing…", active status, notifications, task and meeting changes all arrive without a reload.
Browsers connect with a two-minute signed ticket (`/api/live/ticket`, renewed every 30 minutes so a
sign-out takes effect); typing and active status use signed "room" and "watch" passes, so the hub
never reads D1 for them. The hub counts its requests and rests at 80% of the free 100,000 a day
(pages then check on a timer); System health shows connections and today's count. Without the hub
(older API, blocked network) everything falls back to polling that is slower than before.

**Database load.** A quiet open conversation used 2 statements every 5–30 seconds; with a live
connection it uses none. Receiving a message costs the receiver no reads; sending costs about 6
statements (inbox via `conversations.last_message_id`). The new-message picker loads the member
directory once and filters in the browser instead of a `LIKE` scan per keystroke. Hourly
housekeeping moved its slow parts (session and token purge, lost & found, orphan uploads, old
notifications) to the daily job, which keeps each run well under 45 statements. Tasks: indexed
query per view, a stored comment count, partial indexes for due and open tasks.

**Email.** Only security notices and decisions waiting for someone are emailed at once (and a
decision waits for the digest when the person has the dashboard open). Everything else is marked
`email_state = 'DUE'` and goes out as one email per person from the hourly job, only if it is still
unread after 15 minutes. Reading it in the dashboard first means no email.

**Messages.** Group conversations (any member, three a day, up to `chat.max_group_members` = 50):
name, description and photo, changed by the owner and by holders of the new `chat.groups.manage`
(granted to the President, both Vice-Presidents, the General Secretary and both Joint General
Secretaries; Moderators hold everything). Add, remove, leave (ownership passes on), delete (messages
purged after 30 days). Reactions (👍 ❤️ 😂 😮 😢 😡 🙏: hover, long-press, double-tap or R), replies,
edit with ↑, emoji inserter, delivered/seen ticks, "Seen by" in groups, typing indicators, active
status (shared both ways; a new setting hides it). People carry a truthful club badge (their
current position, "Moderator", "Faculty", "Alumni" or "Member") instead of everyone being "Member".

**Profile and group photos.** The browser refuses blank, placeholder, mostly transparent or tiny
pictures before uploading (`lib/media/photo-quality.ts`), warns about blurry ones or (where the
browser can tell) no face, and checks the framed square again. The Worker refuses WebP profile
pictures too small to be a photo (under 0.003 bytes per pixel), for uploads that skipped the check.

**Tasks.** Smart views (My tasks, Overdue, Due today, This week, Given by me, Everyone), list and
board (drag, a "Move to" menu, or [ and ]), search and sort in the browser, bulk status, due date and
delete (one statement), checklists with progress, labels, templates, comments with @mentions and
edit/delete, a history from the activity log, stale edit forms refused. Fixed: done → reopen → done
within seconds replayed the first answer (toggles are never replayed now); editing an email-only task
wrote the address into its name; a cancelled task offered its assignee a "Reopen" the server
refused. A morning notice lists each person's overdue tasks.

**Meetings.** Upcoming, Today, Past and a month calendar; any https join link; agenda items with
leads and notes; repeat weekly (up to 12, one statement); a warning when invitees are busy then;
replies with a live tally; attendance; action items that become tasks; minutes and decisions;
Google Calendar and `.ics`; meetings end by themselves (the hourly job marks them done) and can no
longer be moved into the past or replied to afterwards.

**Blog (public page redesigned, as agreed).** The newest article up front, search, category and tag
filters, tag pages (`/blog/tag/…`), an RSS feed (`/blog/feed.xml`), and on each article a table of
contents, tags, reactions for signed-in members, an author box, related articles and newer/older
links. SEO title and description are used; posts without a cover get the site's generated card.
The editor has a side-by-side preview, shortcuts, paste/drop images, a word count and an unsaved copy
kept in the browser. A member editing their live post no longer changes it straight away: the edit
waits for the same approval as publishing (`posts.pending_revision_id`). Re-publishing keeps the date.

**Events (public page redesigned, as agreed).** Status from real start and end times (a multi-day
event isn't "past" on its second day), category filter, the next event up front, cards with date,
seats and registration. Event pages: facts panel, programme (new `event_agenda_items`, edited in the
dashboard), speakers, guests, a photo lightbox, add to calendar, share, related events, a register
bar on phones, a "cancelled" page instead of a 404, structured data with real times and status.
QR check-in: members see a code on their dashboard; organisers scan it (or type it) on the event's
page; admitting the last seat is race-free. Duplicate an event; reminders a day before.

**Also.** Approvals are filtered before paging (page 2 and "approve next" no longer skip requests);
the blog stylesheet loads only where articles are shown; SEO and layout audit scripts
(`scripts/qa/seo-audit.mjs`, `scripts/qa/responsive-audit.mjs`).

**Public redesign, part 2 (contact, navbar; agreed 2026-09-30).**

- _Navbar._ Every link fits from 1024 px (the club's name gives way at 1024–1279 px); it used to
  overlap at 768 px and wrap at 1024 px. Pill links with a clear current page, a shadow once the
  page scrolls. Phones and tablets get a menu panel: large targets with icons, Services always
  open, sign in / join (or dashboard / messages), email and social links; the page behind doesn't
  scroll and Escape closes it. The day/night switch follows the device's setting correctly.
- _Site search._ The search button, Ctrl/⌘ K or "/" opens a search over pages, every event, every
  article and the current committee (`/search-index.json`, built hourly from the same cached reads;
  fetched only when opened). Arrows move, Enter opens.
- _Home._ Unchanged: kept exactly as it was (a redesign was tried and reverted at the club's request).
- _Contact._ Email (with copy), address with Maps and directions, all social profiles, shortcuts
  (join, events, sponsors, lost & found), and a form with a Topic (`contact_messages.topic`,
  migration `0012_contact_topic.sql`; `/contact?topic=partnership` preselects it). The topic shows
  in the inbox, the notice and the email subject. Phones see the form before the extras.
- _Event pages._ The banner is shown whole beside the title (posters were cropped and written
  over); no "Open in Maps" for online events. Imported articles now get reactions, related posts
  and newer/older links like the others.
- _SEO._ Shorter descriptions (under 160 characters) on the home, events, blog and contact pages;
  titles never read "GUCC | GUCC". Fixed a page nested in a second `<main>` (contact, event pages).

**Production check (2026-09-30, part 3).**

- _Assistant (Gemini)._ Asks `gemini-3.8-flash`, then `gemini-3.7-flash` if the newest is missing,
  busy or failing (a `GEMINI_MODEL` set on the Worker goes first). Gemini 3 requests use a low
  thinking level and room for the reply (thinking counts against the limit); the model's thinking
  is never shown; a question refused by the safety filters isn't retried; with no model answering,
  the club's own data answers and the day's AI allowance is given back. System health lists the
  model order. The chat panel: answers show lists and bold text, only the conversation scrolls
  (never the page behind), the button sits above an event's Register bar on phones and respects
  the iPhone safe area.
- _Profile photo._ After framing, the background can be removed on the member's own device
  (MediaPipe selfie segmenter, Apache-2.0, served by this site from `/mediapipe` and `/models`;
  nothing is sent to anyone): white, soft grey, GUCC green, formal blue, a blur of the original, or
  unchanged. Only for a member's own profile photo; leaders' photo fields (executives, people)
  frame and check the picture without it. With the background removed, a transparent cut-out is
  saved too (`profiles.cutout_media_id`, migration 0013) and the executives list shows it floating
  on the card like the club's own portraits; the round photo shows everywhere else. A new photo
  without one, a leader's new photo, removing the photo or deleting the account drops it. The
  editor also rotates, and moves and zooms from the keyboard. The profile page shows the photo in
  a green ring; the photo itself is the button to change it.
- _Other uploads._ The admin image field takes drag and drop and paste, shows progress, and
  frames portraits as squares with the blank-photo check.
- _Email._ One branded, mobile-friendly template (tables and inline styles, for Gmail, Outlook and
  Apple Mail) for account emails, notices and digests: inbox preview line, a button for the main
  link with the full address under it, and why it was sent.
- _Fixed._ The site's `Permissions-Policy` blocked the camera everywhere, so QR check-in could
  never scan (now `camera=(self)`); the meetings tabs overflowed a 320 px screen.
- _Database._ "Is this file used anywhere?" (media library, daily clean-up of unused uploads)
  read every profile, listing, event and link table for each file; partial indexes in 0013 make
  each look a single search. `tests/integration/query-plans.test.ts` checks the hot queries use
  indexes.

## Round 7 (2026-09-29): one source for people, messages that work, member submissions, profiles

Everything below is in the working tree and **not released**. Schema and data changes are in
`migrations/0010_platform_v6.sql`, which is additive: the round-6 Worker keeps working against a
migrated database, so the release order (API first, then the website) is safe.

**People data has one source.** A new profile photo didn't show on the Executives pages because each
committee listing kept its own copy of the photo (52 of 53 current listings, 213 past ones) and the
copy won.

- **Photo:** the person's profile photo is their photo in every year, past committees included.
  The roster, their executive page (`/executives/<student id>`), every past year they served, link
  previews and the sitemap all update the moment they change it. A listing's own photo is only the
  fallback for people whose profile has none (older imports). A new photo also clears the old
  framing, and removing it shows initials everywhere.
- **Name, faculty designation and links:** these follow the profile for the current and upcoming
  committee. Archived years keep a snapshot of who held which post, taken when the committee is
  archived. Position titles follow a renamed position on live listings.
- **`0010`:**
  - drops listing photo copies wherever the profile has a usable photo, in every year;
  - removes live copies of name and designation that equal the profile;
  - strips the `mailto:` prefix stored on 64 public emails.

  On production the photo clean-up changes what shows on exactly 4 listings: the past years of a
  member whose new photo wasn't showing (`/executives/221902084`). Everything else is identical.

**Photos wherever a person appears**: chat list, thread and bubbles, notifications (the sender is now
recorded), person search, members, people, approvals, activity, tasks and comments, meetings,
recruitment notes, blog bylines. One SQL fragment (`lib/server/avatar.ts`) returns only public, ready
images, inside the existing query, so no page makes an extra D1 call. One component
(`components/person-avatar.tsx`) falls back to initials.

**Messages**

- Report and Block now always say what happened. They were silent on success and used browser
  pop-ups, which in-app browsers can block. Reports take a category, can include the two messages
  before, and can block at the same time.
- Moderators see the category, the context and the sender's earlier reports. They can dismiss,
  remove, warn, or pause the sender's messaging for 1, 7 or 30 days. The reporter and the sender are
  told the outcome.
- Blocked people are listed in Message settings with Unblock. The settings load what you saved (they
  used to reset).
- A message is sent once even on a double Enter (a client id with a unique index). Links are
  clickable. Polling costs one D1 statement when nothing changed (`chat.pulse`, answered from the
  session alone).

**Notifications**

- They clear themselves: a row seen in the list for about a second, or any dashboard page a notice
  points to once it's opened. "Mark unread" undoes it.
- The badge updates without a reload (`session.counts`, one statement).
- Titles say who and what:
  - "You're on the team for …";
  - "Review …'s application";
  - "… changed the due date";
  - a meeting move says what it was before.
- Links open a page the person can use. Role notices go to the person's access page. People removed
  from a task or meeting go to their list.
- New notices:
  - a default in-app one for contact messages (unless a rule already covers them);
  - removed meeting participants;
  - a reopened task, sent to its assignee;
  - a lost & found post removed by a moderator.
- Waiting-list promotions and reminders go through the email outbox. Announcements validate their
  link and skip the sender.

**Everyone can contribute, reviewers approve easily**

- Every approved member can write blog posts and propose events. Members' posts and events are only
  their own, and none is public until approved. Members have daily and pending limits, and a Settings
  switch pauses submissions.
- A new approver type, "anyone holding a permission club-wide", lets the President, the General
  Secretary, Moderators and anyone who can publish (the Publication Secretary) approve. `0010`
  changes the default policies only where they still hold the seeded value.
- The Approvals queue:
  - opens on "Waiting for me";
  - shows the author, the wait time and the policy in words;
  - previews the post or event inline;
  - offers Approve & next.
- Requests waiting 48 hours send one reminder. Items sent back show the reason on their own page.

**Profiles**

- Public member pages carry full search and link-preview data:
  - a title and description built from role, bio and skills;
  - an Open Graph card with the photo;
  - `ProfilePage` and `Person` structured data, with breadcrumbs;
  - a canonical address.
- Public member pages are in the sitemap with their photo. They link to the person's executive page
  and back (in the page and in `sameAs`), so search engines see one person. Members-only and
  private pages stay `noindex`.
- `/members/<handle>` shows:
  - photo, positions, bio and skills;
  - links and club journey;
  - published posts and events.
- Visibility is Members (default), Public or Only me. Phone, student ID and sign-in email never
  appear.
- The `/members` directory searches by name, department, batch or skill.

**Security and sign-in**

- A reset link is used up only when the new password is accepted.
- Redirects accept only same-site paths.
- Two-factor attempts are counted per account.
- Honest messages when email is delayed.
- Resend has a per-address cooldown.
- The lock is announced on the attempt that locks the account.
- Invited accounts that reset their password become members.
- Live password rules show while typing.
- Every browser `confirm()`/`prompt()` is replaced by an accessible dialog. Forms warn before unsaved
  text is lost.

**Your requests**

- **Contact**: a clear "Message sent" panel with "Send another message".
- **Contributors**: the ranking is 75% authored lines and 25% real commits (at least 10 lines), from
  D1. `release.ts` refreshes it after every API release, and the static list in the repo is
  regenerated.
- **The routine maker**: `/scheduler` is removed and redirects home. This drops about 7,450 lines
  and four packages.

**Public site (same look)**

- Event pages:
  - real capacity and seats;
  - waitlist wording;
  - registration opening and closing decided in the browser;
  - the time taken from the start date.
- The Events list keeps its search in the URL, and "Upcoming" shows the soonest first.
- Partner names are readable in dark mode, and the home stats render their final values.
- Other fixes:
  - an unknown blog post returns 404;
  - certificate checks tell an outage apart from "not found";
  - social links on the Executives page work on touch devices;
  - one menu at a time on phones.

**Dashboard**

- Registrations can be checked in, undone, admitted from the waitlist or cancelled, with search and
  filters.
- Archive now has Restore, and archiving never lands on a 404.
- Save buttons say what saving does. Scheduled posts show "scheduled" with the Dhaka time.
- Recruitment review uses one decision form with an email preview.
- The Contact inbox has Reply (your email app, message quoted) and "Mark as new".
- Lost & found has a "My posts" tab showing the moderator's reason and a "Fix and post again" button.
- The gallery offers Remove only on photos you may remove. Uploads reload only when nothing failed.
- The post editor keeps text typed during an image upload and asks for alt text. Earlier versions
  of a post can be read before restoring, and restoring keeps the post's current address.
- Anyone who publishes club-wide (the Publication Secretary) gets the "Waiting for me" queue and
  the Home card, with how long the oldest request has waited.
- Detail pages have a link back to their list. Content statuses use the same words everywhere
  ("changes requested", "waiting for approval", "scheduled").
- Forms focus the first invalid field. Hints and errors are announced with their fields.
- Profile addresses are readable (`/members/anika-rahman`); an old id link redirects.

**Clean-up**

- Removed: the scheduler, six unused API procedures (`views.dashboard`, `permissions.list`,
  `positions.move`, `chat.unread`, `activity.related`, `audit.list`) and about 20 unused exports.
- CSV cells, HTML escaping, slugs and site links now each live in one place.
- Blog and event pages have no loading screen, so a missing page answers 404, not 200.

**Checks (2026-09-29)**

- typecheck clean, lint without errors, 371 unit and integration tests;
- seed check, migration lint, webpack build;
- Worker 829 KiB (201 KiB gzip);
- browser suite: all 69 pass (66 in the full run, then the round-7 file on its own after test fixes).

Read-only production counts: 0 duplicate profile addresses, no clashing policy keys, the
default approval policy still seeded, 64 `mailto:` emails to clean, 52 live photo copies
(0 differ from the profile). So `0010` applies cleanly.

## Round 5 (2026-09-27): production safety, never paying, speed

Everything below is in the working tree, tested locally, and **not released**. Production still runs
migrations `0001`–`0006` and the round-3 Worker; `0007` and `0008` (which now also carry this round's
tables) go out with the next release.

**The crash** ("Cannot read properties of undefined (reading 'mfaRequired')"): the website read a
field the older live API doesn't send. Responses are now checked against a contract with safe
defaults (`lib/api/contracts.ts`), the API reports its version, leaders see a notice when website
and API differ, and a page the older API can't serve says "Not available yet".

**Never paying (a card is attached to Cloudflare)**

- Only R2 bills past its free amount. Atomic caps (a single conditional upsert, so concurrent
  requests can't overshoot): 2,000 files written a day, 300 applicant files a day, stored files
  capped at 8 GB of the free 10 GB. The hourly job warns Moderators at 70% of any free limit and
  switches uploads off at 90% of free R2 storage or writes. No setting can be raised past the free
  amounts.
- AI answers (300 a day, then answers from the club's own data) and emails (90 a day; Resend's free
  plan allows 100) have the same kind of cap.
- System health shows usage against every free limit: Cloudflare's own figures with the optional
  read-only analytics token, GUCC's own counts otherwise.
- Photos keep only the sizes their purpose needs (avatars 400/800 px, lost & found up to 1280,
  events and library up to 1920): about half the storage per photo, no visible difference.

**Floods and abuse**

- Vercel Firewall rules and Attack Mode (steps in RUNBOOK.md); the Worker's per-address limits on
  images, health and uploads before any database work; repeat offenders of the D1 rate limits are
  refused from memory; every signed-in account has a ceiling of 300 changes per 10 minutes.
- All rate limits live in one table (`lib/server/limits.ts`): strict for sign-in, resets, sign-up,
  contact and uploads, moderate for everyday work.
- Fewer Vercel function calls: anonymous visitors don't call `/api/session` (a non-secret hint
  cookie), OG cards render only for URLs the site signed, news, announcements, forms, certificates
  and lost & found pages are cached (ISR), anonymous lost & found lists are cached 30 s, the chatbot
  no longer calls the server just to open.
- If Turnstile itself is unreachable, sign-in keeps working under a strict extra limit.

**Transaction safety**

- Race-free state changes: approving or rejecting a member, suspending, deciding an approval,
  publishing, appointing to a position with a holder limit, opening a recruitment. Of two leaders
  acting at once, one change happens (one audit entry, one notification, one email); the other
  hears who did it.
- Idempotency: a double click or retry within 10 seconds gets the first answer.
- Optimistic locking on posts, events, people, positions, roles, rules, committees, settings and
  quick edit: a save over someone else's newer change is refused, naming who and when.
- Unique-constraint errors read as plain sentences ("An account with that email already exists").
- Constraints audit: no new unique index was needed (so no migration can fail on existing data);
  rules SQL can't express are asserted inside the transaction.

**Recovery**

- Releases: a migration safety lint (no drops, renames or unguarded deletes), a checked backup,
  and an **automatic Worker rollback** when the smoke test fails; the website is smoke-tested after
  deploying (it must serve the new commit) and **rolled back automatically** if it fails.
- The weekly backup is restore-tested: decrypted, loaded into a throwaway database on the runner,
  integrity- and foreign-key-checked, row counts compared with production.
- Break-glass script (reset two-factor, sign out everywhere, appoint a Moderator, switch off a rule,
  Time Travel steps): needs the Cloudflare credentials and a typed confirmation, is logged, and
  notifies every Moderator.
- Key rotation with overlap for `AUTH_SECRET` and `PASSWORD_PEPPER` (hashes now name their
  pepper, so a rotation costs no extra hashing).
- RUNBOOK.md (every failure and its fix, firewall rules, restore, rotation), FAILURE_MODES.md
  (tested behaviour for each dependency failing), PRIVACY.md (what is kept, who sees it, for how
  long).

**Security**

- Production session cookie `__Host-gucc_session`; COOP header; "confirm it's you" for access
  changes, deletions and settings by holders of sensitive permissions; an account's owner is told
  when sign-in is paused after failed attempts; CSRF tests replay a real server action from another
  origin.
- Data retention enforced daily (error events 30 days, email log 90 days, sign-in events a year,
  rejected applications and archived lost & found a year, registrations anonymised after two years,
  activity log two years in whole sealed ranges). Account deletion now also removes two-factor
  secrets, email choices and notifications, and drops addresses from logs.
- Audit seals cover at most 300 rows and System health recomputes only the newest seal (Worker CPU).

**Dashboard**

- Email with Resend: off until a test email arrives; then account emails and email copies of
  notifications by each person's choices (My profile → Email notifications; security notices
  always); every message and Resend's answer in System health.
- System health: free-plan usage, the upload and email switches, email outcomes, recent errors,
  sign-in figures, the daily clean-up. Visible to Moderators, the President, the General Secretary
  and the Developer role.
- Access simulator: the whole authorization chain for any person, action and item, step by step.
- Password show/hide everywhere; members can start conversations with members (their message
  settings and blocks respected, no emails shown); "Change position" on each listing and a link from
  the person's page; roles with sensitive permissions are marked before granting; opening a
  notification marks it read.
- Uploads: drag and drop, two at a time, per-file progress, cancel and retry; encoding off the main
  thread where the browser allows; clear guidance for iPhone HEIC photos; unused files listed after
  30 days for a Moderator to delete permanently (a file used anywhere, including inside a post, is
  never deleted).
- Accessibility: axe checks on the main pages; invisible fixes (names for the footer's icon links and
  for the lost & found filters).

**Speed** (no visual change)

- The website's server functions run in Singapore (`sin1`), next to the D1 database, instead of the
  USA; the page preconnects to the image origin; five more public routes are cached (ISR); the
  hero's particle animation starts once the page is idle instead of competing with the first paint.
- Lighthouse (mobile, on the local production build): executives page 95, events 81, home 72
  (before this round's changes: 94, 72, 70). On the local test database the home and events pages
  still load the old full-size `public/` images, which production serves as sized WebP from R2; the
  rest of the gap is the hero's animated look, kept as designed. Accessibility 95–98, best practices
  100, SEO 100.

**Verified:** typecheck (website and Worker); lint 0 errors; 317 unit and integration tests in 41
files; 59 end-to-end tests (desktop and phone) in one clean run on their own database; no Content
Security Policy violations; Worker 175 KiB gzip (limit 3 MiB); every request path and both
scheduled runs within D1's statement budget; public pages compared with the live site show only the
known differences (the added "Skip to content" and "Sign in", counts and ordering that follow the
data).

**Architecture guard:** every decision goes through User → role/position/direct grant → permission
→ scope → rules → approval; a test fails if a service compares role or position names.

**Not done in this round**

- A separate 1200×630 JPEG variant for social cards (the generated card is used).
- Moving the D1 primary region (it is in Singapore; functions now run next to it instead).
- A WAF in front of `workers.dev` (needs a custom domain on Cloudflare, which needs DNS).

## Round 4 (2026-09-27): dashboard, governance, security and operations

Everything below is in the working tree, tested locally, and **not released**. Production still runs
migrations `0001`–`0006` and the previous Worker; `0007_platform_v4.sql` and
`0008_governance_seed_v4.sql` go out with the next `bun run release:api:production`.

**Governance**

- One authorization model: roles, positions, direct grants (optionally time-limited), and rules.
  The President and the General Secretary create roles and positions and give permissions;
  sensitive ones wait for a Moderator's approval.
- Only GUCC's own listings carry position authority. CSS (and any other affiliated committee) people
  get an account and their own posts and events, published after the President or the General
  Secretary approves.
- Positions have an explicit level (Moderator 100 … Executive Member 20); lists follow it.
- Give one role to many members from the Members page (preview first; roles with sensitive
  permissions are given one at a time so each is approved).
- Position names are written out everywhere ("General Secretary"); a test fails on "GS" in pages or
  seeded text. The one seeded rule that said "GS" is corrected by `0008`.

**Dashboard for everyone** (`/dashboard`; `/admin` and `/account` redirect)

- Home: what needs attention (including overdue tasks), my tasks and meetings, events, my work,
  recent activity for leaders, club figures.
- Tasks: for a member, or for an email address (the task moves to the account when that address
  is approved; no account is created automatically). Comments, status, due dates, a Tasks tab on
  each profile for leaders.
- Meetings: participants, agenda, notes, replies, a Google Meet link pasted by the organiser (only
  `meet.google.com` links are accepted; nothing creates Meet rooms). One notice per change.
- Notifications with Unread / All tabs and paging; Messages between members; Activity log; System
  health (live checks only: API, database and migrations, both storage buckets, email mode, the
  hourly job, audit seals, bot protection, assistant key).
- Site content editors: home page messages and figures, the Services menu and partner clubs are
  forms, not JSON. The API refuses content that would break a page.
- Post editor: toolbar, image upload and insert, and a preview rendered by the public page's code.
- Executives: remove entries made by mistake and restore them within 30 days, quick edit of titles,
  names and order for everyone at once, JSON/CSV export that the importer reads back, delete an
  empty mistaken committee, merge or delete duplicate people.
- Recruitment: import applications from CSV, JSON or Excel (.xlsx) with column matching and a
  preview; duplicates and invalid rows are listed, not imported.

**Security**

- Two-factor sign-in with an authenticator app (secret encrypted at rest, 10 one-time recovery
  codes, replay protection). Required for holders of sensitive permissions after 7 days; until
  then those permissions are paused and the dashboard says so. Leaders can reset a lost device.
- "Confirm it's you" (password or code within 10 minutes) before giving sensitive permissions,
  exporting personal data, creating password-reset links or resetting two-factor.
- Sessions end after 14 idle days (12 idle hours for sensitive accounts) and after 30 days; a
  sign-in from a new kind of device leaves a notice.
- Content Security Policy on the whole site (production builds).
- The audit log is sealed hourly in a hash chain; the health page and
  `scripts/platform/verify-audit.ts` check it.
- The API accepts a second key during rotation (documented).
- Fixed: people search showed account emails to anyone who could search (for example affiliated
  committee executives). Emails now show only to people who manage members.
- Dependencies: jsPDF 4.2.1, sharp 0.35.4, PostCSS 8.5.28 (clears every critical advisory; the rest
  are in build/lint tooling pulled in by Next.js and ESLint).

**Operations**

- Database backups are kept only encrypted (`BACKUP_PASSPHRASE`); weekly backup workflow (90 days).
- Uptime check every 30 minutes; dependency audit in CI; the duplicate manual deploy workflow was
  removed.
- Each production release ends with a read-only `PRAGMA quick_check` and `foreign_key_check`.
- Footer contributors ranked by commits and lines of authored code (lockfiles, data dumps, images
  and seeds excluded; one commit counts at most 2,000 lines), recomputed by a workflow and stored in
  D1; until then the site uses GitHub's graph with the same formula.
- The assistant answers common questions (joining, events, the committee, contact) from the club's
  own data when there's no AI key or the AI service fails.
- SEO: `/api/og` allowed in robots.txt (X obeys it), explicit images no longer claim 1200×630,
  sitemap entries include event and post images.

**Checks on the finished pages**

- **Public pages vs. the live site** (`node scripts/qa/compare.mjs`, text, links and layout height at 390
  and 1280 px): identical except the intended differences: the "Sign in" link and skip link, the
  corrected executive links, the fixed participant counts on six event pages (one event page is
  20 px shorter because "/ 50" is gone), the duplicate-name event card that now links to its own
  page, and the contact form's hidden spam trap. The 2025 committee page also shows newer links
  and emails for a few people than the live site does; that comes from the data already in the
  production database (served by the current production API), not from this round's changes.
  Animated counters and the typing effect differ only by timing.
- **Content Security Policy:** no violations or page errors on 21 public routes, every dashboard
  page, a Google Form embed, and uploads to the API Worker (end-to-end media test).
- **Day and night mode** (`node scripts/qa/theme-audit.mjs`, axe-core contrast, 390 and 1280 px): in dark
  mode the dashboard has no contrast problems; no menu, dialog or dropdown list is transparent in
  either mode; no page scrolls sideways on a phone (the rules editor did, fixed). Remaining: in light
  mode the brand green (#16a249) is 3.2–3.3:1 as text and behind white text (the guideline asks
  4.5:1), and a few older public sections (event cards in light mode, the class scheduler, partner
  cards on the home page in dark mode) have low-contrast text. These are the site's existing
  design, left as they are because the public look must not change; say if you want them adjusted.

**Not done in this round**

- A separate 1200×630 JPEG variant for event and post images (the generated card is used when a
  page has no image).
- Rotating the session token when someone's permissions change.
- Drag-and-drop reordering (quick edit takes order numbers instead).

## Authentication

- Sign up, sign in and sign out; sessions are 256-bit tokens stored hashed, in HttpOnly/Secure/Lax
  cookies. Lockout comes after 5 failures, rate limits apply, and Turnstile works once configured.
- **Two email modes.**
  - _Email available_ (a Resend key, or development): sign up → verify email → approval → active.
  - _No provider_ (production today): sign up → approval → active, with "Your account has been
    created and is awaiting GUCC approval." Reviewers are notified in the app.
  - Nothing ever claims an email was sent when it wasn't: this covers sign-up, resend, password
    reset, invitations and recruitment. The email code sits behind one provider interface
    (`lib/server/email.ts`).
- **Password reset.**
  - Emailed links last an hour.
  - Administrators (`users.reset_password`) can issue one-time links that last 24 hours. They can't
    issue one for themselves, for a Moderator (unless they are one), or for anyone holding club-wide
    permissions they lack.
  - Tokens are single-use and stored as hashes.
- Changing your password signs out your other sessions and notifies you. PBKDF2-SHA256 with a secret
  pepper, sized for the free plan's CPU limit; hashes are never exposed.
- Tested: sign-up in both modes, duplicate sign-ups (same answer, no second account), verification,
  approval, reset links (used once), password change, invitations, suspension.

## Membership

- Review page: name, student ID, batch, department, email, phone (member managers only), sign-up
  date, verification state and status. It also shows any correction requested, an internal reviewer
  note, and links to the account's history, roles and positions.
- Actions: approve, reject, request correction, suspend, reactivate, reset link, and link to an
  existing profile by search.
- **Claims.** Registering with an executive's student ID shows "Claims student ID … which belongs
  to Bakul Ahmed (2026 General Secretary)". **Approve and link** attaches the account in one step,
  and the position's permissions apply. Nothing is linked automatically, since anyone can type an ID.
- Filters: status, name/email/student ID, batch and department. Member approval defaults to
  Moderators, the President and the GS; the Technical Administrator and Developer have no member
  rights unless granted.

## Governance

- The 2026 hierarchy is database records. Split out into their own positions this round (each keeps
  the permissions it had; public titles unchanged):
  - Former Deputy Moderator;
  - Joint General Secretary (Activity) and (Technical);
  - Programming Secretary (Activity) and (Technical);
  - Graphics & Multimedia Coordinator (Lead).

  Existing listings moved to them by migration `0006`.

- Access comes from roles, current positions, scoped grants (OWN, ASSIGNED, EVENT, CATEGORY,
  COMMITTEE, POSITION, ALL), access rules (allow / deny / require approval; protected first, deny
  wins) and approval policies (President or GS, President and GS, a Moderator, 2 of 3 Moderators,
  a position, assigned people).
- **Notification rules (new):** WHEN an event or post is submitted or published, or a member,
  recruitment or contact message arrives, and optional conditions hold, THEN notify holders of chosen
  positions, roles or permissions. They never change access.
- **Protections:**
  - Moderators are capped at three, and the last one can't be removed.
  - Nobody changes their own roles or positions.
  - You can only grant what you hold club-wide.
  - Protected rules, settings and permission assignment are Moderator-only, and need a second
    Moderator's approval when one exists.
  - The audit log is append-only.
- Permission names differ from the prompt's examples but cover them: `members.approve` for
  users.approve, `executives.assign` for executives.create, `events.manage_registration` for
  events.registration.manage, and so on (see `/admin/roles`).

## Migration

| Source (in the repository)                            | Records                  | Migrated                       | Skipped / failed / duplicate | Conflicts (resolved, recorded)                                 |
| ----------------------------------------------------- | ------------------------ | ------------------------------ | ---------------------------- | -------------------------------------------------------------- |
| Executives (`executives.json`, 10 committees)         | 334 listings, 224 people | all                            | 0                            | 57 (one student ID listed for different people: kept separate) |
| Events                                                | 81                       | all                            | 0                            | 2                                                              |
| Contests, forms, certificate recipients, page content | 23, 7, 146, 5            | all                            | 0                            | 0                                                              |
| Images                                                | 268                      | all (267 in R2, 1 kept static) | 0                            | 0                                                              |

- Orphaned records: 0 (every one of the 1,099 source mappings resolves).
- Verification rebuilds every committee, event and contest through the public read models and
  compares field by field: **passed locally and in production, 0 unexpected differences**. A second
  import changes nothing.
- The import only inserts what's missing; it never overwrites edits. Supabase and Hashnode content
  was not transferred (the club's decision).

## Executive import

- `/admin/committees/import`: upload or paste JSON or CSV → preview → resolve → confirm → import →
  verify.
  - The preview flags new people, existing people and listings, updates, duplicates, unknown
    positions, missing names and IDs, invalid dates, missing committees and campuses, protected
    positions and single-holder conflicts, all with row numbers.
  - You can resolve issues in place: map a title to a position, pick the right person among
    same-named ones, or skip a row.
- Modes: add new only, add and update, update existing only. People are matched by student ID, then
  account email, then name (flagged), so nobody is duplicated.
- Accepts GUCC's own `executives.json` (years, campuses, wings, portraits) as it is. The whole history
  file previews as 334 rows. Example files and a guide:
  [EXECUTIVE_IMPORT.md](EXECUTIVE_IMPORT.md).
- All or nothing: one transaction of about ten statements whatever the size. It's refused if the data
  changed since the preview. Audited with the file's SHA-256 and counts, and one record per listing.
- **Bulk changes** on a committee page, each previewed with what can't change and why:
  - end or reactivate assignments;
  - change position;
  - copy to another committee;
  - sort by rank.

## D1

- Migrations `0001`–`0006`. New this round:
  - `0005`: event Google Form, contest↔event link, recruitment reviewer and notes, member review note
    (additive only);
  - `0006`: generated from the catalog, the split positions and the import/reset permissions.
- **Free-plan statement budget.** D1 allows 50 statements per Worker invocation, counting each
  statement in a batch. Everything that wrote one statement per row now writes one set-based
  statement: notifications to many people, broadcasts, reordering, event people, contest teams,
  imports and bulk changes.
  - A test holds the heaviest requests to ≤ 45. Before this, a broadcast to 120 members needed 129
    statements and would have failed partway.
  - The Worker logs a warning above 40.
- Production: `gucc` holds the imported data, with migrations `0001`–`0006` applied (released
  2026-09-26).

## R2

- `gucc-media-public-production`: 267 migrated images as WebP variants with metadata stripped, cached
  for a year. `gucc-media-private-production`: recruitment documents, served only through signed
  links that expire.
- The media library now shows each file's details and **everywhere it is used**. You can **replace an
  image**: same record, so every page shows the new version; old files are deleted. Referenced files
  can't be archived.

## Workers

- `gucc-api` is live, with secrets set, an hourly job, and 401 for any request without the key. Size:
  103 KiB gzip (limit 3 MiB).
- New procedures:
  - import and bulk: `executives.importPreview`, `.import`, `.bulkPreview`, `.bulk`;
  - members and recruitment: `members.resetLink`, `.reviewNote`, `recruitment.assign`, `.note`;
  - rules, media and registrations: `rules.createNotify`, `media.details`, `events.registrations`.
- Direct browser uploads now refresh the public pages they affect.
- Release: `bun run release:api:production` backs up D1, applies migrations, deploys and smoke-tests.
  Fixed this round: the smoke test couldn't find the API address in `wrangler.jsonc`.
- **Automatic deployment:** `.github/workflows/deploy.yml`. A push to `main` runs:
  1. checks;
  2. D1 backup (kept 30 days as a build artifact), migrations, Worker deploy, smoke test;
  3. the website build against the new API, then the Vercel production deploy.

  If a step fails, nothing after it runs. `vercel.json` turns off Vercel's own Git deploys of `main`,
  so the site never goes out ahead of its backend. Preview deploys of other branches still work.

## Admin

- Navigation by permission, with Import executives and Registrations added.
- The dashboard shows real counts:
  - members: total, active, waiting, suspended;
  - executives: serving, positions filled, committee size;
  - events: upcoming, ongoing, completed, registrations;
  - content: drafts, pending, published;
  - recruitment: open campaigns, applications, awaiting review;
  - unread messages.

  In no-email mode it also shows a notice.

- Events:
  - Google Form registration link (Google Forms only);
  - PDF documents;
  - participants and judges fields, matching the old events;
  - speakers and event team.
- Recruitment: reviewer assignment (people with recruitment rights, notified), a notes history, an
  "assigned to me" filter.
- Contests: editorial and practice links, status, linked event, search.
- Registrations across events, for people who manage them club-wide.
- **Fixed:** every admin form field now has a unique id. Pages with repeated forms (contests,
  committee listings) had labels pointing at the first form's inputs.

## Public website

- **Looks exactly as before; only the data source changed.** Every public page was compared with
  the live original (`gucc.green.edu.bd`): visible text, headings, images, links, and page height at
  1280 px and 390 px. The checker is `scripts/qa/compare.mjs`. Restored this round:
  - `/executives/*`: grid breakpoints, both sections always shown, the original spacer and tabs.
    Past committees use each year's own social links, from `committee_members.legacy_json`.
  - Home: the original quotation marks.
  - Event pages: "Back to event page", the always-shown guests box, the original guest parsing,
    the attendance bar, and "View Facebook Post". Same-day events are back in their original
    order (by the order they were added, `rowid`).
  - Navbar: the original links, labels and "Join Us" button. The Executives link follows the
    current committee in the database instead of being hard-coded to 2026.
  - `/join`: the original "Recruitment is Closed" page. While a recruitment is open it redirects to
    `/recruitment`, as "Join Us" used to link there.
  - `/recruitment`: the original form design. The title, introduction, circular, deadline,
    semester labels and positions now come from the campaign. Files go to private R2.
- **Kept deliberately (differences from the original):**
  - A "Sign in" link in the navbar, and an account menu once signed in.
  - 17 executive links that pointed at another person (shared student IDs), and one "183002xxx"
    placeholder link that 404'd, now go to the right profile.
  - Attendance for the 6 events without a number shows the text (e.g. "All Executive Members") or
    "—", instead of " / 50", " / NaN" or "All Executive Members / All Executive Members50". The
    layout is unchanged.
  - The second "CSE Fresher's Orientation Spring 2025" card opens its own page (`…-2`). Before,
    both cards opened the first one.
  - Hidden-to-people spam protection on the contact form.
- **Only appear for data entered in the dashboard, so migrated pages are unchanged:** speakers,
  Google Form button, PDF documents, photo gallery, and on-site registration. Judges stay on record
  only, as before. To show a judge, add a "Judge: …" line under Guests.
- Drafts, private data and internal notes never reach public read models. Every route responds
  against the live backend.

## Security

- **Fixed:** any executive could add photos to any event's gallery. Uploads are now checked against the
  event (creator, assigned people, club-wide media rights).
- **Fixed:** a photo already in the library was never added to a gallery. Saving event people
  duplicated imported guests on every save.
- **Fixed:** the no-email false claims listed above.
- Reset-link and import rules as described; all new procedures check permissions server-side; import
  text is size-limited; no secrets in code, logs or reports.
- Earlier controls stand: shared-secret API, CSRF defence, file-type sniffing, EXIF stripping, a
  private bucket, audit.

## Tests

| Check                                       | Result                                                                                                                                                                                                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck (website + Worker)                | Passed                                                                                                                                                                                                                                                                  |
| Lint                                        | 0 errors (warnings only in older pages)                                                                                                                                                                                                                                 |
| Unit + integration                          | 249 passed in 27 files (TOTP against the RFC test vectors, two-factor and step-up, sessions, audit seals, tasks, meetings, recruitment import, executives quick edit/export/restore, people merge, bulk roles, content settings, schema integrity, statement budget, …) |
| End-to-end (desktop + iPhone, own database) | 32 passed (desktop 30, mobile 2) in one clean run from a fresh database, including the new round-4 story (tasks, meetings, two-factor sign-in, confirm-before-export, activity, health, quick edit, Excel import, home page editor)                                     |
| Production build                            | Passed                                                                                                                                                                                                                                                                  |
| Governance seed / Worker size               | Up to date / 150 KiB gzip (limit 3 MiB)                                                                                                                                                                                                                                 |
| Dependency audit                            | No critical advisories                                                                                                                                                                                                                                                  |

## Cleanup

This round removed the external chat service call, dead scheduler, sponsors and certificate code, the
duplicate certificate font, three settings files (merged into `.env.local`) and a broken type package.
It also replaced one-statement-per-row loops. Nothing with data was removed; `data/*.json` stays as the
migration's audit record.

## Remaining issues

These need you. Claude Code's auto mode doesn't run production deploys, and some need accounts only
you hold.

1. **Release the backend:** `bun run release:api:production`. It backs up D1, applies `0007` and
   `0008`, deploys the Worker (with the new procedures, the hourly audit seal and the
   `http://localhost:3000` upload origin), smoke-tests it, and runs a read-only `quick_check` and
   `foreign_key_check`. The dashboard's new pages need this Worker; the public pages work with
   either.
2. **Turn on automatic deployment.** In GitHub → Settings → Secrets and variables → Actions, add:
   - `CLOUDFLARE_API_TOKEN`: a new token with Workers Scripts Edit, D1 Edit, Workers R2 Storage
     Edit and Account Settings Read;
   - `CLOUDFLARE_ACCOUNT_ID`;
   - `VERCEL_TOKEN`: vercel.com → Account → Tokens;
   - `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`;
   - `BACKUP_PASSPHRASE`: a long random passphrase kept in a password manager (backups are stored
     only encrypted with it; without it they aren't kept).

   The IDs are listed in [DEPLOYMENT.md](DEPLOYMENT.md) §5.

3. **Website settings (no DNS change).** In Vercel → `gucc` → Environment Variables (Production and
   Preview), add:
   - `NEXT_PUBLIC_BASE_URL=https://gucc.green.edu.bd`;
   - `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_MEDIA_BASE_URL` = `https://gucc-api.gucc.workers.dev`;
   - `API_SHARED_SECRET` = `PRODUCTION_API_SHARED_SECRET` from `.env.local` (mark it Sensitive).

   Then merge `database` into `main`. The workflow deploys everything.

4. **First administrators.**
   - Bakul Ahmed registers on the new site, then run `bun scripts/platform/bootstrap-admin.ts --target
production --confirm-production --email <that email> --student-id 232002184`. The account gets
     the General Secretary position's rights.
   - A faculty moderator does the same with `bootstrap-moderator.ts`.
   - Both then turn on two-factor sign-in (Dashboard → Security) within 7 days; after that their
     sensitive permissions pause until they do.
5. **Optional:** `GOOGLE_API_KEY` for the AI assistant (without it, it answers from the club's own
   data); Turnstile keys; move `RESEND_API_KEY` to the Worker if its sending domain is verified.
   Otherwise the site runs in no-email mode, which is complete.
6. **Clean up:**
   - delete the unused Vercel variables (Supabase, Web3Forms);
   - revoke the old read-only Cloudflare token;
   - after the new site is live, remove the legacy images from `public/`.
7. **Local site on the live API.** `.env.local` points `localhost:3000` at
   `https://gucc-api.gucc.workers.dev`, so anything done there changes real data. The end-to-end
   tests use their own local API and database.
8. The personal-data CSV removed earlier is still in Git history.
9. Nothing is committed or pushed.
