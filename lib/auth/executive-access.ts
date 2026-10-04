import executivesData from "@/data/executives.json"

/**
 * Who is allowed into the form builder (/forms): anyone whose email appears as
 * a `mail` in data/executives.json (any committee year, campus or wing).
 *
 * Server-side only — this pulls in the whole executives.json, so client
 * components should ask /api/auth/executive-status instead of importing it.
 */

// Many entries are stored as "mailto:someone@x.com" (or with a doubled colon),
// so strip that before comparing against the signed-in user's address.
function normalizeEmail(value: string): string {
  return value.trim().toLowerCase().replace(/^mailto:+/, "").trim()
}

// executives.json nests people differently per year (top-level, campuses.*, wings.*),
// so walk the whole tree and pick up every `mail` rather than hardcoding the paths.
function collectMails(node: unknown, out: Set<string>) {
  if (Array.isArray(node)) {
    node.forEach((item) => collectMails(item, out))
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "mail" && typeof value === "string") {
        const email = normalizeEmail(value)
        if (email) out.add(email)
      } else {
        collectMails(value, out)
      }
    }
  }
}

const executiveEmails = new Set<string>()
collectMails(executivesData, executiveEmails)

export function isExecutiveEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return executiveEmails.has(normalizeEmail(email))
}
