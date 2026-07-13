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
  /** Shown to the person filling out the form, above the fields on this page/segment */
  description?: string
}

export interface FormConfig {
  id: string
  userId: string
  title: string
  description?: string
  logoUrl?: string
  /** Where the logo renders relative to the title/description. Defaults to "top" (above the title). */
  logoPosition?: "top" | "below-description"
  rulebookUrl?: string
  rulebookFileName?: string
  /** Google Drive folder (shared with the service account) where logo/rulebook/submission files are stored */
  driveFolderId?: string
  sheetId: string
  sheetName: string
  fields: FormField[]
  pages: FormPage[]
  submitLabel?: string
  successMessage?: string
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