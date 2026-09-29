'use client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { resetPasswordAction } from '@/app/auth/actions'
import { PasswordChecklist } from '@/components/password-checklist'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'

export function UpdatePasswordForm({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  const handle = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await resetPasswordAction({ token, password })
      if (res.ok) router.push('/auth/login?reset=1')
      else setError(res.error)
    })
  }

  if (!token) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-2xl">Link missing</CardTitle>
          <CardDescription>Open the reset link you were given (by email, or by a GUCC administrator), or request a new one from the login page.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Reset Your Password</CardTitle>
          <CardDescription>Please enter your new password below.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handle}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="password">New password</Label>
                {/* Lets password managers save the new password for the right account. */}
                <input type="text" name="username" autoComplete="username" value={params.get('email') ?? ''} readOnly hidden aria-hidden />
                <PasswordInput id="password" placeholder="At least 10 characters" required minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="pw-rules" aria-invalid={Boolean(error)} />
                <PasswordChecklist id="pw-rules" password={password} email={params.get('email')} />
              </div>
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? 'Saving...' : 'Save new password'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
