# Runbook

What to do when something goes wrong, and the routine jobs that keep the platform healthy and
free. Written for whoever holds the Cloudflare, Vercel and GitHub access. Nothing here needs DNS
access.

- [Releasing](#releasing) and [when a release fails](#when-a-release-fails)
- [Staying on the free plans](#staying-on-the-free-plans) (a card is attached to Cloudflare)
- [Under attack](#under-attack) and [Vercel Firewall rules](#vercel-firewall-rules)
- [Restoring the database](#restoring-the-database)
- [Rotating secrets](#rotating-secrets)
- [Break-glass recovery](#break-glass-recovery)
- [Turning email on](#turning-email-on)

## Releasing

Push to `main`. `.github/workflows/deploy.yml` runs, in order, and stops at the first failure:

| Step               | What it does                                                                                                        | Changes production? |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------- |
| checks             | typecheck, unit and integration tests, seed check, migration safety lint                                            | no                  |
| 1. preflight       | pending migrations must be additive (no drops, renames, or `DELETE`/`UPDATE` without `WHERE`)                       | no                  |
| 2. backup          | `wrangler d1 export`, checked: not empty, has the tables; kept encrypted as a workflow artifact                     | no                  |
| 3. migrate         | applies new migrations                                                                                              | database            |
| 4. deploy Worker   | `wrangler deploy`; the previous version's id is kept                                                                | API                 |
| 5. smoke test      | `/health` answers with this code's API version; calls without the API key are refused                               | no                  |
| 6. integrity       | read-only `PRAGMA quick_check` and `foreign_key_check`                                                              | no                  |
| 7. deploy website  | `vercel deploy --prod` from this commit                                                                             | website             |
| 8. site smoke test | the live site serves this commit (`X-Gucc-Build` header), the home page, `/api/session` and the sign-in gate answer | no                  |

Steps 4–5 roll the Worker back automatically; step 8 rolls the website back automatically.

## When a release fails

Open the failed run in GitHub → Actions. Find the step, then:

| Failed step                             | State of production                                                                      | What to do                                                                                                                                                                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| checks                                  | untouched                                                                                | Fix the failing test or type error locally (`bun run typecheck && bun run test`), push again.                                                                                                                                                          |
| preflight                               | untouched                                                                                | A pending migration drops or rewrites something. Make it additive (add columns and tables; keep old ones until a later release stops using them). A reviewed exception is marked `-- safety: reviewed <reason>` on its line.                           |
| backup                                  | untouched                                                                                | Usually Cloudflare access: check the `CLOUDFLARE_API_TOKEN` secret (D1 Edit) and run again. Nothing is migrated without a backup.                                                                                                                      |
| migrate                                 | database may be partly migrated; old Worker still live                                   | Read the error. D1 applies each migration as a whole, so a failed one isn't half-applied; fix it and push again. If data was damaged, restore (below).                                                                                                 |
| deploy Worker                           | old Worker still live (the deploy didn't go out)                                         | Read the error (bundle size, config). Fix and push again.                                                                                                                                                                                              |
| smoke test                              | **rolled back automatically** to the previous Worker; migrations stay (they're additive) | Read the smoke output (health, version, 401 check). Test locally with `bun run dev:api`. If the log says the automatic rollback also failed, run the printed `bunx wrangler rollback <version> --env production` yourself.                             |
| integrity                               | new Worker live; website not deployed                                                    | Run the checks by hand: `bunx wrangler d1 execute DB --remote --env production --command "PRAGMA foreign_key_check"`. Fix the data (a migration that inserted orphan rows), or restore. Then run the workflow again (Actions → Deploy → Run workflow). |
| deploy website                          | old website live, new Worker live (the API accepts the old website's calls)              | Read the Vercel error (missing variable, build error). Fix and push again.                                                                                                                                                                             |
| site smoke test, "still serves build …" | the older website is live and working                                                    | Vercel didn't put the new deployment on the domain (after an earlier rollback it stops doing so automatically). Vercel → Deployments → the newest one → ⋯ → **Promote**.                                                                               |
| site smoke test (other)                 | **rolled back automatically** to the previous website                                    | Open the site and the Vercel logs, fix, push again. After a rollback Vercel stops promoting new deployments automatically: promote the next good one by hand as above.                                                                                 |

Rollback by hand at any time:

- API: `bunx wrangler deployments list --env production`, then `bunx wrangler rollback <version-id> --env production`.
- Website: Vercel → Deployments → a previous production deployment → ⋯ → **Instant Rollback**.
- Database: see [Restoring the database](#restoring-the-database). Never needed for a failed deploy: migrations are additive.

## Staying on the free plans

The Cloudflare account has a card attached. Only **R2** (file storage) is billed past its free
amount; Workers Free and D1 Free stop at their limits instead of charging (requests fail until
00:00 UTC). Vercel Hobby pauses, it never charges. What keeps R2 free:

| Guard                                                | Where                                                                                                                     | Default                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Storage cap: uploads stop when stored files reach it | `media.storage_limit_bytes` (protected)                                                                                   | 8 GB of the free 10 GB                                     |
| Daily write cap across all uploads                   | `media.daily_object_writes` (protected)                                                                                   | 2,000 files a day (the free tier allows 1 million a month) |
| Anonymous (applicant) files per day                  | `media.daily_anonymous_files`                                                                                             | 300                                                        |
| Automatic pause at 90% of free storage or writes     | hourly job (`guardFreeTier`)                                                                                              | switches `media.uploads_enabled` off and tells Moderators  |
| Warning at 70% of any free limit                     | hourly job                                                                                                                | a notice to Moderators, once a day per metric              |
| Reads                                                | every read goes through the Worker, whose free cap (100,000 requests a day) keeps reads far under R2's 10 million a month | —                                                          |

No setting can raise these past the free amounts (the API refuses, see `SETTING_RANGES`). Caps
are atomic, so concurrent uploads can't overshoot them.

**Check once, now:** Cloudflare dashboard → Workers & Pages → **Plans** must say **Workers Free**
(on Workers Paid, going over bills instead of stopping). Then Notifications → add a **billing
alert** (Cloudflare can email when usage is billed at all).

**Watch:** Dashboard → System health → _Free plan usage_. With the read-only analytics token
(`CF_ANALYTICS_TOKEN`, "Account Analytics: Read") it shows Cloudflare's own figures; without it,
GUCC's own counts.

**When uploads were paused:** delete unused files (Media → _Unused 30+ days_ → Delete
permanently; deleting is free), check the usage table, then a Moderator switches uploads back on
in System health.

## Under attack

Signs: System health shows many failed sign-ins or rate-limited addresses, API requests near
100,000 a day, the site slow, or Vercel usage emails.

1. **Vercel:** Firewall → turn on **Attack Challenge Mode** (every visitor passes a browser
   check first; free on Hobby, and blocked traffic doesn't count toward usage).
2. **Uploads or email abused:** System health → _Switches_ → switch **Uploads** or **Email** off.
   Anyone who can see System health can do this; a Moderator switches them back on.
3. **One account abused:** suspend it (Members), or sign it out everywhere with break-glass
   `revoke-sessions`.
4. **The API's daily requests used up:** the API answers errors until 00:00 UTC (06:00 Dhaka),
   at no cost. Public pages keep working from Vercel's cache. Without a custom domain there's no
   Cloudflare WAF in front of `workers.dev`; this is the accepted limit.
5. Afterwards: turn Attack Mode off, check the Activity log, switch uploads/email back on.

## Vercel Firewall rules

Hobby includes DDoS mitigation, Attack Challenge Mode, and a few custom rules (one of them a rate
limit). Add these three (Vercel → project → Firewall → Configure → New rule):

1. **Rate limit busy paths.**
   - If: _Request Path_ starts with `/api` **or** starts with `/auth` **or** starts with
     `/dashboard`, **or** _Method_ equals `POST`.
   - Then: **Rate Limit**, fixed window **60 s**, **120 requests**, keyed by **IP**, action
     **Deny** (429) for **5 minutes**.
2. **Block scanners.**
   - If: _Request Path_ matches
     `^/(wp-admin|wp-login\.php|xmlrpc\.php|\.env|\.git|phpmyadmin|cgi-bin|vendor/phpunit)`.
   - Then: **Deny**.
3. **Challenge scripts on sign-in and the assistant.**
   - If: _User Agent_ matches `(?i)(curl|wget|python-requests|go-http-client|libwww|scrapy|httpclient)`
     **and** _Request Path_ starts with `/auth` or `/api/chat`.
   - Then: **Challenge**.

Save and **Publish** the changes.

## Restoring the database

Take a fresh backup before any restore:
`bunx wrangler d1 export DB --remote --env production --output before-restore.sql`.

**D1 Time Travel** (any minute in the last 7 days on the free plan; replaces everything written
after that moment):

```bash
bunx wrangler d1 time-travel info DB --env production --timestamp 2026-09-27T10:00:00Z
bunx wrangler d1 time-travel restore DB --env production --bookmark <bookmark>
```

**From an encrypted backup** (GitHub → Actions → _Weekly database backup_ or a _Deploy_ run →
Artifacts):

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in backup.sql.enc -out backup.sql   # asks for BACKUP_PASSPHRASE
bun scripts/platform/restore-check.ts backup.sql      # proves it loads and passes the checks, locally
```

Loading a dump into the live database replaces data: do it only with a second person present,
into a new D1 database first (`bunx wrangler d1 create gucc-restore`, then
`bunx wrangler d1 execute gucc-restore --remote --file backup.sql`), and point the Worker at it
(`database_id` in `wrangler.jsonc`) once it checks out.

Every weekly backup is restore-tested automatically (decrypted, loaded into a throwaway SQLite
database on the runner, integrity- and foreign-key-checked, row counts compared with production).

## Rotating secrets

Rotate after anyone with access leaves, or at once if a value may have leaked. Never paste a
secret into chat, an issue or a commit.

| Secret                                                    | Where           | How, without signing anyone out                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API_SHARED_SECRET`                                       | Worker + Vercel | See DEPLOYMENT.md, "Rotating the API key without downtime" (`API_SHARED_SECRET_NEXT`).                                                                                                                                                                                                                                                                                |
| `AUTH_SECRET`                                             | Worker          | `wrangler secret put AUTH_SECRET_PREVIOUS` (old value), then `wrangler secret put AUTH_SECRET` (new). Upload links and private-file links made before keep working until they expire; two-factor secrets are re-encrypted with the new key the next time they're used. Remove `AUTH_SECRET_PREVIOUS` after 30 days. Sessions aren't affected (they're random tokens). |
| `PASSWORD_PEPPER`                                         | Worker          | `wrangler secret put PASSWORD_PEPPER_PREVIOUS` (old), then `PASSWORD_PEPPER` (new). Passwords are re-hashed with the new pepper at each person's next sign-in; recovery codes keep working. Keep the previous pepper until everyone active has signed in (months); accounts that never did need an admin reset link afterwards.                                       |
| `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Worker + Vercel | Cloudflare → Turnstile → the widget → Rotate secret key. Put the new secret on the Worker. (The site key doesn't change.)                                                                                                                                                                                                                                             |
| `SMTP2GO_API_KEY`                                         | Worker          | SMTP2GO → Settings → API Keys → add a new key (Emails permission) → `wrangler secret put SMTP2GO_API_KEY --env production` → delete the old key in SMTP2GO. Sending stops only between the two steps.                                                                                                                                                                 |
| `GOOGLE_API_KEY`                                          | Worker          | Google Cloud → the project **without billing** → Credentials → create a key restricted to the Generative Language API → put it on the Worker → delete the old one.                                                                                                                                                                                                    |
| `CF_ANALYTICS_TOKEN`                                      | Worker          | Cloudflare → My Profile → API Tokens → roll the "Account Analytics: Read" token → put it on the Worker.                                                                                                                                                                                                                                                               |
| `CLOUDFLARE_API_TOKEN`                                    | GitHub secret   | Create a new token (Workers Scripts Edit, D1 Edit, Workers R2 Storage Edit, Account Settings Read), update the secret, revoke the old token.                                                                                                                                                                                                                          |
| `VERCEL_TOKEN`                                            | GitHub secret   | Vercel → Account → Tokens → create, update the secret, delete the old one.                                                                                                                                                                                                                                                                                            |
| `BACKUP_PASSPHRASE`                                       | GitHub secret   | Set a new value. **Keep the old one somewhere safe** until the last backup made with it has expired (90 days), or those backups can't be opened.                                                                                                                                                                                                                      |

Worker secrets are set with `bunx wrangler secret put <NAME> --env production` (it asks for the
value; it's never printed).

## Break-glass recovery

For lockouts the dashboard can't fix: every Moderator lost their authenticator, a bad rule denies
everyone, an account is compromised. It needs the Cloudflare credentials, `--confirm-production`
and typing the target to confirm. Every use is written to the activity log and every Moderator is
notified.

```bash
bun scripts/platform/break-glass.ts reset-mfa --email person@example.com --target production --confirm-production
bun scripts/platform/break-glass.ts revoke-sessions --email person@example.com --target production --confirm-production
bun scripts/platform/break-glass.ts grant-moderator --email person@example.com --target production --confirm-production
bun scripts/platform/break-glass.ts disable-rule --key some-rule-key --target production --confirm-production
bun scripts/platform/break-glass.ts time-travel --target production          # prints restore steps only
```

`grant-moderator` refuses past the Moderator limit (3) unless `--over-limit` is given.

## Turning email on

Email goes through SMTP2GO and stays off until a real message has arrived. SMTP2GO's free plan
sends 1,000 emails a month (then refuses; nothing is billed) and 200 a day, and 25 an hour until a
sending domain is verified (extra ones wait in its queue). The platform stops at
`email.daily_limit` (40 a day) and `email.monthly_limit` (1,000 a month), and sends at most 25 per
request or cron run.

1. SMTP2GO: add `gucc@green.edu.bd` as a verified **single sender** (Settings → Verified Senders;
   SMTP2GO emails that address a link to click). No DNS change is needed. Create an API key
   (Settings → API Keys) with the "Emails" send permission.
2. Worker: `bunx wrangler secret put SMTP2GO_API_KEY --env production`. The sender is the plain
   variable `EMAIL_FROM="GUCC <gucc@green.edu.bd>"` in `wrangler.jsonc`.
3. System health → _Switches_ → **Send me a test email** (a Moderator). SMTP2GO's answer is shown.
   Check the inbox **and the spam folder**: without the university's DNS records for SMTP2GO,
   some mail providers file club email as spam (every "check your email" screen says so).
4. When the email has arrived: **Switch email on**. With other Moderators, one of them confirms.

Optional, better delivery: whoever manages green.edu.bd's DNS adds SMTP2GO's SPF include and DKIM
records (SMTP2GO → Sender Domains) and merges the two SPF records the domain has today into one.

From then on: account emails (verification, password reset, invitations, membership decisions)
and email copies of notifications, by each person's choices (My profile → _Email
notifications_; security notices always). Every message and SMTP2GO's answer are listed in System
health. Club-wide announcements stay in the dashboard (they would use a whole day's allowance).
