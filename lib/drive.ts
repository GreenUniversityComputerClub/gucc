import { google } from "googleapis"
import { Readable } from "stream"
import { getGoogleAuth } from "./google-auth"

const UPLOADS_FOLDER_NAME = "Form Uploads"

function getDriveClient() {
  return google.drive({ version: "v3", auth: getGoogleAuth() })
}

type DriveClient = ReturnType<typeof getDriveClient>

async function getSheetParentFolderId(
  sheetId: string,
  drive: DriveClient
): Promise<string | null> {
  try {
    const res = await drive.files.get({ fileId: sheetId, fields: "parents" })
    return res.data.parents?.[0] ?? null
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    throw new Error(
      `Could not read the Google Sheet's Drive location (${message}). Make sure the Sheet's folder is shared with the service account as Editor and that the Google Drive API is enabled on the project.`
    )
  }
}

async function findOrCreateUploadsFolder(
  parentId: string | null,
  drive: DriveClient
): Promise<string> {
  const q = parentId
    ? `name = '${UPLOADS_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`
    : `name = '${UPLOADS_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`

  const existing = await drive.files.list({ q, fields: "files(id, name)", spaces: "drive" })
  const found = existing.data.files?.[0]?.id
  if (found) return found

  const created = await drive.files.create({
    requestBody: {
      name: UPLOADS_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  })

  if (!created.data.id) throw new Error("Failed to create the Drive uploads folder.")
  return created.data.id
}

export interface DriveUploadResult {
  fileId: string
  url: string
}

/**
 * Uploads a file into a "Form Uploads" folder that lives right next to the
 * form's Google Sheet, so everything for a form stays in one place in Drive.
 * Requires the Sheet's parent folder to be shared with the service account
 * as Editor (sharing only the Sheet file itself is not enough to create
 * files alongside it).
 */
export async function uploadFileToSheetFolder(params: {
  sheetId: string
  fileName: string
  mimeType: string
  buffer: Buffer
}): Promise<DriveUploadResult> {
  const drive = getDriveClient()

  const parentId = await getSheetParentFolderId(params.sheetId, drive)
  const folderId = await findOrCreateUploadsFolder(parentId, drive)

  const created = await drive.files.create({
    requestBody: { name: params.fileName, parents: [folderId] },
    media: { mimeType: params.mimeType, body: Readable.from(params.buffer) },
    fields: "id",
  })

  const fileId = created.data.id
  if (!fileId) throw new Error("Drive did not return a file id after upload.")

  // Make the file link-viewable so anyone who opens the sheet can open the
  // file too, without needing separate Drive access of their own.
  try {
    await drive.permissions.create({
      fileId,
      requestBody: { role: "reader", type: "anyone" },
    })
  } catch {
    // Organization Drive policy may block public link sharing. The file
    // still exists and remains accessible to anyone with folder access.
  }

  const file = await drive.files.get({ fileId, fields: "webViewLink, webContentLink" })
  const url = file.data.webViewLink ?? file.data.webContentLink ?? ""
  return { fileId, url }
}
