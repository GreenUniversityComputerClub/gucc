"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, CalendarClock, Check, Copy, ExternalLink, Info, Lock, MoreVertical, QrCode, Share2, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QrDialog } from "@/components/forms/qr-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formState, isInAppBrowser, shouldEmbed, type FormDisplay, type FormState } from "@/lib/forms/providers";
import { cn } from "@/lib/utils";

export interface FormView {
  slug: string;
  title: string;
  description: string | null;
  providerLabel: string;
  /** "Open in Google Forms" and the like. */
  openLabel: string;
  openUrl: string;
  embedUrl: string | null;
  requiresSignIn: boolean;
  display: FormDisplay;
  state: FormState;
  opensAt: string | null;
  closesAt: string | null;
  closedMessage: string | null;
  questionCount: number | null;
  event: { slug: string; title: string } | null;
}

/** How long the form may take to appear before we offer to open it at the provider. */
const SLOW_MS = 12_000;
const PHONE = "(max-width: 1023.98px)";
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function StatusChip({ state, closesAt, opensAt, className }: { state: FormState; closesAt: string | null; opensAt: string | null; className?: string }) {
  const text = state === "closed" ? "Closed" : state === "scheduled" ? (opensAt ? `Opens ${when(opensAt)}` : "Opens soon") : closesAt ? `Open until ${when(closesAt)}` : "Open";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
      state === "open" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : state === "scheduled" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", state === "open" ? "bg-emerald-500" : state === "scheduled" ? "bg-amber-500" : "bg-muted-foreground")} aria-hidden />
      {text}
    </span>
  );
}

/** The page's own address (for sharing), built in the browser. */
const pageUrl = () => (typeof window === "undefined" ? "" : `${window.location.origin}${window.location.pathname}`);

function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }).catch(() => undefined);
  }, []);
  return [copied, copy];
}

/** Open the form at the provider, in a new tab. */
function OpenButton({ href, label, className, variant = "default" }: { href: string; label: string; className?: string; variant?: "default" | "outline" }) {
  return (
    <Button asChild variant={variant} className={cn("min-h-11 gap-2", className)}>
      <a href={href} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" aria-hidden />{label}</a>
    </Button>
  );
}

/**
 * The form itself, or the card that stands in for it: closed, not open yet, or (for a form that
 * needs a Google account, on a phone or inside a social app's browser) opening it at the provider.
 */
export function FormShell({ form }: { form: FormView }) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(form.state);
  // null until the browser has said what it is (the server can't know): a skeleton meanwhile.
  const [embed, setEmbed] = useState<boolean | null>(null);
  const [inApp, setInApp] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const [qr, setQr] = useState(false);
  const [about, setAbout] = useState(false);
  const [copied, copy] = useCopy();
  const openLabel = form.openLabel;

  useEffect(() => {
    const phone = window.matchMedia(PHONE).matches;
    const app = isInAppBrowser(navigator.userAgent);
    setInApp(app);
    setEmbed(shouldEmbed({ display: form.display, requiresSignIn: form.requiresSignIn, embedUrl: form.embedUrl }, { phone, inAppBrowser: app }));
    // The schedule is checked again here: the page may have been cached before the form opened or closed.
    if (form.state !== "closed") setState(formState({ opensAt: form.opensAt, closesAt: form.closesAt }));
  }, [form]);

  // On phones the form fills the screen: the page behind it shouldn't scroll.
  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const apply = () => document.documentElement.classList.toggle("overflow-hidden", mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      document.documentElement.classList.remove("overflow-hidden");
    };
  }, []);

  useEffect(() => {
    if (!embed || loaded) return;
    const t = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => window.clearTimeout(t);
  }, [embed, loaded]);

  const back = () => {
    if (document.referrer.startsWith(window.location.origin) && window.history.length > 1) router.back();
    else router.push("/");
  };
  const share = async () => {
    const url = pageUrl();
    if (navigator.share) {
      try {
        await navigator.share({ title: form.title, url });
        return;
      } catch {
        // Dismissed, or not allowed here: copying works everywhere.
      }
    }
    copy(url);
  };

  const signInNote = form.requiresSignIn
    ? "This form asks you to sign in with your Google account (it records your email). Use your university account if the form asks for it."
    : null;

  const content = (() => {
    if (state === "closed") {
      return (
        <StatusCard icon={Lock} title="This form is closed">
          <p>{form.closedMessage || "It no longer takes answers. Thank you to everyone who filled it in."}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {form.event && <Button asChild className="min-h-11"><Link href={`/events/${form.event.slug}`}>About {form.event.title}</Link></Button>}
            <Button asChild variant="outline" className="min-h-11"><Link href="/events">Upcoming events</Link></Button>
            <Button asChild variant="ghost" className="min-h-11"><Link href="/contact">Contact us</Link></Button>
          </div>
        </StatusCard>
      );
    }
    if (state === "scheduled") {
      return (
        <StatusCard icon={CalendarClock} title={form.opensAt ? `Opens ${when(form.opensAt)}` : "Opens soon"}>
          <p>Come back then: this page will show the form.</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="outline" className="min-h-11 gap-2" onClick={() => void share()}>{copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}{copied ? "Link copied" : "Share"}</Button>
          </div>
        </StatusCard>
      );
    }
    if (embed === null) return <FrameSkeleton />;
    if (!embed || !form.embedUrl) {
      return (
        <StatusCard icon={form.requiresSignIn ? ShieldCheck : ExternalLink} title={form.requiresSignIn ? "This form needs your Google account" : "Open the form"}>
          {form.description && <p className="mb-3 line-clamp-6 whitespace-pre-line text-left">{form.description}</p>}
          <p>{form.requiresSignIn ? "It opens at Google, where you can sign in and answer. Come back here any time with this link." : "It opens on its own page."}</p>
          <div className="mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center">
            <OpenButton href={form.openUrl} label={openLabel} />
            {form.embedUrl && <Button variant="outline" className="min-h-11" onClick={() => setEmbed(true)}>Fill it in here instead</Button>}
          </div>
          {inApp && (
            <div className="mt-5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-left text-sm text-foreground">
              <p className="font-medium">Opened from Facebook, Messenger or another app?</p>
              <p className="mt-1 text-muted-foreground">Google often can&apos;t sign you in inside those apps. Open this page in Chrome or Safari instead: use the app&apos;s menu (⋯) → &ldquo;Open in browser&rdquo;, or copy the link.</p>
              <Button variant="outline" size="sm" className="mt-2 min-h-10 gap-2" onClick={() => copy(pageUrl())}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy link"}</Button>
            </div>
          )}
        </StatusCard>
      );
    }
    return (
      <div className="relative h-full w-full bg-white">
        {!loaded && <FrameSkeleton />}
        <iframe
          src={form.embedUrl}
          title={form.title}
          className={cn("absolute inset-0 h-full w-full border-0 bg-white transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
          style={{ colorScheme: "light" }}
          allow="clipboard-write; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setLoaded(true)}
        />
        {slow && !loaded && (
          <div className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-popover p-3 text-sm text-popover-foreground shadow-lg">
            <span>Taking long to load?</span>
            <OpenButton href={form.openUrl} label={openLabel} className="min-h-10" />
          </div>
        )}
      </div>
    );
  })();

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background lg:static lg:z-auto lg:container lg:grid lg:h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-6 lg:py-6">
      {/* Phones: one slim bar, the form fills the rest of the screen. */}
      <header className="flex h-12 shrink-0 items-center gap-1 border-b bg-background/95 px-1.5 backdrop-blur pt-[env(safe-area-inset-top)] box-content lg:hidden">
        <button type="button" onClick={back} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Image src="/android-chrome-192x192.png" alt="" width={24} height={24} className="h-6 w-6 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 px-1.5">
          <h1 className="truncate text-sm font-semibold leading-tight">{form.title}</h1>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">GUCC · {form.providerLabel}{form.requiresSignIn ? " · Google sign-in" : ""}</p>
        </div>
        {state === "open" && (
          <a href={form.openUrl} target="_blank" rel="noopener noreferrer" aria-label={openLabel} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ExternalLink className="h-5 w-5" />
          </a>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Form options">
              <MoreVertical className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[70] w-56">
            <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => setAbout(true)}><Info className="h-4 w-4" />About this form</DropdownMenuItem>
            <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => void share()}><Share2 className="h-4 w-4" />Share</DropdownMenuItem>
            <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => copy(pageUrl())}><Copy className="h-4 w-4" />{copied ? "Link copied" : "Copy link"}</DropdownMenuItem>
            <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => setQr(true)}><QrCode className="h-4 w-4" />QR code</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="min-h-11 gap-2"><a href={form.openUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />{openLabel}</a></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Desktop: what the form is about, beside it. */}
      <aside className="hidden min-h-0 flex-col gap-4 overflow-y-auto lg:flex">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/" className="hover:text-primary">Home</Link> <span aria-hidden>/</span> <span>Forms</span>
        </nav>
        <div>
          <StatusChip state={state} closesAt={form.closesAt} opensAt={form.opensAt} />
          <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight text-balance">{form.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Green University Computer Club · {form.providerLabel}{form.questionCount ? ` · ${form.questionCount} question${form.questionCount === 1 ? "" : "s"}` : ""}</p>
        </div>
        {form.description && <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{form.description}</p>}
        {signInNote && state === "open" && <p className="flex gap-2 rounded-xl border bg-muted/40 p-3 text-sm"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />{signInNote}</p>}
        <div className="flex flex-col gap-2">
          {state === "open" && <OpenButton href={form.openUrl} label={openLabel} variant="outline" />}
          <div className="grid grid-cols-3 gap-2">
            <Button variant="ghost" className="min-h-11 flex-col gap-1 text-xs" onClick={() => void share()}><Share2 className="h-4 w-4" />Share</Button>
            <Button variant="ghost" className="min-h-11 flex-col gap-1 text-xs" onClick={() => copy(pageUrl())}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy link"}</Button>
            <Button variant="ghost" className="min-h-11 flex-col gap-1 text-xs" onClick={() => setQr(true)}><QrCode className="h-4 w-4" />QR code</Button>
          </div>
        </div>
        {form.event && <p className="text-sm">Part of <Link href={`/events/${form.event.slug}`} className="font-medium text-primary hover:underline">{form.event.title}</Link></p>}
      </aside>

      <section aria-label={form.title} className="relative min-h-0 flex-1 overflow-hidden lg:rounded-2xl lg:border lg:shadow-sm">
        {content}
      </section>

      <QrDialog open={qr} onOpenChange={setQr} url={qr ? pageUrl() : ""} title={form.title} />
      <DialogPrimitive.Root open={about} onOpenChange={setAbout}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/50" />
          <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-[70] max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl focus:outline-none">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
            <StatusChip state={state} closesAt={form.closesAt} opensAt={form.opensAt} />
            <DialogPrimitive.Title className="mt-2 text-lg font-semibold">{form.title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">Green University Computer Club · {form.providerLabel}{form.questionCount ? ` · ${form.questionCount} questions` : ""}</DialogPrimitive.Description>
            {form.description && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{form.description}</p>}
            {signInNote && <p className="mt-3 flex gap-2 rounded-xl border bg-muted/40 p-3 text-sm"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />{signInNote}</p>}
            <DialogPrimitive.Close asChild><Button variant="outline" className="mt-4 min-h-11 w-full gap-2"><X className="h-4 w-4" />Close</Button></DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}

function StatusCard({ icon: Icon, title, children }: { icon: typeof Lock; title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full items-start justify-center overflow-y-auto bg-background p-4 sm:items-center lg:bg-card">
      <div className="w-full max-w-md py-6 text-center text-sm text-muted-foreground">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-7 w-7" aria-hidden /></span>
        <h2 className="mb-2 text-xl font-semibold text-foreground">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function FrameSkeleton() {
  return (
    <div className="absolute inset-0 flex justify-center overflow-hidden bg-white p-4" aria-hidden>
      <div className="w-full max-w-2xl animate-pulse space-y-4 pt-2">
        <div className="h-28 rounded-lg bg-slate-200" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3 rounded-lg border border-slate-200 p-4">
            <div className="h-4 w-1/2 rounded bg-slate-200" />
            <div className="h-9 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
