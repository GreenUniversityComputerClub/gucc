"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { submitContactForm } from "@/lib/contact/actions";

type FormState = {
  name: string;
  email: string;
  message: string;
};

type SubmitState = "idle" | "submitting" | "success" | "error";

const initialFormState: FormState = {
  name: "",
  email: "",
  message: "",
};

export function ContactForm() {
  const [form, setForm] = useState<FormState>(initialFormState);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const isSubmitting = submitState === "submitting";

  const isValid = useMemo(() => {
    return (
      form.name.trim().length >= 1 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) &&
      form.message.trim().length >= 1
    );
  }, [form]);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    if (submitState !== "submitting") {
      setSubmitState("idle");
      setErrorMessage("");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isValid) {
      setSubmitState("error");
      setErrorMessage("Please enter your name, a valid email, and a message.");
      return;
    }

    setSubmitState("submitting");
    setErrorMessage("");

    const result = await submitContactForm({
      name: form.name,
      email: form.email,
      message: form.message,
    });

    if (!result.success) {
      setSubmitState("error");
      setErrorMessage(result.error);
      return;
    }

    setForm(initialFormState);
    setSubmitState("success");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8"
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="contact-name">Name</Label>
          <Input
            id="contact-name"
            name="name"
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
            placeholder="Your name"
            autoComplete="name"
            aria-invalid={submitState === "error" && !form.name.trim()}
            maxLength={100}
            disabled={isSubmitting}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-email">Email</Label>
          <Input
            id="contact-email"
            name="email"
            type="email"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            aria-invalid={
              submitState === "error" &&
              !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
            }
            disabled={isSubmitting}
            maxLength={254}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-message">Message</Label>
          <Textarea
            id="contact-message"
            name="message"
            value={form.message}
            onChange={(event) => updateField("message", event.target.value)}
            placeholder="Tell us what is on your mind"
            className="min-h-36 resize-none"
            aria-invalid={submitState === "error" && !form.message.trim()}
            disabled={isSubmitting}
            maxLength={5000}
            required
          />
        </div>

        {submitState === "success" && (
          <p className="text-sm font-medium text-primary">
            Thanks. Your message has been sent.
          </p>
        )}

        {submitState === "error" && errorMessage && (
          <p className="text-sm font-medium text-destructive">{errorMessage}</p>
        )}

        <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Send Message
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
