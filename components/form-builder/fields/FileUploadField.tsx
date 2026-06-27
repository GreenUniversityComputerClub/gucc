import { FormField } from "@/types/form"
import { Upload, Image as ImageIcon } from "lucide-react"

export default function FileUploadField({ field }: { field: FormField }) {
  const isImage = field.type === "image"
  return (
    <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-2 text-muted-foreground bg-muted/30">
      {isImage ? <ImageIcon className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
      <p className="text-xs">
        {isImage ? "Upload image" : "Upload file"}
        {field.accept && ` (${field.accept})`}
      </p>
    </div>
  )
}