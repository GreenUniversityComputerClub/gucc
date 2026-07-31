# Form Builder — Get Started

Direct setup steps only. For explanations, architecture, data model, and
troubleshooting, see the [Reference Guide](form-builder-reference.md).

## 1. Google Cloud service account

- [ ] Create/open a project at [console.cloud.google.com](https://console.cloud.google.com/)
- [ ] **APIs & Services → Library** → enable **Google Sheets API** and **Google Drive API**
- [ ] **APIs & Services → Credentials → Create Credentials → Service account**
- [ ] Open it → **Keys → Add key → Create new key → JSON** → download
- [ ] In `.env.local`, set the whole file's contents as one line:
  ```
  GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","client_email":"...","private_key":"...", ...}
  ```
- [ ] Note the `client_email` value — you'll share sheets with it below

## 2. Master sheet (one-time, whole-site)

- [ ] Create a new Google Sheet
- [ ] Share it with the service account email → **Editor**
- [ ] Rename its first tab to exactly `forms`
- [ ] In row 1 of that tab, type these headers exactly, A→H:
  ```
  id | title | description | sheetId | sheetName | config_json | createdAt | updatedAt
  ```
- [ ] Copy the ID from the sheet's URL (`.../d/`**`THIS`**`/edit`) → set in `.env.local`:
  ```
  MASTER_SHEET_ID=...
  ```

## 3. Supabase Storage

- [ ] Supabase dashboard → **Storage → New bucket**
- [ ] Name it exactly `form-uploads`
- [ ] Toggle **Public bucket** ON → **Create bucket**
- [ ] **Settings → API** → copy these into `.env.local`:
  ```
  NEXT_PUBLIC_SUPABASE_URL=...
  NEXT_PUBLIC_SUPABASE_ANON_KEY=...          # "Publishable key"
  SUPABASE_SERVICE_ROLE_KEY=...              # "Secret keys" section, starts sb_secret_...
  ```

## 4. Run it

```bash
npm install
npm run dev
```

Open `/forms/new`.

## 5. Build and test a form

- [ ] Fill in title, description, fields, banner, success settings
- [ ] Create a **new** Google Sheet for this form's responses (not the master sheet)
- [ ] Share that sheet with the service account email → **Editor**
- [ ] Paste its URL into "Google Sheet URL or ID" → **Verify**
- [ ] **Save**
- [ ] Open the **live link** (external-link icon on `/forms`, or `/forms/{id}/submit`) and submit a test response — **Preview never saves**, only the live link does
- [ ] Check the response landed in the sheet

Done.
