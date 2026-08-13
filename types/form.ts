export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "number"
  | "date"
  | "select"
  | "checkbox"
  | "radio"
  | "file"
  | "image"
  | "rating"
  | "url"
  | "time"
  | "color"
  | "range"

export interface SelectOption {
  label: string
  value: string
}

export type ValidationRuleType =
  | "none"
  | "number_gt"
  | "number_gte"
  | "number_lt"
  | "number_lte"
  | "number_eq"
  | "number_between"
  | "number_integer"
  | "text_min_length"
  | "text_max_length"
  | "text_regex"
  | "text_contains"
  | "text_not_contains"
  | "text_email"
  | "text_url"

export interface ValidationRule {
  type: ValidationRuleType
  /** Primary comparison value (number or text depending on rule type) */
  value?: string
  /** Secondary value, only used by "*_between" rules */
  value2?: string
  /** Shown instead of the generic error when this rule fails */
  message?: string
}

export interface FormField {
  id: string
  type: FieldType
  label: string
  placeholder?: string
  helpText?: string
  required: boolean
  isUnique: boolean
  options?: SelectOption[]
  accept?: string
  min?: number
  max?: number
  step?: number
  rows?: number
  pageIndex: number
  width?: "full" | "half"
  /** Arbitrary HTML attributes applied directly to the rendered input, e.g. { pattern: "[0-9]{10}", maxLength: "10", autoComplete: "off" } */
  customAttributes?: Record<string, string>
  /** Google-Forms-style response validation, checked in addition to `required` */
  validation?: ValidationRule
}

export interface FormPage {
  title?: string
  /** Sanitized rich-text HTML shown to the person filling out the form, above the fields on this page/segment */
  description?: string
}

export interface FormConfig {
  id: string
  userId: string
  /** Email of the executive who created this form. Powers "Created by" display and the delete-approval flow. */
  createdByEmail?: string
  /** Email of whoever last requested to delete this form (someone other than the creator) */
  pendingDeleteRequestedByEmail?: string
  /** Secret token emailed to the creator; must match for approve-delete to take effect */
  pendingDeleteToken?: string
  /** Set once the creator approves the pending delete request, unlocking deletion for pendingDeleteRequestedByEmail */
  pendingDeleteApproved?: boolean
  pendingDeleteRequestedAt?: string
  title: string
  /** Sanitized rich-text HTML (bold, lists, links, etc.), not plain text */
  description?: string
  logoUrl?: string
  /** Where the banner image renders relative to the title/description. Defaults to "top". */
  logoPosition?: "top" | "below-description" | "left" | "right" | "background"
  rulebookUrl?: string
  rulebookFileName?: string
  /** @deprecated Google Drive folder id — no longer used for new uploads (Supabase Storage is used instead). Kept so old forms still resolve any Drive-hosted links they already saved. */
  driveFolderId?: string
  sheetId: string
  sheetName: string
  fields: FormField[]
  pages: FormPage[]
  submitLabel?: string
  /** Sanitized rich-text HTML shown after submission when successAction is "message" */
  successMessage?: string
  /** Image shown alongside the success message */
  successImageUrl?: string
  /** What happens right after a successful submission. Defaults to "message". */
  successAction?: "message" | "redirect"
  /** External URL to send the user to when successAction is "redirect" */
  redirectUrl?: string
  /** Seconds to show the "redirecting..." screen before navigating away. Defaults to 3. */
  redirectDelaySeconds?: number
  createdAt: string
  updatedAt: string
}

export interface FormSubmission {
  formId: string
  submittedAt: string
  values: Record<string, string>
}

export interface ApiSuccess<T> {
  data: T
  error: null
}

export interface ApiError {
  data: null
  error: string
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError