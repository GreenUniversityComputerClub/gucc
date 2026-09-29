/**
 * Password rules, shared by the sign-up / reset forms (shown as the person types) and the API
 * (which enforces them), so the two can never disagree.
 */
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "12345678", "123456789", "1234567890", "0123456789", "qwerty123", "qwertyuiop",
  "iloveyou", "iloveyou1", "gucc1234", "gucc12345", "greenuniversity", "greenuniversity1", "11111111", "1111111111", "00000000", "abcd1234",
  "abc123456", "welcome123", "admin12345", "bangladesh", "bangladesh1", "dhaka12345", "letmein123", "football1", "sunshine1", "princess1",
]);

export interface PasswordRule {
  key: "length" | "common" | "email" | "variety";
  label: string;
  ok: (password: string, email?: string | null) => boolean;
  /** The message when it fails. */
  problem: string;
}

const emailName = (email?: string | null) => (email ? email.split("@")[0]!.toLowerCase() : "");

export const PASSWORD_RULES: PasswordRule[] = [
  { key: "length", label: "10 to 200 characters", ok: (p) => p.length >= 10 && p.length <= 200, problem: "Use 10 to 200 characters." },
  { key: "variety", label: "At least 5 different characters", ok: (p) => new Set(p).size >= 5, problem: "Use a less repetitive password." },
  { key: "email", label: "Doesn't contain your email name", ok: (p, email) => { const l = emailName(email); return l.length < 4 || !p.toLowerCase().includes(l); }, problem: "Do not include your email name in the password." },
  { key: "common", label: "Not a common password", ok: (p) => !COMMON_PASSWORDS.has(p.toLowerCase()), problem: "That password is too common." },
];

/** The first rule the password breaks, as a message, or null when it's fine. */
export function passwordProblem(password: string, email?: string | null): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "Use at most 200 characters.";
  return PASSWORD_RULES.find((r) => !r.ok(password, email))?.problem ?? null;
}
