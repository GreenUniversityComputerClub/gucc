import { NextRequest, NextResponse } from "next/server"
import { getForm, saveForm, deleteForm } from "@/lib/forms"
import { extractSheetId } from "@/lib/sheets"
import { extractFolderId } from "@/lib/drive"
import { requireExecutiveApi } from "@/lib/auth/require-executive-api"

interface Params { params: Promise<{ formId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { denied } = await requireExecutiveApi(req)
  if (denied) return denied

  const { formId } = await params
  const form = await getForm(formId)
  if (!form) return NextResponse.json({ data: null, error: "Form not found" }, { status: 404 })
  return NextResponse.json({ data: form, error: null })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { denied } = await requireExecutiveApi(req)
  if (denied) return denied

  const { formId } = await params
  const existing = await getForm(formId)
  if (!existing) return NextResponse.json({ data: null, error: "Form not found" }, { status: 404 })

  const body = await req.json()
  // These are only ever set by trusted server-side logic (create, request-delete,
  // approve-delete) — never trust a client-supplied value for them here.
  delete body.createdByEmail
  delete body.pendingDeleteRequestedByEmail
  delete body.pendingDeleteToken
  delete body.pendingDeleteApproved
  delete body.pendingDeleteRequestedAt

  if (body.sheetId && body.sheetId !== existing.sheetId) {
    const sheetId = extractSheetId(body.sheetId)
    if (!sheetId) return NextResponse.json({ data: null, error: "Invalid Sheet URL" }, { status: 400 })
    body.sheetId = sheetId
  }
  if (body.driveFolderId && body.driveFolderId !== existing.driveFolderId) {
    const driveFolderId = extractFolderId(body.driveFolderId)
    if (!driveFolderId) return NextResponse.json({ data: null, error: "Invalid Drive folder URL" }, { status: 400 })
    body.driveFolderId = driveFolderId
  }
  const updated = await saveForm({ ...body, id: formId })
  return NextResponse.json({ data: updated, error: null })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { user, denied } = await requireExecutiveApi(req)
  if (denied) return denied

  const { formId } = await params
  const existing = await getForm(formId)
  if (!existing) return NextResponse.json({ data: null, error: "Form not found" }, { status: 404 })

  // Legacy forms saved before creator-tracking existed have no createdByEmail on
  // record — nobody to ask for approval, so fall back to allowing direct deletion.
  const isCreator = !existing.createdByEmail || existing.createdByEmail === user.email
  const isApprovedRequester =
    existing.pendingDeleteApproved && existing.pendingDeleteRequestedByEmail === user.email

  if (!isCreator && !isApprovedRequester) {
    return NextResponse.json(
      {
        data: null,
        error: existing.createdByEmail
          ? `Only ${existing.createdByEmail} (who created this form) can delete it. Request their approval first.`
          : "Only the creator can delete this form.",
        requiresApproval: true,
      },
      { status: 403 }
    )
  }

  await deleteForm(formId)
  return NextResponse.json({ data: { deleted: true }, error: null })
}
