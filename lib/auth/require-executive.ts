import "server-only"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isExecutiveEmail } from "./executive-access"

/**
 * Server Component / Server Action guard for executive-only pages under /forms.
 * Redirects to login (preserving the destination) if signed out, or to
 * /forms/access-denied if signed in but not an executive. Returns the user
 * on success so callers can show "signed in as ...".
 */
export async function requireExecutive(currentPath: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    redirect(`/auth/login?next=${encodeURIComponent(currentPath)}`)
  }

  if (!isExecutiveEmail(data.user.email)) {
    redirect("/forms/access-denied")
  }

  return data.user
}
