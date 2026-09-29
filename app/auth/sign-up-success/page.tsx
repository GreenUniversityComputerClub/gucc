import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { SignUpDone } from './done'

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
              <CardDescription>{review ? 'Your application is with GUCC' : 'One more step: confirm your email'}</CardDescription>
            </CardHeader>
            <CardContent>
              <SignUpDone review={review} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
