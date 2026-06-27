import { FormField } from "@/types/form"
import { Star } from "lucide-react"

export default function RatingField({ field }: { field: FormField }) {
  const max = field.max ?? 5
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <Star key={i} className="h-6 w-6 text-muted-foreground/40" />
      ))}
    </div>
  )
}