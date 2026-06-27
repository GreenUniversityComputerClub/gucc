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
}

export interface FormPage {
  title?: string
  description?: string
}

export interface FormConfig {
  id: string
  userId: string
  title: string
  description?: string
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