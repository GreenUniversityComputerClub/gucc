import { NextRequest, NextResponse } from "next/server";

const contactEmail = process.env.CONTACT_EMAIL ?? "gucc@green.edu.bd";
const resendFromEmail =
  process.env.RESEND_FROM_EMAIL ?? "GUCC Website <gucc@green.edu.bd>";

type ContactRequest = {
  name?: unknown;
  email?: unknown;
  message?: unknown;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ContactRequest;
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();
    const message = String(body.message ?? "").trim();

    if (
      !name ||
      name.length > 100 ||
      !isValidEmail(email) ||
      email.length > 254 ||
      !message ||
      message.length > 5000
    ) {
      return NextResponse.json(
        { error: "Invalid contact form submission" },
        { status: 400 },
      );
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "Email service is not configured" },
        { status: 500 },
      );
    }

    if (!contactEmail) {
      return NextResponse.json(
        { error: "Contact email is not configured" },
        { status: 500 },
      );
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFromEmail,
        to: contactEmail,
        subject: `New Contact Form Submission from ${name}`,
        html: `
          <h2>New Contact Form Submission</h2>
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Message:</strong></p>
          <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
        `,
        reply_to: email,
      }),
    });

    if (!response.ok) {
      const providerError = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      const message = providerError?.message ?? "Resend rejected the email";

      console.error("Resend rejected contact email:", message);
      return NextResponse.json(
        {
          error:
            process.env.NODE_ENV === "development"
              ? message
              : "Email delivery was rejected. Please try again later.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { message: "Email sent successfully" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 },
    );
  }
}
