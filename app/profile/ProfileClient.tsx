"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { format, formatDistanceToNow } from "date-fns"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { LogoutButton } from "@/components/logout-button"
import { Pencil, Loader2, CheckCircle2, AlertCircle, ShieldCheck } from "lucide-react"

interface Props {
  userId: string
  email: string
  fullName: string
  studentId: string
  department: string
  isExecutive: boolean
  createdAt: string
  lastSignInAt: string | null
}

function initialsFor(name: string, email: string): string {
  const source = name.trim() || email
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

export default function ProfileClient({
  userId: _userId,
  email,
  fullName: initialFullName,
  studentId: initialStudentId,
  department: initialDepartment,
  isExecutive,
  createdAt,
  lastSignInAt,
}: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [fullName, setFullName] = useState(initialFullName)
  const [studentId, setStudentId] = useState(initialStudentId)
  const [department, setDepartment] = useState(initialDepartment)

  const handleSave = async () => {
    setSaving(true)
    setStatus("idle")
    setErrorMsg(null)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName.trim(), student_id: studentId.trim(), department: department.trim() },
    })
    setSaving(false)
    if (error) {
      setStatus("error")
      setErrorMsg(error.message)
      return
    }
    setStatus("success")
    setEditing(false)
    router.refresh()
    setTimeout(() => setStatus("idle"), 3000)
  }

  const handleCancel = () => {
    setFullName(initialFullName)
    setStudentId(initialStudentId)
    setDepartment(initialDepartment)
    setEditing(false)
    setErrorMsg(null)
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-semibold shrink-0">
              {initialsFor(initialFullName, email)}
            </div>
            <div>
              <h2 className="text-lg font-semibold">{initialFullName || "Unnamed"}</h2>
              <p className="text-sm text-muted-foreground">{email}</p>
              {isExecutive && (
                <Badge variant="secondary" className="mt-1 text-[10px] gap-1">
                  <ShieldCheck className="h-3 w-3" /> Executive
                </Badge>
              )}
            </div>
          </div>
          {!editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
          )}
        </div>

        {editing ? (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Full name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Student ID</Label>
                <Input value={studentId} onChange={(e) => setStudentId(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Department</Label>
                <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
              </div>
            </div>
            {errorMsg && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" /> {errorMsg}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                {saving ? "Saving..." : "Save changes"}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancel} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Student ID</p>
              <p>{initialStudentId || <span className="text-muted-foreground">Not set</span>}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Department</p>
              <p>{initialDepartment || <span className="text-muted-foreground">Not set</span>}</p>
            </div>
          </div>
        )}

        {status === "success" && (
          <p className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Profile updated
          </p>
        )}

        <div className="flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
          <div className="space-y-0.5">
            <p>Joined {format(new Date(createdAt), "MMM d, yyyy")} ({formatDistanceToNow(new Date(createdAt), { addSuffix: true })})</p>
            {lastSignInAt && <p>Last signed in {formatDistanceToNow(new Date(lastSignInAt), { addSuffix: true })}</p>}
          </div>
          <LogoutButton size="sm" variant="outline" className="h-7 text-xs" />
        </div>
      </CardContent>
    </Card>
  )
}
