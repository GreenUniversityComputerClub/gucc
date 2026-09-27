/**
 * HackTheAI certificate types. Participant data lives in D1
 * (certificate_recipients) and is looked up server-side by
 * verifyCertificate(); only names, team and institution — plus a masked email —
 * ever reach the browser.
 */
export interface TeamMember {
  fullName: string
  gender: string
  /** Masked, e.g. "ab•••@gmail.com". */
  email: string
  /** True for the member whose email was used to verify. */
  verified?: boolean
}

export interface Participant {
  teamName: string
  university: string
  members: TeamMember[]
}
