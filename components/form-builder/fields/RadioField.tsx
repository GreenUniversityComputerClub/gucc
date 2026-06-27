import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { FormField } from "@/types/form"

export default function RadioField({ field }: { field: FormField }) {
  return (
    <RadioGroup disabled>
      {(field.options ?? []).map((opt) => (
        <div key={opt.value} className="flex items-center gap-2">
          <RadioGroupItem value={opt.value} id={opt.value} />
          <Label htmlFor={opt.value} className="font-normal text-sm">
            {opt.label}
          </Label>
        </div>
      ))}
    </RadioGroup>
  )
}