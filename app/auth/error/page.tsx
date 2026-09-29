import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const MESSAGES: Record<string, { text: string; href?: string; cta?: string }> = {
  TOKEN_INVALID: { text: 'This link is invalid, already used, or has expired. Request a new one from the sign-in page ("Resend the link" or "Forgot your password?").', href: '/auth/login', cta: 'Go to sign in' },
  'missing-token': { text: 'The link is incomplete. Open it directly from your email, or copy the whole address into your browser.', href: '/auth/login', cta: 'Go to sign in' },
  'email-change': { text: 'This email-change link is invalid or has expired. Start the change again from your security page.', href: '/dashboard/security', cta: 'Open security settings' },
  RATE_LIMITED: { text: 'Too many attempts. Wait a few minutes and try again.', href: '/auth/login', cta: 'Go to sign in' },
  UNAVAILABLE: { text: "The club's service is temporarily unavailable. Please try again in a few minutes." },
}

export default async function Page({ searchParams }: { searchParams: Promise<{ error: string }> }) {
  const params = await searchParams

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Sorry, something went wrong.</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const m = params?.error ? MESSAGES[params.error] : undefined
                return (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">{m?.text ?? (params?.error ? `Something went wrong (code ${params.error.slice(0, 40)}). Please try again, or contact the club if it keeps happening.` : 'An unspecified error occurred.')}</p>
                    <Link href={m?.href ?? '/'} className="inline-flex min-h-10 items-center text-sm font-medium underline underline-offset-4">{m?.cta ?? 'Back to the home page'}</Link>
                  </div>
                )
              })()}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
