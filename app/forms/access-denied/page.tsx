import Link from "next/link"
import { ShieldAlert } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LogoutButton } from "@/components/logout-button"

export default async function AccessDeniedPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()

  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center space-y-2">
          <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>Executives only</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            The form builder is restricted to GUCC executive members.
            {data.user?.email && (
              <>
                {" "}You&apos;re signed in as <span className="font-medium text-foreground">{data.user.email}</span>,
                which isn&apos;t on the executive list.
              </>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            If this is a mistake, ask an existing executive to add your account.
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <Button asChild variant="outline" size="sm">
              <Link href="/">Back to site</Link>
            </Button>
            {data.user && <LogoutButton />}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
