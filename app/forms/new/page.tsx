"use client"

import { useRouter } from "next/navigation"
import FormBuilder from "@/components/form-builder/FormBuilder"
import { FormConfig } from "@/types/form"

export default function NewFormPage() {
  const router = useRouter()

  const handleSave = async (config: Partial<FormConfig>): Promise<FormConfig> => {
    const res = await fetch("/api/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    })
    const json = await res.json()
    if (json.error) throw new Error(json.error)
    return json.data as FormConfig
  }

  return (
    <FormBuilder
      onSave={handleSave}
      onPreview={(id) => router.push(`/forms/${id}/preview`)}
    />
  )
}