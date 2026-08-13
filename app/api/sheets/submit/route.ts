import { NextRequest, NextResponse } from "next/server"
import { getFormById } from "@/lib/forms"
import { checkUniqueness, ensureHeaderRow, appendRow } from "@/lib/sheets"
import { validateFields } from "@/lib/validation"
import { getFormAvailability } from "@/lib/form-status"

const CLOSED_MESSAGES = {
  closed: "This form is no longer accepting responses.",
  "not-started": "This form isn't open yet.",
  expired: "This form's response window has closed.",
}

export async function POST(req: NextRequest) {
  const body = await req.formData()

  const formId = body.get("formId") as string
  if (!formId) return NextResponse.json({ data: null, error: "Missing formId" }, { status: 400 })

  const form = await getFormById(formId)
  if (!form) return NextResponse.json({ data: null, error: "Form not found" }, { status: 404 })

  // Never trust the client's rendered state alone — someone could hit this route directly.
  const availability = getFormAvailability(form)
  if (!availability.open) {
    return NextResponse.json({ data: null, error: CLOSED_MESSAGES[availability.reason] }, { status: 403 })
  }

  // Build values map: fieldId -> string value (file fields already come as URLs from client)
  const values: Record<string, string> = {}
  for (const field of form.fields) {
    values[field.id] = (body.get(field.id) as string) ?? ""
  }

  // Server-side validation (required + type + custom rules) — never trust the client alone
  const validationErrors = validateFields(form.fields, values)
  if (Object.keys(validationErrors).length > 0) {
    return NextResponse.json(
      { data: null, error: "Some responses are invalid.", fieldErrors: validationErrors },
      { status: 400 }
    )
  }

  // Uniqueness check + header check are independent Sheets API calls — run them
  // together instead of one after another to cut the round-trip time roughly in half.
  const [unique] = await Promise.all([checkUniqueness(form, values), ensureHeaderRow(form)])
  if (!unique.ok) {
    return NextResponse.json(
      { data: null, error: `"${unique.conflictField}" with value "${unique.conflictValue}" already exists.` },
      { status: 409 }
    )
  }

  // Append row
  const submittedAt = new Date().toISOString()
  await appendRow(form, values, submittedAt)

  return NextResponse.json({ data: { submitted: true, submittedAt }, error: null })
}