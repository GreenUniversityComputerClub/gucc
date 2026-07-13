import { NextRequest, NextResponse } from "next/server"
import { extractSheetId, validateSheet } from "@/lib/sheets"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const rawSheet = searchParams.get("sheetId") ?? ""
  const sheetName = searchParams.get("sheetName") ?? "Sheet1"

  const sheetId = extractSheetId(rawSheet)
  if (!sheetId) return NextResponse.json({ data: null, error: "Invalid Sheet URL or ID" }, { status: 400 })

  const result = await validateSheet(sheetId, sheetName)
  if (!result.ok) return NextResponse.json({ data: null, error: result.error }, { status: 400 })

  return NextResponse.json({ data: { valid: true }, error: null })
}