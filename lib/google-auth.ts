import { google } from "googleapis"

// Both Sheets and Drive access go through the same service account so that
// sharing one email with a Sheet (and its Drive folder) is enough for
// everything — no separate storage provider or credentials needed.
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
]

interface ServiceAccountCreds {
  clientEmail: string
  privateKey: string
}

function parseServiceAccountCreds(): ServiceAccountCreds {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY

  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed.client_email && parsed.private_key) {
        return { clientEmail: parsed.client_email, privateKey: parsed.private_key }
      }
    } catch {
      // raw wasn't JSON — fall through and treat it as a bare private key
    }
    return {
      clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "",
      privateKey: raw.replace(/\\n/g, "\n"),
    }
  }

  return {
    clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "",
    privateKey: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  }
}

/** The email you need to share your Google Sheet (and its Drive folder) with, as Editor. */
export function getServiceAccountEmail(): string {
  const { clientEmail } = parseServiceAccountCreds()
  if (!clientEmail) {
    throw new Error(
      "No Google service account configured. Set GOOGLE_SERVICE_ACCOUNT_KEY (or GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) in your environment."
    )
  }
  return clientEmail
}

export function getGoogleAuth() {
  const { clientEmail, privateKey } = parseServiceAccountCreds()
  return new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: SCOPES,
  })
}
