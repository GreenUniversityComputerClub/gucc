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
  rulebookUrl?: string
  rulebookFileName?: string
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