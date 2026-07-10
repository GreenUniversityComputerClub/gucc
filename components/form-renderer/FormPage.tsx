"use client"

import { FormField } from "@/types/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Star, Upload } from "lucide-react"
import { useState, useRef } from "react"

interface Props {
  fields: FormField[]
  values: Record<string, string>
  errors: Record<string, string>
  onChange: (fieldId: string, value: string) => void
  onUploadingChange?: (fieldId: string, uploading: boolean) => void
  sheetId: string
}

// Only the FormPage function needs to change — FieldRenderer stays identical

export default function FormPage({ fields, values, errors, onChange, onUploadingChange, sheetId }: Props) {
  // Group fields: consecutive "half" fields go into the same row (max 2 per row),
  // "full" fields always get their own row.
  const rows: FormField[][] = []
  let i = 0
  while (i < fields.length) {
    const current = fields[i]
    if (current.width === "half" && fields[i + 1]?.width === "half") {
      rows.push([current, fields[i + 1]])
      i += 2
    } else {
      rows.push([current])
      i += 1
    }
  }

  return (
    <div className="space-y-5">
      {rows.map((row, rowIdx) =>
        row.length === 2 ? (
          // Two half-width fields → side by side
          <div key={rowIdx} className="flex gap-4">
            {row.map((field) => (
              <div key={field.id} className="flex-1 min-w-0">
                <FieldRenderer
                  field={field}
                  value={values[field.id] ?? ""}
                  error={errors[field.id]}
                  onChange={(v) => onChange(field.id, v)}
                  onUploadingChange={(u) => onUploadingChange?.(field.id, u)}
                  sheetId={sheetId}
                />
              </div>
            ))}
          </div>
        ) : (
          // Single field (full or solo half) → full row
          <FieldRenderer
            key={row[0].id}
            field={row[0]}
            value={values[row[0].id] ?? ""}
            error={errors[row[0].id]}
            onChange={(v) => onChange(row[0].id, v)}
            onUploadingChange={(u) => onUploadingChange?.(row[0].id, u)}
            sheetId={sheetId}
          />
        )
      )}
    </div>
  )
}


function FieldRenderer({
  field,
  value,
  error,
  onChange,
  onUploadingChange,
  sheetId,
}: {
  field: FormField
  value: string
  error?: string
  onChange: (v: string) => void
  onUploadingChange?: (uploading: boolean) => void
  sheetId: string
}) {
  const [hoverRating, setHoverRating] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!sheetId) {
      setUploadError("This form isn't connected to a Google Sheet yet, so there's nowhere to store the file.")
      return
    }
    setFileName(file.name)
    setUploading(true)
    onUploadingChange?.(true)
    setUploadError(null)
    onChange("") // clear any previous value until this upload resolves
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("fieldId", field.id)
      fd.append("sheetId", sheetId)
      const res = await fetch("/api/upload", { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok || json.error) {
        setUploadError(json.error ?? "Upload failed. Please try again.")
        return
      }
      if (json.url) onChange(json.url)
    } catch {
      setUploadError("Upload failed — check your connection and try again.")
    } finally {
      setUploading(false)
      onUploadingChange?.(false)
    }
  }


  return (
    <div className={`space-y-1.5`}>
      <Label className="text-sm font-medium">
        {field.label}
        {field.required && <span className="text-destructive ml-1">*</span>}
        {field.isUnique && (
          <span className="ml-2 text-[10px] text-muted-foreground font-normal">(unique)</span>
        )}
      </Label>

      {field.helpText && (
        <p className="text-xs text-muted-foreground">{field.helpText}</p>
      )}

      {/* Text / Email / URL / Phone / Time */}
      {["text", "email", "url", "phone", "time"].includes(field.type) && (
        <Input
          type={field.type === "phone" ? "tel" : field.type}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={error ? "border-destructive" : ""}
          {...field.customAttributes}
        />
      )}

      {/* Number */}
      {field.type === "number" && (
        <Input
          type="number"
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
          step={field.step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={error ? "border-destructive" : ""}
          {...field.customAttributes}
        />
      )}

      {/* Date */}
      {field.type === "date" && (
        <Input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={error ? "border-destructive" : ""}
          {...field.customAttributes}
        />
      )}

      {/* Textarea */}
      {field.type === "textarea" && (
        <Textarea
          placeholder={field.placeholder}
          rows={field.rows ?? 4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`resize-none ${error ? "border-destructive" : ""}`}
          {...field.customAttributes}
        />
      )}

      {/* Select */}
      {field.type === "select" && (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className={error ? "border-destructive" : ""}>
            <SelectValue placeholder={field.placeholder || "Select..."} />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Radio */}
      {field.type === "radio" && (
        <RadioGroup value={value} onValueChange={onChange} className="space-y-1.5">
          {(field.options ?? []).map((opt) => (
            <div key={opt.value} className="flex items-center gap-2">
              <RadioGroupItem value={opt.value} id={`${field.id}-${opt.value}`} />
              <Label htmlFor={`${field.id}-${opt.value}`} className="font-normal text-sm cursor-pointer">
                {opt.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      )}

      {/* Checkbox */}
      {field.type === "checkbox" && (
        <div className="space-y-1.5">
          {(field.options ?? []).map((opt) => {
            const selected = value.split(",").filter(Boolean)
            const checked = selected.includes(opt.value)
            return (
              <div key={opt.value} className="flex items-center gap-2">
                <Checkbox
                  id={`${field.id}-${opt.value}`}
                  checked={checked}
                  onCheckedChange={(c) => {
                    const next = c
                      ? [...selected, opt.value]
                      : selected.filter((v) => v !== opt.value)
                    onChange(next.join(","))
                  }}
                />
                <Label htmlFor={`${field.id}-${opt.value}`} className="font-normal text-sm cursor-pointer">
                  {opt.label}
                </Label>
              </div>
            )
          })}
        </div>
      )}

      {/* Rating */}
      {field.type === "rating" && (
        <div className="flex gap-1">
          {Array.from({ length: field.max ?? 5 }).map((_, i) => {
            const val = i + 1
            const active = val <= (hoverRating || Number(value))
            return (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setHoverRating(val)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => onChange(String(val))}
              >
                <Star
                  className={`h-7 w-7 transition-colors ${active ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"
                    }`}
                />
              </button>
            )
          })}
          {value && (
            <span className="ml-2 text-sm text-muted-foreground self-center">
              {value} / {field.max ?? 5}
            </span>
          )}
        </div>
      )}

      {/* Range */}
      {field.type === "range" && (
        <div className="space-y-1">
          <input
            type="range"
            min={field.min ?? 0}
            max={field.max ?? 100}
            step={field.step ?? 1}
            value={value || String(field.min ?? 0)}
            onChange={(e) => onChange(e.target.value)}
            className="w-full accent-primary"
            {...field.customAttributes}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{field.min ?? 0}</span>
            <span className="font-medium text-foreground">{value || (field.min ?? 0)}</span>
            <span>{field.max ?? 100}</span>
          </div>
        </div>
      )}

      {/* Color */}
      {field.type === "color" && (
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={value || "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="h-10 w-16 rounded cursor-pointer border"
            {...field.customAttributes}
          />
          <span className="text-sm text-muted-foreground">{value || "#000000"}</span>
        </div>
      )}

      {/* File / Image */}
      {(field.type === "file" || field.type === "image") && (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept={field.accept}
            onChange={handleFileChange}
            className="hidden"
          />
          <div
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors ${(error || uploadError) ? "border-destructive" : "border-border"
              }`}
          >
            <Upload className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {uploading
                ? "Uploading..."
                : fileName
                  ? fileName
                  : `Click to upload${field.accept ? ` (${field.accept})` : ""}`}
            </p>
          </div>
          {/* Confirms exactly where the file ended up, and lets the user verify it */}
          {value && !uploading && !uploadError && (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary underline mt-1 inline-block"
            >
              View uploaded file
            </a>
          )}
          {uploadError && (
            <p className="text-xs text-destructive mt-1">{uploadError}</p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}