'use client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Turnstile } from '@/components/turnstile'
import { forgotPasswordAction } from '@/app/auth/actions'
import Link from 'next/link'
import { useCallback, useState, useTransition } from 'react'

export function ForgotPasswordForm({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const onToken = useCallback((t: string | null) => setToken(t), [])

  const handle = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await forgotPasswordAction({ email, turnstileToken: token ?? undefined })
      if (res.ok) setDone(res.data?.message ?? 'Check your email.')
      else setError(res.error)
    })
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      {done ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Check Your Email</CardTitle>
            <CardDescription>Password reset instructions sent</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{done}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Reset Your Password</CardTitle>
            <CardDescription>Type in your email and we&apos;ll send you a link to reset your password</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handle}>
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="m@example.com" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <Turnstile onToken={onToken} />
                {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? 'Sending...' : 'Send reset email'}
                </Button>
              </div>
              <div className="mt-4 text-center text-sm">
                Already have an account?{' '}
                <Link href="/auth/login" className="underline underline-offset-4">Login</Link>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
