'use client'

import { PasswordInput } from "@/components/ui/password-input";
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Turnstile } from '@/components/turnstile'
import { registerAction } from '@/app/auth/actions'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'

export function SignUpForm({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  const [fullName, setFullName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [department, setDepartment] = useState('')
  const [batch, setBatch] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [token, setToken] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const onToken = useCallback((t: string | null) => setToken(t), [])
  const router = useRouter()

  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== repeatPassword) {
      setFields({ repeatPassword: 'Passwords do not match' })
      return
    }
    start(async () => {
      const res = await registerAction({ email, password, fullName, studentId: studentId || undefined, department: department || undefined, batch: batch || undefined, phone: phone || undefined, turnstileToken: token ?? undefined })
      if (res.ok) router.push(res.data?.emailSent === false ? '/auth/sign-up-success?review=1' : '/auth/sign-up-success')
      else {
        setError(res.error)
        setFields(res.fields ?? {})
      }
    })
  }

  const hint = (k: string) => (fields[k] ? <p className="text-sm text-red-500">{fields[k]}</p> : null)

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Sign up</CardTitle>
          <CardDescription>Apply for GUCC membership. After you verify your email, a club administrator reviews your application.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignUp} noValidate>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="full-name">Full name</Label>
                <Input id="full-name" type="text" placeholder="Your name" required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} aria-invalid={Boolean(fields.fullName)} />
                {hint('fullName')}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="student-id">Student ID</Label>
                <Input id="student-id" type="text" inputMode="numeric" placeholder="9 digits, e.g. 232002184" maxLength={9} value={studentId} onChange={(e) => setStudentId(e.target.value.replace(/\D/g, ''))} aria-invalid={Boolean(fields.studentId)} />
                {hint('studentId')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="department">Department</Label>
                  <Input id="department" type="text" placeholder="CSE" autoComplete="organization-title" value={department} onChange={(e) => setDepartment(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="batch">Batch</Label>
                  <Input id="batch" type="text" placeholder="e.g. 232" value={batch} onChange={(e) => setBatch(e.target.value)} aria-invalid={Boolean(fields.batch)} />
                  {hint('batch')}
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone <span className="font-normal text-muted-foreground">(optional, private)</span></Label>
                <Input id="phone" type="tel" placeholder="01XXXXXXXXX" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={Boolean(fields.phone)} />
                <p className="text-xs text-muted-foreground">Only club administrators can see it.</p>
                {hint('phone')}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@student.green.ac.bd" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(fields.email)} />
                {hint('email')}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <PasswordInput id="password" required autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(fields.password)} aria-describedby="pw-hint" />
                <p id="pw-hint" className="text-xs text-muted-foreground">At least 10 characters.</p>
                {hint('password')}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="repeat-password">Repeat Password</Label>
                <PasswordInput id="repeat-password" required autoComplete="new-password" value={repeatPassword} onChange={(e) => setRepeatPassword(e.target.value)} />
                {hint('repeatPassword')}
              </div>
              <Turnstile onToken={onToken} />
              {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? 'Creating an account...' : 'Sign up'}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              Already have an account?{' '}
              <Link href="/auth/login" className="underline underline-offset-4">Login</Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
