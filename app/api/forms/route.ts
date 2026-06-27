import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { listForms, saveForm } from "@/lib/forms"
import { extractSheetId } from "@/lib/sheets"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const forms = await listForms(user.id)
  return NextResponse.json({ data: forms, error: null })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const sheetId = extractSheetId(body.sheetId ?? "")
  if (!sheetId) {
    return NextResponse.json({ data: null, error: "Invalid Google Sheets URL or ID" }, { status: 400 })
  }

  const form = await saveForm(user.id, { ...body, sheetId })
  return NextResponse.json({ data: form, error: null }, { status: 201 })
}