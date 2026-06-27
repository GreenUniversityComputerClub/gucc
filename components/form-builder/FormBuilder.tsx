"use client"

import { useState, useCallback } from "react"
import { v4 as uuidv4 } from "uuid"
import { FormConfig, FormField, FieldType } from "@/types/form"
import FieldPalette from "./FieldPalette"
import FieldEditor from "./FieldEditor"
import PageManager from "./PageManager"
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
} from "lucide-react"

interface FormBuilderProps {
  initial?: FormConfig
  onSave: (config: Partial<FormConfig>) => Promise<FormConfig>
  onPreview?: (formId: string) => void
}

export default function FormBuilder({ initial, onSave, onPreview }: FormBuilderProps) {
  const [title, setTitle] = useState(initial?.title ?? "Untitled Form")
  const [description, setDescription] = useState(initial?.description ?? "")
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
          <div className="flex-1 min-w-0">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-lg font-semibold border-none shadow-none focus-visible:ring-0 px-0 h-auto"
              placeholder="Form title..."
            />
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
              <Separator />
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