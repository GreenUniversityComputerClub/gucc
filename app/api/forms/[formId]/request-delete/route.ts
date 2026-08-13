import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { getForm, saveForm } from "@/lib/forms"
import { requireExecutiveApi } from "@/lib/auth/require-executive-api"
import { sendEmail, escapeHtml } from "@/lib/email"

interface Params { params: Promise<{ formId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { user, denied } = await requireExecutiveApi(req)
  if (denied) return denied

  const { formId } = await params
  const form = await getForm(formId)
  if (!form) return NextResponse.json({ data: null, error: "Form not found" }, { status: 404 })

  if (!form.createdByEmail) {
    return NextResponse.json(
      { data: null, error: "This form has no recorded creator — you can delete it directly." },
      { status: 400 }
    )
  }
  if (form.createdByEmail === user.email) {
    return NextResponse.json(
      { data: null, error: "You created this form — delete it directly." },
      { status: 400 }
    )
  }

  const token = randomUUID()
  const requestedAt = new Date().toISOString()

  await saveForm({
    id: formId,
    pendingDeleteRequestedByEmail: user.email ?? "",
    pendingDeleteToken: token,
    pendingDeleteApproved: false,
    pendingDeleteRequestedAt: requestedAt,
  })

  const approveUrl = `${req.nextUrl.origin}/api/forms/${formId}/approve-delete?token=${token}`
  const result = await sendEmail({
    to: form.createdByEmail,
    subject: `Delete request for your form "${form.title}"`,
    html: `
      <h2>Delete request</h2>
      <p><strong>${escapeHtml(user.email ?? "Someone")}</strong> wants to delete a form you created: <strong>${escapeHtml(form.title)}</strong>.</p>
      <p>If that's fine, approve it here — this will let them delete it (it does not delete it immediately):</p>
      <p><a href="${approveUrl}" style="display:inline-block;padding:10px 16px;background:#16a34a;color:#fff;border-radius:6px;text-decoration:none;">Approve deletion</a></p>
      <p>If you don't recognize this or don't want it deleted, just ignore this email — nothing happens until you click approve.</p>
    `,
  })

  if (!result.ok) {
    return NextResponse.json(
      { data: null, error: `Request saved, but the notification email failed to send: ${result.error}` },
      { status: 502 }
    )
  }

  return NextResponse.json({ data: { requested: true, sentTo: form.createdByEmail }, error: null })
}
