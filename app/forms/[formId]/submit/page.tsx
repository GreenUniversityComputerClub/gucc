import { notFound } from "next/navigation"
import { getFormById } from "@/lib/forms"
import FormRenderer from "@/components/form-renderer/FormRenderer"

interface Props { params: Promise<{ formId: string }> }

export default async function SubmitPage({ params }: Props) {
  const { formId } = await params
  const form = await getFormById(formId)
  if (!form) notFound()

  return (
    <div className="min-h-screen bg-background">
      <FormRenderer form={form} />
    </div>
  )
}