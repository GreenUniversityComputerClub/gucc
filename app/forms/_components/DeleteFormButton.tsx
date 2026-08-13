"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Trash2, Loader2, Mail, Clock } from "lucide-react"
import { FormConfig } from "@/types/form"

interface Props {
  form: FormConfig
  currentUserEmail: string
}

export default function DeleteFormButton({ form, currentUserEmail }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const isCreator = !form.createdByEmail || form.createdByEmail === currentUserEmail
  const hasPendingRequest = !!form.pendingDeleteRequestedByEmail
  const isMyPendingRequest = form.pendingDeleteRequestedByEmail === currentUserEmail
  const canDeleteNow = isCreator || (isMyPendingRequest && form.pendingDeleteApproved)

  const handleDelete = async () => {
    if (!confirm(`Delete "${form.title}"? This cannot be undone.`)) return
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/forms/${form.id}`, { method: "DELETE" })
    const json = await res.json()
    if (json.error) {
      setError(json.error)
      setLoading(false)
      return
    }
    router.refresh()
    setLoading(false)
  }

  const handleRequestDelete = async () => {
    if (!confirm(`This form was created by ${form.createdByEmail}. Send them a request to approve deleting it?`)) return
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/forms/${form.id}/request-delete`, { method: "POST" })
    const json = await res.json()
    if (json.error) {
      setError(json.error)
    } else {
      alert(`Delete request sent to ${json.data.sentTo}. You'll be able to delete it once they approve.`)
      router.refresh()
    }
    setLoading(false)
  }

  if (canDeleteNow) {
    return (
      <div className="relative">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
          onClick={handleDelete}
          disabled={loading}
          title="Delete"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
        {error && <ErrorPopover message={error} />}
      </div>
    )
  }

  if (hasPendingRequest) {
    return (
      <div className="relative">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-muted-foreground cursor-default"
          disabled
          title={isMyPendingRequest ? `Waiting for ${form.createdByEmail} to approve` : "Someone else already requested deletion"}
        >
          <Clock className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="ghost"
        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
        onClick={handleRequestDelete}
        disabled={loading}
        title={`Ask ${form.createdByEmail} to approve deleting this`}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
      </Button>
      {error && <ErrorPopover message={error} />}
    </div>
  )
}

function ErrorPopover({ message }: { message: string }) {
  return (
    <p className="absolute right-0 top-full mt-1 w-48 text-[10px] text-destructive bg-destructive/10 border border-destructive/20 rounded px-2 py-1 z-10">
      {message}
    </p>
  )
}
