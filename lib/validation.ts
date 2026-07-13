import type { FormField } from "@/types/form"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Validates a single field's submitted value against its built-in type checks
 * (email/url) plus any Google-Forms-style `validation` rule attached to it.
 * Returns an error message, or null if the value is valid.
 * Empty values are considered valid here — `required` is checked separately.
 */
export function validateFieldValue(field: FormField, rawValue: string): string | null {
  const value = rawValue ?? ""
  if (!value.trim()) return null

  // Built-in type checks
  if (field.type === "email" && !EMAIL_RE.test(value)) {
    return "Enter a valid email address"
  }
  if (field.type === "url") {
    try {
      new URL(value)
    } catch {
      return "Enter a valid URL"
    }
  }

  const rule = field.validation
  if (!rule || rule.type === "none") return null

  const fail = (fallback: string) => rule.message?.trim() || fallback

  switch (rule.type) {
    case "number_gt":
    case "number_gte":
    case "number_lt":
    case "number_lte":
    case "number_eq":
    case "number_between":
    case "number_integer": {
      const num = Number(value)
      if (Number.isNaN(num)) return fail("Enter a valid number")
      const n1 = rule.value !== undefined ? Number(rule.value) : NaN
      const n2 = rule.value2 !== undefined ? Number(rule.value2) : NaN
      switch (rule.type) {
        case "number_gt":
          if (!(num > n1)) return fail(`Must be greater than ${rule.value}`)
          break
        case "number_gte":
          if (!(num >= n1)) return fail(`Must be greater than or equal to ${rule.value}`)
          break
        case "number_lt":
          if (!(num < n1)) return fail(`Must be less than ${rule.value}`)
          break
        case "number_lte":
          if (!(num <= n1)) return fail(`Must be less than or equal to ${rule.value}`)
          break
        case "number_eq":
          if (num !== n1) return fail(`Must be equal to ${rule.value}`)
          break
        case "number_between":
          if (!(num >= n1 && num <= n2)) return fail(`Must be between ${rule.value} and ${rule.value2}`)
          break
        case "number_integer":
          if (!Number.isInteger(num)) return fail("Must be a whole number")
          break
      }
      return null
    }

    case "text_min_length": {
      const min = Number(rule.value ?? 0)
      if (value.length < min) return fail(`Must be at least ${min} characters`)
      return null
    }
    case "text_max_length": {
      const max = Number(rule.value ?? 0)
      if (value.length > max) return fail(`Must be at most ${max} characters`)
      return null
    }
    case "text_regex": {
      if (!rule.value) return null
      try {
        if (!new RegExp(rule.value).test(value)) return fail("Doesn't match the required format")
      } catch {
        return null // malformed pattern set by the builder — don't block submitters over it
      }
      return null
    }
    case "text_contains": {
      if (rule.value && !value.includes(rule.value)) return fail(`Must contain "${rule.value}"`)
      return null
    }
    case "text_not_contains": {
      if (rule.value && value.includes(rule.value)) return fail(`Must not contain "${rule.value}"`)
      return null
    }
    case "text_email": {
      if (!EMAIL_RE.test(value)) return fail("Enter a valid email address")
      return null
    }
    case "text_url": {
      try {
        new URL(value)
      } catch {
        return fail("Enter a valid URL")
      }
      return null
    }
    default:
      return null
  }
}

/** Validates every field's value, returning a map of fieldId -> error message for failures. */
export function validateFields(
  fields: FormField[],
  values: Record<string, string>
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const field of fields) {
    const value = values[field.id] ?? ""
    if (field.required && !value.trim()) {
      errors[field.id] = `${field.label} is required`
      continue
    }
    const error = validateFieldValue(field, value)
    if (error) errors[field.id] = error
  }
  return errors
}
