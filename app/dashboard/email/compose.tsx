"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Mail, Send, Users } from "lucide-react";
import { ActionForm, FormSection, useFieldError } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { renderEmail } from "@/lib/server/email-template";
import { describeEstimate, estimateDelivery } from "@/lib/email/estimate";
import { showFlash } from "@/lib/flash";
import { cn } from "@/lib/utils";
import type { campaignOptions } from "@/lib/server/services/campaigns";
import { countAudienceAction, createCampaignAction, sendTestCampaignAction } from "./actions";

type Options = Awaited<ReturnType<typeof campaignOptions>>;
type Kind = "members" | "executives" | "batch" | "department" | "event";

function FieldError({ name }: { name: string }) {
  const error = useFieldError(name);
  return error ? <p className="text-xs text-destructive">{error}</p> : null;
}

const select = "h-10 w-full min-w-0 rounded-md border bg-background px-2 text-base md:text-sm";

/**
 * Write an announcement email: who it goes to (with a live count), the message, a button, and a
 * preview of the email as people get it; send yourself a test; then queue it.
 */
export function Compose({ options, me }: { options: Options; me: string }) {
  const a = options.audiences;
  const [kind, setKind] = useState<Kind>("members");
  const [batch, setBatch] = useState(a.batches[0]?.value ?? "");
  const [department, setDepartment] = useState(a.departments[0]?.value ?? "");
  const [eventId, setEventId] = useState(a.events[0]?.id ?? "");
  const [statuses, setStatuses] = useState<string[]>(["REGISTERED", "ATTENDED"]);
  const [guests, setGuests] = useState(false);
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [body, setBody] = useState("");
  const [buttonLabel, setButtonLabel] = useState("");
  const [buttonPath, setButtonPath] = useState("");
  const [notBefore, setNotBefore] = useState("");
  const [count, setCount] = useState<number | null>(a.members);
  const [counting, startCount] = useTransition();
  const [testing, startTest] = useTransition();

  // Who it reaches, counted by the API (opt-outs, unconfirmed addresses and duplicates removed).
  useEffect(() => {
    const fd = new FormData();
    fd.set("audienceKind", kind);
    fd.set("batch", batch);
    fd.set("department", department);
    fd.set("eventId", eventId);
    for (const st of statuses) fd.append("statuses", st);
    if (guests) fd.set("guests", "on");
    let live = true;
    const t = window.setTimeout(() => startCount(async () => {
      const r = await countAudienceAction(fd).catch(() => null);
      if (live) setCount(r ? r.count : null);
    }), 250);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [kind, batch, department, eventId, statuses, guests]);

  const estimate = useMemo(() => estimateDelivery(count ?? 0, options.allowance), [count, options.allowance]);
  const preview = useMemo(() => renderEmail({
    site: typeof window === "undefined" ? "" : window.location.origin,
    kicker: "Club announcement",
    preheader: preheader || body.slice(0, 140),
    heading: subject || "Subject",
    paragraphs: [`Hi ${me.split(/\s+/)[0] || "there"},`, ...(body || "Your message…").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)],
    action: buttonLabel && buttonPath ? { label: buttonLabel, url: `${typeof window === "undefined" ? "" : window.location.origin}${buttonPath}` } : undefined,
    footer: ["Green University Computer Club", "You get club announcements because you're a GUCC member.", "Unsubscribe from announcements: (a personal link)"],
  }), [subject, preheader, body, buttonLabel, buttonPath, me]);

  const sendTest = () => startTest(async () => {
    const fd = new FormData();
    Object.entries({ subject, preheader, body, buttonLabel, buttonPath }).forEach(([k, v]) => fd.set(k, v));
    const r = await sendTestCampaignAction(fd).catch(() => null);
    showFlash(r?.ok ? (r.data?.message ?? "Test sent.") : (r && !r.ok ? r.error : "Couldn't send the test. Check your connection."));
  });

  const kinds: Array<{ value: Kind; label: string; count?: number; disabled?: boolean }> = [
    { value: "members", label: "All members", count: a.members },
    { value: "executives", label: "The current committee", count: a.executives },
    { value: "batch", label: "A batch", disabled: a.batches.length === 0 },
    { value: "department", label: "A department", disabled: a.departments.length === 0 },
    { value: "event", label: "People registered for an event", disabled: a.events.length === 0 },
  ];
  const event = a.events.find((e) => e.id === eventId);

  return (
    <ActionForm action={createCampaignAction} submitLabel={count ? `Queue email to ${count.toLocaleString("en-US")} people` : "Queue email"} redirectTo="/dashboard/email/{id}" sticky
      confirm={`Email ${count?.toLocaleString("en-US") ?? "these"} people? ${describeEstimate(count ?? 0, estimate)} You can pause or cancel it while it's sending.`}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0 space-y-4">
          {!options.emailOn && (
            <p role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Email is switched off, so nothing is sent yet: emails queued now go out once a Moderator switches it on (Settings → Email).
            </p>
          )}
          <FormSection title="Who gets it" description="Only people with a confirmed address who haven't turned off club announcements."
            aside={<span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary" aria-live="polite">
              {counting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Users className="h-3.5 w-3.5" aria-hidden />}
              {count === null ? "…" : `${count.toLocaleString("en-US")} people`}
            </span>}>
            <input type="hidden" name="audienceKind" value={kind} />
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="sr-only">Audience</legend>
              {kinds.map((k) => (
                <label key={k.value} className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm", kind === k.value ? "border-primary bg-primary/5" : "hover:bg-muted/40", k.disabled && "cursor-not-allowed opacity-50")}>
                  <input type="radio" name="audienceChoice" value={k.value} checked={kind === k.value} disabled={k.disabled} onChange={() => setKind(k.value)} className="h-4 w-4" />
                  <span className="min-w-0 flex-1">{k.label}</span>
                  {k.count !== undefined && <span className="text-xs text-muted-foreground">{k.count}</span>}
                </label>
              ))}
            </fieldset>
            {kind === "batch" && (
              <div className="grid gap-1.5"><Label htmlFor="cmp-batch">Batch</Label>
                <select id="cmp-batch" name="batch" value={batch} onChange={(e) => setBatch(e.target.value)} className={select}>
                  {a.batches.map((b) => <option key={b.value} value={b.value}>Batch {b.value} ({b.count})</option>)}
                </select></div>
            )}
            {kind === "department" && (
              <div className="grid gap-1.5"><Label htmlFor="cmp-dept">Department</Label>
                <select id="cmp-dept" name="department" value={department} onChange={(e) => setDepartment(e.target.value)} className={select}>
                  {a.departments.map((d) => <option key={d.value} value={d.value}>{d.value} ({d.count})</option>)}
                </select></div>
            )}
            {kind === "event" && (
              <div className="space-y-3">
                <div className="grid gap-1.5"><Label htmlFor="cmp-event">Event</Label>
                  <select id="cmp-event" name="eventId" value={eventId} onChange={(e) => setEventId(e.target.value)} className={select}>
                    {a.events.map((e) => <option key={e.id} value={e.id}>{e.title} ({e.members + e.guests})</option>)}
                  </select></div>
                <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <legend className="mb-1 text-sm font-medium">Registrations</legend>
                  {(["REGISTERED", "ATTENDED", "WAITLISTED"] as const).map((st) => (
                    <label key={st} className="flex min-h-10 items-center gap-2">
                      <input type="checkbox" name="statuses" value={st} checked={statuses.includes(st)} className="h-4 w-4"
                        onChange={(e) => setStatuses((list) => (e.target.checked ? [...list, st] : list.filter((x) => x !== st)))} />
                      {st === "REGISTERED" ? "Registered" : st === "ATTENDED" ? "Attended" : "Waiting list"}
                    </label>
                  ))}
                </fieldset>
                <label className="flex min-h-10 items-start gap-2 text-sm">
                  <input type="checkbox" name="guests" checked={guests} onChange={(e) => setGuests(e.target.checked)} className="mt-0.5 h-4 w-4" />
                  <span>Also people without a GUCC account{event ? ` (${event.guests})` : ""}<span className="block text-xs text-muted-foreground">They registered with this address; the email says why they got it and how to stop.</span></span>
                </label>
              </div>
            )}
            <FieldError name="audience" />
          </FormSection>

          <FormSection title="The email">
            <div className="grid gap-1.5">
              <Label htmlFor="cmp-subject">Subject <span className="text-destructive">*</span></Label>
              <Input id="cmp-subject" name="subject" required maxLength={150} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="General meeting this Friday at 3 PM" />
              <FieldError name="subject" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cmp-pre">Preview line</Label>
              <Input id="cmp-pre" name="preheader" maxLength={150} value={preheader} onChange={(e) => setPreheader(e.target.value)} placeholder="Shown next to the subject in the inbox" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cmp-body">Message <span className="text-destructive">*</span></Label>
              <Textarea id="cmp-body" name="body" required rows={9} maxLength={6000} value={body} onChange={(e) => setBody(e.target.value)}
                placeholder={"Plain text. Leave an empty line between paragraphs.\n\nWeb addresses become links."} />
              <div className="flex justify-between gap-2"><FieldError name="body" /><span className="ml-auto text-xs text-muted-foreground">{body.length}/6000</span></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="cmp-btn">Button</Label>
                <Input id="cmp-btn" name="buttonLabel" maxLength={40} value={buttonLabel} onChange={(e) => setButtonLabel(e.target.value)} placeholder="Register now" />
                <FieldError name="buttonLabel" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cmp-link">Button link</Label>
                <Input id="cmp-link" name="buttonPath" maxLength={300} value={buttonPath} onChange={(e) => setButtonPath(e.target.value)} placeholder="/events/workshop-2026" />
                <FieldError name="buttonPath" />
              </div>
            </div>
            <div className="grid gap-1.5 sm:max-w-xs">
              <Label htmlFor="cmp-when">Send from (optional)</Label>
              <Input id="cmp-when" name="notBefore" type="datetime-local" value={notBefore} onChange={(e) => setNotBefore(e.target.value)} />
              <p className="text-xs text-muted-foreground">Dhaka time. Empty: start now.</p>
            </div>
          </FormSection>
        </div>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-20 xl:self-start">
          <section className="rounded-xl border bg-card p-4" aria-label="Delivery">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Mail className="h-4 w-4 text-primary" aria-hidden />Delivery</h2>
            <p className="mt-2 text-sm">{describeEstimate(count ?? 0, estimate)}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-muted/50 p-2"><dt className="text-muted-foreground">Left today</dt><dd className="text-base font-semibold">{estimate.todayLeft}</dd></div>
              <div className="rounded-lg bg-muted/50 p-2"><dt className="text-muted-foreground">Left this month</dt><dd className="text-base font-semibold">{estimate.monthLeft}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              At most {options.allowance.hourlyMax} an hour. {options.allowance.dailyReserve} a day and {options.allowance.monthlyReserve} a month stay kept for sign-in and security emails.
            </p>
            <Button type="button" variant="outline" className="mt-3 w-full gap-2" onClick={sendTest} disabled={testing || !subject.trim() || !body.trim()}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}Send me a test
            </Button>
          </section>
          <section className="overflow-hidden rounded-xl border bg-card" aria-label="Preview">
            <h2 className="border-b px-4 py-2 text-sm font-semibold">Preview</h2>
            {/* Everything in it is escaped by renderEmail and it runs no script: no sandbox, so screen readers and checkers can read it. */}
          <iframe title="Email preview" srcDoc={preview} className="h-[32rem] w-full bg-[#f1f5f9]" />
          </section>
        </aside>
      </div>
    </ActionForm>
  );
}
