/**
 * Emails allowed into the form builder (/forms). Same pattern as
 * lib/lost-found/config.ts's adminEmails — a plain allowlist, edited by hand
 * as executives change. Add/remove one line per person; no other setup needed.
 */
export const executiveEmails: string[] = [
  "232002256@student.green.ac.bd",
  "jawadhossainmahi@gmail.com",
]

export function isExecutiveEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return executiveEmails.includes(email.trim().toLowerCase())
}
