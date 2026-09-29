# Deploying the GUCC platform

The frontend runs on **Vercel (free Hobby plan)**. The whole backend runs on **Cloudflare (free
plan)**: one Worker (`gucc-api`), the D1 database `gucc`, and two R2 buckets. Only R2 can bill past
its free amount; the guards that keep it free, and what to do when anything fails, are in
[RUNBOOK.md](RUNBOOK.md). Check once that Cloudflare → Workers & Pages → **Plans** says **Workers
Free**, and add a billing alert (Notifications).

## 1. Cloudflare access (one time)

Either of these works; the scripts and Wrangler pick them up from `.env.local`
(`cp .env.example .env.local`), which is git-ignored:

- **Wrangler login (simplest).** Run `bunx wrangler login` and sign in with the club's Cloudflare
  account (gucc@green.edu.bd). Leave `CLOUDFLARE_API_TOKEN` empty in `.env.local`.
- **API token.** At **My Profile → API Tokens → Create Token**, use the "Edit Cloudflare Workers"
  template plus **D1: Edit**, and put it in `.env.local` as `CLOUDFLARE_API_TOKEN` (never in chat, Git
  or Vercel):

  | Permission               | Why                                   |
  | ------------------------ | ------------------------------------- |
  | Workers Scripts: Edit    | Deploy the Worker and set its secrets |
  | D1: Edit                 | Apply migrations and import data      |
  | Workers R2 Storage: Edit | Create the buckets and upload images  |
  | Account Settings: Read   | Wrangler account lookup               |

`CLOUDFLARE_ACCOUNT_ID` is already filled in (`c1b05716895cd372f5520dde62e5f68b`). A token in
`.env.local` always wins over the login, so leave it empty when you use the login.

> The old token (formerly in `.env.cloudflare.local`) could only read D1, R2 and Workers. It is no
> longer used; revoke it in the Cloudflare dashboard.

R2 must be enabled on the account (R2 → Get started). It is free up to 10 GB.

## 2. Backend: one command

```bash
bun install
bun run production:setup                 # checks access; changes nothing
bun run production:setup -- --apply      # does everything below
```

With `--apply` the script (`scripts/platform/production.ts`), each step safe to repeat:

1. checks the token's permissions and stops with instructions if one is missing;
2. backs up the production database to `migration/backup/` (git-ignored);
3. applies migrations `0001`–`0004`;
4. imports the club's data: 10 committees and 334 executive listings (including 2026's GUCC and CSS
   campuses), 81 events, 23 contests, the blog, forms, page content and certificate records;
5. verifies it field by field against the original files (`VERIFICATION PASSED` or it stops);
6. creates `gucc-media-public-production` and `gucc-media-private-production`;
7. generates `API_SHARED_SECRET`, `AUTH_SECRET` and `PASSWORD_PEPPER` without printing them
   (existing secrets are never replaced; `PASSWORD_PEPPER` must never change, or every password stops
   working);
8. deploys the Worker to `https://gucc-api.gucc.workers.dev` with those secrets in the same upload;
9. moves the legacy images into R2 as WebP variants with metadata stripped (`wrangler r2 bulk put`;
   database rows switch to R2 only after every upload succeeded);
10. verifies again against the live Worker and smoke-tests `/health` and the API.

The production `API_SHARED_SECRET` is saved in `.env.local` as `PRODUCTION_API_SHARED_SECRET`, and the
script prints the values for Vercel. Running it again is safe: data already imported, buckets, secrets
and images are left as they are.

Further secrets, any time (each asks for the value; nothing is printed):

```bash
bunx wrangler secret put TURNSTILE_SECRET_KEY --env production # bot protection (with the site key on Vercel); System health shows an Error without it
bunx wrangler secret put SMTP2GO_API_KEY --env production      # email via SMTP2GO (stays off until a test email arrives; RUNBOOK.md, "Turning email on")
bunx wrangler secret put GOOGLE_API_KEY --env production       # the chat assistant; use a Google project WITHOUT billing
bunx wrangler secret put CF_ANALYTICS_TOKEN --env production   # optional: a read-only "Account Analytics: Read" token for System health's usage figures
```

`CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, `CF_WORKER_NAME` and `CF_R2_BUCKETS` (which analytics to read)
are already in `wrangler.jsonc`, as are `EMAIL_FROM` (the verified SMTP2GO sender, `GUCC <gucc@green.edu.bd>`) and `CONTACT_EMAIL`; change them in `wrangler.jsonc`
(`env.production.vars`) and release. For key rotation (`AUTH_SECRET_PREVIOUS`,
`PASSWORD_PEPPER_PREVIOUS`) see RUNBOOK.md, "Rotating secrets".

## 3. Frontend on Vercel

In **Vercel → Project → Settings → Environment Variables**, add these for Production and Preview:

| Variable                         | Value                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_BASE_URL`           | `https://gucc.green.edu.bd`                                                    |
| `NEXT_PUBLIC_API_BASE_URL`       | `https://gucc-api.gucc.workers.dev`                                            |
| `NEXT_PUBLIC_MEDIA_BASE_URL`     | `https://gucc-api.gucc.workers.dev`                                            |
| `API_SHARED_SECRET`              | the `PRODUCTION_API_SHARED_SECRET` value from `.env.local` (mark it Sensitive) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | once Turnstile is set up                                                       |

The project still has the old site's variables (checked 2026-09-26). After the new site is live:

- **Move to the Worker**, then delete from Vercel: `GOOGLE_API_KEY` (`bunx wrangler secret put
GOOGLE_API_KEY --env production`, pasting the value from the provider's dashboard). Email now uses
  SMTP2GO (`SMTP2GO_API_KEY` on the Worker only); **delete** the old `RESEND_API_KEY` and
  `RESEND_FROM_EMAIL` from Vercel, and from the Worker with `bunx wrangler secret delete RESEND_API_KEY --env production`.
- **Delete**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
  `NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY`. Nothing reads them any more.

`vercel.json` runs the website's server functions in Singapore (`sin1`), next to the D1 database,
so a dashboard page doesn't cross the Pacific for every query. The Firewall rules to add after the
first deploy are in RUNBOOK.md, "Vercel Firewall rules".

Then deploy: push to `main` (see §5, which deploys the backend first), or run the **Deploy** workflow
by hand. The build fetches data from the Worker and refuses to finish if it can't reach it, so a
misconfigured deploy never replaces the live site with empty pages.

If the site's domain changes, update `PUBLIC_BASE_URL` and `FRONTEND_ORIGIN` in `wrangler.jsonc`
(uploads are only accepted from those origins) and redeploy the Worker.

## 4. First administrators

The platform starts with no one who can approve members; two command-line steps create the first
administrators, after which everything happens in the admin (audited).

**The General Secretary (or another current executive).** Their executive profile, with its position,
is already in the database from the import (for example Bakul Ahmed, General Secretary 2026, student
ID 232002184). They register on the website with their own email, then:

```bash
bun scripts/platform/bootstrap-admin.ts --target production --confirm-production \
  --email <the email they registered with> --student-id 232002184
```

It activates the account and links it to that profile; the position's permissions (member approval,
executives, events, posts, recruitment …) apply immediately. It refuses once anyone can approve members.
No password ever passes through the command line.

**The first Moderator** (protected governance: roles, permissions, protected rules). A faculty moderator
registers, then:

```bash
bun scripts/platform/bootstrap-moderator.ts --target production --confirm-production --email <their email>
```

It only works while no Moderator exists. After that, Moderators appoint each other at `/dashboard/roles`
(with a second Moderator's approval), and the President and the General Secretary approve members at `/dashboard/members`
(**Approve and link** attaches accounts that claim an executive profile).

## 5. Automatic deployment (push to `main`)

Every push to `main` runs `.github/workflows/deploy.yml`, in order:

1. **checks:** typecheck, unit and integration tests, governance seed, migration safety lint;
2. **backend** (`bun run release:api:production`): pending migrations must be additive; back up D1
   and check the backup; apply new migrations; deploy the API Worker; smoke-test it (health, this
   code's API version, refusal without the key) and **roll the Worker back automatically** if that
   fails; read-only integrity checks. The backup is kept as a workflow artifact for 30 days only
   **encrypted** with `BACKUP_PASSPHRASE` (the repository is public); without that secret it isn't kept;
3. **frontend:** check the website's settings exist in Vercel, then build and deploy this commit on
   Vercel production, then smoke-test the live site (it must serve this commit, the home page, the
   session endpoint and the sign-in gate) and **roll it back automatically** if that fails. The build
   runs on Vercel because Vercel never hands out Sensitive values such as `API_SHARED_SECRET`, not
   even to its own CLI.

If a step fails, the later ones don't run. RUNBOOK.md has a table of every failure and its fix. `vercel.json` turns off
Vercel's own Git deployments of `main`, so a website build never runs ahead of the backend it needs.
Preview deployments of other branches still happen automatically.

**One-time setup:** add these secrets at GitHub → the repository → Settings → Secrets and variables →
Actions (or on a `production` environment, which can require a reviewer before deploying):

| Secret                  | Value                                                                                                                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | A token from Cloudflare → My Profile → API Tokens: the "Edit Cloudflare Workers" template plus **D1: Edit**, limited to this account                                                                                                   |
| `CLOUDFLARE_ACCOUNT_ID` | `c1b05716895cd372f5520dde62e5f68b`                                                                                                                                                                                                     |
| `VERCEL_TOKEN`          | A token from Vercel → Account Settings → Tokens, with access to the green-university-computer-clubs-projects team                                                                                                                      |
| `VERCEL_ORG_ID`         | `team_xDeXkoENFucLUttWz1SQOVv6`                                                                                                                                                                                                        |
| `VERCEL_PROJECT_ID`     | `prj_hcQOkFEusJftPOG26bs0QcjVEmYv`                                                                                                                                                                                                     |
| `BACKUP_PASSPHRASE`     | A long random passphrase you keep in a password manager. Database backups are encrypted with it before they're stored; you need it to restore (`openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in backup.sql.enc -out backup.sql`). |

The Vercel project also needs the four settings from §3. You can also run the workflow by hand
(Actions → Deploy → Run workflow).

From your own machine the same backend release is `bun run release:api:production` (or
`bun run release:api:staging`). Schema changes are new files in `migrations/`; never edit an applied
one. Migrations always run before the Worker that needs them.

**Other workflows**

| Workflow           | When                                      | What                                                                                                                                                                                                                                                                               |
| ------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`           | every push and pull request               | typecheck, lint, tests, dependency audit (fails on critical advisories), seed check, Worker size, local database round trip, frontend build                                                                                                                                        |
| `backup.yml`       | weekly (Saturday 03:30 Dhaka) and by hand | encrypted production database export, kept 90 days, then **restore-tested** (decrypted, loaded into a throwaway SQLite database on the runner, integrity and foreign-key checks, row counts compared with production); needs `BACKUP_PASSPHRASE`                                   |
| `uptime.yml`       | every 30 minutes                          | the API's `/health` and the website's home page must answer; a failure emails whoever watches the repository's Actions. Set the repository variables `API_URL` / `SITE_URL` to override the defaults. GitHub pauses scheduled workflows after 60 days without repository activity. |
| `contributors.yml` | push to `main`, weekly                    | recomputes the footer's contributor order from the full history (commits and lines of authored code) and stores it in D1 (`site.contributors`)                                                                                                                                     |

### Rotating the API key without downtime

1. Generate a new key and set it on the Worker as `API_SHARED_SECRET_NEXT`
   (`bunx wrangler secret put API_SHARED_SECRET_NEXT --env production`). The Worker now accepts both.
2. In Vercel, set `API_SHARED_SECRET` to the new key and `API_SHARED_SECRET_PREVIOUS` to the old one,
   then redeploy the website.
3. Set the Worker's `API_SHARED_SECRET` to the new key and delete `API_SHARED_SECRET_NEXT`
   (`bunx wrangler secret delete API_SHARED_SECRET_NEXT --env production`).
4. Remove `API_SHARED_SECRET_PREVIOUS` from Vercel.

### Security settings that affect people

- **Two-factor sign-in** is required for accounts holding sensitive permissions (Moderators, the
  President, the General Secretary and anyone given such a permission), after a 7-day grace period
  (`security.mfa_required_for_sensitive`, `security.mfa_grace_days`). Until they turn it on, those
  permissions are paused; everything else keeps working. Members turn it on under Dashboard →
  Security. A leader with `users.reset_password` can reset someone's two-factor from Members.
- **Sessions** end after 14 idle days (12 idle hours for accounts with sensitive permissions) and
  after 30 days in any case (`security.session_*`).
- **"Confirm it's you"**: for anyone holding sensitive permissions, changes to roles, permissions,
  positions and rules, suspensions, deletions and settings need the password (or a code) entered in
  the last 10 minutes (`security.reauth_minutes`), as do exports of personal data, password reset
  links and two-factor resets for everyone.
- **Failed sign-ins:** after 5 wrong passwords an account is paused for 15 minutes and its owner is
  notified (and emailed, when email is on).
- **Content Security Policy** (production builds, `next.config.ts`): scripts only from the site and
  Cloudflare Turnstile, connections only to the site and the API Worker, frames only Google Forms
  and Turnstile. If a new embed or third-party script is added, add its origin there. Set
  `DISABLE_CSP=1` at build time only to rule the policy out while investigating a problem.

### Email: off until tested

- **Off (default, and whenever the protected `email.enabled` switch is off):** sign-ups go straight
  to approval, and reviewers are told in the app. Administrators give out one-time password reset
  links (Members → Password reset link) and invitation links. Nothing claims an email was sent.
- **On:** after `SMTP2GO_API_KEY` is set (and `EMAIL_FROM` in `wrangler.jsonc`), a Moderator sends a test email from
  System health and switches email on once it has arrived (RUNBOOK.md, "Turning email on"). Sign-ups
  then verify their email first; resets and invitations are emailed; notifications are emailed by
  each person's choices; at most `email.daily_limit` (40) a day and `email.monthly_limit` (1,000) a month. (Cloudflare Email Service can be
  added as another provider in `lib/server/email.ts`; its outbound sending needs the Workers Paid
  plan.)

## 6. Rolling back

Releases roll back by themselves when their smoke tests fail. By hand:

- **Worker:** `bunx wrangler deployments list --env production`, then
  `bunx wrangler rollback <version-id> --env production`.
- **Frontend:** Vercel → Deployments → the previous production deployment → Instant Rollback (after
  a rollback, promote the next good deployment by hand).
- **Data:** every deploy workflow run stores an encrypted D1 export as an artifact, and a release run
  from your machine keeps one in `migration/backup/`. See [DATABASE.md](DATABASE.md#backups-and-restore). Restore with Cloudflare's D1 Time Travel
  (`bunx wrangler d1 time-travel restore gucc --timestamp=<ISO time> --env production`) or by importing
  the export into a fresh database.

## Without DNS access

Nothing above needs a DNS change. The Worker lives on Cloudflare's own `workers.dev` address, images
are served through it, and `gucc.green.edu.bd` already points at the Vercel project, so deploying the
new frontend there changes no records. Two things do need DNS on a domain the club controls, and wait
until someone has it:

- **An R2 custom domain** for images. Optional: the Worker serves them with long-lived caching.
- **Better email delivery**: SMTP2GO sends from the verified single sender `gucc@green.edu.bd`
  without any DNS change, but some inboxes file it as spam until the domain's DNS has SMTP2GO's SPF
  and DKIM records. Until email is switched on, leaders approve new members from
  `/dashboard/members` without email verification.

## 7. Later, optional

- **R2 custom domain** for images (e.g. `media.gucc.green.edu.bd` on the public bucket): set
  `NEXT_PUBLIC_MEDIA_BASE_URL` to it. Images then skip the Worker entirely.
- **Remove legacy images from `public/`** after the production media migration is verified. They are
  committed, so they stay recoverable from Git history.
