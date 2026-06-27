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
}

export default function FormPage({ fields, values, errors, onChange }: Props) {
  return (
    <div className="space-y-5">
      {fields.map((field) => (
        <FieldRenderer
          key={field.id}
          field={field}
          value={values[field.id] ?? ""}
          error={errors[field.id]}
          onChange={(v) => onChange(field.id, v)}
        />
      ))}
    </div>
  )
}

function FieldRenderer({
  field,
  value,
  error,
  onChange,
}: {
  field: FormField
  value: string
  error?: string
  onChange: (v: string) => void
}) {
  const [hoverRating, setHoverRating] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("fieldId", field.id)
      const res = await fetch("/api/upload", { method: "POST", body: fd })
      const json = await res.json()
      if (json.url) onChange(json.url)
    } catch {
      onChange("[upload failed]")
    } finally {
      setUploading(false)
    }
  }

  const wrapperClass = field.width === "half" ? "w-1/2" : "w-full"

  return (
    <div className={`${wrapperClass} space-y-1.5`}>
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
        />
      )}

      {/* Date */}
      {field.type === "date" && (
        <Input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={error ? "border-destructive" : ""}
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
                  className={`h-7 w-7 transition-colors ${
                    active ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"
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
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{field.min ?? 0}</span>
            <span className="font-medium text-foreground">{value || field.min ?? 0}</span>
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
            className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors ${
              error ? "border-destructive" : "border-border"
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
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}