import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { FormField } from "@/types/form"

export default function CheckboxField({ field }: { field: FormField }) {
  return (
    <div className="space-y-2">
      {(field.options ?? []).map((opt) => (
        <div key={opt.value} className="flex items-center gap-2">
          <Checkbox id={opt.value} disabled />
          <Label htmlFor={opt.value} className="font-normal text-sm">
            {opt.label}
          </Label>
        </div>
      ))}
    </div>
  )
}