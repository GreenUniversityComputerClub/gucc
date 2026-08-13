import { createServerClient, type SetAllCookies } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isExecutiveEmail } from '@/lib/auth/executive-access'

export async function updateSession(request: NextRequest) {
  // Check if Supabase environment variables are available
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase environment variables not configured. Skipping authentication middleware.')
    return NextResponse.next({
      request,
    })
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: DO NOT REMOVE auth.getUser()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (isExecutiveOnlyPath(pathname)) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }
    if (!isExecutiveEmail(user.email)) {
      const url = request.nextUrl.clone()
      url.pathname = '/forms/access-denied'
      url.search = ''
      return NextResponse.redirect(url)
    }
  } else if (!user && isProtectedPath(pathname)) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}

const PROTECTED_PATHS = [
  // '/executives.*', '/contests.*', '/events.*', '/collaborations.*', '^/$'
  '/admin.*'
];

function isProtectedPath(path: string) {
  return PROTECTED_PATHS.some((p) => {
    // Match wildcard paths
    const regex = new RegExp(p)
    return regex.test(path)
  })
}

// The form builder itself is executive-only; the public submit page under the
// same /forms/[id]/... tree must stay open to anyone, so these are listed
// explicitly rather than matched with a single /forms.* wildcard. This is a
// fast edge-level check — lib/auth/require-executive.ts enforces the same
// rule again at the page level as the source of truth.
const EXECUTIVE_ONLY_PATHS = [
  '^/forms$',
  '^/forms/new(/.*)?$',
  '^/forms/[^/]+/edit(/.*)?$',
  '^/forms/[^/]+/preview(/.*)?$',
]

function isExecutiveOnlyPath(path: string) {
  return EXECUTIVE_ONLY_PATHS.some((p) => new RegExp(p).test(path))
}