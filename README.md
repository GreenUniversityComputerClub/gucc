# Green University Computer Club — Official Website

The official website of the **Green University Computer Club (GUCC)**, the flagship
student-run technology club of Green University of Bangladesh.

Live at **[gucc.green.edu.bd](https://gucc.green.edu.bd)**

Built with Next.js 15 (App Router), React 19, Tailwind CSS v4, shadcn/ui and Supabase.

---

## Getting started

**Requirements:** [Bun](https://bun.sh) (preferred) or Node.js 20+. The pinned
toolchain lives in `.tool-versions`.

```bash
bun install
cp .env.example .env.local   # then fill in the values below
bun dev
```

Open <http://localhost:3000>.

### Environment variables

Copy `.env.example` to `.env.local`. The site runs without any of these — the
features that depend on them degrade gracefully — so you only need the ones you
are actually working on.

| Variable                               | Required for              | Notes                                                         |
| -------------------------------------- | ------------------------- | ------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Auth, forms, lost & found | Supabase project URL                                          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`        | Auth, forms, lost & found | Public anon key; access is enforced by row-level security     |
| `GOOGLE_API_KEY`                       | Chatbot                   | Server-only. Google Generative AI key                         |
| `HASHNODE_HOST`                        | Blog                      | Hashnode publication host. Without it only local posts render |
| `RESEND_API_KEY`                       | Contact form              | Server-only                                                   |
| `RESEND_FROM_EMAIL`                    | Contact form              | Verified sender address                                       |
| `CONTACT_EMAIL`                        | Contact form              | Where enquiries are delivered                                 |
| `NEXT_PUBLIC_RAG_API_URL`              | Chatbot document Q&A      | Optional                                                      |
| `NEXT_PUBLIC_BASE_URL`                 | SEO                       | Canonical origin. Defaults to `https://gucc.green.edu.bd`     |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | SEO                       | Google Search Console token                                   |
| `NEXT_PUBLIC_BING_SITE_VERIFICATION`   | SEO                       | Bing Webmaster token                                          |

> Never commit `.env.local`. It is git-ignored.

### Scripts

| Command          | What it does                          |
| ---------------- | ------------------------------------- |
| `bun dev`        | Development server (Turbopack)        |
| `bun run build`  | Production build                      |
| `bun start`      | Serve the production build            |
| `bun run lint`   | ESLint                                |
| `bun run fmt`    | Prettier across the repo              |
| `bun run deploy` | Build and deploy to Vercel production |

---

## Project layout

```
app/                     Routes (App Router)
  api/                   Route handlers, incl. /api/og social-card renderer
  executives/            Committee pages + one profile page per executive
  events/  contests/     Event and contest archives
  blog/                  Hashnode-backed blog
  scheduler/             Course routine planner
  lost-found/            Campus lost & found board
  sitemap.ts robots.ts   Generated /sitemap.xml and /robots.txt
components/              Shared UI (shadcn/ui in components/ui)
data/                    Site content as JSON — see below
lib/
  seo/                   Metadata, JSON-LD and Open Graph card generation
  supabase/              Supabase browser/server clients
public/                  Static assets (executive portraits, event covers…)
```

### Content lives in `data/`

Most of the site is driven by JSON, so updating content needs no React work:

| File                                 | Drives                                            |
| ------------------------------------ | ------------------------------------------------- |
| `executives.json`                    | Every committee, and every executive profile page |
| `events.json`                        | The events archive and event detail pages         |
| `contests.json`                      | Programming contest results                       |
| `sponsors.json`, `collaborations.ts` | Sponsors and partner clubs                        |

**Two rules keep the site consistent:**

1. **Event names must be unique.** The URL is derived from the name, so two
   events with the same name collide on one page and only the first is reachable.
2. **Contest `id`s must be unique.** They are the URL.

Executive portraits go in `public/executives/` named after the student ID
(`232002184.png`), or set `avatarUrl` explicitly.

---

## SEO

SEO is centralised rather than sprinkled across pages:

- **`lib/seo/site.ts`** — one source of truth for club name, address, socials and
  keywords. Change it here and metadata, structured data, the sitemap and social
  cards all follow.
- **`lib/seo/metadata.ts`** — `buildMetadata()` produces canonical URL, Open Graph
  and Twitter tags, and caps title/description to what Google displays.
- **`lib/seo/schema.ts`** — JSON-LD builders (Organization, Person, ProfilePage,
  Event, BlogPosting, breadcrumbs, FAQ).
- **`app/api/og/route.tsx`** — renders branded social cards on demand, so every
  executive and event gets its own image without build-time cost.

When adding a page, give it metadata via `buildMetadata()` — in the page for
server components, or in a sibling `layout.tsx` for client components (a
`"use client"` page cannot export `metadata`).

---

## Contributing

```bash
git checkout -b feature/your-feature
# make your changes
bun run lint && bun run build     # both must pass
git commit -m "feat: describe your change"
git push origin HEAD
```

Then open a pull request against `main`.

Husky runs lint-staged on commit, so staged files are linted and formatted
automatically.

---

## Deployment

Deployed on Vercel. `main` deploys to production automatically; set every
environment variable above in the Vercel project settings.

Note that the filesystem is read-only in production — content changes go through
`data/*.json` in git, not through the app at runtime.

---

Built and maintained by GUCC members. Issues and pull requests are welcome at
[github.com/green-university-computer-club/gucc](https://github.com/green-university-computer-club/gucc).
