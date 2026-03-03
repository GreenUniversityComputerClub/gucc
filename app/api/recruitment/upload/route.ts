import { NextRequest, NextResponse } from "next/server";

// ─── Configuration ────────────────────────────────────────────────────────────

const UPLOAD_API_URL =
  "https://script.google.com/macros/s/AKfycbx8JQnkB9Do0PZt0WADzCFuRojLB5Ze2nMOZV1hgdqAFN5H7wpoaze3YPsT1RAeeq5H/exec";

// Accepted MIME types (with common variants browsers may report)
const ACCEPTED_TYPES = {
  cv: [
    "application/pdf",
    "application/x-pdf",
    "application/acrobat",
    "application/vnd.pdf",
    "text/pdf",
    "text/x-pdf",
  ],
  photo: [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ],
  idCard: [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ],
};

// File extensions as fallback when MIME type is empty or unreliable
const ACCEPTED_EXTENSIONS = {
  cv: ["pdf"],
  photo: ["jpg", "jpeg", "png", "webp"],
  idCard: ["jpg", "jpeg", "png", "webp"],
};

const LABELS = {
  cv: "CV (PDF)",
  photo: "Photo",
  idCard: "ID Card",
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB for all categories
const MAX_RETRIES = 4;
const UPLOAD_TIMEOUT = 180_000; // 3 minutes
const RETRY_BASE_DELAY = 1500;

type FileCategory = keyof typeof ACCEPTED_TYPES;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

function isValidFileType(file: File, category: FileCategory): boolean {
  const mimeType = (file.type || "").toLowerCase().trim();
  const ext = getExtension(file.name);

  // Check MIME type first
  if (mimeType && ACCEPTED_TYPES[category].includes(mimeType)) {
    return true;
  }

  // Fallback: check file extension (handles empty/unknown MIME types)
  if (ext && ACCEPTED_EXTENSIONS[category].includes(ext)) {
    return true;
  }

  return false;
}

function isRetryableStatus(status: number): boolean {
  return [429, 500, 502, 503, 504].includes(status);
}

function formatMB(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // --- Parse multipart form data ---
    let formData: globalThis.FormData;
    try {
      formData = await request.formData();
    } catch (parseError) {
      console.error("[Upload] Failed to parse form data:", parseError);
      return NextResponse.json(
        { error: "Could not read the uploaded file. The file may be too large or the request was interrupted. Please try again." },
        { status: 400 },
      );
    }

    const file = formData.get("file") as File | null;
    const fileType = formData.get("type") as string | null;

    // --- Presence checks ---
    if (!file || !fileType) {
      console.error("[Upload] Missing fields - file:", !!file, "type:", fileType);
      return NextResponse.json(
        { error: "File and type are required" },
        { status: 400 },
      );
    }

    if (!(fileType in ACCEPTED_TYPES)) {
      console.error("[Upload] Invalid category:", fileType);
      return NextResponse.json(
        { error: "Invalid file type. Must be 'cv', 'photo', or 'idCard'" },
        { status: 400 },
      );
    }

    const category = fileType as FileCategory;
    const label = LABELS[category];

    // --- File validations ---
    if (file.size === 0) {
      console.error("[Upload] Empty file:", file.name);
      return NextResponse.json(
        { error: `${label} file is empty. Please select a valid file.` },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      console.error("[Upload] File too large:", file.name, file.size);
      return NextResponse.json(
        { error: `${label} is too large (${formatMB(file.size)}). Maximum allowed size is ${formatMB(MAX_FILE_SIZE)}.` },
        { status: 400 },
      );
    }

    if (!isValidFileType(file, category)) {
      const exts = ACCEPTED_EXTENSIONS[category].map((e) => `.${e}`).join(", ");
      console.error("[Upload] Invalid file type:", file.name, "MIME:", file.type, "Category:", category);
      return NextResponse.json(
        { error: `Invalid ${label} format (detected: "${file.type || "unknown"}"). Accepted formats: ${exts}` },
        { status: 400 },
      );
    }

    // --- Convert to base64 ---
    let base64: string;
    try {
      const arrayBuffer = await file.arrayBuffer();
      base64 = Buffer.from(arrayBuffer).toString("base64");
    } catch (bufferError) {
      console.error("[Upload] Failed to read file buffer:", bufferError);
      return NextResponse.json(
        { error: "Failed to process the file. It may be corrupted. Please try a different file." },
        { status: 400 },
      );
    }

    // Determine the correct MIME type to send to GAS
    const resolvedMime = file.type || (category === "cv" ? "application/pdf" : `image/${getExtension(file.name) === "png" ? "png" : getExtension(file.name) === "webp" ? "webp" : "jpeg"}`);

    const payload = JSON.stringify({
      file: base64,
      fileName: file.name,
      fileType: resolvedMime,
      type: category, // GAS expects "cv", "photo", or "idCard"
    });

    console.log(`[Upload] Sending ${label} to GAS: ${file.name} (${formatMB(file.size)}, ${resolvedMime})`);

    // --- Send to Google Apps Script with retry + exponential backoff ---
    let response: Response | null = null;
    let lastError: unknown = null;
    let lastStatus: number | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT);

        response = await fetch(UPLOAD_API_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: payload,
          signal: controller.signal,
          redirect: "follow",
        });

        clearTimeout(timeoutId);

        if (response.ok || (response.status >= 400 && response.status < 500 && !isRetryableStatus(response.status))) {
          break;
        }

        lastStatus = response.status;
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
          console.warn(`[Upload] Attempt ${attempt} got ${response.status}, retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          response = null;
          continue;
        }
      } catch (err: unknown) {
        lastError = err;
        const errName = err instanceof Error ? err.name : "";

        if (errName === "AbortError") {
          if (attempt < MAX_RETRIES) {
            const delay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
            console.warn(`[Upload] Attempt ${attempt} timed out, retrying in ${delay}ms...`);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          return NextResponse.json(
            { error: "Upload timed out after multiple attempts. Please try with a smaller file or check your connection." },
            { status: 504 },
          );
        }

        if (attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
          console.warn(`[Upload] Attempt ${attempt} failed (network), retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
    }

    if (!response) {
      console.error("[Upload] All attempts failed. Last error:", lastError, "Last status:", lastStatus);
      return NextResponse.json(
        { error: "Could not reach the upload service after multiple attempts. Please check your connection and try again." },
        { status: 502 },
      );
    }

    // --- Read & parse response ---
    let responseText: string;
    try {
      responseText = await response.text();
    } catch {
      return NextResponse.json(
        { error: "Failed to read upload service response. Please try again." },
        { status: 502 },
      );
    }

    console.log(`[Upload] GAS response (status ${response.status}):`, responseText.slice(0, 500));

    const trimmed = responseText.trimStart().toLowerCase();
    if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
      console.error("[Upload] GAS returned HTML error page");
      return NextResponse.json(
        { error: "Upload service is temporarily unavailable. Please wait a moment and try again." },
        { status: 502 },
      );
    }

    if (!responseText.trim()) {
      console.error("[Upload] GAS returned empty response");
      return NextResponse.json(
        { error: "Upload service returned an empty response. Please try again." },
        { status: 502 },
      );
    }

    let result: Record<string, unknown>;
    try {
      result = JSON.parse(responseText);
    } catch {
      console.error("[Upload] GAS returned non-JSON:", responseText.slice(0, 300));
      return NextResponse.json(
        { error: "Invalid response from upload service. Please try again." },
        { status: 502 },
      );
    }

    if (result.success === false || result.error) {
      const msg = String(result.message || result.error || "Upload failed");
      console.error("[Upload] GAS error:", msg);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const fileUrl = (result.url || result.fileUrl || result.link || result.fileLink) as string | undefined;
    if (!fileUrl) {
      console.error("[Upload] GAS response missing URL:", JSON.stringify(result));
      return NextResponse.json(
        { error: "Upload completed but the file URL was not returned. Please try again." },
        { status: 502 },
      );
    }

    console.log(`[Upload] Success: ${file.name} → ${fileUrl}`);
    return NextResponse.json({ success: true, url: fileUrl });
  } catch (error) {
    console.error("[Upload] Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during upload. Please try again." },
      { status: 500 },
    );
  }
}
