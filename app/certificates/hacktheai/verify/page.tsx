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
            className="inline-block px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md transition-colors"
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
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">
            Certificate Not Found
          </h2>
          <p className="text-gray-600 mb-6">
            Participant not found. Please verify your credentials.
          </p>
          <a
            href="/certificates/hacktheai"
            className="inline-block px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md transition-colors"
          >
            Go Back to Verification
          </a>
        </div>
      </div>
    )
  }

  return <CertificateVerifyClient participant={participant} verifiedEmail={email} />
}
