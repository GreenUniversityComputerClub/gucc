import { NextRequest, NextResponse } from "next/server"
import { listForms, saveForm } from "@/lib/forms"
import { extractSheetId } from "@/lib/sheets"
import { extractFolderId } from "@/lib/drive"

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

  let driveFolderId = body.driveFolderId ?? ""
  if (driveFolderId) {
    const extracted = extractFolderId(driveFolderId)
    if (!extracted) {
      return NextResponse.json({ data: null, error: "Invalid Google Drive folder URL or ID" }, { status: 400 })
    }
    driveFolderId = extracted
  }

  const form = await saveForm({ ...body, sheetId, driveFolderId })
  return NextResponse.json({ data: form, error: null }, { status: 201 })
}