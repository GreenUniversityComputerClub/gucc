import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/types/form"

export default function TextareaField({ field }: { field: FormField }) {
  return (
    <Textarea
      placeholder={field.placeholder}
      rows={field.rows ?? 4}
      disabled
      className="pointer-events-none resize-none"
    />
  )
}