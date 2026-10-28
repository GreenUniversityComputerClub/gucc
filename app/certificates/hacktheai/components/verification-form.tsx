'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Participant } from '@/lib/certificates/hacktheai'

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
      // The lookup runs on the server; participant data never ships to the browser.
      router.push(
        `/certificates/hacktheai/verify?team=${encodeURIComponent(teamName.trim())}&email=${encodeURIComponent(email.trim())}`
      )
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
      <div className="glass glow-border relative rounded-3xl p-5 sm:p-8">
        <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-foreground">
          Verify Your Participation
        </h2>
        <p className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6">
          Enter your team name and your email address to verify your participation and
          download your certificate. Both fields are required for authentication.
        </p>

        <form onSubmit={handleSearch} className="space-y-4">
          <div>
            <label
              htmlFor="teamName"
              className="block text-sm font-medium text-foreground mb-2"
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
              className="w-full px-4 py-2 border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent bg-background/60 text-foreground placeholder:text-muted-foreground"
              style={{ color: '#111827' }}
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-foreground mb-2"
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
              className="w-full px-4 py-2 border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent bg-background/60 text-foreground placeholder:text-muted-foreground"
              style={{ color: '#111827' }}
            />
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-md">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 px-6 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Searching...' : 'Verify & Generate Certificate'}
          </button>
        </form>

        {results.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-4 text-foreground">
              Multiple Teams Found
            </h3>
            <div className="space-y-2">
              {results.map((participant, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectTeam(participant)}
                  className="w-full text-left bg-card hover:bg-muted border border-border rounded-2xl p-4 transition-colors"
                >
                  <div className="font-semibold text-foreground">
                    {participant.teamName}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {participant.university}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
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

