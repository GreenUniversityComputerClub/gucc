import { NextRequest, NextResponse } from "next/server";

// ─── Configuration ────────────────────────────────────────────────────────────

const SHEET_API_URL =
  "https://script.google.com/macros/s/AKfycbxmyEnJrx_muHpBYhAnjDnboQACMaIeOkZ7s-0iKLMJuVqKJS6s2NlHnGTwkbXdHbPalw/exec";

const VALID_POSITIONS = [
  "President",
  "Vice-President",
  "General Secretary",
  "Joint General Secretary",
  "Treasurer",
  "Organizing Secretary",
  "Joint Organizing Secretary",
  "Event Coordinator",
  "Programming Secretary",
  "Information Secretary",
  "Joint Information Secretary",
  "Outreach Secretary",
  "Publication Secretary",
  "Joint Publication Secretary",
  "Cultural Secretary",
  "Graphics and Multimedia Coordinators",
  "Photography Secretary",
  "Photo and Video Editor",
  "Sports Secretary",
  "Executive Members",
];

const VALID_SEMESTERS = [
  "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "Others",
];

const VALID_GENDERS = ["Male", "Female"];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^(?:\+?880|0)?1[3-9]\d{8}$/;
const STUDENT_ID_REGEX = /^\d{9}$/;

const MAX_RETRIES = 4;
const SUBMIT_TIMEOUT = 60_000; // 60 seconds
const RETRY_BASE_DELAY = 1500;

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormPayload {
  name: string;
  studentId: string;
  email: string;
  phone: string;
  gender: string;
  semester: string;
  batch: string;
  cgpa: string | number;
  completedCredit: string | number;
  positions: string;
  clubWork?: string;
  cvUrl: string;
  photoUrl: string;
  idCardUrl: string;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(d: FormPayload): string | null {
  if (!d.name || typeof d.name !== "string" || d.name.trim().length < 2)
    return "Full name must be at least 2 characters";
  if (d.name.trim().length > 100)
    return "Name is too long (max 100 characters)";

  if (!d.studentId || typeof d.studentId !== "string" || !STUDENT_ID_REGEX.test(d.studentId.trim()))
    return "Student ID must be exactly 9 digits";

  if (!d.email || typeof d.email !== "string" || !EMAIL_REGEX.test(d.email.trim()))
    return "Invalid email address";

  if (!d.phone || typeof d.phone !== "string" || !PHONE_REGEX.test(d.phone.replace(/[\s-]/g, "")))
    return "Invalid mobile number";

  if (!d.gender || !VALID_GENDERS.includes(d.gender))
    return "Gender is required";

  if (!d.semester || !VALID_SEMESTERS.includes(d.semester))
    return "Please select a valid semester";

  if (!d.batch || typeof d.batch !== "string" || d.batch.trim().length === 0)
    return "Batch is required";

  const cgpaStr = String(d.cgpa).trim();
  const cgpa = parseFloat(cgpaStr);
  if (!cgpaStr || isNaN(cgpa) || cgpa < 0 || cgpa > 4.0)
    return "CGPA must be between 0.00 and 4.00";

  const creditsStr = String(d.completedCredit).trim();
  const credits = parseInt(creditsStr, 10);
  if (!creditsStr || isNaN(credits) || credits < 0 || credits > 200)
    return "Completed credits must be a whole number between 0 and 200";
  if (creditsStr !== String(credits))
    return "Completed credits must be a whole number";

  if (!d.positions || !VALID_POSITIONS.includes(d.positions))
    return "Please select a valid position";

  if (!d.cvUrl || typeof d.cvUrl !== "string" || !d.cvUrl.startsWith("http"))
    return "CV upload is required";
  if (!d.photoUrl || typeof d.photoUrl !== "string" || !d.photoUrl.startsWith("http"))
    return "Photo upload is required";
  if (!d.idCardUrl || typeof d.idCardUrl !== "string" || !d.idCardUrl.startsWith("http"))
    return "Student ID card image is required";

  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    let data: FormPayload;
    try {
      data = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body. Please try again." },
        { status: 400 },
      );
    }

    const error = validate(data);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    // Build payload matching GAS field names exactly
    const sheetPayload = {
      name: data.name.trim(),
      studentId: data.studentId.trim(),
      email: data.email.trim().toLowerCase(),
      phone: data.phone.trim(),
      gender: data.gender,
      semester: data.semester,
      batch: data.batch.trim(),
      cgpa: String(data.cgpa).trim(),
      completedCredit: String(data.completedCredit).trim(),
      positions: data.positions,
      clubWork: (data.clubWork || "").trim(),
      cvUrl: data.cvUrl.trim(),
      photoUrl: data.photoUrl.trim(),
      idCardUrl: data.idCardUrl.trim(),
    };

    const body = JSON.stringify(sheetPayload);
    let response: Response | null = null;
    let lastError: unknown = null;
    let lastStatus: number | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SUBMIT_TIMEOUT);

        response = await fetch(SHEET_API_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body,
          signal: controller.signal,
          redirect: "follow",
        });

        clearTimeout(timeoutId);

        // Break on success or non-retryable client errors
        if (response.ok || (response.status >= 400 && response.status < 500 && !isRetryableStatus(response.status))) {
          break;
        }

        lastStatus = response.status;
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
          console.warn(`Submit attempt ${attempt} got ${response.status}, retrying in ${delay}ms...`);
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
            console.warn(`Submit attempt ${attempt} timed out, retrying in ${delay}ms...`);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          return NextResponse.json(
            { error: "Submission timed out after multiple attempts. Please try again." },
            { status: 504 },
          );
        }

        if (attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
          console.warn(`Submit attempt ${attempt} failed (network), retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
    }

    if (!response) {
      console.error("All submit attempts failed. Last error:", lastError, "Last status:", lastStatus);
      return NextResponse.json(
        { error: "Could not reach submission service after multiple attempts. Please check your connection and try again." },
        { status: 502 },
      );
    }

    // --- Read & parse response ---
    let responseText: string;
    try {
      responseText = await response.text();
    } catch {
      return NextResponse.json(
        { error: "Failed to read submission service response. Please try again." },
        { status: 502 },
      );
    }

    const trimmed = responseText.trimStart().toLowerCase();
    if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
      console.error("Sheet API returned HTML error page (status:", response.status, ")");
      return NextResponse.json(
        { error: "Submission service is temporarily unavailable. Please try again in a moment." },
        { status: 502 },
      );
    }

    if (!responseText.trim()) {
      console.error("Sheet API returned empty response (status:", response.status, ")");
      return NextResponse.json(
        { error: "Submission service returned an empty response. Please try again." },
        { status: 502 },
      );
    }

    let result: Record<string, unknown>;
    try {
      result = JSON.parse(responseText);
    } catch {
      console.error("Sheet API returned non-JSON:", responseText.slice(0, 300));
      return NextResponse.json(
        { error: "Invalid response from submission service. Please try again." },
        { status: 502 },
      );
    }

    if (result.success === false || result.error) {
      const msg = String(result.message || result.error || "Submission failed");
      const lower = msg.toLowerCase();
      if (lower.includes("duplicate") || lower.includes("already")) {
        return NextResponse.json(
          { error: "You have already submitted an application with this Student ID or email." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "Application submitted successfully!",
    });
  } catch (error) {
    console.error("Submit route unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during submission. Please try again." },
      { status: 500 },
    );
  }
}
