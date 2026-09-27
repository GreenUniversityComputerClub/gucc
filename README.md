# Green University Computer Club — Official Website

The official website of the **Green University Computer Club (GUCC)**, the flagship
student-run technology club of Green University of Bangladesh.

Live at **[gucc.green.edu.bd](https://gucc.green.edu.bd)**

```
Browser ──► Next.js frontend (Vercel, free) ──► API Worker (Cloudflare, free) ──► D1 database + R2 files
```

- **Frontend:** Next.js 15 (App Router), React 19, Tailwind CSS v4, shadcn/ui. Public pages are
  static and refresh automatically when content changes.
- **Backend:** one Cloudflare Worker (`workers/api`) holds all logic: accounts, the governance
  engine, content, uploads, media, email and the hourly housekeeping job.
- **Data:** Cloudflare D1 (SQLite) and two R2 buckets, one for public images and one for private files.

Platform docs: [architecture](docs/platform/ARCHITECTURE.md) · [deployment](docs/platform/DEPLOYMENT.md) ·
[runbook](docs/platform/RUNBOOK.md) · [failure modes](docs/platform/FAILURE_MODES.md) · [privacy](docs/platform/PRIVACY.md) ·
[database](docs/platform/DATABASE.md) · [testing](docs/platform/TESTING.md) · [executive import](docs/platform/EXECUTIVE_IMPORT.md) ·
[implementation report](docs/platform/IMPLEMENTATION_REPORT.md) · [migration report](migration/reports/MIGRATION_REPORT.md)

---

## Getting started

**Requirements:** [Bun](https://bun.sh) and Node.js 20+.

```bash
bun install
cp .env.example .env.local                  # the one settings file (git-ignored); works as is locally
bun run db:migrate:local                    # create the local D1 schema
bun run migrate:legacy -- --target local    # load the club's data into local D1
bun run migrate:media -- --target local     # move images into local R2
BOOTSTRAP_PASSWORD='choose-a-long-one' bun run bootstrap:moderator -- --target local --email you@example.com --name "Your Name"

bun run dev:api                             # terminal 1: API Worker on http://localhost:8787
bun run dev                                 # terminal 2: website on http://localhost:3000
```

Sign in at `/auth/login`; the admin is at `/admin`. Development emails (verification, invitations,
password resets) are printed in the API Worker's terminal.

To start the local database over, delete `.wrangler/state` and repeat the `db:migrate`, `migrate:*` and
`bootstrap:moderator` steps. Also delete `.next/cache/fetch-cache`, or a production build may reuse
pages built from the old data. The end-to-end tests use their own database (`.e2e/state`), so they
never add test accounts to yours.

### Environment and secrets

One file, `.env.local` (git-ignored), copied from the committed template `.env.example`:

| Section                                                                          | Read by                                                                                |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Website (`NEXT_PUBLIC_*`)                                                        | Next.js                                                                                |
| `API_SHARED_SECRET`                                                              | Next.js and the local API Worker (same value)                                          |
| API Worker secrets (`AUTH_SECRET`, `PASSWORD_PEPPER`, Turnstile, Resend, Gemini) | `wrangler dev`, which takes only the names listed under `secrets` in `wrangler.jsonc`  |
| Cloudflare (`CLOUDFLARE_ACCOUNT_ID`, optional `CLOUDFLARE_API_TOKEN`)            | Wrangler and the platform scripts; with the token empty they use `bunx wrangler login` |
| `PRODUCTION_API_SHARED_SECRET`                                                   | Written by `production:setup`, for copying into Vercel                                 |

Don't create a `.dev.vars` file: Wrangler would read it instead of `.env.local`. Production secrets live
in Cloudflare (`wrangler secret put`) and in the Vercel project settings; see
[DEPLOYMENT.md](docs/platform/DEPLOYMENT.md).

### Scripts

| Command                                    | What it does                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `bun run dev` / `bun run dev:api`          | Website (Turbopack) / API Worker with local D1 and R2                                                     |
| `bun run build` / `bun start`              | Production build of the website (needs the API running) / serve it                                        |
| `bun run typecheck`                        | TypeScript for the website and the Worker                                                                 |
| `bun run lint`                             | ESLint                                                                                                    |
| `bun run test` / `bun run test:e2e`        | Unit and integration tests / Playwright end-to-end tests                                                  |
| `bun run db:migrate:<env>`                 | Apply D1 schema migrations (`local`, `staging`, `production`)                                             |
| `bun run migrate:legacy -- --target <env>` | Import `data/*.json` and media records into D1 (idempotent)                                               |
| `bun run migrate:media -- --target <env>`  | Move legacy images into R2 as optimised WebP variants                                                     |
| `bun run migrate:verify -- --target <env>` | Verify the database field by field against the original sources                                           |
| `bun run production:setup`                 | First setup: check access; add `-- --apply` to migrate, import, verify and deploy                         |
| `bun run release:api:<env>`                | Later releases: back up D1, apply new migrations, deploy the Worker, smoke-test (`staging`, `production`) |
| `bun run deploy:api:<env>`                 | Deploy the API Worker only (`staging`, `production`)                                                      |
| `bun scripts/platform/bootstrap-admin.ts`  | Link the first administrator's account (e.g. the GS) to their executive profile                           |
| `bun run check:worker-size`                | Bundle the Worker and report its size (free plan limit: 3 MiB gzip)                                       |
| `bun run db:seed:render`                   | Regenerate the governance seed migrations from `lib/governance/catalog.ts`                                |

---

## Project layout

```
app/                     Website routes (App Router)
  admin/                 Admin: members, committees, profiles, recruitment, events, posts, media, governance
  account/  auth/        Member account, sign-up, sign-in, invitations, password reset
  executives/ events/ blog/ news/ announcements/ contests/   Public pages (static, auto-refreshing)
  api/                   Thin route handlers (session, CSV exports, lost & found, chat, OG cards, revalidate)
components/              Shared UI (shadcn/ui in components/ui, admin kit in components/admin)
lib/
  api/                   The frontend's only way to reach data: calls to the API Worker
  governance/            Permission, rule and approval engine (pure, unit-tested)
  server/                Services, views, auth, security — run inside the API Worker
  public/                Read models and page shapes for the public site
  media/                 Browser-side image pipeline and upload client
workers/api/             The API Worker entry point, routes and procedure allowlist
migrations/              D1 schema and default governance (0001–0004)
scripts/platform/        Migration, verification, media, bootstrap and production CLIs
migration/               Migration reports (committed) and private backups (git-ignored)
data/                    Original JSON sources, kept as the migration's audit record (no longer read)
tests/                   Unit, integration (real schema) and Playwright end-to-end tests
```

### Content lives in the database

Committees, executives, events, contests, posts, forms, recruitment and page content are edited in
the admin and stored in D1. Nothing on the site is hard-coded: positions, permissions, rules and
approval workflows are database records that Moderators, the President and the General Secretary
manage from `/dashboard` (see [ARCHITECTURE.md](docs/platform/ARCHITECTURE.md#governance)).

New images are uploaded in the dashboard (drag and drop), resized to WebP in the browser at only the
sizes their purpose needs, validated by the Worker and stored in R2, within caps that keep R2 on its
free tier ([RUNBOOK.md](docs/platform/RUNBOOK.md#staying-on-the-free-plans)). `public/` still holds the original images until the production media migration is
verified; they are committed, so nothing is lost when they are removed later.

---

## SEO

- `lib/seo/site.ts` is the single source of truth for club details; metadata, structured data, the
  sitemap and social cards all follow it.
- `buildMetadata()` (`lib/seo/metadata.ts`) gives every page a canonical URL and Open Graph and
  Twitter tags; `lib/seo/schema.ts` builds JSON-LD (Organization, Person, ProfilePage, Event,
  BlogPosting, breadcrumbs).
- `/api/og` renders branded 1200×630 social cards on demand, including executive portraits.
- `/sitemap.xml` lists every page with real last-modified dates from the database.

---

## Contributing

```bash
git checkout -b feature/your-feature
bun run typecheck && bun run lint && bun run test
git commit -m "feat: describe your change"
git push origin HEAD
```

Then open a pull request against `main`. Husky runs lint-staged on commit.

---

## Deployment

See [docs/platform/DEPLOYMENT.md](docs/platform/DEPLOYMENT.md). In short: sign in with
`bunx wrangler login` (or put a token with D1, R2 and Workers edit permissions in `.env.local`), run
`bun run production:setup -- --apply`, add the printed values to Vercel, and appoint the first Moderator.

---

Built and maintained by GUCC members. Issues and pull requests are welcome at
[github.com/green-university-computer-club/gucc](https://github.com/green-university-computer-club/gucc).
