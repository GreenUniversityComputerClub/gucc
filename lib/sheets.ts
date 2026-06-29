import { google } from "googleapis"
import type { FormConfig } from "@/types/form"
function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!
  let clientEmail: string
  let privateKey: string

  try {
    const parsed = JSON.parse(raw)
    clientEmail = parsed.client_email
    privateKey = parsed.private_key
  } catch {
    clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!
    privateKey = raw.replace(/\\n/g, "\n")
  }

  return new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
}

function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() })
}

export function extractSheetId(urlOrId: string): string | null {
  const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (match) return match[1]
  if (/^[a-zA-Z0-9-_]{20,}$/.test(urlOrId)) return urlOrId
  return null
}

export function indexToCol(index: number): string {
  let col = ""
  let i = index
  while (i >= 0) {
    col = String.fromCharCode((i % 26) + 65) + col
    i = Math.floor(i / 26) - 1
  }
  return col
}

export async function validateSheet(
  sheetId: string,
  sheetName = "Sheet1"
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sheets = getSheetsClient()
    await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1`,
    })
    return { ok: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    if (msg.includes("403")) {
      return {
        ok: false,
        error: `Sheet not shared with service account. Share it with: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`,
      }
    }
    if (msg.includes("404")) {
      return { ok: false, error: "Sheet not found. Check the URL and tab name." }
    }
    return { ok: false, error: msg }
  }
}

export async function ensureHeaderRow(form: FormConfig): Promise<void> {
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: form.sheetId,
    range: `${form.sheetName}!1:1`,
  })
  const existingHeaders = res.data.values?.[0] ?? []
  if (existingHeaders.length > 0) return

  const headers = ["Submitted At", ...form.fields.map((f) => f.label)]
  await sheets.spreadsheets.values.update({
    spreadsheetId: form.sheetId,
    range: `${form.sheetName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers] },
  })
}

export async function getColumnValues(
  sheetId: string,
  sheetName: string,
  colIndex: number
): Promise<string[]> {
  const sheets = getSheetsClient()
  const col = indexToCol(colIndex)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${sheetName}!${col}:${col}`,
  })
  const rows = res.data.values ?? []
  return rows.slice(1).map((r) => r[0] ?? "")
}

export async function checkUniqueness(
  form: FormConfig,
  values: Record<string, string>
): Promise<{ ok: boolean; conflictField?: string; conflictValue?: string }> {
  const uniqueFields = form.fields.filter((f) => f.isUnique)
  for (const field of uniqueFields) {
    const fieldIndex = form.fields.indexOf(field)
    const existing = await getColumnValues(form.sheetId, form.sheetName, fieldIndex + 1)
    const submitted = values[field.id] ?? ""
    if (submitted && existing.includes(submitted)) {
      return { ok: false, conflictField: field.label, conflictValue: submitted }
    }
  }
  return { ok: true }
}

export async function appendRow(
  form: FormConfig,
  values: Record<string, string>,
  submittedAt: string
): Promise<void> {
  const sheets = getSheetsClient()
  const row = [submittedAt, ...form.fields.map((f) => values[f.id] ?? "")]
  await sheets.spreadsheets.values.append({
    spreadsheetId: form.sheetId,
    range: `${form.sheetName}!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  })
}

export async function getRows(
  sheetId: string,
  sheetName: string
): Promise<{ headers: string[]; rows: string[][] }> {
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${sheetName}!A:ZZ`,
  })
  const all = res.data.values ?? []
  const headers = all[0] ?? []
  const rows = all.slice(1)
  return { headers, rows }
}