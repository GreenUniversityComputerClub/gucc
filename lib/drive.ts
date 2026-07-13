import { google } from "googleapis"
import { Readable } from "stream"
import { getGoogleAuth } from "./google-auth"

function getDriveClient() {
  return google.drive({ version: "v3", auth: getGoogleAuth() })
}

/** Accepts a full Drive folder URL or a bare folder ID and returns the ID. */
export function extractFolderId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim()
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9-_]+)/)
  if (match) return match[1]
  const idParam = trimmed.match(/[?&]id=([a-zA-Z0-9-_]+)/)
  if (idParam) return idParam[1]
  if (/^[a-zA-Z0-9-_]{10,}$/.test(trimmed)) return trimmed
  return null
}

/** Confirms the service account can see the folder, and that it really is a folder. */
export async function validateFolder(
  folderId: string
): Promise<{ ok: boolean; name?: string; error?: string }> {
  try {
    const drive = getDriveClient()
    const res = await drive.files.get({ fileId: folderId, fields: "id, name, mimeType" })
    if (res.data.mimeType !== "application/vnd.google-apps.folder") {
      return { ok: false, error: "That link points to a file, not a folder. Paste a folder link instead." }
    }
    return { ok: true, name: res.data.name ?? undefined }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    if (message.includes("404")) {
      return { ok: false, error: "Folder not found. Check the link and make sure it's shared with the service account." }
    }
    if (message.includes("403")) {
      return { ok: false, error: "No access to this folder. Share it with the service account email as Editor." }
    }
    return { ok: false, error: message }
  }
}

export interface DriveUploadResult {
  fileId: string
}

/** Fetches a file's bytes + metadata for proxying a download through our own site. */
export async function getFileForDownload(fileId: string): Promise<{
  stream: NodeJS.ReadableStream
  name: string
  mimeType: string
}> {
  const drive = getDriveClient()
  const meta = await drive.files.get({ fileId, fields: "name, mimeType" })
  const content = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  )
  return {
    stream: content.data as unknown as NodeJS.ReadableStream,
    name: meta.data.name ?? "download",
    mimeType: meta.data.mimeType ?? "application/octet-stream",
  }
}

/** Uploads a file directly into the given Drive folder. Returns the Drive file id — build
 * the downloadable URL as `/api/files/{fileId}` so downloads are proxied through our own
 * site instead of redirecting to drive.google.com. */
export async function uploadFileToFolder(params: {
  folderId: string
  fileName: string
  mimeType: string
  buffer: Buffer
}): Promise<DriveUploadResult> {
  const drive = getDriveClient()

  const created = await drive.files.create({
    requestBody: { name: params.fileName, parents: [params.folderId] },
    media: { mimeType: params.mimeType, body: Readable.from(params.buffer) },
    fields: "id",
  })

  const fileId = created.data.id
  if (!fileId) throw new Error("Drive did not return a file id after upload.")

  return { fileId }
}
