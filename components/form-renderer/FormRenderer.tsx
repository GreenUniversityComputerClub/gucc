"use client"

import { useEffect, useState } from "react"
import { FormConfig } from "@/types/form"
import { validateFields } from "@/lib/validation"
import FormPage from "./FormPage"
import SubmitHandler from "./SubmitHandler"
import RichText from "./RichText"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { CheckCircle2, FileText, Loader2 } from "lucide-react"

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

  // Saving a response takes a couple of Google Sheets round-trips — guard against
  // someone closing/refreshing mid-submit and assuming it silently failed.
  useEffect(() => {
    if (!submitting) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [submitting])

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
    const willRedirect = form.successAction === "redirect" && !!form.redirectUrl?.trim()

    // Live forms navigate away; in preview we stay put and just show what would happen.
    if (willRedirect && !preview) {
      return <RedirectingScreen url={form.redirectUrl!} delaySeconds={form.redirectDelaySeconds ?? 3} />
    }

    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center text-center p-8 space-y-4">
        {form.successImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={form.successImageUrl}
            alt=""
            className="h-24 w-24 rounded-full object-cover border"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
        )}
        <h2 className="text-xl font-semibold">
          {preview ? "Preview: Form submitted!" : "Response Recorded"}
        </h2>
        <RichText
          html={form.successMessage ?? "Thank you! Your response has been recorded."}
          className="text-muted-foreground max-w-sm"
        />
        {preview && willRedirect && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5 max-w-sm">
            Preview mode — on the live form this would redirect to <span className="font-medium">{form.redirectUrl}</span> after {form.redirectDelaySeconds ?? 3}s instead of showing this screen.
          </p>
        )}
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
      <div className="space-y-3">
        {form.logoUrl && (!form.logoPosition || form.logoPosition === "top") && (
          <Banner url={form.logoUrl} title={form.title} />
        )}

        {form.logoUrl && form.logoPosition === "background" ? (
          <div className="relative rounded-xl overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={form.logoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/40 to-black/10" />
            <div className="relative px-6 py-10 space-y-2">
              <h1 className="text-2xl font-bold text-white">{form.title}</h1>
              {form.description && <RichText html={form.description} className="text-white/90" />}
            </div>
          </div>
        ) : form.logoUrl && (form.logoPosition === "left" || form.logoPosition === "right") ? (
          <div className={`flex gap-4 items-start ${form.logoPosition === "right" ? "flex-row-reverse" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={form.logoUrl}
              alt=""
              className="h-24 w-24 sm:h-32 sm:w-32 rounded-lg object-cover shrink-0 border"
            />
            <div className="space-y-2 min-w-0">
              <h1 className="text-2xl font-bold">{form.title}</h1>
              {form.description && <RichText html={form.description} className="text-muted-foreground" />}
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold">{form.title}</h1>
            {form.description && <RichText html={form.description} className="text-muted-foreground" />}
            {form.logoUrl && form.logoPosition === "below-description" && (
              <Banner url={form.logoUrl} title={form.title} />
            )}
          </>
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
        <RichText
          html={form.pages[currentPage]!.description!}
          className="text-sm text-muted-foreground bg-muted/40 rounded-md px-3 py-2"
        />
      )}

      {/* Fields */}
      <FormPage
        fields={pageFields}
        values={values}
        errors={errors}
        onChange={setValue}
        onUploadingChange={handleUploadingChange}
        formId={form.id}
      />

      {/* Error */}
      {submitError && (
        <p className="text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-md">
          {submitError}
        </p>
      )}

      {/* Navigation */}
      <div className="space-y-1.5 pt-2">
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentPage === 0 || submitting}
          >
            Back
          </Button>
          {currentPage < totalPages - 1 ? (
            <Button onClick={handleNext} disabled={anyUploading}>
              {anyUploading ? "Waiting for upload..." : "Next"}
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting || anyUploading}>
              {anyUploading ? (
                "Waiting for upload..."
              ) : submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...
                </>
              ) : (
                form.submitLabel ?? "Submit"
              )}
            </Button>
          )}
        </div>
        {submitting && (
          <p className="text-xs text-muted-foreground text-right">
            Saving your response — this can take a few seconds, please don&apos;t close this page.
          </p>
        )}
      </div>
    </div>
  )
}

function Banner({ url, title }: { url: string; title: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={`${title} banner`} className="w-full max-h-64 object-cover rounded-lg" />
  )
}

function RedirectingScreen({ url, delaySeconds }: { url: string; delaySeconds: number }) {
  const [secondsLeft, setSecondsLeft] = useState(Math.max(0, delaySeconds))

  useEffect(() => {
    if (secondsLeft <= 0) {
      window.location.href = url
      return
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [secondsLeft, url])

  return (
    <div className="min-h-[400px] flex flex-col items-center justify-center text-center p-8 space-y-4">
      <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircle2 className="h-8 w-8 text-green-600" />
      </div>
      <h2 className="text-xl font-semibold">Response Recorded</h2>
      <p className="text-muted-foreground">
        Redirecting you{secondsLeft > 0 ? ` in ${secondsLeft}s` : "..."}
      </p>
      <a href={url} className="text-sm text-primary underline">
        Continue now
      </a>
    </div>
  )
}