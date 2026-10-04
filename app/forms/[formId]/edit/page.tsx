import { redirect } from "next/navigation"
import { getForm } from "@/lib/forms"
import { isFormOwner } from "@/lib/form-ownership"
import { requireExecutive } from "@/lib/auth/require-executive"
import EditFormClient from "./EditFormClient"

interface Props { params: Promise<{ formId: string }> }

export default async function EditFormPage({ params }: Props) {
  const { formId } = await params
  const user = await requireExecutive(`/forms/${formId}/edit`)

  // Someone else's form is view-only — send them to the preview instead of the editor.
  const form = await getForm(formId)
  if (form && !isFormOwner(form, user.email)) {
    redirect(`/forms/${formId}/preview`)
  }

  return <EditFormClient />
}
