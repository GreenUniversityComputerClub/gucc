/**
 * Small, dependency-free input validation. Each helper returns a clean value
 * or records a field error; `done()` throws one ValidationError listing all.
 */
import { ValidationError } from "./errors";

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export const STUDENT_ID_RE = /^\d{9}$/;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class Validator {
  readonly errors: Record<string, string> = {};

  constructor(private readonly input: Record<string, unknown>) {}

  private raw(field: string): unknown {
    const v = this.input[field];
    return typeof v === "string" ? v.trim() : v;
  }

  string(field: string, opts: { required?: boolean; min?: number; max?: number; label?: string; pattern?: RegExp; patternMessage?: string } = {}): string | null {
    const label = opts.label ?? field;
    const v = this.raw(field);
    if (v === undefined || v === null || v === "") {
      if (opts.required) this.errors[field] = `${label} is required.`;
      return null;
    }
    if (typeof v !== "string") {
      this.errors[field] = `${label} must be text.`;
      return null;
    }
    if (opts.min && v.length < opts.min) this.errors[field] = `${label} must be at least ${opts.min} characters.`;
    else if (v.length > (opts.max ?? 5000)) this.errors[field] = `${label} must be at most ${opts.max ?? 5000} characters.`;
    else if (opts.pattern && !opts.pattern.test(v)) this.errors[field] = opts.patternMessage ?? `${label} is not valid.`;
    return v;
  }

  email(field: string, required = true): string | null {
    const v = this.string(field, { required, max: 254, label: "Email", pattern: EMAIL_RE, patternMessage: "Enter a valid email address." });
    return v ? v.toLowerCase() : null;
  }

  int(field: string, opts: { required?: boolean; min?: number; max?: number; label?: string } = {}): number | null {
    const label = opts.label ?? field;
    const v = this.raw(field);
    if (v === undefined || v === null || v === "") {
      if (opts.required) this.errors[field] = `${label} is required.`;
      return null;
    }
    const n = Number(v);
    if (!Number.isInteger(n)) {
      this.errors[field] = `${label} must be a whole number.`;
      return null;
    }
    if (opts.min !== undefined && n < opts.min) this.errors[field] = `${label} must be at least ${opts.min}.`;
    if (opts.max !== undefined && n > opts.max) this.errors[field] = `${label} must be at most ${opts.max}.`;
    return n;
  }

  oneOf<T extends string>(field: string, allowed: readonly T[], opts: { required?: boolean; label?: string } = {}): T | null {
    const v = this.raw(field);
    if (v === undefined || v === null || v === "") {
      if (opts.required) this.errors[field] = `${opts.label ?? field} is required.`;
      return null;
    }
    if (!allowed.includes(v as T)) {
      this.errors[field] = `${opts.label ?? field} has an invalid value.`;
      return null;
    }
    return v as T;
  }

  bool(field: string): boolean {
    const v = this.input[field];
    return v === true || v === "true" || v === "on" || v === "1" || v === 1;
  }

  /** ISO date or datetime; returns normalized ISO string. */
  datetime(field: string, opts: { required?: boolean; label?: string } = {}): string | null {
    const v = this.raw(field);
    if (v === undefined || v === null || v === "") {
      if (opts.required) this.errors[field] = `${opts.label ?? field} is required.`;
      return null;
    }
    // Form inputs (datetime-local) carry no zone; the club's clock is Dhaka time,
    // and Workers run in UTC, so interpret zone-less times as +06:00.
    const raw = String(v);
    const withZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(raw) ? `${raw}+06:00` : raw;
    const d = new Date(withZone);
    if (Number.isNaN(d.getTime())) {
      this.errors[field] = `${opts.label ?? field} is not a valid date.`;
      return null;
    }
    return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : d.toISOString();
  }

  url(field: string, opts: { required?: boolean; label?: string } = {}): string | null {
    const v = this.string(field, { required: opts.required, max: 2000, label: opts.label });
    if (!v) return null;
    try {
      const u = new URL(v);
      if (!["http:", "https:"].includes(u.protocol)) throw new Error("scheme");
      return u.toString();
    } catch {
      this.errors[field] = `${opts.label ?? field} must be an http(s) URL.`;
      return null;
    }
  }

  check(ok: boolean, field: string, message: string) {
    if (!ok && !this.errors[field]) this.errors[field] = message;
  }

  done(message = "Please correct the highlighted fields.") {
    if (Object.keys(this.errors).length > 0) throw new ValidationError(message, this.errors);
  }
}

const COMMON_PASSWORDS = new Set(["password", "password1", "12345678", "123456789", "1234567890", "qwerty123", "iloveyou", "gucc1234", "greenuniversity", "11111111"]);

export function passwordProblem(password: string, email?: string | null): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "Use at most 200 characters.";
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return "That password is too common.";
  const local = email ? email.split("@")[0].toLowerCase() : "";
  if (local.length >= 4 && password.toLowerCase().includes(local)) return "Do not include your email name in the password.";
  if (new Set(password).size < 5) return "Use a less repetitive password.";
  return null;
}

/** Slug from a title, ASCII only. */
export function toSlug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
