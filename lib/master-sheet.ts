import { google } from "googleapis"

const MASTER_SHEET_ID = process.env.MASTER_SHEET_ID!

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

// ... rest of your functions unchanged
function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() })
}

/**
 * Read all rows from a named tab in the master sheet.
 * Returns an array of string arrays (one per row), skipping the header row.
 */
export async function readTab(tab: string): Promise<string[][]> {
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: MASTER_SHEET_ID,
    range: `${tab}!A:ZZ`,
  })
  const rows = res.data.values ?? []
  // Skip header row (row 0) — data starts at row 1
  return rows.slice(1).map((row) => row.map((cell) => String(cell ?? "")))
}

/**
 * Append a new row to a named tab in the master sheet.
 */
export async function appendToTab(tab: string, row: string[]): Promise<void> {
  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.append({
    spreadsheetId: MASTER_SHEET_ID,
    range: `${tab}!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  })
}

/**
 * Update an existing row identified by its ID (column A) in a named tab.
 */
export async function updateRowById(
  tab: string,
  id: string,
  newRow: string[]
): Promise<void> {
  const sheets = getSheetsClient()

  // Fetch all rows to find which row number this ID is on
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: MASTER_SHEET_ID,
    range: `${tab}!A:A`,
  })

  const column = res.data.values ?? []
  // Row 0 is header, data starts at index 1 → sheet row 2
  const rowIndex = column.findIndex((r, i) => i > 0 && r[0] === id)
  if (rowIndex === -1) throw new Error(`Row with id "${id}" not found in tab "${tab}"`)

  const sheetRow = rowIndex + 1 // 1-based sheet row number

  await sheets.spreadsheets.values.update({
    spreadsheetId: MASTER_SHEET_ID,
    range: `${tab}!A${sheetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [newRow] },
  })
}

/**
 * Delete a row identified by its ID (column A) from a named tab.
 * Uses batchUpdate to physically delete the row (not just clear it).
 */
export async function deleteRowById(tab: string, id: string): Promise<void> {
  const sheets = getSheetsClient()

  // Get the sheet's numeric ID for the named tab
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: MASTER_SHEET_ID,
  })
  const sheet = meta.data.sheets?.find(
    (s) => s.properties?.title === tab
  )
  if (!sheet?.properties?.sheetId == null)
    throw new Error(`Tab "${tab}" not found in master sheet`)
  const sheetId = sheet!.properties!.sheetId!

  // Find the row index of the target ID
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: MASTER_SHEET_ID,
    range: `${tab}!A:A`,
  })
  const column = res.data.values ?? []
  const rowIndex = column.findIndex((r, i) => i > 0 && r[0] === id)
  if (rowIndex === -1) throw new Error(`Row with id "${id}" not found in tab "${tab}"`)

  // Delete the row (0-based index in the API)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: MASTER_SHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowIndex,
              endIndex: rowIndex + 1,
            },
          },
        },
      ],
    },
  })
}