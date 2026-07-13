import { NextRequest, NextResponse } from "next/server"
import { uploadFileToFolder, extractFolderId } from "@/lib/drive"

const MAX_SIZE_BYTES = 15 * 1024 * 1024 // 15MB

// fieldId prefixes that carry a fixed, known purpose get an extra type check
// on the server too (never trust the client-side `accept` attribute alone).
function enforceExpectedType(fieldId: string, file: File): string | null {
  if (fieldId === "form-logo" && !file.type.startsWith("image/")) {
    return "The form logo must be an image file."
  }
  if (fieldId === "form-rulebook" && file.type !== "application/pdf") {
    return "The rule book must be a PDF file."
  }
  return null
}

function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-100)
}

export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get("file") as File | null
  const fieldId = fd.get("fieldId") as string | null
  const folderRef = fd.get("folderId") as string | null

  if (!file || !fieldId) {
    return NextResponse.json({ error: "Missing file or fieldId" }, { status: 400 })
  }

  if (!folderRef || !folderRef.trim()) {
    return NextResponse.json(
      { error: "Connect and verify this form's Google Drive folder before uploading files." },
      { status: 400 }
    )
  }

  const folderId = extractFolderId(folderRef)
  if (!folderId) {
    return NextResponse.json({ error: "Invalid Google Drive folder URL or ID." }, { status: 400 })
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

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin"
  const safeName = sanitizeFileName(file.name.replace(/\.[^.]+$/, ""))
  const driveFileName = `${Date.now()}-${fieldId}-${safeName}.${ext}`

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const { fileId } = await uploadFileToFolder({
      folderId,
      fileName: driveFileName,
      mimeType: file.type || "application/octet-stream",
      buffer,
    })
    // Proxied through our own site so opening/downloading never redirects to drive.google.com.
    // Absolute, since this also gets written into the Sheet cell and opened from outside the app.
    const downloadUrl = new URL(`/api/files/${fileId}`, req.url).toString()
    return NextResponse.json({ url: downloadUrl, fileId, fileName: file.name })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
