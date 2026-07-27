"use server";

type ContactFormInput = {
  name: string;
  email: string;
  message: string;
};

type ContactFormResult =
  | { success: true }
  | { success: false; error: string };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitContactForm({
  name,
  email,
  message,
}: ContactFormInput): Promise<ContactFormResult> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const toEmail = process.env.CONTACT_EMAIL ?? fromEmail;

  if (!resendApiKey) {
    return { success: false, error: "Missing Resend API key." };
  }

  if (!fromEmail) {
    return {
      success: false,
      error: "Missing sender email address for contact messages.",
    };
  }

  if (!toEmail) {
    return {
      success: false,
      error: "Missing destination email address for contact messages.",
    };
  }

  if (!name.trim() || !message.trim() || !emailPattern.test(email.trim())) {
    return {
      success: false,
      error: "Please enter your name, a valid email, and a message.",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: toEmail,
      reply_to: email.trim(),
      subject: `New contact message from ${name.trim()}`,
      html: `
        <h2>New contact message</h2>
        <p><strong>Name:</strong> ${escapeHtml(name.trim())}</p>
        <p><strong>Email:</strong> ${escapeHtml(email.trim())}</p>
        <p><strong>Message:</strong></p>
        <p>${escapeHtml(message.trim()).replace(/\n/g, "<br />")}</p>
      `,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      success: false,
      error: body ? `Unable to send message: ${body}` : "Unable to send message.",
    };
  }

  return { success: true };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
