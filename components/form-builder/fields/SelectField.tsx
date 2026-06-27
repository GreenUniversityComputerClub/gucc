import { FormField } from "@/types/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function SelectField({ field }: { field: FormField }) {
  return (
    <Select disabled>
      <SelectTrigger>
        <SelectValue placeholder={field.placeholder || "Select an option..."} />
      </SelectTrigger>
      <SelectContent>
        {(field.options ?? []).map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}