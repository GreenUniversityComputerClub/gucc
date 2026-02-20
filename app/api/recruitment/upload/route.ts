import { NextRequest, NextResponse } from "next/server";

const UPLOAD_API_URL =
  "https://script.google.com/macros/s/AKfycbwezyc-gSEYD9C0lZszc7B7dLdyzPncs1ABSscRJ1coWTeXTEp1YYeDYmkgNK1TrJkT/exec";

// Max file sizes
const MAX_CV_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB

const ALLOWED_CV_TYPES = ["application/pdf"];
const ALLOWED_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const fileType = formData.get("type") as string | null; // "cv" or "photo"

    if (!file || !fileType) {
      return NextResponse.json(
        { error: "File and type are required" },
        { status: 400 }
      );
    }

    if (!["cv", "photo"].includes(fileType)) {
      return NextResponse.json(
        { error: "Invalid file type. Must be 'cv' or 'photo'" },
        { status: 400 }
      );
    }

    // Validate file has content
    if (file.size === 0) {
      return NextResponse.json(
        { error: "File is empty" },
        { status: 400 }
      );
    }

    // Validate file size
    const maxSize = fileType === "cv" ? MAX_CV_SIZE : MAX_PHOTO_SIZE;
    if (file.size > maxSize) {
      const maxMB = maxSize / (1024 * 1024);
      return NextResponse.json(
        { error: `File too large. Maximum size is ${maxMB}MB` },
        { status: 400 }
      );
    }

    // Validate MIME type
    const allowedTypes =
      fileType === "cv" ? ALLOWED_CV_TYPES : ALLOWED_PHOTO_TYPES;
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Invalid file format. Allowed: ${allowedTypes.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // Build payload for Google Apps Script
    // GAS expects: { file, fileName, fileType (MIME), category ("cv"|"photo") }
    const payload = {
      file: base64,
      fileName: file.name,
      fileType: file.type,
      category: fileType,
    };

    // Send to Google Apps Script Upload API with retry
    // GAS returns a 302 redirect; fetch() auto-follows it as GET and returns the JSON response
    const jsonBody = JSON.stringify(payload);
    const MAX_RETRIES = 3;
    let response: Response | null = null;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);

        response = await fetch(UPLOAD_API_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: jsonBody,
          signal: controller.signal,
          redirect: "follow",
        });

        clearTimeout(timeoutId);
        break; // success, exit retry loop
      } catch (fetchError: unknown) {
        lastError = fetchError;
        clearTimeout(0); // ensure no dangling timers
        const errName = fetchError instanceof Error ? fetchError.name : "";

        if (errName === "AbortError" || errName === "TimeoutError") {
          return NextResponse.json(
            { error: "Upload timed out. Please try again with a smaller file." },
            { status: 504 }
          );
        }

        // Retry on ETIMEDOUT / network errors
        if (attempt < MAX_RETRIES) {
          console.warn(`Upload attempt ${attempt} failed, retrying...`);
          await new Promise((r) => setTimeout(r, 1000 * attempt)); // backoff
          continue;
        }
      }
    }

    if (!response) {
      console.error("All upload attempts failed:", lastError);
      return NextResponse.json(
        { error: "Could not reach upload service. Please try again." },
        { status: 502 }
      );
    }

    // Read the response body as text first to handle both JSON and HTML error pages
    const responseText = await response.text();

    // Check if the response is HTML (GAS error page) instead of JSON
    if (responseText.trimStart().startsWith("<!DOCTYPE") || responseText.trimStart().startsWith("<HTML")) {
      console.error("Upload API returned HTML error page");
      return NextResponse.json(
        { error: "Upload service is temporarily unavailable. Please try again." },
        { status: 502 }
      );
    }

    // Parse JSON response
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      console.error("Upload API returned non-JSON:", responseText.substring(0, 200));
      return NextResponse.json(
        { error: "Invalid response from upload service. Please try again." },
        { status: 502 }
      );
    }

    // Check for errors in the response
    if (result.success === false) {
      return NextResponse.json(
        { error: result.message || result.error || "Upload failed" },
        { status: 400 }
      );
    }

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Return the file URL
    const fileUrl = result.url || result.fileUrl || result.link;
    if (!fileUrl) {
      console.error("Upload API response missing URL:", JSON.stringify(result));
      return NextResponse.json(
        { error: "Upload succeeded but no URL was returned. Please try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      url: fileUrl,
    });
  } catch (error) {
    console.error("Upload route error:", error);
    return NextResponse.json(
      { error: "Internal server error during upload" },
      { status: 500 }
    );
  }
}
