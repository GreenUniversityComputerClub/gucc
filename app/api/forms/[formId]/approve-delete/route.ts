import { NextRequest, NextResponse } from "next/server"
import { getForm, saveForm } from "@/lib/forms"
import { sendEmail, escapeHtml } from "@/lib/email"

interface Params { params: Promise<{ formId: string }> }

/**
 * Clicked from the delete-request email — deliberately not behind requireExecutive,
 * since the creator may click it from a device with no active session. The token
 * itself (mailed only to the creator) is the credential.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { formId } = await params
  const token = req.nextUrl.searchParams.get("token") ?? ""
  const origin = req.nextUrl.origin
  const dest = (status: string) => NextResponse.redirect(`${origin}/forms/${formId}/delete-approved?status=${status}`)

  const form = await getForm(formId)
  if (!form) return dest("notfound")
  if (!token || !form.pendingDeleteToken || token !== form.pendingDeleteToken) return dest("invalid")
  if (form.pendingDeleteApproved) return dest("already")

  await saveForm({ id: formId, pendingDeleteApproved: true })

  if (form.pendingDeleteRequestedByEmail) {
    await sendEmail({
      to: form.pendingDeleteRequestedByEmail,
      subject: `Deletion approved for "${form.title}"`,
      html: `
        <p><strong>${escapeHtml(form.createdByEmail ?? "The creator")}</strong> approved deleting <strong>${escapeHtml(form.title)}</strong>.</p>
        <p>You can now delete it from the Form Builder's forms list.</p>
      `,
    })
  }

  return dest("ok")
}
