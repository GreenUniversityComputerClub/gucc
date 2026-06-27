import { NextRequest, NextResponse } from "next/server"
import { listForms, saveForm } from "@/lib/forms"
import { extractSheetId } from "@/lib/sheets"

export async function GET() {
  const forms = await listForms()
  return NextResponse.json({ data: forms, error: null })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const sheetId = extractSheetId(body.sheetId ?? "")
  if (!sheetId) {
    return NextResponse.json({ data: null, error: "Invalid Google Sheets URL or ID" }, { status: 400 })
  }
  const form = await saveForm({ ...body, sheetId })
  return NextResponse.json({ data: form, error: null }, { status: 201 })
}