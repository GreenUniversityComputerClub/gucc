'use client'

import { useRouter } from 'next/navigation'
import { CertificateViewer } from '../components/certificate-viewer'
import { Participant } from '@/lib/certificates/hacktheai'

interface CertificateVerifyClientProps {
  participant: Participant
  verifiedEmail: string
}

export function CertificateVerifyClient({ participant, verifiedEmail }: CertificateVerifyClientProps) {
  const router = useRouter()

  return (
    <div className="min-h-screen px-4 pb-8 pt-24 sm:pb-12">
      <div className="container mx-auto max-w-6xl">
        <div className="mb-4 sm:mb-6">
          <button
            onClick={() => router.push('/certificates/hacktheai')}
            className="text-primary hover:text-primary/80 font-medium flex items-center gap-2 text-sm sm:text-base"
          >
            ← Back to Verification
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-xl p-4 sm:p-6 lg:p-8 overflow-x-auto">
          <CertificateViewer participant={participant} verifiedEmail={verifiedEmail} />
        </div>
      </div>
    </div>
  )
}

