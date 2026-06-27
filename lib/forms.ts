import { createClient } from "@/lib/supabase/server"
import type { FormConfig } from "@/types/form"
import { v4 as uuidv4 } from "uuid"

const BUCKET = "form-configs"

function formPath(userId: string, formId: string) {
  return `${userId}/${formId}.json`
}

export async function listForms(userId: string): Promise<FormConfig[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(BUCKET).list(userId, {
    limit: 100,
    sortBy: { column: "created_at", order: "desc" },
  })
  if (error || !data) return []

  const forms: FormConfig[] = []
  for (const file of data) {
    if (!file.name.endsWith(".json")) continue
    const formId = file.name.replace(".json", "")
    const form = await getForm(userId, formId)
    if (form) forms.push(form)
  }
  return forms
}

export async function getForm(
  userId: string,
  formId: string
): Promise<FormConfig | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(formPath(userId, formId))
  if (error || !data) return null
  try {
    return JSON.parse(await data.text()) as FormConfig
  } catch {
    return null
  }
}

export async function getFormById(formId: string): Promise<FormConfig | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(`index/${formId}.json`)
  if (error || !data) return null
  try {
    const { userId } = JSON.parse(await data.text()) as { userId: string }
    return await getForm(userId, formId)
  } catch {
    return null
  }
}

export async function saveForm(
  userId: string,
  config: Partial<FormConfig> & { id?: string }
): Promise<FormConfig> {
  const supabase = await createClient()
  const now = new Date().toISOString()
  const formId = config.id ?? uuidv4()
  const existing = config.id ? await getForm(userId, formId) : null

  const form: FormConfig = {
    id: formId,
    userId,
    title: config.title ?? "Untitled Form",
    description: config.description ?? "",
    sheetId: config.sheetId ?? "",
    sheetName: config.sheetName ?? "Sheet1",
    fields: config.fields ?? [],
    pages: config.pages ?? [{ title: "Page 1" }],
    submitLabel: config.submitLabel ?? "Submit",
    successMessage: config.successMessage ?? "Thank you! Your response has been recorded.",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  const blob = new Blob([JSON.stringify(form, null, 2)], { type: "application/json" })
  await supabase.storage.from(BUCKET).upload(formPath(userId, formId), blob, { upsert: true })

  const indexBlob = new Blob([JSON.stringify({ userId, formId })], { type: "application/json" })
  await supabase.storage.from(BUCKET).upload(`index/${formId}.json`, indexBlob, { upsert: true })

  return form
}

export async function deleteForm(userId: string, formId: string): Promise<void> {
  const supabase = await createClient()
  await supabase.storage.from(BUCKET).remove([
    formPath(userId, formId),
    `index/${formId}.json`,
  ])
}

export async function uploadSubmissionFile(
  formId: string,
  fieldId: string,
  file: File
): Promise<string> {
  const supabase = await createClient()
  const UPLOAD_BUCKET = "form-uploads"
  const ext = file.name.split(".").pop() ?? "bin"
  const path = `${formId}/${fieldId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage.from(UPLOAD_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) throw new Error(`Upload failed: ${error.message}`)

  return supabase.storage.from(UPLOAD_BUCKET).getPublicUrl(path).data.publicUrl
}