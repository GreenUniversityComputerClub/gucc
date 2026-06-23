import { NextRequest, NextResponse } from "next/server";

const web3formsAccessKey = process.env.WEB3FORMS_ACCESS_KEY;

type ContactRequest = {
  name?: unknown;
  email?: unknown;
  message?: unknown;
};

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

    if (!web3formsAccessKey) {
      return NextResponse.json(
        {
          error: "WEB3FORMS_ACCESS_KEY is not configured.",
        },
        { status: 500 },
      );
    }

    const response = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        access_key: web3formsAccessKey,
        subject: `New Contact Form Submission from ${name}`,
        from_name: "GUCC Website",
        name,
        email,
        message,
        replyto: email,
        botcheck: true,
      }),
    });

    if (!response.ok) {
      const providerError = (await response.json().catch(() => null)) as {
        message?: string;
        success?: boolean;
        error?: string;
      } | null;
      const message =
        providerError?.message ??
        providerError?.error ??
        "Web3Forms rejected the email";

      console.error("Web3Forms rejected contact email:", message);
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
