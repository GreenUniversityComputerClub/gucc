'use client'

import { useState, useMemo, useEffect } from 'react'
import { CertificateTemplate } from './certificate-template'
import { DownloadButtons } from './download-buttons'
import { Participant, TeamMember } from '@/lib/certificates/hacktheai'

interface CertificateViewerProps {
  participant: Participant
  verifiedEmail?: string
}

export function CertificateViewer({ participant, verifiedEmail }: CertificateViewerProps) {
  // Find the member index that matches the verified email
  const defaultMemberIndex = useMemo(() => {
    if (!verifiedEmail) return 0
    const emailLower = verifiedEmail.toLowerCase().trim()
    const index = participant.members.findIndex(
      (member) => member.email.toLowerCase().trim() === emailLower
    )
    return index >= 0 ? index : 0
  }, [participant.members, verifiedEmail])

  const [selectedMember, setSelectedMember] = useState<TeamMember>(
    participant.members[defaultMemberIndex]
  )

  // Update selected member when verified email or participant changes
  useEffect(() => {
    setSelectedMember(participant.members[defaultMemberIndex])
  }, [participant.members, defaultMemberIndex])

  return (
    <div className="space-y-4 sm:space-y-6">
      {participant.members.length > 1 && (
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
          <label
            htmlFor="member-select"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Select Team Member
          </label>
          <select
            id="member-select"
            value={participant.members.indexOf(selectedMember)}
            onChange={(e) =>
              setSelectedMember(participant.members[parseInt(e.target.value)])
            }
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-gray-900 text-sm sm:text-base"
            style={{ color: '#111827' }}
          >
            {participant.members.map((member, idx) => (
              <option key={idx} value={idx}>
                {member.fullName} ({member.email})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="bg-gray-50 rounded-lg p-2 sm:p-4 overflow-x-auto">
        <div className="min-w-full" style={{ minWidth: '300px' }}>
          <CertificateTemplate
            name={selectedMember.fullName}
            teamName={participant.teamName}
            university={participant.university}
            gender={selectedMember.gender}
            eventName="HackTheAI"
            eventDate="22/23/24 September, 2025"
            organization="Green University Computer Club (GUCC)"
          />
        </div>
      </div>

      <DownloadButtons
        participantName={selectedMember.fullName}
        teamName={participant.teamName}
      />
    </div>
  )
}

