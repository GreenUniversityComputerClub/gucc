import { rpc } from '@/lib/api/session'
import { CertificateVerifyClient } from './certificate-verify-client'

interface VerifyPageProps {
  searchParams: Promise<{ team?: string; email?: string }>
}

export const dynamic = 'force-dynamic'

export default async function CertificateVerifyPage({ searchParams }: VerifyPageProps) {
  const params = await searchParams
  const teamName = params.team
  const email = params.email

  // For authentic verification, both are required
  if (!teamName || !email) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">
            Certificate Not Found
          </h2>
          <p className="text-gray-600 mb-6">
            Missing verification credentials. Both team name and email are required.
          </p>
          <a
            href="/certificates/hacktheai"
            className="inline-block px-6 py-3 bg-green-700 hover:bg-green-800 text-white font-semibold rounded-md transition-colors"
          >
            Go Back to Verification
          </a>
        </div>
      </div>
    )
  }

  // Server-side lookup - FAST!
  const res = await rpc<Record<string, unknown> | null>('certificates.verify', { programKey: 'hacktheai-2025', teamName, email })
  const participant = res.ok ? (res.data as Parameters<typeof CertificateVerifyClient>[0]['participant'] | null) : null

  if (!participant) {
    // Only a clear "no match" means not found; an outage or too many tries says so and when to retry.
    const busy = !res.ok && res.code === 'RATE_LIMITED'
    const down = !res.ok && !busy
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <h2 className={`text-2xl font-bold mb-4 ${down || busy ? 'text-amber-700' : 'text-red-700'}`}>
            {busy ? 'Too many checks' : down ? 'Verification is unavailable right now' : 'Certificate Not Found'}
          </h2>
          <p className="text-gray-700 mb-6">
            {busy ? 'Please wait a few minutes, then try again.' : down ? 'We could not reach the certificate records. Please try again in a few minutes.' : 'No participant matches that team name and email. Check the spelling and try again.'}
          </p>
          <a
            href="/certificates/hacktheai"
            className="inline-block px-6 py-3 bg-green-700 hover:bg-green-800 text-white font-semibold rounded-md transition-colors"
          >
            Go Back to Verification
          </a>
        </div>
      </div>
    )
  }

  return <CertificateVerifyClient participant={participant} verifiedEmail={email} />
}
