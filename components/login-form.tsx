'use client'

import { PasswordInput } from "@/components/ui/password-input";
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Turnstile } from '@/components/turnstile'
import { loginAction, resendVerificationAction } from '@/app/auth/actions'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'

export function LoginForm({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<{ message: string; code: string } | null>(null)
  const [info, setInfo] = useState<string | null>(params.get('reset') ? 'Password updated. Sign in with your new password.' : params.get('email-changed') ? 'Your sign-in email was changed. Sign in with the new address.' : null)
  const [token, setToken] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const onToken = useCallback((t: string | null) => setToken(t), [])

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await loginAction({ email, password, next: params.get('next') ?? undefined, turnstileToken: token ?? undefined })
      // Success redirects on the server; only failures come back here.
      if (res && !res.ok) setError({ message: res.error, code: res.code })
    })
  }

  const resend = () =>
    start(async () => {
      const res = await resendVerificationAction(email)
      setInfo(res.ok ? res.data?.message ?? 'Sent.' : res.error)
      setError(null)
    })

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Login</CardTitle>
          <CardDescription>Enter your email below to login to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="m@example.com" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                  <Link href="/auth/forgot-password" className="ml-auto inline-block text-sm underline-offset-4 hover:underline">
                    Forgot your password?
                  </Link>
                </div>
                <PasswordInput id="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Turnstile onToken={onToken} />
              {info && <p className="text-sm text-muted-foreground" role="status">{info}</p>}
              {error && (
                <p className="text-sm text-red-500" role="alert">
                  {error.message}{' '}
                  {error.code === 'EMAIL_UNVERIFIED' && (
                    <button type="button" onClick={resend} className="underline underline-offset-4">Resend the link</button>
                  )}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? 'Logging in...' : 'Login'}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              Don&apos;t have an account?{' '}
              <Link href="/auth/sign-up" className="underline underline-offset-4">Sign up</Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
