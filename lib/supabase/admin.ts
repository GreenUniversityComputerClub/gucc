import { createClient } from "@supabase/supabase-js"

/**
 * Server-only Supabase client using the service role key. Bypasses RLS, so this
 * must never be imported into client ("use client") code — it's used to let
 * anonymous form submitters upload files without needing their own Supabase account.
 */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      "File uploads aren't configured yet: SUPABASE_SERVICE_ROLE_KEY is missing from the environment."
    )
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
