// this page is created to test the api hits of form builder
import { NextResponse } from "next/server"
import { google } from "googleapis"

export async function GET() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY

  if (!email || !key) {
    return NextResponse.json({
      step: 1,
      error: "Env vars missing",
      email: !!email,
      key: !!key,
    })
  }

  const keyPreview = {
    length: key.length,
    startsWithQuote: key.startsWith('"'),
    endsWithQuote: key.endsWith('"'),
    startsWithDash: key.startsWith("-----"),
    startsWithBrace: key.startsWith("{"),
    first30: key.slice(0, 30),
    last30: key.slice(-30),
    hasLiteralBackslashN: key.includes("\\n"),
    hasRealNewline: key.includes("\n"),
  }

  let privateKey: string
  let clientEmail: string
  let parseMethod: string

  try {
    const parsed = JSON.parse(key)
    privateKey = parsed.private_key
    clientEmail = parsed.client_email
    parseMethod = "JSON.parse (full JSON)"
  } catch {
    privateKey = key.replace(/\\n/g, "\n")
    clientEmail = email
    parseMethod = "replace \\n (raw key)"
  }

  const privateKeyPreview = {
    method: parseMethod,
    length: privateKey.length,
    startsCorrectly: privateKey.startsWith("-----BEGIN"),
    endsCorrectly: privateKey.trimEnd().endsWith("-----"),
    hasRealNewlines: privateKey.includes("\n"),
    lineCount: privateKey.split("\n").length,
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    })

    const token = await auth.getAccessToken()
    return NextResponse.json({
      step: 4,
      success: true,
      tokenObtained: !!token,
      keyPreview,
      privateKeyPreview,
    })
  } catch (err: unknown) {
    return NextResponse.json({
      step: 4,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      keyPreview,
      privateKeyPreview,
    })
  }
}