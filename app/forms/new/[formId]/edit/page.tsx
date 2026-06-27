"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import FormBuilder from "@/components/form-builder/FormBuilder"
import { FormConfig } from "@/types/form"

export default function EditFormPage() {
  const { formId } = useParams<{ formId: string }>()
  const router = useRouter()
  const [form, setForm] = useState<FormConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/forms/${formId}`)
      .then((r) => r.json())
      .then((json) => { setForm(json.data); setLoading(false) })
  }, [formId])

  const handleSave = async (config: Partial<FormConfig>): Promise<FormConfig> => {
    const res = await fetch(`/api/forms/${formId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    })
    const json = await res.json()
    if (json.error) throw new Error(json.error)
    return json.data as FormConfig
  }

  if (loading) return <div className="flex items-center justify-center h-screen text-muted-foreground">Loading...</div>
  if (!form) return <div className="flex items-center justify-center h-screen text-destructive">Form not found</div>

  return (
    <FormBuilder
      initial={form}
      onSave={handleSave}
      onPreview={(id) => router.push(`/forms/${id}/preview`)}
    />
  )
}