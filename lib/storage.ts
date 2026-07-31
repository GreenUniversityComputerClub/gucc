import { getSupabaseAdmin } from "./supabase/admin"

/** Public Supabase Storage bucket that all form-builder uploads (banners, rule books,
 * and per-field file/image uploads) go into. Create it once in the Supabase dashboard
 * under Storage, marked "Public bucket" so the returned URLs work without auth. */
export const UPLOADS_BUCKET = "form-uploads"

export function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-100)
}

/** Builds a collision-resistant storage path, grouped by form so a bucket listing stays readable. */
export function buildStoragePath(params: { formId?: string | null; fieldId: string; fileName: string }): string {
  const ext = params.fileName.split(".").pop()?.toLowerCase() || "bin"
  const base = sanitizeFileName(params.fileName.replace(/\.[^.]+$/, ""))
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const folder = params.formId?.trim() || "unsaved"
  return `${folder}/${params.fieldId}/${unique}-${base}.${ext}`
}

export interface StorageUploadResult {
  publicUrl: string
  path: string
}

/** Uploads a file into the shared public bucket and returns its permanent public URL. */
export async function uploadToStorage(params: {
  path: string
  mimeType: string
  buffer: Buffer
}): Promise<StorageUploadResult> {
  const supabase = getSupabaseAdmin()

  const { error } = await supabase.storage.from(UPLOADS_BUCKET).upload(params.path, params.buffer, {
    contentType: params.mimeType,
    upsert: false,
  })

  if (error) {
    if (error.message?.toLowerCase().includes("bucket not found")) {
      throw new Error(
        `Storage bucket "${UPLOADS_BUCKET}" doesn't exist yet. Create a public bucket with this exact name in your Supabase project's Storage section.`
      )
    }
    throw new Error(error.message)
  }

  const { data } = supabase.storage.from(UPLOADS_BUCKET).getPublicUrl(params.path)
  return { publicUrl: data.publicUrl, path: params.path }
}
