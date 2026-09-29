'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { CheckCircle2, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { resendVerificationAction } from '@/app/auth/actions'
import { SPAM_HINT } from '@/lib/email-hint'

const COOLDOWN = 60

/** After signing up: where the link went, what happens next, and a resend with a visible wait. */
export function SignUpDone({ review }: { review: boolean }) {
  const [email, setEmail] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [wait, setWait] = useState(COOLDOWN)
  const [pending, start] = useTransition()

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('gucc-signup') ?? 'null') as { email?: string; message?: string | null } | null
      if (saved?.email) setEmail(saved.email)
      if (saved?.message && /couldn't be emailed/.test(saved.message)) setNote(saved.message)
    } catch { /* nothing saved */ }
  }, [])
  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const steps = review
    ? ['Club leaders review your application.', 'You get a notification (and an email when the club uses email) when it’s approved.', 'Then you can register for events, message members and write for the club.']
    : ['Open the link in the email to confirm your address.', 'Club leaders review your application.', 'You get a notification when it’s approved.']

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        {review ? <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden /> : <MailCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />}
        <p className="text-sm">
          {review ? 'Your account is created and waiting for approval by club leaders.' : <>We sent a confirmation link to <strong className="break-all">{email ?? 'your email address'}</strong>.</>}
        </p>
      </div>
      {note && <p className="rounded-md border border-amber-400/60 bg-amber-500/10 p-3 text-sm" role="status">{note}</p>}
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">{steps.map((s) => <li key={s}>{s}</li>)}</ol>
      {!review && (
        <div className="space-y-2 rounded-md bg-muted/50 p-3 text-sm">
          <p className="text-muted-foreground">{SPAM_HINT}</p>
          {email && (
            <Button type="button" variant="outline" size="sm" className="min-h-10" disabled={wait > 0 || pending}
              onClick={() => start(async () => {
                const r = await resendVerificationAction(email)
                setNote(r.ok ? r.data?.message ?? 'Sent.' : r.error)
                setWait(COOLDOWN)
              })}>
              {pending ? 'Sending…' : wait > 0 ? `Resend the link in ${wait}s` : 'Resend the link'}
            </Button>
          )}
        </div>
      )}
      <Button asChild className="w-full min-h-11"><Link href="/auth/login">Go to sign in</Link></Button>
    </div>
  )
}
