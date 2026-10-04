import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isExecutiveEmail } from "@/lib/auth/executive-access"

/**
 * Tells client components (the navbar) whether the signed-in user is an
 * executive, without shipping the executives list to the browser. Only a UI
 * hint — the /forms pages and APIs enforce access themselves.
 */
export async function GET() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return NextResponse.json({ data: { isExecutive: isExecutiveEmail(data.user?.email) }, error: null })
}
