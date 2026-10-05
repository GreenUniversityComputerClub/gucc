"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, CalendarClock, Check, Copy, ExternalLink, Info, LifeBuoy, Lock, MoreVertical, QrCode, RefreshCw, Share2, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QrDialog } from "@/components/forms/qr-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { chromeIntent, cookieAdvice, SIGN_IN_PAGE, visitorOf, type Visitor } from "@/lib/forms/frame";
import { formState, isInAppBrowser, type FormProvider, type FormState } from "@/lib/forms/providers";
import { cn } from "@/lib/utils";

/**
 * What the page knows about a form. Never the form's own address: that isn't in the page at all,
 * the script below asks for it once the form is open (/api/forms/<slug>/frame).
 */
export interface FormView {
  slug: string;
  title: string;
  description: string | null;
  provider: FormProvider | null;
  providerLabel: string;
  requiresSignIn: boolean;
  state: FormState;
  opensAt: string | null;
  closesAt: string | null;
  closedMessage: string | null;
  questionCount: number | null;
  event: { slug: string; title: string } | null;
}

/** How long the form may take to appear before we offer help. */
const SLOW_MS = 12_000;
const PHONE = "(max-width: 1023.98px)";
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

type Frame = { phase: "asking" } | { phase: "ready"; src: string } | { phase: "failed" };
interface Env {
  visitor: Visitor;
  inApp: boolean;
}

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

/**
 * The form itself, inside this page, or the card that stands in for it: closed, not open yet, an
 * app's built-in browser that can't sign in to Google, or a form that didn't load. When the form
 * stays blank (Google wants a sign-in, a cookie is blocked), "Can't see the form?" says what to do.
 * The form's own address is never shown or linked.
 */
export function FormShell({ form }: { form: FormView }) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(form.state);
  // null until the browser has said what it is (the server can't know): a skeleton meanwhile.
  const [env, setEnv] = useState<Env | null>(null);
  const [signIn, setSignIn] = useState(form.requiresSignIn);
  const [tryHere, setTryHere] = useState(false);
  const [frame, setFrame] = useState<Frame>({ phase: "asking" });
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const [qr, setQr] = useState(false);
  const [about, setAbout] = useState(false);
  const [help, setHelp] = useState(false);
  const [copied, copy] = useCopy();

  const account = (form.provider && SIGN_IN_PAGE[form.provider]?.account) || "account";
  // Facebook, Messenger and similar apps can't sign in to Google inside their own browser.
  const holdForApp = Boolean(env?.inApp && signIn && !tryHere);

  useEffect(() => {
    const ua = navigator.userAgent;
    setEnv({ visitor: visitorOf(ua), inApp: isInAppBrowser(ua) });
    // The schedule is checked again here: the page may have been cached before the form opened or closed.
    if (form.state !== "closed") setState(formState({ opensAt: form.opensAt, closesAt: form.closesAt }));
  }, [form]);

  // Ask for the form's address once it is open (and, in an app's browser, once the visitor chose to try).
  useEffect(() => {
    if (state !== "open" || !env || holdForApp) return;
    const ac = new AbortController();
    setFrame({ phase: "asking" });
    setLoaded(false);
    setSlow(false);
    fetch(`/api/forms/${encodeURIComponent(form.slug)}/frame`, { headers: { "X-Requested-With": "gucc-form" }, cache: "no-store", signal: ac.signal })
      .then(async (r) => (await r.json().catch(() => null)) as { state?: string; src?: string; signIn?: boolean } | null)
      .then((body) => {
        if (ac.signal.aborted) return;
        if (body?.state === "open" && typeof body.src === "string") {
          setSignIn(Boolean(body.signIn));
          setFrame({ phase: "ready", src: body.src });
        } else if (body?.state === "closed" || body?.state === "scheduled") {
          setState(body.state);
        } else {
          setFrame({ phase: "failed" });
        }
      })
      .catch(() => {
        if (!ac.signal.aborted) setFrame({ phase: "failed" });
      });
    return () => ac.abort();
  }, [state, env, holdForApp, form.slug, attempt]);

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
    if (frame.phase !== "ready" || loaded) return;
    const t = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => window.clearTimeout(t);
  }, [frame, loaded]);

  const reload = () => setAttempt((n) => n + 1);
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

  const signInNote = signIn ? `This form asks you to sign in with your ${account} (it records your email). Use your university account if the form asks for it.` : null;
  const open = state === "open";

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
    if (!env) return <FrameSkeleton />;
    if (holdForApp) {
      const intent = env.visitor.android ? chromeIntent(pageUrl()) : null;
      return (
        <StatusCard icon={ShieldCheck} title="Open this page in your browser">
          {form.description && <p className="mb-3 line-clamp-6 whitespace-pre-line text-left">{form.description}</p>}
          <p>This form needs a {account}, and Facebook, Messenger and other apps can&apos;t sign you in inside their built-in browser, so the form would stay blank.</p>
          <p className="mt-2">Open this page in Chrome or Safari: use the app&apos;s menu (⋯) → &ldquo;Open in browser&rdquo;, or copy the link.</p>
          <div className="mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center">
            {intent && <Button asChild className="min-h-11 gap-2"><a href={intent}><ExternalLink className="h-4 w-4" aria-hidden />Open in Chrome</a></Button>}
            <Button variant={intent ? "outline" : "default"} className="min-h-11 gap-2" onClick={() => copy(pageUrl())}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Link copied" : "Copy link to this page"}</Button>
            <Button variant="ghost" className="min-h-11" onClick={() => setTryHere(true)}>Try here anyway</Button>
          </div>
        </StatusCard>
      );
    }
    if (frame.phase === "asking") return <FrameSkeleton />;
    if (frame.phase === "failed") {
      return (
        <StatusCard icon={TriangleAlert} title="The form didn't load">
          <p>Check your connection and try again. If it keeps happening, tell us and we&apos;ll sort it out.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button className="min-h-11 gap-2" onClick={reload}><RefreshCw className="h-4 w-4" aria-hidden />Try again</Button>
            <Button asChild variant="outline" className="min-h-11"><Link href="/contact">Contact us</Link></Button>
          </div>
        </StatusCard>
      );
    }
    return (
      <div className="relative h-full w-full bg-white">
        {!loaded && <FrameSkeleton />}
        <iframe
          key={attempt}
          src={frame.src}
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
            <span className="flex gap-2">
              <Button size="sm" variant="outline" className="min-h-10" onClick={reload}>Reload</Button>
              <Button size="sm" className="min-h-10" onClick={() => setHelp(true)}>Get help</Button>
            </span>
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
          <p className="truncate text-[11px] leading-tight text-muted-foreground">GUCC · {form.providerLabel}{signIn ? ` · needs a ${account}` : ""}</p>
        </div>
        {open && !holdForApp && (
          <button type="button" onClick={reload} aria-label="Reload the form" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <RefreshCw className="h-5 w-5" />
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Form options">
              <MoreVertical className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[70] w-56">
            <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => setAbout(true)}><Info className="h-4 w-4" />About this form</DropdownMenuItem>
            {open && <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => setHelp(true)}><LifeBuoy className="h-4 w-4" />Can&apos;t see the form?</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => void share()}><Share2 className="h-4 w-4" />Share</DropdownMenuItem>
            <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => copy(pageUrl())}><Copy className="h-4 w-4" />{copied ? "Link copied" : "Copy link"}</DropdownMenuItem>
            <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => setQr(true)}><QrCode className="h-4 w-4" />QR code</DropdownMenuItem>
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
        {signInNote && open && <p className="flex gap-2 rounded-xl border bg-muted/40 p-3 text-sm"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />{signInNote}</p>}
        <div className="flex flex-col gap-2">
          {open && <Button variant="outline" className="min-h-11 gap-2" onClick={() => setHelp(true)}><LifeBuoy className="h-4 w-4" aria-hidden />Can&apos;t see the form?</Button>}
          <div className="grid grid-cols-3 gap-2">
            <Button variant="ghost" className="min-h-11 flex-col gap-1 text-xs" onClick={() => void share()}><Share2 className="h-4 w-4" />Share</Button>
            <Button variant="ghost" className="min-h-11 flex-col gap-1 text-xs" onClick={() => copy(pageUrl())}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy link"}</Button>
            <Button variant="ghost" className="min-h-11 flex-col gap-1 text-xs" onClick={() => setQr(true)}><QrCode className="h-4 w-4" />QR code</Button>
          </div>
        </div>
        {form.event && <p className="text-sm">Part of <Link href={`/events/${form.event.slug}`} className="font-medium text-primary hover:underline">{form.event.title}</Link></p>}
      </aside>

      <section aria-label={form.title} className="relative flex min-h-0 flex-1 flex-col overflow-hidden lg:rounded-2xl lg:border lg:shadow-sm">
        {/* Phones: a form that needs an account says so, with help one tap away. */}
        {signIn && open && !holdForApp && (
          <div className="flex min-h-11 shrink-0 items-center gap-2 border-b bg-muted/50 px-3 text-xs lg:hidden">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1 truncate">Needs your {account}</span>
            <button type="button" onClick={() => setHelp(true)} className="inline-flex min-h-11 shrink-0 items-center px-2 font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Trouble signing in?</button>
          </div>
        )}
        <div className="relative min-h-0 flex-1">{content}</div>
        <noscript>
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background p-6 text-center text-sm text-muted-foreground">This form needs JavaScript. Turn it on, or try another browser.</div>
        </noscript>
      </section>

      <QrDialog open={qr} onOpenChange={setQr} url={qr ? pageUrl() : ""} title={form.title} />
      <HelpDialog open={help} onOpenChange={setHelp} signIn={signIn} provider={form.provider} account={account} env={env}
        onReload={() => { setHelp(false); reload(); }} onCopy={() => copy(pageUrl())} copied={copied} />
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

/**
 * "Can't see the form?": what to do, in order, for this browser. The form's own address is never
 * offered; the way out is the visitor's own account, cookies and browser.
 */
function HelpDialog({ open, onOpenChange, signIn, provider, account, env, onReload, onCopy, copied }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signIn: boolean;
  provider: FormProvider | null;
  account: string;
  env: Env | null;
  onReload: () => void;
  onCopy: () => void;
  copied: boolean;
}) {
  const signInPage = provider ? SIGN_IN_PAGE[provider] : undefined;
  const visitor = env?.visitor ?? { browser: "other" as const, ios: false, android: false };
  const reloadButton = <Button className="min-h-11 gap-2" onClick={onReload}><RefreshCw className="h-4 w-4" aria-hidden />Reload the form</Button>;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/50" />
        <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-[70] max-h-[88dvh] overflow-y-auto rounded-t-3xl border-t bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl focus:outline-none lg:inset-auto lg:left-1/2 lg:top-1/2 lg:w-full lg:max-w-lg lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-2xl lg:border lg:pb-5">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30 lg:hidden" aria-hidden />
          <DialogPrimitive.Title className="text-lg font-semibold">Can&apos;t see the form?</DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
            {signIn
              ? `This form is for people with a ${account}, and the ${provider === "microsoft" ? "Microsoft" : "Google"} service has to recognise you inside this page. Try these in order.`
              : "It's usually a blocker, a slow connection or an app's own browser. Try these in order."}
          </DialogPrimitive.Description>
          <ol className="mt-4 space-y-4 text-sm">
            {signIn ? (
              <>
                <li>
                  <p className="font-medium">1. Sign in to your {account} in this browser</p>
                  <p className="mt-0.5 text-muted-foreground">Use your university account if the form asks for it. Then come back to this tab.</p>
                  {signInPage && <Button asChild variant="outline" className="mt-2 min-h-11 gap-2"><a href={signInPage.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" aria-hidden />Open {provider === "microsoft" ? "Microsoft" : "Google"} sign-in</a></Button>}
                </li>
                <li>
                  <p className="font-medium">2. Let this page use your sign-in</p>
                  <p className="mt-0.5 text-muted-foreground">{cookieAdvice(visitor)}</p>
                </li>
                <li>
                  <p className="font-medium">3. Reload the form</p>
                  <div className="mt-2">{reloadButton}</div>
                </li>
              </>
            ) : (
              <>
                <li>
                  <p className="font-medium">1. Reload the form</p>
                  <div className="mt-2">{reloadButton}</div>
                </li>
                <li>
                  <p className="font-medium">2. Pause ad or privacy blockers for this site</p>
                  <p className="mt-0.5 text-muted-foreground">They sometimes stop forms from showing inside a page. {cookieAdvice(visitor)}</p>
                </li>
              </>
            )}
            <li>
              <p className="font-medium">{signIn ? "4" : "3"}. Use Chrome or Safari</p>
              <p className="mt-0.5 text-muted-foreground">Facebook, Messenger, Instagram and other apps open pages in a limited browser. Copy this page&apos;s link and open it in your browser.</p>
              <Button variant="outline" className="mt-2 min-h-11 gap-2" onClick={onCopy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Link copied" : "Copy link to this page"}</Button>
            </li>
          </ol>
          <p className="mt-5 text-sm text-muted-foreground">Still stuck? <Link href="/contact" className="font-medium text-primary underline-offset-4 hover:underline">Tell us</Link> and we&apos;ll help you fill it in.</p>
          <DialogPrimitive.Close asChild><Button variant="outline" className="mt-4 min-h-11 w-full gap-2"><X className="h-4 w-4" />Close</Button></DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
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
