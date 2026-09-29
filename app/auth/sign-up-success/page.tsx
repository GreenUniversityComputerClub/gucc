import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { SPAM_HINT } from '@/lib/email-hint'

export default async function Page({ searchParams }: { searchParams: Promise<{ review?: string }> }) {
  // ?review=1: email is off, so the application went straight to the club for approval.
  const review = (await searchParams).review === '1'
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Thank you for signing up!</CardTitle>
              <CardDescription>{review ? 'Your application is with GUCC' : 'Check your email to confirm'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {review ? (
                <p className="text-sm text-muted-foreground">
                  Your account has been created and is waiting for approval by club leadership.
                  You can sign in to see its status.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    You&apos;ve successfully signed up. Please check your email to confirm your account
                    before signing in.
                  </p>
                  <p className="text-sm text-muted-foreground">{SPAM_HINT}</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
