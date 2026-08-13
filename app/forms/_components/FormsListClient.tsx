"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Search, ExternalLink, Edit, Eye, AlertTriangle, Clock, XCircle } from "lucide-react"
import { FormConfig } from "@/types/form"
import { getFormAvailability } from "@/lib/form-status"
import DeleteFormButton from "./DeleteFormButton"

/** Descriptions are sanitized rich-text HTML — strip tags for the plain-text card preview. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

export default function FormsListClient({ forms, currentUserEmail }: { forms: FormConfig[]; currentUserEmail: string }) {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return forms
    return forms.filter((f) => {
      const haystack = `${f.title} ${stripHtml(f.description ?? "")}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [forms, query])

  return (
    <div className="space-y-5">
      {forms.length > 0 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search forms..."
            className="pl-8 h-9 text-sm"
          />
        </div>
      )}

      {forms.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl p-16 text-center space-y-3">
          <p className="text-muted-foreground">No forms yet</p>
          <Button asChild variant="outline">
            <Link href="/forms/new">Create your first form</Link>
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl p-10 text-center text-sm text-muted-foreground">
          No forms match &quot;{query}&quot;
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((form) => (
            <FormCard key={form.id} form={form} currentUserEmail={currentUserEmail} />
          ))}
        </div>
      )}
    </div>
  )
}

function FormCard({ form, currentUserEmail }: { form: FormConfig; currentUserEmail: string }) {
  const preview = stripHtml(form.description ?? "")
  const updated = new Date(form.updatedAt)
  const updatedLabel = Number.isNaN(updated.getTime())
    ? null
    : updated.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
  const availability = getFormAvailability(form)

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-base truncate">{form.title}</CardTitle>
        {preview && <p className="text-xs text-muted-foreground line-clamp-2">{preview}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {availability.open ? (
            <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50">
              Accepting responses
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground gap-1">
              {availability.reason === "not-started" ? (
                <Clock className="h-3 w-3" />
              ) : (
                <XCircle className="h-3 w-3" />
              )}
              {availability.reason === "not-started"
                ? "Not open yet"
                : availability.reason === "expired"
                  ? "Expired"
                  : "Closed"}
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs">
            {form.fields.length} field{form.fields.length !== 1 ? "s" : ""}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {form.pages.length} page{form.pages.length !== 1 ? "s" : ""}
          </Badge>
          {!form.sheetId && (
            <Badge variant="outline" className="text-xs text-amber-700 border-amber-300 bg-amber-50 gap-1">
              <AlertTriangle className="h-3 w-3" /> No sheet
            </Badge>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground space-y-0.5">
          {updatedLabel && <p>Updated {updatedLabel}</p>}
          {form.createdByEmail && <p className="truncate">Created by {form.createdByEmail}</p>}
        </div>
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
          <DeleteFormButton form={form} currentUserEmail={currentUserEmail} />
        </div>
      </CardContent>
    </Card>
  )
}
