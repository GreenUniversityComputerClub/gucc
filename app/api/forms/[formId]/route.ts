import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getForm, saveForm, deleteForm } from "@/lib/forms"
import { extractSheetId } from "@/lib/sheets"

interface Params { params: Promise<{ formId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { formId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const form = await getForm(user.id, formId)
  if (!form) return NextResponse.json({ data: null, error: "Form not found" }, { status: 404 })

  return NextResponse.json({ data: form, error: null })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { formId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const existing = await getForm(user.id, formId)
  if (!existing) return NextResponse.json({ data: null, error: "Form not found" }, { status: 404 })

  const body = await req.json()
  if (body.sheetId && body.sheetId !== existing.sheetId) {
    const sheetId = extractSheetId(body.sheetId)
    if (!sheetId) return NextResponse.json({ data: null, error: "Invalid Google Sheets URL or ID" }, { status: 400 })
    body.sheetId = sheetId
  }

  const updated = await saveForm(user.id, { ...body, id: formId })
  return NextResponse.json({ data: updated, error: null })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { formId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const existing = await getForm(user.id, formId)
  if (!existing) return NextResponse.json({ data: null, error: "Form not found" }, { status: 404 })

  await deleteForm(user.id, formId)
  return NextResponse.json({ data: { deleted: true }, error: null })
}