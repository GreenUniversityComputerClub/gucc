import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { isExecutiveEmail } from "@/lib/auth/executive-access"
import { listForms } from "@/lib/forms"
import ProfileClient from "./ProfileClient"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Edit, Eye, LayoutDashboard } from "lucide-react"

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    redirect("/auth/login?next=/profile")
  }

  const user = data.user
  const isExecutive = isExecutiveEmail(user.email)
  const myForms = isExecutive ? (await listForms()).filter((f) => f.createdByEmail === user.email) : []

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Your Profile</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account details</p>
      </div>

      <ProfileClient
        userId={user.id}
        email={user.email ?? ""}
        fullName={(user.user_metadata?.full_name as string) ?? ""}
        studentId={(user.user_metadata?.student_id as string) ?? ""}
        department={(user.user_metadata?.department as string) ?? ""}
        isExecutive={isExecutive}
        createdAt={user.created_at}
        lastSignInAt={user.last_sign_in_at ?? null}
      />

      {isExecutive && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-1.5">
              <LayoutDashboard className="h-4 w-4" /> Your Forms
            </CardTitle>
            <Link href="/forms" className="text-xs text-primary underline">
              Open Form Builder
            </Link>
          </CardHeader>
          <CardContent>
            {myForms.length === 0 ? (
              <p className="text-sm text-muted-foreground">You haven&apos;t created any forms yet.</p>
            ) : (
              <ul className="space-y-2">
                {myForms.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 text-sm border rounded-md px-3 py-2">
                    <span className="truncate font-medium">{f.title}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="outline" className="text-[10px] mr-2">
                        {f.fields.length} field{f.fields.length !== 1 ? "s" : ""}
                      </Badge>
                      <Link href={`/forms/${f.id}/edit`} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                        <Edit className="h-3.5 w-3.5" />
                      </Link>
                      <Link href={`/forms/${f.id}/preview`} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                        <Eye className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
