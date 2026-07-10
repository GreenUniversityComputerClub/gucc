"use client"

import { FormField, SelectOption } from "@/types/form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Trash2, Plus, X } from "lucide-react"
import { v4 as uuidv4 } from "uuid"

interface Props {
  field: FormField
  onChange: (patch: Partial<FormField>) => void
  onDelete: () => void
}

export default function FieldEditor({ field, onChange, onDelete }: Props) {
  const hasOptions = ["select", "radio", "checkbox"].includes(field.type)
  const hasMinMax = ["number", "range", "rating"].includes(field.type)
  const hasAccept = ["file", "image"].includes(field.type)
  const hasRows = field.type === "textarea"

  const addOption = () => {
    const opts = field.options ?? []
    const n = opts.length + 1
    onChange({
      options: [...opts, { label: `Option ${n}`, value: `option_${n}` }],
    })
  }

  const updateOption = (index: number, patch: Partial<SelectOption>) => {
    const opts = [...(field.options ?? [])]
    opts[index] = { ...opts[index], ...patch }
    // auto-sync value from label if value hasn't been manually set
    if (patch.label && !patch.value) {
      opts[index].value = patch.label.toLowerCase().replace(/\s+/g, "_")
    }
    onChange({ options: opts })
  }

  const removeOption = (index: number) => {
    onChange({ options: (field.options ?? []).filter((_, i) => i !== index) })
  }

  // ── Custom HTML attributes (min, max, pattern, maxLength, etc.) ──────
  const customAttrEntries = Object.entries(field.customAttributes ?? {})

  const addCustomAttr = () => {
    onChange({ customAttributes: { ...(field.customAttributes ?? {}), "": "" } })
  }

  const updateCustomAttrKey = (oldKey: string, newKey: string) => {
    const next = { ...(field.customAttributes ?? {}) }
    const value = next[oldKey]
    delete next[oldKey]
    next[newKey] = value
    onChange({ customAttributes: next })
  }

  const updateCustomAttrValue = (key: string, value: string) => {
    onChange({ customAttributes: { ...(field.customAttributes ?? {}), [key]: value } })
  }

  const removeCustomAttr = (key: string) => {
    const next = { ...(field.customAttributes ?? {}) }
    delete next[key]
    onChange({ customAttributes: next })
  }

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold capitalize">{field.type} Field</p>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

      {/* Label */}
      <div className="space-y-1.5">
        <Label className="text-xs">Label *</Label>
        <Input
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="h-8 text-sm"
        />
      </div>

      {/* Placeholder */}
      {!["checkbox", "radio", "rating", "range", "color", "file", "image"].includes(field.type) && (
        <div className="space-y-1.5">
          <Label className="text-xs">Placeholder</Label>
          <Input
            value={field.placeholder ?? ""}
            onChange={(e) => onChange({ placeholder: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
      )}

      {/* Help text */}
      <div className="space-y-1.5">
        <Label className="text-xs">Help Text</Label>
        <Textarea
          value={field.helpText ?? ""}
          onChange={(e) => onChange({ helpText: e.target.value })}
          rows={2}
          className="text-sm resize-none"
        />
      </div>

      {/* Rows (textarea) */}
      {hasRows && (
        <div className="space-y-1.5">
          <Label className="text-xs">Rows</Label>
          <Input
            type="number"
            min={2}
            max={20}
            value={field.rows ?? 4}
            onChange={(e) => onChange({ rows: Number(e.target.value) })}
            className="h-8 text-sm"
          />
        </div>
      )}

      {/* Min / Max / Step */}
      {hasMinMax && (
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Min</Label>
            <Input
              type="number"
              value={field.min ?? ""}
              onChange={(e) => onChange({ min: Number(e.target.value) })}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Max</Label>
            <Input
              type="number"
              value={field.max ?? ""}
              onChange={(e) => onChange({ max: Number(e.target.value) })}
              className="h-8 text-sm"
            />
          </div>
          {field.type === "range" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Step</Label>
              <Input
                type="number"
                value={field.step ?? 1}
                onChange={(e) => onChange({ step: Number(e.target.value) })}
                className="h-8 text-sm"
              />
            </div>
          )}
        </div>
      )}

      {/* Accept (file/image) */}
      {hasAccept && (
        <div className="space-y-1.5">
          <Label className="text-xs">Accepted File Types</Label>
          <Input
            value={field.accept ?? ""}
            onChange={(e) => onChange({ accept: e.target.value })}
            placeholder={field.type === "image" ? "image/*" : ".pdf,.docx"}
            className="h-8 text-sm"
          />
          <p className="text-[10px] text-muted-foreground">
            e.g. image/*, .pdf, .docx — comma separated
          </p>
        </div>
      )}

      {/* Options */}
      {hasOptions && (
        <div className="space-y-2">
          <Label className="text-xs">Options</Label>
          <div className="space-y-1.5">
            {(field.options ?? []).map((opt, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input
                  value={opt.label}
                  onChange={(e) => updateOption(i, { label: e.target.value })}
                  className="h-7 text-xs flex-1"
                  placeholder={`Option ${i + 1}`}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-muted-foreground"
                  onClick={() => removeOption(i)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-xs"
            onClick={addOption}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Option
          </Button>
        </div>
      )}

      {/* Width */}
      <div className="space-y-1.5">
        <Label className="text-xs">Width</Label>
        <div className="flex gap-2">
          {(["full", "half"] as const).map((w) => (
            <button
              key={w}
              onClick={() => onChange({ width: w })}
              className={`flex-1 text-xs py-1.5 rounded border transition-colors ${
                field.width === w
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-muted-foreground"
              }`}
            >
              {w === "full" ? "Full Width" : "Half Width"}
            </button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Custom HTML attributes */}
      <div className="space-y-2">
        <Label className="text-xs">Custom HTML Attributes</Label>
        <p className="text-[10px] text-muted-foreground">
          Applied directly to the input, e.g. min, max, pattern, maxLength, autoComplete, step, list.
          Use camelCase React prop names (maxLength, not maxlength).
        </p>
        <div className="space-y-1.5">
          {customAttrEntries.map(([key, value], i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                value={key}
                onChange={(e) => updateCustomAttrKey(key, e.target.value)}
                placeholder="attribute"
                className="h-7 text-xs flex-1"
              />
              <Input
                value={value}
                onChange={(e) => updateCustomAttrValue(key, e.target.value)}
                placeholder="value"
                className="h-7 text-xs flex-1"
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0 text-muted-foreground"
                onClick={() => removeCustomAttr(key)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={addCustomAttr}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Attribute
        </Button>
      </div>

      <Separator />

      {/* Toggles */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Required</p>
            <p className="text-[10px] text-muted-foreground">User must fill this field</p>
          </div>
          <Switch
            checked={field.required}
            onCheckedChange={(v) => onChange({ required: v })}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Unique</p>
            <p className="text-[10px] text-muted-foreground">Reject duplicate values</p>
          </div>
          <Switch
            checked={field.isUnique}
            onCheckedChange={(v) => onChange({ isUnique: v })}
          />
        </div>
      </div>
    </div>
  )
}