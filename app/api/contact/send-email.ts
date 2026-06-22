"use server";

type ContactFormData = {
  name: string;
  email: string;
  message: string;
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

export async function sendEmail(formData: ContactFormData) {
  const name = String(formData.name ?? "").trim();
  const email = String(formData.email ?? "").trim();
  const message = String(formData.message ?? "").trim();
  const contactEmail = process.env.CONTACT_EMAIL ?? "gucc@green.edu.bd";
  const resendFromEmail =
    process.env.RESEND_FROM_EMAIL ?? "GUCC Website <gucc@green.edu.bd>";

  if (name.length < 2 || !isValidEmail(email) || message.length < 10) {
    return { success: false, error: "Invalid fields" };
  }

  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: "Email service is not configured" };
  }

  if (!contactEmail) {
    return { success: false, error: "Contact email is not configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFromEmail,
        to: contactEmail,
        subject: `New message from ${name} via GUCC Contact Form`,
        html: `
          <p>You have received a new message from your GUCC website contact form.</p>
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Message:</strong></p>
          <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
        `,
        reply_to: email,
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return { success: true };
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error: "Failed to send email" };
  }
}
