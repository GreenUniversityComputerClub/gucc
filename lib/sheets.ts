import { google } from 'googleapis'

function getAuth() {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  return new google.auth.JWT(
    key.client_email,
    undefined,
    key.private_key,
    ['https://www.googleapis.com/auth/spreadsheets']
  )
}

export async function appendRow(sheetId: string, sheetName: string, values: string[]) {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  })
}

export async function getColumn(sheetId: string, sheetName: string, col: string) {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${sheetName}!${col}:${col}`,
  })
  return res.data.values?.flat() ?? []
}