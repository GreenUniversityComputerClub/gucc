import { Input } from "@/components/ui/input"
import { FormField } from "@/types/form"

export default function TextField({ field }: { field: FormField }) {
  return (
    <Input
      type={field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
      placeholder={field.placeholder}
      disabled
      className="pointer-events-none"
    />
  )
}