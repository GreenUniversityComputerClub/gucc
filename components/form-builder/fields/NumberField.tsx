import { Input } from "@/components/ui/input"
import { FormField } from "@/types/form"

export default function NumberField({ field }: { field: FormField }) {
  if (field.type === "range") {
    return (
      <div className="space-y-1">
        <input
          type="range"
          min={field.min ?? 0}
          max={field.max ?? 100}
          step={field.step ?? 1}
          disabled
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{field.min ?? 0}</span>
          <span>{field.max ?? 100}</span>
        </div>
      </div>
    )
  }
  return (
    <Input
      type="number"
      placeholder={field.placeholder}
      min={field.min}
      max={field.max}
      step={field.step}
      disabled
      className="pointer-events-none"
    />
  )
}