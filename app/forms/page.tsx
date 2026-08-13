import Link from "next/link"
import { listForms } from "@/lib/forms"
import { requireExecutive } from "@/lib/auth/require-executive"
import { Button } from "@/components/ui/button"
import { LogoutButton } from "@/components/logout-button"
import { Plus } from "lucide-react"
import FormsListClient from "./_components/FormsListClient"

export default async function FormsPage() {
  const user = await requireExecutive("/forms")
  const forms = await listForms()

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Form Builder</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Build forms that write directly to Google Sheets
          </p>
        </div>
        <Button asChild>
          <Link href="/forms/new">
            <Plus className="h-4 w-4 mr-2" /> New Form
          </Link>
        </Button>
      </div>

      <FormsListClient forms={forms} currentUserEmail={user.email ?? ""} />

      <div className="flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
        <span>Signed in as {user.email}</span>
        <LogoutButton size="sm" variant="ghost" className="h-7 text-xs" />
      </div>
    </div>
  )
}
