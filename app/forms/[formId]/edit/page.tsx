import { requireExecutive } from "@/lib/auth/require-executive"
import EditFormClient from "./EditFormClient"

interface Props { params: Promise<{ formId: string }> }

export default async function EditFormPage({ params }: Props) {
  const { formId } = await params
  await requireExecutive(`/forms/${formId}/edit`)
  return <EditFormClient />
}
