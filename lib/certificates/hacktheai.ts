import hacktheaiData from '@/data/hacktheaiteam.json'

export interface TeamMember {
  fullName: string
  gender: string
  email: string
  contactNumber: string
}

export interface Participant {
  teamName: string
  university: string
  members: TeamMember[]
}

// Cache normalized data for better performance
let normalizedDataCache: Participant[] | null = null

interface TeamData {
  'Team Name'?: string
  'University/Institute Name'?: string
  'Full Name'?: string
  'Gender'?: string
  'Email'?: string
  'Contact Number'?: string | number
  'Full Name__1'?: string
  'Gender__1'?: string
  'Email__1'?: string
  'Contact Number__1'?: string | number
  'Do you have a 3rd member?'?: string
  'Full Name__2'?: string
  'Gender__2'?: string
  'Email__2'?: string
  'Contact Number__2'?: string | number
}

function normalizeData(teamData: TeamData): Participant {
  // Helper function to convert contact number to string
  const toString = (value: string | number | undefined): string => {
    if (value === undefined || value === null) return ''
    return String(value)
  }

  const members: TeamMember[] = [
    {
      fullName: teamData['Full Name'] || '',
      gender: teamData['Gender'] || '',
      email: teamData['Email'] || '',
      contactNumber: toString(teamData['Contact Number']),
    },
  ]

  // Add member 2
  if (teamData['Full Name__1']) {
    members.push({
      fullName: teamData['Full Name__1'],
      gender: teamData['Gender__1'] || '',
      email: teamData['Email__1'] || '',
      contactNumber: toString(teamData['Contact Number__1']),
    })
  }

  // Add member 3 if exists
  if (teamData['Do you have a 3rd member?'] === 'Yes' && teamData['Full Name__2']) {
    members.push({
      fullName: teamData['Full Name__2'],
      gender: teamData['Gender__2'] || '',
      email: teamData['Email__2'] || '',
      contactNumber: toString(teamData['Contact Number__2']),
    })
  }

  return {
    teamName: teamData['Team Name'] || '',
    university: teamData['University/Institute Name'] || '',
    members: members.filter(m => m.fullName), // Filter out empty members
  }
}

// Pre-normalize all data once for better performance
function getNormalizedData(): Participant[] {
  if (normalizedDataCache === null) {
    normalizedDataCache = hacktheaiData.map(normalizeData)
  }
  return normalizedDataCache
}

// Create a lookup map for faster searches
interface TeamLookup {
  byTeamName: Map<string, Participant[]>
  byEmail: Map<string, Participant[]>
}

let lookupCache: TeamLookup | null = null

function getLookupCache(): TeamLookup {
  if (lookupCache === null) {
    const byTeamName = new Map<string, Participant[]>()
    const byEmail = new Map<string, Participant[]>()

    const normalized = getNormalizedData()

    normalized.forEach((participant) => {
      // Index by team name
      const teamNameKey = participant.teamName.toLowerCase().trim()
      if (!byTeamName.has(teamNameKey)) {
        byTeamName.set(teamNameKey, [])
      }
      byTeamName.get(teamNameKey)!.push(participant)

      // Index by email (all team members' emails)
      participant.members.forEach((member) => {
        const emailKey = member.email.toLowerCase().trim()
        if (!byEmail.has(emailKey)) {
          byEmail.set(emailKey, [])
        }
        byEmail.get(emailKey)!.push(participant)
      })
    })

    lookupCache = { byTeamName, byEmail }
  }
  return lookupCache
}

export function searchParticipant(
  teamName?: string,
  email?: string
): Participant[] {
  // For authentic verification, both team name and email are required
  if (!teamName || !email) {
    return []
  }

  const teamNameLower = teamName.toLowerCase().trim()
  const emailLower = email.toLowerCase().trim()

  const lookup = getLookupCache()

  // Fast lookup by team name
  const teamsByName = lookup.byTeamName.get(teamNameLower) || []
  
  // Fast lookup by email
  const teamsByEmail = lookup.byEmail.get(emailLower) || []

  // Find intersection - teams that match both criteria
  const results = teamsByName.filter((participant) =>
    teamsByEmail.some((p) => p.teamName === participant.teamName)
  )

  return results
}

export function findParticipantByCredentials(
  teamName: string,
  email: string
): Participant | null {
  const results = searchParticipant(teamName, email)
  return results.length > 0 ? results[0] : null
}

export function findParticipantByEmail(email: string): Participant | null {
  const results = searchParticipant(undefined, email)
  return results.length > 0 ? results[0] : null
}

export function findParticipantByTeamName(teamName: string): Participant | null {
  const results = searchParticipant(teamName, undefined)
  return results.length > 0 ? results[0] : null
}

