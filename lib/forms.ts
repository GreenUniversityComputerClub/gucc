import { v4 as uuidv4 } from "uuid"
import type { FormConfig } from "@/types/form"
import { appendToTab, readTab, updateRowById, deleteRowById } from "./master-sheet"

const TAB = "forms"

function rowToForm(row: string[]): FormConfig | null {
  try {
    const [id, title, description, sheetId, sheetName, config_json, createdAt, updatedAt] = row
    if (!id || !config_json) return null
    const parsed = JSON.parse(config_json) as FormConfig
    return { ...parsed, id, title, description, sheetId, sheetName, createdAt, updatedAt }
  } catch {
    return null
  }
}

function formToRow(form: FormConfig): string[] {
  return [
    form.id,
    form.title,
    form.description ?? "",
    form.sheetId,
    form.sheetName,
    JSON.stringify(form),
    form.createdAt,
    form.updatedAt,
  ]
}

export async function listForms(): Promise<FormConfig[]> {
  const rows = await readTab(TAB)
  return rows.map(rowToForm).filter(Boolean) as FormConfig[]
}

export async function getForm(formId: string): Promise<FormConfig | null> {
  const rows = await readTab(TAB)
  const row = rows.find((r) => r[0] === formId)
  if (!row) return null
  return rowToForm(row)
}

// alias used by public submit page
export async function getFormById(formId: string): Promise<FormConfig | null> {
  return getForm(formId)
}

export async function saveForm(
  config: Partial<FormConfig> & { id?: string }
): Promise<FormConfig> {
  const now = new Date().toISOString()
  const isNew = !config.id
  const formId = config.id ?? uuidv4()
  const existing = isNew ? null : await getForm(formId)

  const form: FormConfig = {
    id: formId,
    userId: "",
    createdByEmail: config.createdByEmail ?? existing?.createdByEmail ?? "",
    pendingDeleteRequestedByEmail: config.pendingDeleteRequestedByEmail ?? existing?.pendingDeleteRequestedByEmail ?? "",
    pendingDeleteToken: config.pendingDeleteToken ?? existing?.pendingDeleteToken ?? "",
    pendingDeleteApproved: config.pendingDeleteApproved ?? existing?.pendingDeleteApproved ?? false,
    pendingDeleteRequestedAt: config.pendingDeleteRequestedAt ?? existing?.pendingDeleteRequestedAt ?? "",
    title: config.title ?? existing?.title ?? "Untitled Form",
    description: config.description ?? existing?.description ?? "",
    logoUrl: config.logoUrl ?? existing?.logoUrl ?? "",
    logoPosition: config.logoPosition ?? existing?.logoPosition ?? "top",
    rulebookUrl: config.rulebookUrl ?? existing?.rulebookUrl ?? "",
    rulebookFileName: config.rulebookFileName ?? existing?.rulebookFileName ?? "",
    driveFolderId: config.driveFolderId ?? existing?.driveFolderId ?? "",
    sheetId: config.sheetId ?? existing?.sheetId ?? "",
    sheetName: config.sheetName ?? existing?.sheetName ?? "Sheet1",
    fields: config.fields ?? existing?.fields ?? [],
    pages: config.pages ?? existing?.pages ?? [{ title: "Page 1" }],
    submitLabel: config.submitLabel ?? existing?.submitLabel ?? "Submit",
    successMessage: config.successMessage ?? existing?.successMessage ?? "Thank you! Your response has been recorded.",
    successImageUrl: config.successImageUrl ?? existing?.successImageUrl ?? "",
    successAction: config.successAction ?? existing?.successAction ?? "message",
    redirectUrl: config.redirectUrl ?? existing?.redirectUrl ?? "",
    redirectDelaySeconds: config.redirectDelaySeconds ?? existing?.redirectDelaySeconds ?? 3,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  const row = formToRow(form)
  if (isNew) {
    await appendToTab(TAB, row)
  } else {
    await updateRowById(TAB, formId, row)
  }
  return form
}

export async function deleteForm(formId: string): Promise<void> {
  await deleteRowById(TAB, formId)
}