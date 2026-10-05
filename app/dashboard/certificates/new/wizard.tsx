"use client";

/**
 * Issuing certificates, on one page in four steps: who (members, an event's registrants or
 * speakers, committees, a spreadsheet, or names typed in), the people (checked and corrected in a
 * table), the design and words (with a live preview of the first certificate), and how they hear
 * about it. Then Issue: every certificate gets its own code and page at once.
 */
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Plus, Send, Trash2, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showFlash } from "@/lib/flash";
import { cn } from "@/lib/utils";
import { CertificateSvg } from "@/lib/certificates/render";
import { defaultConfig, KIND_LABEL, KINDS, wordingOf, type CertificateKind, type DesignConfig, type TemplateKey } from "@/lib/certificates/config";
import type { certificateOptions, RecipientDraft } from "@/lib/server/services/certificates";
import { DesignFields, SAMPLE, TemplatePicker } from "../design-editor";
import { importPreviewAction, issueAction } from "../actions";

type Options = Awaited<ReturnType<typeof certificateOptions>>;
type SourceKind = "members" | "event" | "event_people" | "committee" | "csv" | "manual";

const input = "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base md:h-9 md:text-sm";
const SOURCE_FOR: Record<SourceKind, string> = { members: "MEMBERS", event: "EVENT", event_people: "EVENT_PEOPLE", committee: "COMMITTEE", csv: "CSV", manual: "MANUAL" };
const today = () => new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);

function Step({ n, title, children, hint }: { n: number; title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby={`step-${n}`}>
      <h2 id={`step-${n}`} className="flex items-center gap-2 text-base font-semibold">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">{n}</span>{title}
      </h2>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/** Columns of a spreadsheet that mean name, email, student ID, role, rank and team. */
function mapColumns(headers: string[]) {
  const find = (re: RegExp) => headers.findIndex((h) => re.test(h));
  return {
    name: find(/^(full\s*)?name|^participant|^your name/i),
    email: find(/e-?mail/i),
    studentId: find(/student\s*id|^id$|roll/i),
    role: find(/role|position|designation/i),
    rank: find(/rank|position held|place|award/i),
    team: find(/team/i),
  };
}

export function IssueWizard({ options, initialKind = "PARTICIPATION", initialEventId }: { options: Options; initialKind?: CertificateKind; initialEventId?: string }) {
  const router = useRouter();
  const [source, setSource] = useState<SourceKind>(initialEventId ? "event" : "members");
  const [filter, setFilter] = useState<"" | "batch" | "department">("");
  const [filterValue, setFilterValue] = useState("");
  const [eventId, setEventId] = useState(initialEventId ?? options.events[0]?.id ?? "");
  const [statuses, setStatuses] = useState<string[]>(["ATTENDED"]);
  const [committeeIds, setCommitteeIds] = useState<string[]>([]);
  const [manual, setManual] = useState("");
  const [rows, setRows] = useState<RecipientDraft[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [kind, setKind] = useState<CertificateKind>(initialKind);
  const [name, setName] = useState(options.events.find((e) => e.id === initialEventId)?.title ?? "");
  const [issuedOn, setIssuedOn] = useState(today());
  const [template, setTemplate] = useState<TemplateKey>(options.designs.find((d) => d.isDefault)?.template ?? "heritage");
  const [config, setConfig] = useState<DesignConfig>(options.designs.find((d) => d.isDefault)?.config ?? defaultConfig(initialKind));
  const [designId, setDesignId] = useState<string | null>(options.designs.find((d) => d.isDefault)?.id ?? null);
  const [notify, setNotify] = useState(true);
  const [email, setEmail] = useState(false);
  const [emailGuests, setEmailGuests] = useState(false);
  const [issuing, startIssue] = useTransition();
  const [issueError, setIssueError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = (src: Record<string, unknown>) => startLoad(async () => {
    setLoadError(null);
    const r = await importPreviewAction(src).catch(() => null);
    if (!r?.ok) return setLoadError(r && !r.ok ? r.error : "Couldn't load the list. Check your connection.");
    setRows(r.data.rows);
    if (r.data.capped) setLoadError("Only the first 1,000 people are shown. Issue the rest as another batch.");
    if (!r.data.rows.length) setLoadError("Nobody found there.");
  });

  const loadSource = () => {
    if (source === "members") load({ kind: "members", filter, value: filter ? filterValue : "" });
    else if (source === "event") load({ kind: "event", eventId, statuses });
    else if (source === "event_people") load({ kind: "event_people", eventId });
    else if (source === "committee") load({ kind: "committee", committeeIds });
    else if (source === "manual") {
      // One person per line: "Name, email, role" (email and role optional).
      const list = manual.split("\n").map((l) => l.split(/[,\t]/).map((x) => x.trim())).filter((p) => p[0])
        .map(([n, e, r]) => ({ name: n, email: e && e.includes("@") ? e : "", role: e && !e.includes("@") ? e : r ?? "" }));
      load({ kind: "match", rows: list });
    }
  };

  const onFile = async (file: File) => {
    setLoadError(null);
    try {
      const { readSpreadsheet } = await import("@/lib/recruitment/spreadsheet");
      const sheet = await readSpreadsheet(file);
      const c = mapColumns(sheet.headers);
      if (c.name < 0 && c.email < 0) return setLoadError(`No "Name" or "Email" column found. Columns: ${sheet.headers.slice(0, 8).join(", ")}.`);
      const get = (row: string[], i: number) => (i >= 0 ? row[i] ?? "" : "");
      load({ kind: "match", rows: sheet.rows.map((r) => ({ name: get(r, c.name), email: get(r, c.email), studentId: get(r, c.studentId), role: get(r, c.role), rank: get(r, c.rank), team: get(r, c.team) })) });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't read that file.");
    }
  };

  const changeKind = (k: CertificateKind) => {
    setKind(k);
    setConfig((c) => ({ ...c, ...wordingOf(k) }));
  };
  const applyDesign = (id: string) => {
    const d = options.designs.find((x) => x.id === id);
    setDesignId(id || null);
    if (d) {
      setTemplate(d.template);
      setConfig(d.config);
    }
  };

  const event = options.events.find((e) => e.id === eventId);
  const first = rows[0];
  const preview = useMemo(() => ({
    ...SAMPLE, name: first?.name || SAMPLE.name, role: first?.role ?? SAMPLE.role, rank: first?.rank ?? null, team: first?.team ?? null, body: first?.body ?? null,
    event: name || event?.title || SAMPLE.event, title: name || SAMPLE.title,
    date: new Date(`${issuedOn}T00:00:00+06:00`).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "long", year: "numeric" }),
  }), [first, name, event, issuedOn]);
  const guests = rows.filter((r) => !r.userId && r.email).length;
  const withAccount = rows.filter((r) => r.userId).length;
  const tooMany = rows.length > 300;

  const issue = () => startIssue(async () => {
    setIssueError(null);
    const r = await issueAction({
      name, kind, source: SOURCE_FOR[source], sourceJson: { source, eventId: source.startsWith("event") ? eventId : undefined, committeeIds: source === "committee" ? committeeIds : undefined },
      eventId: source === "event" || source === "event_people" ? eventId : null, committeeId: source === "committee" ? committeeIds[0] ?? null : null,
      designId, template, config, issuedOn, recipients: rows, notify, email, emailGuests,
    }).catch(() => null);
    if (!r?.ok) return setIssueError(r && !r.ok ? r.error : "Couldn't issue. Check your connection and try again.");
    showFlash(`Issued ${r.data.issued} certificate${r.data.issued === 1 ? "" : "s"}${r.data.emailed ? `; emailing ${r.data.emailed}` : ""}.`);
    router.push(`/dashboard/certificates/batches/${r.data.id}`);
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_30rem]">
      <div className="min-w-0 space-y-4">
        <Step n={1} title="Who gets one" hint="Load people from the club's records, or from a Google Form export.">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Where the people come from">
            {([["members", "Members"], ["event", "Event registrants"], ["event_people", "Speakers & guests"], ["committee", "Committees"], ["csv", "Spreadsheet"], ["manual", "Type names"]] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={source === k} onClick={() => setSource(k)}
                className={cn("min-h-10 rounded-full border px-3.5 text-sm", source === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>{l}</button>
            ))}
          </div>
          {source === "members" && (
            <div className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]">
              <select className={input} value={filter} onChange={(e) => { setFilter(e.target.value as typeof filter); setFilterValue(""); }} aria-label="Which members">
                <option value="">All active members</option><option value="batch">A batch</option><option value="department">A department</option>
              </select>
              {filter ? (
                <select className={input} value={filterValue} onChange={(e) => setFilterValue(e.target.value)} aria-label={filter === "batch" ? "Batch" : "Department"}>
                  <option value="">Choose…</option>
                  {(filter === "batch" ? options.batches : options.departments).map((x) => <option key={x.value} value={x.value}>{filter === "batch" ? `Batch ${x.value}` : x.value} ({x.count})</option>)}
                </select>
              ) : <span />}
              <Button type="button" onClick={loadSource} disabled={loading || (Boolean(filter) && !filterValue)} className="min-h-10 gap-1.5">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}Load</Button>
            </div>
          )}
          {(source === "event" || source === "event_people") && (
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <select className={input} value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label="Event">
                  {options.events.map((e) => <option key={e.id} value={e.id}>{e.title} ({source === "event" ? `${e.registrations} registered` : `${e.people} people`})</option>)}
                </select>
                <Button type="button" onClick={loadSource} disabled={loading || !eventId} className="min-h-10 gap-1.5">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}Load</Button>
              </div>
              {source === "event" && (
                <div className="flex flex-wrap gap-x-4 text-sm">
                  {(["ATTENDED", "REGISTERED", "WAITLISTED"] as const).map((st) => (
                    <label key={st} className="flex min-h-10 items-center gap-2">
                      <input type="checkbox" className="h-4 w-4" checked={statuses.includes(st)} onChange={(e) => setStatuses((l) => (e.target.checked ? [...l, st] : l.filter((x) => x !== st)))} />
                      {st === "ATTENDED" ? "Attended (checked in)" : st === "REGISTERED" ? "Registered" : "Waiting list"}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          {source === "committee" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Choose one or more committees, oldest first: someone in both gets one certificate naming both terms.</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {options.committees.map((c) => (
                  <label key={c.id} className="flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm">
                    <input type="checkbox" className="h-4 w-4" checked={committeeIds.includes(c.id)} onChange={(e) => setCommitteeIds((l) => (e.target.checked ? [...l, c.id] : l.filter((x) => x !== c.id)))} />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span><span className="text-xs text-muted-foreground">{c.members}</span>
                  </label>
                ))}
              </div>
              <Button type="button" onClick={loadSource} disabled={loading || !committeeIds.length} className="min-h-10 gap-1.5">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}Load</Button>
            </div>
          )}
          {source === "csv" && (
            <div className="space-y-2">
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.json,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onFile(f); }} />
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={loading} className="min-h-10 gap-1.5"><Upload className="h-4 w-4" aria-hidden />Choose a CSV or Excel file</Button>
              <p className="text-xs text-muted-foreground">Download the responses from Google Forms (Responses → ⋮ → Download), then choose the file here. Columns named Name, Email, Student ID, Role, Rank and Team are used; members are matched by email or student ID.</p>
            </div>
          )}
          {source === "manual" && (
            <div className="space-y-2">
              <textarea className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm" value={manual} onChange={(e) => setManual(e.target.value)}
                placeholder={"One person per line: Name, email, role\nRafi Ahmed, rafi@example.com, Volunteer\nNusrat Jahan"} aria-label="People, one per line" />
              <Button type="button" onClick={loadSource} disabled={loading || !manual.trim()} className="min-h-10 gap-1.5">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}Check names</Button>
            </div>
          )}
          {loadError && <p role="alert" className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{loadError}</p>}
        </Step>

        <Step n={2} title={`The people (${rows.length})`} hint="Correct names exactly as they should be printed. Members are linked to their profile; their certificate shows there.">
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">Load people above, or add them one by one.</p> : (
            <div className="max-h-[28rem] overflow-auto rounded-lg border">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="sticky top-0 bg-muted/90 text-left text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <tr><th className="px-2 py-2 font-medium">Name on the certificate</th><th className="px-2 py-2 font-medium">Email</th><th className="px-2 py-2 font-medium">Role or line</th><th className="w-10" /></tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5">
                        <input className={input} value={r.name} aria-label={`Name ${i + 1}`} onChange={(e) => setRows((l) => l.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
                        {r.profileId && <span className="mt-0.5 block text-[11px] text-emerald-700 dark:text-emerald-400">Linked to a member profile</span>}
                      </td>
                      <td className="px-2 py-1.5"><input className={input} value={r.email ?? ""} aria-label={`Email ${i + 1}`} onChange={(e) => setRows((l) => l.map((x, k) => (k === i ? { ...x, email: e.target.value } : x)))} /></td>
                      <td className="px-2 py-1.5"><input className={input} value={r.role ?? ""} aria-label={`Role ${i + 1}`} onChange={(e) => setRows((l) => l.map((x, k) => (k === i ? { ...x, role: e.target.value } : x)))} /></td>
                      <td className="px-1"><Button type="button" variant="ghost" size="icon" className="h-10 w-10" aria-label={`Remove ${r.name}`} onClick={() => setRows((l) => l.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="min-h-10 gap-1" onClick={() => setRows((l) => [...l, { name: "", email: "", role: "" }])}><Plus className="h-4 w-4" aria-hidden />Add a person</Button>
            {rows.length > 0 && <Button type="button" variant="ghost" size="sm" className="min-h-10" onClick={() => setRows([])}>Clear the list</Button>}
            {tooMany && <span className="text-sm text-destructive">At most 300 at a time: remove some, or issue the rest as a second part.</span>}
          </div>
        </Step>

        <Step n={3} title="Design and words">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-xs font-medium sm:col-span-2">What it&apos;s for (shown on the certificate&apos;s page)
              <input className={input} value={name} maxLength={150} onChange={(e) => setName(e.target.value)} placeholder="CSE Carnival 2026" />
            </label>
            <label className="grid gap-1 text-xs font-medium">Date issued<input type="date" className={input} value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} /></label>
            <label className="grid gap-1 text-xs font-medium">Kind
              <select className={input} value={kind} onChange={(e) => changeKind(e.target.value as CertificateKind)}>
                {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </label>
            {options.designs.length > 0 && (
              <label className="grid gap-1 text-xs font-medium sm:col-span-2">Saved design
                <select className={input} value={designId ?? ""} onChange={(e) => applyDesign(e.target.value)}>
                  <option value="">None (start from a template)</option>
                  {options.designs.map((d) => <option key={d.id} value={d.id}>{d.name}{d.isDefault ? " (default)" : ""}</option>)}
                </select>
              </label>
            )}
          </div>
          <TemplatePicker value={template} onChange={setTemplate} config={config} />
          <DesignFields config={config} setConfig={setConfig} />
        </Step>

        <Step n={4} title="Tell them">
          <label className="flex min-h-10 items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            <span>A notice in the dashboard for the {withAccount} with an account<span className="block text-xs text-muted-foreground">Free; it links to their certificate.</span></span>
          </label>
          <label className="flex min-h-10 items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={email} onChange={(e) => setEmail(e.target.checked)} />
            <span>Email them their link<span className="block text-xs text-muted-foreground">Uses the club&apos;s email allowance: sent a few at a time (progress under Email).</span></span>
          </label>
          {email && guests > 0 && (
            <label className="ml-6 flex min-h-10 items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={emailGuests} onChange={(e) => setEmailGuests(e.target.checked)} />
              <span>Also the {guests} without a GUCC account<span className="block text-xs text-muted-foreground">{guests} more emails from the allowance.</span></span>
            </label>
          )}
        </Step>

        <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-6 sm:px-6">
          <Button type="button" onClick={issue} disabled={issuing || !rows.length || tooMany || !name.trim()} className="min-h-11 gap-2 px-6">
            {issuing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            {rows.length ? `Issue ${rows.length} certificate${rows.length === 1 ? "" : "s"}` : "Issue"}
          </Button>
          {!name.trim() && rows.length > 0 && <span className="text-sm text-muted-foreground">Say what it&apos;s for (step 3).</span>}
          {issueError && <p role="alert" className="basis-full text-sm text-destructive">{issueError}</p>}
        </div>
      </div>

      <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start">
        <section className="overflow-hidden rounded-xl border bg-card" aria-label="Preview">
          <h2 className="border-b px-4 py-2 text-sm font-semibold">Preview{first ? `: ${first.name}` : " (sample)"}</h2>
          <div className="bg-muted/40 p-3">
            <CertificateSvg template={template} config={config} data={preview} id="wizard-preview" className="block h-auto w-full rounded shadow" />
          </div>
        </section>
      </aside>
    </div>
  );
}
