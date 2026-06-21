// types/form.ts

export type FieldType =
  | 'text' | 'textarea' | 'email' | 'phone' | 'number' | 'date'
  | 'select' | 'checkbox' | 'radio' | 'file' | 'image' | 'rating' | 'url'

export interface FormField {
  id: string           // uuid
  type: FieldType
  label: string
  placeholder?: string
  helpText?: string
  required: boolean
  isUnique: boolean    // if true, check sheet for duplicate before inserting
  options?: string[]   // for select/checkbox/radio
  accept?: string      // for file: 'image/*', '.pdf', etc.
  pageIndex: number    // which page this field belongs to (0-based)
}

export interface FormConfig {
  id: string
  userId: string
  title: string
  description?: string
  sheetId: string      // extracted from sheets.google.com/d/{sheetId}/...
  sheetName: string    // tab name, default 'Sheet1'
  fields: FormField[]
  pageCount: number
  createdAt: string
  updatedAt: string
}