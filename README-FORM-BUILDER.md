# Form Builder — Setup and Usage Guide

The form builder lets GUCC executives create forms on the website (`/forms`)
and collect responses straight into Google Sheets, without using Google Forms.

This guide covers two things:

1. [Setting it up from scratch](#part-1--setup) (local machine or production server)
2. [Using it on the website](#part-2--using-the-form-builder)

> **Before you start:** the form builder depends on **Supabase** (login and
> file storage) and **Google Sheets** (form definitions and responses). The
> branch you deploy must contain the Supabase-based auth code
> (`lib/supabase/`, `lib/auth/`). If the branch you are deploying has moved to
> a different login system, the form builder's auth has to be ported first.

## How it works

| What                                   | Where it is stored                                |
| -------------------------------------- | ------------------------------------------------- |
| Form definitions (title, fields, etc.) | One "master" Google Sheet, in a tab named `forms` |
| Responses                              | A separate Google Sheet per form                  |
| Uploaded files (banner, PDFs, uploads) | Supabase Storage bucket `form-uploads`            |
| Who may build forms                    | Emails (`mail`) in `data/executives.json`         |
| Login                                  | Supabase Auth                                     |

There is no database table for forms. Google Sheets is the source of truth.

---

## Part 1 — Setup

You need: Node 20+, a Google account, a Supabase project, and (optionally) a
Resend account for emails.

### Step 1. Google Cloud service account

The website talks to Google Sheets through one service account.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create
   or select a project.
2. Go to **APIs & Services → Library** and enable both:
   - **Google Sheets API**
   - **Google Drive API**
3. Go to **APIs & Services → Credentials → Create credentials → Service
   account**. Any name works. No project roles are needed.
4. Open the new service account → **Keys → Add key → Create new key → JSON**.
   A `.json` file downloads. Keep it private.
5. Open the file and note the `client_email` value (it looks like
   `name@project.iam.gserviceaccount.com`). Every sheet the form builder
   touches must be shared with this address.

### Step 2. Master sheet

This is done once for the whole site, not once per form.

1. Create a new Google Sheet (for example "GUCC Forms — Master").
2. Click **Share** and add the service account email as **Editor**.
3. Rename the first tab to exactly `forms` (lowercase).
4. In row 1, type these headers in columns A to H, in this order:

   | A    | B       | C             | D         | E           | F             | G           | H           |
   | ---- | ------- | ------------- | --------- | ----------- | ------------- | ----------- | ----------- |
   | `id` | `title` | `description` | `sheetId` | `sheetName` | `config_json` | `createdAt` | `updatedAt` |

   This row is **not** created automatically. If it is missing, the first
   form you save is treated as the header and never shows up in the list.

5. Copy the sheet ID from its URL:
   `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`

Do not edit the rows of this sheet by hand afterwards.

### Step 3. Supabase

**Storage**

1. Supabase dashboard → **Storage → New bucket**.
2. Name it exactly `form-uploads`.
3. Turn **Public bucket** on, then create it. No policies are needed.

**Authentication**

1. **Authentication → URL Configuration**
   - **Site URL**: your site's address (for example `https://your-domain`).
   - **Redirect URLs**: add `https://your-domain/**` (and
     `http://localhost:3000/**` for local work).
2. Keep **Confirm email** turned **on**. Access is decided by email address,
   so without confirmation someone could sign up with an executive's email.

**Keys**

From **Settings → API**, copy:

- Project URL
- Publishable (anon) key
- Secret (service role) key — server only, never share it

### Step 4. Resend (optional)

Only needed for the "request to delete someone else's form" emails.

1. Create an API key at [resend.com](https://resend.com/).
2. Verify a sending domain, so emails can be delivered to any address.

Without this, everything else works; only delete requests will fail to send.

### Step 5. Environment variables

For local work, put these in `.env.local` in the project root.
For production, add the same names and values in your host's settings
(Vercel: **Project → Settings → Environment Variables → Production**), then
redeploy. `.env.local` is never uploaded.

```bash
# Supabase — login and file uploads
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-secret-key

# Google — Sheets access
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"name@project.iam.gserviceaccount.com", ...}
GOOGLE_SERVICE_ACCOUNT_EMAIL=name@project.iam.gserviceaccount.com
MASTER_SHEET_ID=the-id-from-step-2

# Resend — delete-approval emails (optional)
RESEND_API_KEY=re_xxxxxxxx
RESEND_FROM_EMAIL=GUCC <forms@your-verified-domain>
```

| Variable                        | Required | Notes                                                                    |
| ------------------------------- | -------- | ------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | Yes      | Supabase project URL                                                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes      | Publishable key, safe in the browser                                     |
| `SUPABASE_SERVICE_ROLE_KEY`     | Yes      | Secret. Never prefix with `NEXT_PUBLIC_`. Used to upload files           |
| `GOOGLE_SERVICE_ACCOUNT_KEY`    | Yes      | The whole JSON key file on **one line**, with no extra quotes around it  |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`  | Optional | Only required if you paste just the private key instead of the full JSON |
| `MASTER_SHEET_ID`               | Yes      | ID of the master sheet from Step 2                                       |
| `RESEND_API_KEY`                | Optional | For delete-approval emails                                               |
| `RESEND_FROM_EMAIL`             | Optional | Sender address on your verified Resend domain                            |

Never commit real values. `.env.example` should only hold placeholders.

### Step 6. Give executives access

Anyone whose email appears as a `mail` in `data/executives.json` is treated as
an executive automatically — every committee year, campus and wing counts.
Values written as `mailto:someone@example.com` are accepted too.

To give someone access, add their email as the `mail` of their entry in
`data/executives.json`, then commit and deploy. Each person creates an account
at `/auth/sign-up` using exactly that email and confirms it from their inbox.

To remove someone's access, remove their `mail` from `data/executives.json`
and deploy again.

### Step 7. Run or deploy

Local:

```bash
npm install
npm run dev
```

Open `http://localhost:3000/forms`.

Production: push the branch your host deploys from (or run `npm run deploy`
for Vercel). Make sure Step 5 is done on the host first.

### Step 8. Check that it works

1. Sign in with an executive email and open `/forms`. You should see the
   forms list (empty at first).
2. Open `/forms/new`. The "Google Sheets access" box should show the service
   account email. If it shows an error, `GOOGLE_SERVICE_ACCOUNT_KEY` is wrong.
3. Build a small test form (see Part 2), submit it through the live link,
   and confirm the row appears in the response sheet.

### Before going live

- Delete `app/api/debug-sheets/route.ts`. It is a public test endpoint that
  reveals parts of the Google key.
- `proxy.ts` is only picked up by Next.js 16+. On Next.js 15 the file must be
  named `middleware.ts` and export a function called `middleware`. The
  builder pages are still protected either way, because each page checks the
  login itself.
- `app/forms/dashboard/page.tsx` is an old page from the previous Google Form
  links feature and does not work with the current API.

---

## Part 2 — Using the form builder

### Pages at a glance

| Page                  | Who can open it | What it is for                           |
| --------------------- | --------------- | ---------------------------------------- |
| `/forms`              | Executives      | List of all forms                        |
| `/forms/new`          | Executives      | Create a form                            |
| `/forms/{id}/edit`    | Executives      | Edit a form                              |
| `/forms/{id}/preview` | Executives      | See the form without saving any response |
| `/forms/{id}/submit`  | Everyone        | The live form you share with people      |

### 1. Sign in

Go to `/auth/login` and sign in with your executive email. A **Form Builder**
link appears in the navbar and opens `/forms`. If you see "access denied",
your email is not on the allowlist (Setup, Step 6).

### 2. Create a form

Click **New Form**. The screen has three areas: the field list on the left,
the form in the middle, and the settings of the selected field on the right.

**Title and look**

- Type the form title in the top bar.
- Click the image box next to the title to upload a **banner image**, then
  choose where it appears (top, below the description, left, right, or as
  the background).
- Write the **description**. Formatting pasted from Google Docs or ChatGPT is
  kept (bold, lists, links, headings).
- Optionally upload a **rule book** PDF. Visitors get a link to it.

**Connect the response sheet**

Every form needs its own Google Sheet.

1. Create a new, empty Google Sheet. Do not reuse the master sheet.
2. In the builder's **Google Sheets access** box, copy the email shown.
3. In the Google Sheet, click **Share** and add that email as **Editor**.
4. Paste the sheet's URL into **Google Sheet URL or ID**.
5. Leave **Sheet Tab Name** as `Sheet1` unless you renamed the tab.
6. Click **Verify** and wait for the success mark.

**Availability**

- The **accepting responses** switch opens or closes the form manually.
- **Opens at** and **Closes at** are optional. Before the open time visitors
  see "not open yet"; after the close time they see that it has closed.

**Add fields**

Click a field type in the left panel to add it to the current page.

| Group       | Field types                                |
| ----------- | ------------------------------------------ |
| Basic       | Text, Long Text, Email, Phone, Number, URL |
| Date & Time | Date, Time                                 |
| Choice      | Dropdown, Radio, Checkbox                  |
| Media       | File Upload, Image Upload                  |
| Special     | Rating, Slider, Color                      |

**Edit a field**

Click a field in the middle to open its settings on the right:

- **Label** — the question text. It also becomes the column name in the sheet.
- **Placeholder** and **Help Text** — hints for the person filling it in.
- **Options** — for Dropdown, Radio and Checkbox.
- **Accepted File Types** — for file and image uploads.
- **Min / Max / Step** — for Number, Slider and Rating.
- **Width** — full or half, to place two fields side by side.
- **Response Validation** — rules such as "number greater than", "minimum
  length", "must be an email", or a custom pattern, with your own error text.
- **Required** — the form cannot be submitted without it.
- **Unique** — rejects a value that is already in the sheet. Use it for
  things like student ID or email to stop duplicate registrations.

**Pages**

Use the page bar to add more pages for a multi-step form. Each page can have
its own title and description. New fields go on the page you are viewing.

**After submit**

At the bottom, set:

- **Button Label** — text on the submit button.
- **Show a message** — a thank-you message with an optional image, or
- **Redirect to a link** — send the person to another URL after a short delay.

### 3. Save, preview, share

1. Click **Save**. Wait for the success mark.
2. Click **Preview** to check how it looks. Anything submitted in preview is
   thrown away.
3. From `/forms`, click the external-link icon to open the **live link**
   (`/forms/{id}/submit`). This is the link you share. No login is needed to
   fill it in.
4. Submit one real test response and check the sheet.

### 4. Read the responses

Open the form's Google Sheet. Each submission is one row:

- Column A is **Submitted At**.
- The next columns follow the form's fields, in order.
- File and image uploads appear as links.

The header row is written automatically on the first submission.

> **Finish your fields before collecting responses.** The header row is only
> written once, and answers are placed by position. If you add, remove or
> reorder fields after responses have started, the columns will no longer
> line up, and you will have to fix the header row in the sheet by hand.

### 5. Edit or close a form

- Open `/forms` and click the edit icon. Change what you need and **Save**.
- To stop responses, turn the accepting-responses switch off or set a
  **Closes at** time, then save.

### 6. Delete a form

- **Your own form:** click the delete icon.
- **Someone else's form:** click the request icon. The creator receives an
  email with an **Approve deletion** button. After they approve, you get an
  email and can delete the form from the list.

Deleting a form removes it from the website only. The response sheet and
uploaded files are not deleted.

---

## Limits

- Uploads are limited to **15 MB** per file.
- Submitting takes a few seconds because it writes to Google Sheets. Ask
  people not to close the page until they see the success screen.
- Forms with **Unique** fields get slower as the sheet grows, because the
  whole column is checked on each submission.

## Troubleshooting

| Problem                                                | Likely cause                                                    | Fix                                                                                           |
| ------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| "Sheet not shared with service account" on Verify      | The sheet is not shared with the service account                | Share it as **Editor** with the email shown in the builder                                    |
| "Sheet not found" on Verify                            | Wrong URL or wrong tab name                                     | Check the URL and that **Sheet Tab Name** matches the tab                                     |
| Builder shows "No Google service account configured"   | `GOOGLE_SERVICE_ACCOUNT_KEY` missing or broken                  | Paste the full JSON on one line, without wrapping quotes, and redeploy                        |
| `/forms` crashes or shows no forms after saving        | Master sheet not shared, wrong `MASTER_SHEET_ID`, no header row | Redo Setup Step 2                                                                             |
| Upload fails: "File uploads aren't configured yet"     | `SUPABASE_SERVICE_ROLE_KEY` missing                             | Add it and redeploy                                                                           |
| Upload fails: bucket "form-uploads" doesn't exist      | Bucket missing or misspelled                                    | Create a public bucket named exactly `form-uploads`                                           |
| "Access denied" after login                            | Email is not a `mail` in `data/executives.json`                 | Add it (Setup Step 6) and deploy                                                              |
| Email confirmation link shows "No token hash or type"  | Supabase "Confirm signup" email template uses the default link  | Set the template link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` |
| Delete request says the email failed to send           | Resend key, sender or domain not set up                         | Complete Setup Step 4                                                                         |
| Works locally but not in production                    | Environment variables not set on the host                       | Add all of Setup Step 5 on the host and redeploy                                              |
| Columns in the response sheet do not match the answers | Fields were changed after responses started                     | Fix the header row by hand; avoid changing fields on a live form                              |

## Where the code lives

| Path                                  | Purpose                                            |
| ------------------------------------- | -------------------------------------------------- |
| `app/forms/`                          | Builder pages and the public submit page           |
| `app/api/forms/`                      | Create, edit, delete and delete-approval endpoints |
| `app/api/sheets/submit/route.ts`      | Saves a response to the form's sheet               |
| `app/api/upload/route.ts`             | File uploads to Supabase Storage                   |
| `components/form-builder/`            | The builder interface                              |
| `components/form-renderer/`           | The form people fill in                            |
| `lib/forms.ts`, `lib/master-sheet.ts` | Reading and writing form definitions               |
| `lib/sheets.ts`                       | Reading and writing responses                      |
| `lib/auth/`                           | Executive allowlist and access checks              |
| `types/form.ts`                       | Form and field types                               |

More technical background is in `docs/form-builder-reference.md`.
