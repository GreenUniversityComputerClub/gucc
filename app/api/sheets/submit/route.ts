// In api/sheets/submit/route.ts
const uniqueFields = form.fields.filter(f => f.isUnique)
for (const field of uniqueFields) {
  const colLetter = indexToCol(form.fields.indexOf(field))  // A, B, C...
  const existing = await getColumn(form.sheetId, form.sheetName, colLetter)
  if (existing.includes(submittedValue)) {
    return Response.json({ error: `${field.label} already exists` }, { status: 409 })
  }
}