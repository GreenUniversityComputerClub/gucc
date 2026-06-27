import { NextRequest, NextResponse } from "next/server"
import { getForm, saveForm, deleteForm } from "@/lib/forms"
import { extractSheetId } from "@/lib/sheets"

interface Params { params: Promise<{ formId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { formId } = await params
  const form = await getForm(formId)
  if (!form) return NextResponse.json({ data: null, error: "Form not found" }, { status: 404 })
  return NextResponse.json({ data: form, error: null })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { formId } = await params
  const existing = await getForm(formId)
  if (!existing) return NextResponse.json({ data: null, error: "Form not found" }, { status: 404 })

  const body = await req.json()
  if (body.sheetId && body.sheetId !== existing.sheetId) {
    const sheetId = extractSheetId(body.sheetId)
    if (!sheetId) return NextResponse.json({ data: null, error: "Invalid Sheet URL" }, { status: 400 })
    body.sheetId = sheetId
  }
  const updated = await saveForm({ ...body, id: formId })
  return NextResponse.json({ data: updated, error: null })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { formId } = await params
  const existing = await getForm(formId)
  if (!existing) return NextResponse.json({ data: null, error: "Form not found" }, { status: 404 })
  await deleteForm(formId)
  return NextResponse.json({ data: { deleted: true }, error: null })
}