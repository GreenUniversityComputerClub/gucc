import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import type { User } from "@supabase/supabase-js"
import { isExecutiveEmail } from "./executive-access"

/**
 * Route Handler guard for executive-only API endpoints (form definitions —
 * not the public submit/upload endpoints, which stay open to anyone).
 * Returns { denied } to short-circuit with, or { user } when cleared to proceed.
 */
export async function requireExecutiveApi(
  req: NextRequest
): Promise<{ user: User; denied?: undefined } | { user?: undefined; denied: NextResponse }> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll().map((c) => ({ name: c.name, value: c.value })),
      },
    }
  )

  const { data } = await supabase.auth.getUser()
  if (!data.user) {
    return { denied: NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 }) }
  }
  if (!isExecutiveEmail(data.user.email)) {
    return { denied: NextResponse.json({ data: null, error: "Forbidden — executives only" }, { status: 403 }) }
  }
  return { user: data.user }
}
