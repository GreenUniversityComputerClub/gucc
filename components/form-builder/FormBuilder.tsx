"use client"

import { useState, useCallback, useEffect } from "react"
import { v4 as uuidv4 } from "uuid"
import { FormConfig, FormField, FieldType } from "@/types/form"
import FieldPalette from "./FieldPalette"
import FieldEditor from "./FieldEditor"
import PageManager from "@/options/PageManager"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  GripVertical,
  Trash2,
  Copy,
  Eye,
  Save,
  Loader2,
  Settings2,
  AlertCircle,
  CheckCircle2,
  ImagePlus,
  FileText,
  X,
  KeyRound,
} from "lucide-react"

interface FormBuilderProps {
  initial?: FormConfig
  onSave: (config: Partial<FormConfig>) => Promise<FormConfig>
  onPreview?: (formId: string) => void
}

export default function FormBuilder({ initial, onSave, onPreview }: FormBuilderProps) {
  const [title, setTitle] = useState(initial?.title ?? "Untitled Form")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl ?? "")
  const [logoPosition, setLogoPosition] = useState<"top" | "below-description">(
    initial?.logoPosition ?? "top"
  )
  const [rulebookUrl, setRulebookUrl] = useState(initial?.rulebookUrl ?? "")
  const [rulebookFileName, setRulebookFileName] = useState(initial?.rulebookFileName ?? "")
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingRulebook, setUploadingRulebook] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [rulebookError, setRulebookError] = useState<string | null>(null)
  const [driveFolderUrl, setDriveFolderUrl] = useState(initial?.driveFolderId ?? "")
  const [validatingFolder, setValidatingFolder] = useState(false)
  const [folderValid, setFolderValid] = useState<boolean | null>(null)
  const [folderError, setFolderError] = useState<string | null>(null)
  const [folderName, setFolderName] = useState<string | null>(null)
  const [sheetUrl, setSheetUrl] = useState(initial?.sheetId ?? "")
  const [sheetName, setSheetName] = useState(initial?.sheetName ?? "Sheet1")
  const [submitLabel, setSubmitLabel] = useState(initial?.submitLabel ?? "Submit")
  const [successMessage, setSuccessMessage] = useState(
    initial?.successMessage ?? "Thank you! Your response has been recorded."
  )
  const [fields, setFields] = useState<FormField[]>(initial?.fields ?? [])
  const [pages, setPages] = useState(initial?.pages ?? [{ title: "Page 1" }])
  const [currentPage, setCurrentPage] = useState(0)
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle")
  const [validating, setValidating] = useState(false)
  const [sheetValid, setSheetValid] = useState<boolean | null>(null)
  const [sheetError, setSheetError] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [dragFieldId, setDragFieldId] = useState<string | null>(null)
  const [savedFormId, setSavedFormId] = useState<string | null>(initial?.id ?? null)
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string | null>(null)
  const [serviceAccountError, setServiceAccountError] = useState<string | null>(null)
  const [emailCopied, setEmailCopied] = useState(false)

  useEffect(() => {
    fetch("/api/config/service-account")
      .then((res) => res.json())
      .then((json) => {
        if (json.error) setServiceAccountError(json.error)
        else setServiceAccountEmail(json.data?.email ?? null)
      })
      .catch(() => setServiceAccountError("Could not load service account info."))
  }, [])

  const pageFields = fields.filter((f) => f.pageIndex === currentPage)
  const selectedField = fields.find((f) => f.id === selectedFieldId) ?? null

  // ── Field operations ──────────────────────────────────────────
  const addField = useCallback(
    (type: FieldType) => {
      const newField: FormField = {
        id: uuidv4(),
        type,
        label: labelFor(type),
        placeholder: "",
        helpText: "",
        required: false,
        isUnique: false,
        pageIndex: currentPage,
        width: "full",
        ...(type === "select" || type === "radio" || type === "checkbox"
          ? { options: [{ label: "Option 1", value: "option_1" }] }
          : {}),
        ...(type === "rating" ? { min: 1, max: 5 } : {}),
        ...(type === "range" ? { min: 0, max: 100, step: 1 } : {}),
        ...(type === "textarea" ? { rows: 4 } : {}),
        ...(type === "file" ? { accept: "*/*" } : {}),
        ...(type === "image" ? { accept: "image/*" } : {}),
      }
      setFields((prev) => [...prev, newField])
      setSelectedFieldId(newField.id)
    },
    [currentPage]
  )

  const updateField = useCallback((id: string, patch: Partial<FormField>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }, [])

  const removeField = useCallback(
    (id: string) => {
      setFields((prev) => prev.filter((f) => f.id !== id))
      if (selectedFieldId === id) setSelectedFieldId(null)
    },
    [selectedFieldId]
  )

  const duplicateField = useCallback((field: FormField) => {
    const copy: FormField = { ...field, id: uuidv4() }
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === field.id)
      const next = [...prev]
      next.splice(idx + 1, 0, copy)
      return next
    })
    setSelectedFieldId(copy.id)
  }, [])

  // ── Drag reorder ──────────────────────────────────────────────
  const handleDragStart = (id: string) => setDragFieldId(id)

  const handleDrop = (targetId: string) => {
    if (!dragFieldId || dragFieldId === targetId) return
    setFields((prev) => {
      const from = prev.findIndex((f) => f.id === dragFieldId)
      const to = prev.findIndex((f) => f.id === targetId)
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
    setDragFieldId(null)
    setDragOverIndex(null)
  }

  // ── Logo / Rule book uploads ────────────────────────────────────
  const uploadAsset = async (file: File, fieldId: "form-logo" | "form-rulebook") => {
    const fd = new FormData()
    fd.append("file", file)
    fd.append("fieldId", fieldId)
    fd.append("folderId", driveFolderUrl)
    const res = await fetch("/api/upload", { method: "POST", body: fd })
    const json = await res.json()
    if (!res.ok || json.error) throw new Error(json.error ?? "Upload failed")
    return json as { url: string; fileName: string }
  }

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!driveFolderUrl.trim()) {
      setLogoError("Add your Google Drive folder link below first — uploads are stored there.")
      e.target.value = ""
      return
    }
    setUploadingLogo(true)
    setLogoError(null)
    try {
      const { url } = await uploadAsset(file, "form-logo")
      setLogoUrl(url)
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploadingLogo(false)
      e.target.value = ""
    }
  }

  const handleRulebookChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!driveFolderUrl.trim()) {
      setRulebookError("Add your Google Drive folder link below first — uploads are stored there.")
      e.target.value = ""
      return
    }
    setUploadingRulebook(true)
    setRulebookError(null)
    try {
      const { url, fileName } = await uploadAsset(file, "form-rulebook")
      setRulebookUrl(url)
      setRulebookFileName(fileName)
    } catch (err) {
      setRulebookError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploadingRulebook(false)
      e.target.value = ""
    }
  }

  const validateFolder = async () => {
    if (!driveFolderUrl.trim()) return
    setValidatingFolder(true)
    setFolderError(null)
    try {
      const params = new URLSearchParams({ folderId: driveFolderUrl })
      const res = await fetch(`/api/drive/validate?${params}`)
      const json = await res.json()
      if (!res.ok || json.error) {
        setFolderValid(false)
        setFolderError(json.error ?? "Could not verify this folder")
        setFolderName(null)
      } else {
        setFolderValid(true)
        setFolderName(json.data?.name ?? null)
      }
    } catch {
      setFolderValid(false)
      setFolderError("Network error while verifying folder")
    } finally {
      setValidatingFolder(false)
    }
  }

  // ── Sheet validation ──────────────────────────────────────────
  const validateSheet = async () => {
    if (!sheetUrl.trim()) return
    setValidating(true)
    setSheetError(null)
    setSheetValid(null)
    try {
      const params = new URLSearchParams({ sheetId: sheetUrl, sheetName })
      const res = await fetch(`/api/sheets/validate?${params}`)
      const json = await res.json()
      if (json.error) {
        setSheetValid(false)
        setSheetError(json.error)
      } else {
        setSheetValid(true)
      }
    } catch {
      setSheetValid(false)
      setSheetError("Failed to validate. Check your internet connection.")
    } finally {
      setValidating(false)
    }
  }

  // ── Save ──────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    setSaveStatus("idle")
    try {
      const saved = await onSave({
        id: savedFormId ?? undefined,
        title,
        description,
        logoUrl,
        logoPosition,
        rulebookUrl,
        rulebookFileName,
        driveFolderId: driveFolderUrl,
        sheetId: sheetUrl,
        sheetName,
        fields,
        pages,
        submitLabel,
        successMessage,
      })
      setSavedFormId(saved.id)
      setSaveStatus("success")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch {
      setSaveStatus("error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Left: Field Palette */}
      <aside className="w-60 shrink-0 border-r overflow-y-auto p-3">
        <FieldPalette onAdd={addField} />
      </aside>

      {/* Center: Canvas */}
      <main className="flex-1 overflow-y-auto flex flex-col">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-background border-b px-6 py-3 flex items-center gap-3">
          {/* Logo */}
          <label className="relative shrink-0 h-10 w-10 rounded-md border border-dashed flex items-center justify-center cursor-pointer hover:bg-muted/50 overflow-hidden group">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoChange}
              disabled={uploadingLogo}
            />
            {uploadingLogo ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : logoUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="Form logo" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    setLogoUrl("")
                  }}
                  className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/50 text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <ImagePlus className="h-4 w-4 text-muted-foreground" />
            )}
          </label>
          <div className="flex-1 min-w-0">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-lg font-semibold border-none shadow-none focus-visible:ring-0 px-0 h-auto"
              placeholder="Form title..."
            />
            {logoError && <p className="text-[11px] text-destructive">{logoError}</p>}
            {logoUrl && (
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                Logo position:
                <select
                  value={logoPosition}
                  onChange={(e) => setLogoPosition(e.target.value as "top" | "below-description")}
                  className="text-[11px] border rounded px-1 py-0.5 bg-background"
                >
                  <option value="top">Top, above title</option>
                  <option value="below-description">Below description</option>
                </select>
              </label>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {saveStatus === "success" && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> Saved
              </span>
            )}
            {saveStatus === "error" && (
              <span className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" /> Save failed
              </span>
            )}
            {savedFormId && onPreview && (
              <Button variant="outline" size="sm" onClick={() => onPreview(savedFormId)}>
                <Eye className="h-4 w-4 mr-1" /> Preview
              </Button>
            )}
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save
            </Button>
          </div>
        </div>

        <div className="flex-1 px-6 py-6 max-w-3xl mx-auto w-full space-y-6">
          {/* Form meta */}
          <Card>
            <CardContent className="pt-5 space-y-3">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Form description (optional)..."
                rows={2}
                className="resize-none border-none shadow-none focus-visible:ring-0 px-0 text-sm text-muted-foreground"
              />

              {/* Rule book / attachment PDF, shown alongside the description */}
              <div className="flex items-center gap-2">
                {rulebookUrl ? (
                  <div className="flex items-center gap-2 text-xs bg-muted rounded-md px-2.5 py-1.5">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <a
                      href={rulebookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline truncate max-w-[220px]"
                    >
                      {rulebookFileName || "Rule Book.pdf"}
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setRulebookUrl("")
                        setRulebookFileName("")
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-1.5 text-xs border rounded-md px-2.5 py-1.5 cursor-pointer hover:bg-muted/50 text-muted-foreground">
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={handleRulebookChange}
                      disabled={uploadingRulebook}
                    />
                    {uploadingRulebook ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileText className="h-3.5 w-3.5" />
                    )}
                    {uploadingRulebook ? "Uploading..." : "Attach Rule Book (PDF)"}
                  </label>
                )}
                {rulebookError && (
                  <span className="text-[11px] text-destructive">{rulebookError}</span>
                )}
              </div>

              <Separator />

              {/* Setup instructions + the email that needs Editor access */}
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-medium flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" /> Google Sheets & Drive access
                </p>
                <ol className="text-[11px] text-muted-foreground list-decimal list-inside space-y-0.5">
                  <li>Create or open the Google Sheet you want responses saved to, and share it with the email below as <span className="font-medium">Editor</span>. Paste its URL and click Verify.</li>
                  <li>Create (or pick) a Google Drive folder for uploads — logos, rule books, and any file/image fields people submit. Share that folder with the same email as <span className="font-medium">Editor</span>, then paste its URL and click Verify.</li>
                </ol>
                {serviceAccountEmail && (
                  <div className="flex items-center gap-2">
                    <code className="text-[11px] bg-background border rounded px-2 py-1 flex-1 truncate">
                      {serviceAccountEmail}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(serviceAccountEmail)
                        setEmailCopied(true)
                        setTimeout(() => setEmailCopied(false), 2000)
                      }}
                    >
                      {emailCopied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                )}
                {serviceAccountError && (
                  <p className="text-[11px] text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {serviceAccountError}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Google Sheet URL or ID</Label>
                  <div className="flex gap-2">
                    <Input
                      value={sheetUrl}
                      onChange={(e) => {
                        setSheetUrl(e.target.value)
                        setSheetValid(null)
                      }}
                      placeholder="Paste sheet URL..."
                      className="text-xs h-8"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs shrink-0"
                      onClick={validateSheet}
                      disabled={validating || !sheetUrl.trim()}
                    >
                      {validating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Verify"}
                    </Button>
                  </div>
                  {sheetValid === true && (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Sheet connected
                    </p>
                  )}
                  {sheetValid === false && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {sheetError}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Sheet Tab Name</Label>
                  <Input
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                    placeholder="Sheet1"
                    className="text-xs h-8"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Google Drive Folder URL or ID (for uploads)</Label>
                <div className="flex gap-2">
                  <Input
                    value={driveFolderUrl}
                    onChange={(e) => {
                      setDriveFolderUrl(e.target.value)
                      setFolderValid(null)
                    }}
                    placeholder="Paste Drive folder URL..."
                    className="text-xs h-8"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs shrink-0"
                    onClick={validateFolder}
                    disabled={validatingFolder || !driveFolderUrl.trim()}
                  >
                    {validatingFolder ? <Loader2 className="h-3 w-3 animate-spin" /> : "Verify"}
                  </Button>
                </div>
                {folderValid === true && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Connected{folderName ? ` to "${folderName}"` : ""}
                  </p>
                )}
                {folderValid === false && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {folderError}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Page Manager */}
          <PageManager
            pages={pages}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onAddPage={() => {
              setPages((p) => [...p, { title: `Page ${p.length + 1}` }])
              setCurrentPage(pages.length)
            }}
            onRemovePage={(i) => {
              if (pages.length === 1) return
              setPages((p) => p.filter((_, idx) => idx !== i))
              setFields((f) => f.filter((field) => field.pageIndex !== i).map((field) => ({
                ...field,
                pageIndex: field.pageIndex > i ? field.pageIndex - 1 : field.pageIndex,
              })))
              setCurrentPage(Math.max(0, currentPage - 1))
            }}
            onUpdatePage={(i, patch) =>
              setPages((p) => p.map((pg, idx) => (idx === i ? { ...pg, ...patch } : pg)))
            }
          />

          {/* Fields canvas */}
          <div className="space-y-3">
            {pageFields.length === 0 && (
              <div className="border-2 border-dashed rounded-lg p-12 text-center text-muted-foreground text-sm">
                Click a field type on the left to add it here
              </div>
            )}
            {pageFields.map((field) => (
              <div
                key={field.id}
                draggable
                onDragStart={() => handleDragStart(field.id)}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverIndex(fields.findIndex((f) => f.id === field.id))
                }}
                onDrop={() => handleDrop(field.id)}
                onDragEnd={() => {
                  setDragFieldId(null)
                  setDragOverIndex(null)
                }}
                onClick={() => setSelectedFieldId(field.id)}
                className={`group relative border rounded-lg p-4 cursor-pointer transition-all ${
                  selectedFieldId === field.id
                    ? "border-primary ring-1 ring-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/40"
                } ${dragOverIndex === fields.findIndex((f) => f.id === field.id) && dragFieldId !== field.id ? "border-primary/60 bg-primary/5" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1 cursor-grab text-muted-foreground/40 group-hover:text-muted-foreground">
                    <GripVertical className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{field.label}</span>
                      {field.required && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                          Required
                        </Badge>
                      )}
                      {field.isUnique && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                          Unique
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 ml-auto capitalize">
                        {field.type}
                      </Badge>
                    </div>
                    {field.placeholder && (
                      <p className="text-xs text-muted-foreground truncate">{field.placeholder}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); duplicateField(field) }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); removeField(field.id) }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Submit settings */}
          <Card>
            <CardContent className="pt-5 space-y-3">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Settings2 className="h-3.5 w-3.5" /> Submit Settings
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Button Label</Label>
                  <Input
                    value={submitLabel}
                    onChange={(e) => setSubmitLabel(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Success Message</Label>
                  <Input
                    value={successMessage}
                    onChange={(e) => setSuccessMessage(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Right: Field Editor */}
      <aside className="w-72 shrink-0 border-l overflow-y-auto">
        {selectedField ? (
          <FieldEditor
            field={selectedField}
            onChange={(patch) => updateField(selectedField.id, patch)}
            onDelete={() => removeField(selectedField.id)}
          />
        ) : (
          <div className="p-6 text-center text-muted-foreground text-sm mt-12">
            <Settings2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
            Select a field to edit its properties
          </div>
        )}
      </aside>
    </div>
  )
}

function labelFor(type: FieldType): string {
  const map: Record<FieldType, string> = {
    text: "Text Field",
    textarea: "Long Text",
    email: "Email Address",
    phone: "Phone Number",
    number: "Number",
    date: "Date",
    time: "Time",
    url: "Website URL",
    select: "Dropdown",
    checkbox: "Checkboxes",
    radio: "Multiple Choice",
    file: "File Upload",
    image: "Image Upload",
    rating: "Rating",
    color: "Color Picker",
    range: "Slider",
  }
  return map[type] ?? type
}