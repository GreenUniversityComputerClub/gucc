"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Trash2, Loader2 } from "lucide-react"

export default function DeleteFormButton({ formId }: { formId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    if (!confirm("Delete this form? This cannot be undone.")) return
    setLoading(true)
    await fetch(`/api/forms/${formId}`, { method: "DELETE" })
    router.refresh()
    setLoading(false)
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
      onClick={handleDelete}
      disabled={loading}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </Button>
  )
}