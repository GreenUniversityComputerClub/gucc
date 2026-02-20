import { NextRequest, NextResponse } from "next/server";

// Google Apps Script Form Submission Web App URL
const SHEET_API_URL =
  "https://script.google.com/macros/s/AKfycbxX1hkvNM9GlZr2huFvT1VMEBPC9OzZsQQnN4ZExR2-W_7GdBetZFm3uuk9bNA9K7g/exec";

// Validation constants
const VALID_POSITIONS = [
  "President",
  "Vice President",
  "General Secretary",
  "Treasurer",
  "Joint Secretary",
  "Organizing Secretary",
  "Publication Secretary",
  "Executive Member",
  "Member",
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^(?:\+?880|0)?1[3-9]\d{8}$/;
const STUDENT_ID_REGEX = /^\d{8,10}$/;

interface RecruitmentFormData {
  name: string;
  email: string;
  studentId: string;
  phone: string;
  batch: string;
  completedCredit: number;
  cgpa: number;
  cvUrl: string;
  photoUrl: string;
  positions: string[];
}

function validateFormData(data: RecruitmentFormData): string | null {
  if (!data.name || typeof data.name !== "string" || data.name.trim().length < 2) {
    return "Name must be at least 2 characters";
  }

  if (!data.email || !EMAIL_REGEX.test(data.email)) {
    return "Invalid email address";
  }

  if (!data.studentId || !STUDENT_ID_REGEX.test(data.studentId)) {
    return "Invalid Student ID (must be 8-10 digits, e.g., 232002184)";
  }

  if (!data.phone || !PHONE_REGEX.test(data.phone.replace(/\s/g, ""))) {
    return "Invalid phone number";
  }

  if (!data.batch || typeof data.batch !== "string" || data.batch.trim().length === 0) {
    return "Batch is required";
  }

  const credit = Number(data.completedCredit);
  if (isNaN(credit) || credit < 0 || credit > 200) {
    return "Completed credit must be between 0 and 200";
  }

  const cgpa = Number(data.cgpa);
  if (isNaN(cgpa) || cgpa < 0 || cgpa > 4.0) {
    return "CGPA must be between 0.00 and 4.00";
  }

  if (!data.cvUrl || typeof data.cvUrl !== "string" || !data.cvUrl.startsWith("http")) {
    return "CV upload is required";
  }

  if (!data.photoUrl || typeof data.photoUrl !== "string" || !data.photoUrl.startsWith("http")) {
    return "Photo upload is required";
  }

  if (
    !data.positions ||
    !Array.isArray(data.positions) ||
    data.positions.length === 0
  ) {
    return "At least one position must be selected";
  }

  for (const pos of data.positions) {
    if (!VALID_POSITIONS.includes(pos)) {
      return `Invalid position: ${pos}`;
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const data: RecruitmentFormData = await request.json();

    // Server-side validation
    const validationError = validateFormData(data);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Sanitize data — field names must match GAS doPost expectations exactly
    const sanitized = {
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      studentId: data.studentId.trim(),
      phone: data.phone.trim().replace(/\s/g, "").replace(/^\+?880/, "0"),
      batch: data.batch.trim(),
      completedCredit: Number(data.completedCredit),
      cgpa: Number(data.cgpa),
      cv: data.cvUrl.trim(),
      photo: data.photoUrl.trim(),
      positions: data.positions,
      source: "website",
    };

    // Submit to Google Apps Script Sheet API with retry
    const jsonBody = JSON.stringify(sanitized);
    const MAX_RETRIES = 3;
    let response: Response | null = null;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        response = await fetch(SHEET_API_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: jsonBody,
          signal: controller.signal,
          redirect: "follow",
        });

        clearTimeout(timeoutId);
        break;
      } catch (fetchError: unknown) {
        lastError = fetchError;
        const errName = fetchError instanceof Error ? fetchError.name : "";
        if (errName === "AbortError" || errName === "TimeoutError") {
          return NextResponse.json(
            { error: "Submission timed out. Please try again." },
            { status: 504 }
          );
        }
        if (attempt < MAX_RETRIES) {
          console.warn(`Submit attempt ${attempt} failed, retrying...`);
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }
      }
    }

    if (!response) {
      console.error("All submit attempts failed:", lastError);
      return NextResponse.json(
        { error: "Could not reach submission service. Please try again." },
        { status: 502 }
      );
    }

    // Read response as text to handle both JSON and HTML error pages
    const responseText = await response.text();

    if (responseText.trimStart().startsWith("<!DOCTYPE") || responseText.trimStart().startsWith("<HTML")) {
      console.error("Sheet API returned HTML error page");
      return NextResponse.json(
        { error: "Submission service is temporarily unavailable. Please try again." },
        { status: 502 }
      );
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      console.error("Sheet API returned non-JSON:", responseText.substring(0, 200));
      return NextResponse.json(
        { error: "Invalid response from submission service. Please try again." },
        { status: 502 }
      );
    }

    if (result.success === false) {
      const msg = result.message || result.error || "Submission failed";
      if (msg.includes("duplicate") || msg.includes("already")) {
        return NextResponse.json(
          { error: "You have already submitted an application." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "Application submitted successfully!",
    });
  } catch (error) {
    console.error("Submit route error:", error);
    return NextResponse.json(
      { error: "Internal server error during submission" },
      { status: 500 }
    );
  }
}
