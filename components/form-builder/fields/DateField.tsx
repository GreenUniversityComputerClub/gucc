import { Input } from "@/components/ui/input"
import { FormField } from "@/types/form"

export default function DateField({ field }: { field: FormField }) {
  return (
    <Input
      type={field.type === "time" ? "time" : "date"}
      disabled
      className="pointer-events-none"
    />
  )
}