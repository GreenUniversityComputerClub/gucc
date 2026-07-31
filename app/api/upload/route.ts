import { NextRequest, NextResponse } from "next/server"
import { uploadToStorage, buildStoragePath } from "@/lib/storage"

const MAX_SIZE_BYTES = 15 * 1024 * 1024 // 15MB

// fieldId prefixes that carry a fixed, known purpose get an extra type check
// on the server too (never trust the client-side `accept` attribute alone).
function enforceExpectedType(fieldId: string, file: File): string | null {
  if ((fieldId === "form-logo" || fieldId === "form-success-image") && !file.type.startsWith("image/")) {
    return "Please upload an image file."
  }
  if (fieldId === "form-rulebook" && file.type !== "application/pdf") {
    return "The rule book must be a PDF file."
  }
  return null
}

export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get("file") as File | null
  const fieldId = fd.get("fieldId") as string | null
  const formId = (fd.get("formId") as string | null) ?? undefined

  if (!file || !fieldId) {
    return NextResponse.json({ error: "Missing file or fieldId" }, { status: 400 })
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "The selected file is empty." }, { status: 400 })
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File is too large. Max size is ${MAX_SIZE_BYTES / (1024 * 1024)}MB.` },
      { status: 400 }
    )
  }

  const typeError = enforceExpectedType(fieldId, file)
  if (typeError) {
    return NextResponse.json({ error: typeError }, { status: 400 })
  }

  const path = buildStoragePath({ formId, fieldId, fileName: file.name })

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const { publicUrl } = await uploadToStorage({
      path,
      mimeType: file.type || "application/octet-stream",
      buffer,
    })
    return NextResponse.json({ url: publicUrl, fileName: file.name })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
