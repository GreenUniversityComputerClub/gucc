import Link from "next/link"
import { listForms } from "@/lib/forms"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, ExternalLink, Edit, Eye } from "lucide-react"
import { FormConfig } from "@/types/form"
import DeleteFormButton from "./_components/DeleteFormButton"

export default async function FormsPage() {
  const forms = await listForms()

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Form Builder</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Build forms that write directly to Google Sheets
          </p>
        </div>
        <Button asChild>
          <Link href="/forms/new">
            <Plus className="h-4 w-4 mr-2" /> New Form
          </Link>
        </Button>
      </div>

      {forms.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl p-16 text-center space-y-3">
          <p className="text-muted-foreground">No forms yet</p>
          <Button asChild variant="outline">
            <Link href="/forms/new">Create your first form</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {forms.map((form) => (
            <FormCard key={form.id} form={form} />
          ))}
        </div>
      )}
    </div>
  )
}

function FormCard({ form }: { form: FormConfig }) {
  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-base truncate">{form.title}</CardTitle>
        {form.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{form.description}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs">
            {form.fields.length} field{form.fields.length !== 1 ? "s" : ""}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {form.pages.length} page{form.pages.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        <p className="text-[10px] text-muted-foreground truncate">
          Sheet: {form.sheetId || "Not connected"}
        </p>
        <div className="flex items-center gap-2 pt-1">
          <Button asChild size="sm" variant="outline" className="flex-1 h-8 text-xs">
            <Link href={`/forms/${form.id}/edit`}>
              <Edit className="h-3.5 w-3.5 mr-1" /> Edit
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="h-8 w-8 p-0">
            <Link href={`/forms/${form.id}/preview`}>
              <Eye className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="h-8 w-8 p-0">
            <Link href={`/forms/${form.id}/submit`} target="_blank">
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <DeleteFormButton formId={form.id} />
        </div>
      </CardContent>
    </Card>
  )
}