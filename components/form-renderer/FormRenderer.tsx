"use client"

import { useState } from "react"
import { FormConfig } from "@/types/form"
import FormPage from "./FormPage"
import SubmitHandler from "./SubmitHandler"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { CheckCircle2 } from "lucide-react"

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

  const totalPages = form.pages.length
  const progress = ((currentPage + 1) / totalPages) * 100

  const pageFields = form.fields.filter((f) => f.pageIndex === currentPage)

  const setValue = (fieldId: string, value: string) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }))
    if (errors[fieldId]) setErrors((prev) => { const n = { ...prev }; delete n[fieldId]; return n })
  }

  const validatePage = () => {
    const newErrors: Record<string, string> = {}
    for (const field of pageFields) {
      if (field.required && !values[field.id]?.trim()) {
        newErrors[field.id] = `${field.label} is required`
      }
      if (field.type === "email" && values[field.id]) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[field.id])) {
          newErrors[field.id] = "Enter a valid email address"
        }
      }
      if (field.type === "url" && values[field.id]) {
        try { new URL(values[field.id]) } catch {
          newErrors[field.id] = "Enter a valid URL"
        }
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (!validatePage()) return
    setCurrentPage((p) => Math.min(p + 1, totalPages - 1))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleBack = () => {
    setCurrentPage((p) => Math.max(p - 1, 0))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleSubmit = async () => {
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
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{form.title}</h1>
        {form.description && <p className="text-muted-foreground">{form.description}</p>}
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

      {/* Fields */}
      <FormPage
        fields={pageFields}
        values={values}
        errors={errors}
        onChange={setValue}
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
          <Button onClick={handleNext}>Next</Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting..." : (form.submitLabel ?? "Submit")}
          </Button>
        )}
      </div>
    </div>
  )
}