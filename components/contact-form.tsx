"use client";

import { FormEvent, useMemo, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

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
      form.name.trim().length >= 2 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) &&
      form.message.trim().length >= 10
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
      setErrorMessage("Please complete every field with valid information.");
      return;
    }

    setSubmitState("submitting");
    setErrorMessage("");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          message: form.message.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to send message");
      }

      setForm(initialFormState);
      setSubmitState("success");
    } catch {
      setSubmitState("error");
      setErrorMessage("We could not send your message. Please try again.");
    }
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
            aria-invalid={submitState === "error" && form.name.trim().length < 2}
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
            aria-invalid={
              submitState === "error" && form.message.trim().length < 10
            }
            disabled={isSubmitting}
            required
          />
        </div>

        {submitState === "success" && (
          <p className="text-sm font-medium text-primary">
            Thanks. Your message has been sent.
          </p>
        )}

        {submitState === "error" && errorMessage && (
          <p className="text-sm font-medium text-destructive">
            {errorMessage}
          </p>
        )}

        <Button
          type="submit"
          className="w-full gap-2"
          disabled={isSubmitting}
        >
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
