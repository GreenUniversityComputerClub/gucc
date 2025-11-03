'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { searchParticipant, Participant } from '@/lib/certificates/hacktheai'

export function VerificationForm() {
  const router = useRouter()
  const [teamName, setTeamName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Participant[]>([])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setResults([])

    if (!teamName.trim() || !email.trim()) {
      setError('Both Team Name and Email are required for verification')
      return
    }

    setLoading(true)

    try {
      const searchResults = searchParticipant(
        teamName.trim(),
        email.trim()
      )

      if (searchResults.length === 0) {
        setError('Verification failed. Please ensure both the team name and email address are correct and match a registered participant.')
      } else if (searchResults.length === 1) {
        // Single result - go directly to certificate
        const participant = searchResults[0]
        router.push(
          `/certificates/hacktheai/verify?team=${encodeURIComponent(participant.teamName)}&email=${encodeURIComponent(email.trim() || participant.members[0].email)}`
        )
      } else {
        // Multiple results - show selection
        setResults(searchResults)
      }
    } catch (err) {
      setError('An error occurred while searching. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectTeam = (participant: Participant) => {
    router.push(
      `/certificates/hacktheai/verify?team=${encodeURIComponent(participant.teamName)}&email=${encodeURIComponent(email.trim() || participant.members[0].email)}`
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 lg:p-8">
        <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-gray-800">
          Verify Your Participation
        </h2>
        <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
          Enter your team name and your email address to verify your participation and
          download your certificate. Both fields are required for authentication.
        </p>

        <form onSubmit={handleSearch} className="space-y-4">
          <div>
            <label
              htmlFor="teamName"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Team Name <span className="text-red-500">*</span>
            </label>
            <input
              id="teamName"
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Enter your team name"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-gray-900 placeholder:text-gray-400"
              style={{ color: '#111827' }}
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-gray-900 placeholder:text-gray-400"
              style={{ color: '#111827' }}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Searching...' : 'Verify & Generate Certificate'}
          </button>
        </form>

        {results.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">
              Multiple Teams Found
            </h3>
            <div className="space-y-2">
              {results.map((participant, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectTeam(participant)}
                  className="w-full text-left bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md p-4 transition-colors"
                >
                  <div className="font-semibold text-gray-800">
                    {participant.teamName}
                  </div>
                  <div className="text-sm text-gray-600">
                    {participant.university}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {participant.members.length} member(s)
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

