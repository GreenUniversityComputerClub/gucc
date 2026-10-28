"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { submitContactForm } from "@/lib/contact/actions";
import { Turnstile } from "@/components/turnstile";
import { CONTACT_TOPICS, topicOf, type ContactTopic } from "@/lib/contact/topics";

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE = 5000;

/** A link such as /contact?topic=partnership preselects the Topic list (read in the browser, so the page stays static). */
export function ContactForm() {
  const [form, setForm] = useState<FormState>(initialFormState);
  const [topic, setTopic] = useState<ContactTopic>("general");
  useEffect(() => {
    const t = topicOf(new URLSearchParams(window.location.search).get("topic"));
    if (t) setTopic(t);
  }, []);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sentTo, setSentTo] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [website, setWebsite] = useState("");
  const onToken = useCallback((t: string | null) => setToken(t), []);
  const successRef = useRef<HTMLDivElement>(null);

  const isSubmitting = submitState === "submitting";

  // Same rules as the server: a name of 2+ characters, a valid email, a message of 10+.
  const isValid = useMemo(() => {
    return form.name.trim().length >= 2 && EMAIL_RE.test(form.email.trim()) && form.message.trim().length >= 10;
  }, [form]);

  useEffect(() => {
    if (submitState === "success") successRef.current?.focus();
  }, [submitState]);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    if (submitState !== "submitting") {
      setSubmitState("idle");
      setErrorMessage("");
      setFieldErrors((f) => ({ ...f, [field]: "" }));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isValid) {
      setSubmitState("error");
      setErrorMessage("Please enter your name (2 or more letters), a valid email, and a message of at least 10 characters.");
      return;
    }

    setSubmitState("submitting");
    setErrorMessage("");
    setFieldErrors({});

    let result: Awaited<ReturnType<typeof submitContactForm>>;
    try {
      result = await submitContactForm({ name: form.name, email: form.email, message: form.message, topic, website, turnstileToken: token });
    } catch {
      result = { success: false, error: "Couldn't reach the server. Check your connection and try again." };
    }
    // Each answer uses up the check: get a fresh one for the next message.
    setAttempt((n) => n + 1);

    if (!result.success) {
      setSubmitState("error");
      setErrorMessage(result.error);
      setFieldErrors(result.fields ?? {});
      return;
    }

    setSentTo(form.email.trim());
    setForm(initialFormState);
    setSubmitState("success");
  }

  if (submitState === "success") {
    return (
      <div
        ref={successRef}
        tabIndex={-1}
        role="status"
        className="flex flex-col items-center rounded-2xl border border-emerald-500/40 bg-card p-8 text-center shadow-sm outline-none sm:p-10"
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
          <CheckCircle2 className="h-9 w-9 text-emerald-600 dark:text-emerald-400" aria-hidden />
        </span>
        <h3 className="mt-4 text-2xl font-bold">Message sent</h3>
        <p className="mt-2 max-w-md text-muted-foreground">
          Thanks for reaching out. The GUCC team has your message and usually replies within a few days at <span className="break-all font-medium text-foreground">{sentTo}</span>.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-6 gap-2"
          onClick={() => {
            setSubmitState("idle");
          }}
        >
          <Send className="h-4 w-4" aria-hidden />
          Send another message
        </Button>
      </div>
    );
  }

  const fieldError = (k: keyof FormState) =>
    fieldErrors[k] ? <p id={`contact-${k}-error`} className="text-sm text-destructive">{fieldErrors[k]}</p> : null;

  return (
    <form onSubmit={handleSubmit} className="glass glow-border relative overflow-hidden rounded-3xl shadow-[0_30px_80px_-40px_hsl(var(--primary)/0.5)]" noValidate>
      {/* A console's title bar */}
      <div aria-hidden className="flex items-center gap-1.5 border-b border-border/60 px-5 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-aurora-400/80" />
        <span className="ml-3 font-mono text-xs text-muted-foreground">~/gucc/new_message</span>
      </div>
      <div className="p-5 sm:p-8">
      <h2 id="contact-form-title" className="mb-1 font-display text-2xl font-semibold">Send us a message</h2>
      <p className="mb-6 text-sm text-muted-foreground">All fields are required. We reply by email.</p>
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
            className="h-11 rounded-xl bg-background/60"
            aria-invalid={Boolean(fieldErrors.name) || (submitState === "error" && form.name.trim().length < 2)}
            aria-describedby={fieldErrors.name ? "contact-name-error" : undefined}
            maxLength={100}
            disabled={isSubmitting}
            required
          />
          {fieldError("name")}
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
            className="h-11 rounded-xl bg-background/60"
            inputMode="email"
            aria-invalid={Boolean(fieldErrors.email) || (submitState === "error" && !EMAIL_RE.test(form.email.trim()))}
            aria-describedby={fieldErrors.email ? "contact-email-error" : undefined}
            disabled={isSubmitting}
            maxLength={254}
            required
          />
          {fieldError("email")}
        </div>

        <fieldset className="space-y-2" disabled={isSubmitting}>
          <legend className="mb-2 text-sm font-medium leading-none">Topic</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CONTACT_TOPICS).map(([k, label]) => (
              <label key={k} className={`relative inline-flex min-h-10 cursor-pointer items-center rounded-full border px-4 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${topic === k ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25" : "bg-background/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}>
                <input type="radio" name="topic" value={k} checked={topic === k} onChange={() => setTopic(k as ContactTopic)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="contact-message">Message</Label>
            <span className={`text-xs tabular-nums ${form.message.length > MAX_MESSAGE - 200 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`} aria-live="polite">
              {form.message.length > 0 ? `${form.message.length.toLocaleString("en-US")} / ${MAX_MESSAGE.toLocaleString("en-US")}` : ""}
            </span>
          </div>
          <Textarea
            id="contact-message"
            name="message"
            value={form.message}
            onChange={(event) => updateField("message", event.target.value)}
            placeholder="Tell us what is on your mind"
            className="min-h-40 resize-y rounded-xl bg-background/60"
            aria-invalid={Boolean(fieldErrors.message) || (submitState === "error" && form.message.trim().length < 10)}
            aria-describedby={fieldErrors.message ? "contact-message-error" : undefined}
            disabled={isSubmitting}
            maxLength={MAX_MESSAGE}
            required
          />
          {fieldError("message")}
        </div>

        {submitState === "error" && errorMessage && (
          <p role="alert" className="text-sm font-medium text-destructive">{errorMessage}</p>
        )}

        {/* Honeypot: hidden from people, filled only by bots. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
        </div>
        <Turnstile onToken={onToken} resetKey={attempt} />
        <Button type="submit" size="lg" className="group h-12 w-full gap-2 rounded-full border-0 bg-gradient-to-r from-brand-600 to-aurora-700 text-base font-semibold text-white shadow-[0_0_30px_-8px] shadow-brand-500/70 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:bg-gradient-to-r dark:from-brand-400 dark:to-aurora-400 dark:text-slate-950" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending…
            </>
          ) : (
            <>
              <Send className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              Send Message
            </>
          )}
        </Button>
      </div>
      </div>
    </form>
  );
}
