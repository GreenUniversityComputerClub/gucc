import { updateSession } from '@/lib/supabase/middleware'
import { type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  /*
   * Scoped to the routes that actually read a Supabase session. `updateSession`
   * makes a network call to Supabase on every request it handles, so running it
   * across the whole site would add that round-trip to ~300 public content
   * pages that never look at auth.
   *
   * Keep this list in sync with the routes using the Supabase server client,
   * and with PROTECTED_PATHS in lib/supabase/middleware.ts.
   */
  matcher: [
    '/auth/:path*',
    '/protected/:path*',
    '/admin/:path*',
    '/forms/:path*',
    '/lost-found/:path*',
    '/api/forms/:path*',
    '/api/lost-found/:path*',
  ],
}
