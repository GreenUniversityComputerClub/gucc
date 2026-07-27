import { VerificationForm } from './components/verification-form'

export default function CertificateVerificationPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white py-6 sm:py-12 px-4">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-800 mb-2 sm:mb-4">
            HackTheAI Participation Certificate
          </h1>
          <p className="text-base sm:text-lg text-gray-600">
            Verify your participation and download your personalized certificate
          </p>
        </div>

        <VerificationForm />
      </div>
    </div>
  )
}

