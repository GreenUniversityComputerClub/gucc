import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getForm } from "@/lib/forms"
import FormRenderer from "@/components/form-renderer/FormRenderer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft, ExternalLink } from "lucide-react"

interface Props { params: Promise<{ formId: string }> }

export default async function PreviewPage({ params }: Props) {
  const { formId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const form = await getForm(user.id, formId)
  if (!form) notFound()

  return (
    <div>
      {/* Preview banner */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="h-7">
          <Link href={`/forms/${formId}/edit`}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to Editor
          </Link>
        </Button>
        <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-xs">
          Preview Mode — submissions won&apos;t be saved
        </Badge>
        <Button asChild size="sm" variant="outline" className="h-7 text-xs ml-auto">
          <Link href={`/forms/${formId}/submit`} target="_blank">
            <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open Live Form
          </Link>
        </Button>
      </div>

      <FormRenderer form={form} preview />
    </div>
  )
}