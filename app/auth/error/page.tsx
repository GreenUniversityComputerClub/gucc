import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const MESSAGES: Record<string, string> = {
  TOKEN_INVALID: 'This link is invalid, already used, or has expired. Request a new one from the login page.',
  'missing-token': 'The link is incomplete. Open it directly from your email.',
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
              {params?.error ? (
                <p className="text-sm text-muted-foreground">{MESSAGES[params.error] ?? `Error code: ${params.error.slice(0, 40)}`}</p>
              ) : (
                <p className="text-sm text-muted-foreground">An unspecified error occurred.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
