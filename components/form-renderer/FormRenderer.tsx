"use client"

import { useState } from "react"
import { FormConfig } from "@/types/form"
import { validateFields } from "@/lib/validation"
import FormPage from "./FormPage"
import SubmitHandler from "./SubmitHandler"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { CheckCircle2, FileText } from "lucide-react"

interface Props {
  form: FormConfig
  preview?: boolean
}

export default function FormRenderer({ form, preview = false }: Props) {
  const [currentPage, setCurrentPage] = useState(0)
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [uploadingFields, setUploadingFields] = useState<Set<string>>(new Set())
  const anyUploading = uploadingFields.size > 0

  const handleUploadingChange = (fieldId: string, uploading: boolean) => {
    setUploadingFields((prev) => {
      const next = new Set(prev)
      if (uploading) next.add(fieldId)
      else next.delete(fieldId)
      return next
    })
  }

  const totalPages = form.pages.length
  const progress = ((currentPage + 1) / totalPages) * 100

  const pageFields = form.fields.filter((f) => f.pageIndex === currentPage)

  const setValue = (fieldId: string, value: string) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }))
    if (errors[fieldId]) setErrors((prev) => { const n = { ...prev }; delete n[fieldId]; return n })
  }

  const validatePage = () => {
    const newErrors = validateFields(pageFields, values)
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (anyUploading) return
    if (!validatePage()) return
    setCurrentPage((p) => Math.min(p + 1, totalPages - 1))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleBack = () => {
    setCurrentPage((p) => Math.max(p - 1, 0))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleSubmit = async () => {
    if (anyUploading) return
    if (!validatePage()) return
    if (preview) { setSubmitted(true); return }
    setSubmitting(true)
    setSubmitError(null)
    try {
      await SubmitHandler({ form, values })
      setSubmitted(true)
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed")
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center text-center p-8 space-y-4">
        <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold">
          {preview ? "Preview: Form submitted!" : "Response Recorded"}
        </h2>
        <p className="text-muted-foreground max-w-sm">
          {form.successMessage ?? "Thank you! Your response has been recorded."}
        </p>
        {preview && (
          <Button variant="outline" onClick={() => { setSubmitted(false); setCurrentPage(0); setValues({}) }}>
            Reset Preview
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto w-full space-y-6 py-8 px-4">
      {/* Header */}
      <div className="space-y-2">
        {form.logoUrl && form.logoPosition !== "below-description" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={form.logoUrl}
            alt={`${form.title} logo`}
            className="h-14 w-auto object-contain mb-1"
          />
        )}
        <h1 className="text-2xl font-bold">{form.title}</h1>
        {form.description && <p className="text-muted-foreground">{form.description}</p>}
        {form.logoUrl && form.logoPosition === "below-description" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={form.logoUrl}
            alt={`${form.title} logo`}
            className="h-14 w-auto object-contain"
          />
        )}
        {form.rulebookUrl && (
          <a
            href={form.rulebookUrl}
            download
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline"
          >
            <FileText className="h-4 w-4" />
            {form.rulebookFileName ? `Download ${form.rulebookFileName}` : "Download Rule Book (PDF)"}
          </a>
        )}
      </div>

      {/* Progress */}
      {totalPages > 1 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{form.pages[currentPage]?.title || `Page ${currentPage + 1}`}</span>
            <span>{currentPage + 1} / {totalPages}</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      )}

      {/* Per-segment instructions */}
      {form.pages[currentPage]?.description && (
        <p className="text-sm text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
          {form.pages[currentPage]?.description}
        </p>
      )}

      {/* Fields */}
      <FormPage
        fields={pageFields}
        values={values}
        errors={errors}
        onChange={setValue}
        onUploadingChange={handleUploadingChange}
        driveFolderId={form.driveFolderId ?? ""}
      />

      {/* Error */}
      {submitError && (
        <p className="text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-md">
          {submitError}
        </p>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentPage === 0}
        >
          Back
        </Button>
        {currentPage < totalPages - 1 ? (
          <Button onClick={handleNext} disabled={anyUploading}>
            {anyUploading ? "Waiting for upload..." : "Next"}
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting || anyUploading}>
            {anyUploading ? "Waiting for upload..." : submitting ? "Submitting..." : (form.submitLabel ?? "Submit")}
          </Button>
        )}
      </div>
    </div>
  )
}