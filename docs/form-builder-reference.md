# Form Builder — Reference Guide

Everything you need to run the form builder (`/forms`) from a completely fresh
environment: what it's built on, which credentials it needs, and how to wire
up Google Sheets and Supabase Storage from scratch, plus the data model and
troubleshooting.

> Just need to get set up? Use the [Get Started checklist](form-builder-get-started.md)
> instead — this doc is the "why" behind each of its steps.

## 1. Architecture, in one paragraph

There are three moving pieces, each responsible for one kind of data:

- **A "master" Google Sheet** stores every form's _definition_ (title,
  fields, banner, success/redirect settings — the whole config as one JSON
  blob per row) in a tab called `forms`. One spreadsheet for the entire
  site, shared by all forms.
- **A per-form Google Sheet** (one that _you_ create when building a form)
  stores that form's _responses_ — one row per submission. Every form
  points at its own sheet via a URL you paste into the builder.
- **A single Supabase Storage bucket** (`form-uploads`) stores every file a
  form ever touches: banner images, rule book PDFs, and whatever people
  upload into file/image fields. The bucket is public, so the URL written
  into the response sheet is a permanent, directly-loadable link.

There is no database for form data — Google Sheets is the source of truth
for both form definitions and responses. Supabase is storage-only.

```
Form Builder UI  ──save──>  master Sheet, "forms" tab   (one row per form)
Public Submit UI ──submit─>  that form's own Sheet        (one row per response)
File/Image/Banner/Rulebook uploads ──>  Supabase Storage bucket "form-uploads"
```

## 2. Prerequisites

- Node 20+ and either `npm` or `bun` (the repo has both a `package-lock.json`
  and a `bun.lock` — pick one and keep it in sync, don't mix mid-session).
- A Google Cloud project with a service account.
- A Supabase project.

## 3. Environment variables

Add these to `.env.local` (copy `.env.example` as a starting point). Only
the form-builder-relevant ones are listed here — the file has a few more
for unrelated features (chatbot, blog).

| Variable                        | Used for                                                                                            | Where to get it                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_SERVICE_ACCOUNT_KEY`    | Auth for **both** Sheets and Drive APIs                                                             | Full JSON key file content, as one line (see §4)                                                                             |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`  | Fallback if you'd rather not paste the whole JSON blob                                              | The `client_email` field from that same JSON key                                                                             |
| `MASTER_SHEET_ID`               | The spreadsheet ID holding the `forms` tab                                                          | See §5                                                                                                                       |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL                                                                                | Supabase dashboard → Settings → API                                                                                          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public/publishable key (safe in the browser)                                                        | Same page, "Publishable key"                                                                                                 |
| `SUPABASE_SERVICE_ROLE_KEY`     | **Server-only secret.** Lets the upload API write to Storage on behalf of anonymous form submitters | Same page, "Secret keys" section — starts `sb_secret_...` (older projects call it `service_role`, a long JWT-looking string) |

`GOOGLE_SERVICE_ACCOUNT_KEY` accepts either the raw JSON (`{"client_email":
"...", "private_key": "..."}` — that's what `lib/google-auth.ts` and
`lib/master-sheet.ts` expect first) or, if you'd rather split it up, set
`GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
instead. Whichever you pick, keep it out of version control — `.env.local`
is gitignored, `.env.example` should only ever hold placeholders.

## 4. Google Cloud service account setup

This one service account is shared by every form for both Sheets and Drive
access (`lib/google-auth.ts` requests both scopes on the same credentials).

1. In [Google Cloud Console](https://console.cloud.google.com/), create a
   project (or reuse one).
2. **APIs & Services → Library** — enable **Google Sheets API** and
   **Google Drive API**.
3. **APIs & Services → Credentials → Create Credentials → Service account.**
   Any name works, e.g. `sheets-editor`. No special roles/permissions needed
   at the project level — access is granted per-sheet later, by sharing.
4. Open the new service account → **Keys → Add key → Create new key → JSON.**
   This downloads a `.json` file.
5. Paste that file's _entire contents_ as one line into `.env.local`:
   ```
   GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","client_email":"...", ...}
   ```
6. Note the `client_email` value (looks like
   `sheets-editor@your-project.iam.gserviceaccount.com`) — you'll share
   every sheet with this exact address, as **Editor**, in the next steps.
   The running app also surfaces this email for you at
   `GET /api/config/service-account`, and the form builder UI shows it with
   a copy button.

## 5. Master sheet setup (`MASTER_SHEET_ID`)

This is the one-time, whole-site setup — do this once, not per form.

1. Create a new Google Sheet. Name it whatever you like (e.g. "GUCC Forms —
   Master").
2. **Share it** with the service account email from §4, as **Editor**.
3. Rename its first tab to exactly `forms` (case-sensitive, lowercase —
   `lib/forms.ts` hardcodes `const TAB = "forms"`).
4. In row 1 of that tab, add these exact headers, in this exact order:

   | A    | B       | C             | D         | E           | F             | G           | H           |
   | ---- | ------- | ------------- | --------- | ----------- | ------------- | ----------- | ----------- |
   | `id` | `title` | `description` | `sheetId` | `sheetName` | `config_json` | `createdAt` | `updatedAt` |

   **This header row is not created automatically** — unlike per-form
   response sheets (which get their headers auto-generated on first
   submission), the master sheet's `forms` tab needs this row written by
   hand before you save your first form. If you skip it, your first saved
   form becomes row 1 and gets silently treated as the header row instead
   of real data (`readTab()` always skips row 1).

5. Copy the spreadsheet ID out of its URL —
   `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit` — and set
   it as `MASTER_SHEET_ID`.

You can leave the sheet's default `Sheet1` tab as-is (untouched, unused) or
delete it — just don't repurpose it as a form's response sheet (see the
gotcha in §8).

## 6. Supabase Storage setup

1. In your Supabase project: **Storage → New bucket.**
2. Name it exactly `form-uploads` (hardcoded as `UPLOADS_BUCKET` in
   `lib/storage.ts`).
3. Toggle **Public bucket** on.
4. Create it. That's the entire setup — no RLS policies needed:
   - **Writes** go through `/api/upload`, which uses the service-role key
     server-side and therefore bypasses RLS entirely.
   - **Reads** work because the bucket itself is public — anyone with the
     URL can fetch the file, no auth required, which is what you want since
     these URLs get embedded in publicly-viewable forms and Sheet cells.
5. Make sure `SUPABASE_SERVICE_ROLE_KEY` (§3) is set — without it,
   `/api/upload` fails fast with a clear "File uploads aren't configured
   yet" error rather than a silent failure.

## 7. Running it

```bash
npm install     # or bun install
npm run dev     # or bun dev
```

Open `/forms` to see the list, `/forms/new` to build one.

## 8. Creating a form, end to end

1. `/forms/new` → fill in title, description (rich text — paste from
   ChatGPT/Docs and formatting carries over), banner image, rule book PDF,
   success/redirect behavior, add fields.
2. **Create a brand-new Google Sheet just for this form's responses** — do
   not reuse the master sheet from §5. Share it with the service account
   email as Editor. Paste its URL into "Google Sheet URL or ID" and click
   Verify.
3. Click **Save**. The form's config is written to the master sheet's
   `forms` tab.
4. Click **Preview** to check it renders correctly — preview submissions
   are intentionally discarded, never written anywhere.
5. Open the live link (external-link icon on `/forms`, or `/forms/{id}/submit`)
   to actually test end-to-end. The response sheet gets its header row
   auto-generated on the very first real submission.

## 9. Data model reference

`types/form.ts` is the single source of truth; the highlights:

- **`FormField.type`** — `text | textarea | email | phone | number | date |
time | url | select | checkbox | radio | file | image | rating | color |
range`.
- **`FormField.validation`** — optional Google-Forms-style rule
  (`number_gt`, `text_regex`, `text_email`, …), checked in addition to
  `required`. Enforced both client-side (`components/form-renderer/FormPage.tsx`)
  and server-side (`lib/validation.ts`, called again in the submit route —
  never trust the client-only check).
- **`FormField.isUnique`** — on submit, the server reads that field's
  entire response-sheet column and rejects duplicates (`lib/sheets.ts:checkUniqueness`).
  This gets slower as a sheet grows, since it's a full-column read per
  unique field (parallelized across fields, but each one is still a full
  scan).
- **`FormConfig.logoPosition`** — `top | below-description | left | right |
background`. Rendered in `components/form-renderer/FormRenderer.tsx`.
- **`FormConfig.successAction`** — `message` (default, shows
  `successMessage` rich text + optional `successImageUrl`) or `redirect`
  (sends the user to `redirectUrl` after `redirectDelaySeconds`, with a
  "Redirecting you in Ns..." screen and a manual fallback link). In Preview
  mode, redirect is never actually followed — it just shows a note saying
  what _would_ happen on the live form.
- **`FormConfig.driveFolderId`** — deprecated, unused for new uploads.
  Kept only so forms created before the Supabase Storage migration still
  resolve their old Google-Drive-hosted file links
  (proxied through `/api/files/[fileId]`, backed by `lib/drive.ts`).

## 10. Known limitations

- **No auth on `/forms/*`.** Anyone with the URL can create, edit, or
  delete forms, and see every connected Sheet ID —
  `app/api/forms/route.ts` and the `/forms` pages have zero access
  control. Fine for an internal/trusted-link setup; not fine to expose
  publicly without adding auth first.
- **Submitting is inherently a bit slow** — a response write is at minimum
  two Sheets API round-trips run in parallel (uniqueness + header check)
  followed by the append itself, typically ~4–6 seconds. The UI makes this
  obvious (spinner, "please don't close this page," and a `beforeunload`
  guard) — don't remove that feedback without replacing the latency itself.
- **Rich text is a deliberately small allowlist** — bold, italic,
  underline, lists, links, a couple of heading levels. Sanitized both on
  save (`RichTextEditor`) and on render (`RichText`) via
  `isomorphic-dompurify`. If you need more formatting options, extend
  `ALLOWED_TAGS` in `components/form-builder/RichTextEditor.tsx` — don't
  bypass sanitization to do it.
- **Max upload size is 15MB**, enforced server-side in
  `app/api/upload/route.ts`.

## 11. Troubleshooting

| Symptom                                                                                         | Cause                                                                                                                       | Fix                                                                                                           |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| "Sheet not shared with service account" on Verify                                               | The sheet (or the master sheet) isn't shared with the service account email                                                 | Share it as Editor with the email from `/api/config/service-account`                                          |
| Upload fails: "File uploads aren't configured yet"                                              | `SUPABASE_SERVICE_ROLE_KEY` missing/empty                                                                                   | Add it per §3/§6                                                                                              |
| Upload fails: `Storage bucket "form-uploads" doesn't exist yet`                                 | Bucket not created, or misspelled                                                                                           | Create it exactly as `form-uploads`, public (§6)                                                              |
| New form doesn't show up in `/forms`                                                            | Master sheet's `forms` tab is missing its header row, so your first form got treated as the header                          | Fix the header row (§5, step 4); you'll likely need to move that row's data back into a real data row by hand |
| Responses "aren't saving" but no error shown                                                    | Usually means the user closed/refreshed during the ~5s save — check the response sheet directly before assuming it's broken | The spinner + warning text (§10) should prevent this going forward                                            |
| A file/image field's uploaded link points to `drive.google.com`/`/api/files/...` on an old form | That form was created before the Supabase Storage migration                                                                 | Expected — old links still resolve via `lib/drive.ts`; new uploads on that same form now go to Supabase       |

## 12. Deploying

Every environment variable in §3 needs to be set again in your hosting
platform's dashboard (Vercel, etc.) — `.env.local` only affects your local
machine. This project's `deploy` script assumes Vercel
(`bunx vercel build --prod && bunx vercel deploy --prod --prebuilt`).
