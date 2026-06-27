import { Input } from "@/components/ui/input"
import { FormField } from "@/types/form"

export default function PhoneField({ field }: { field: FormField }) {
  return (
    <Input
      type="tel"
      placeholder={field.placeholder || "+880 1XXX-XXXXXX"}
      disabled
      className="pointer-events-none"
    />
  )
}