import Link from "next/link";
import { requireSignedIn, view } from "@/lib/api/session";
import type { HealthStatus, systemHealth, UsageRow } from "@/lib/server/services/health";
import { ActionForm, PageHeader, Section } from "@/components/admin/ui";
import { switchAction, testEmailAction } from "../actions";
import { cn } from "@/lib/utils";

const STYLE: Record<HealthStatus, { label: string; cls: string }> = {
  HEALTHY: { label: "Healthy", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  WARNING: { label: "Warning", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  ERROR: { label: "Error", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  UNKNOWN: { label: "Unknown", cls: "bg-muted text-muted-foreground" },
};

type Health = Awaited<ReturnType<typeof systemHealth>>;

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" });

function amount(n: number, unit: UsageRow["unit"]): string {
  if (unit === "bytes") {
    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
    if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
    return `${Math.round(n / 1024)} KB`;
  }
  if (unit === "ms") return `${n.toFixed(1)} ms`;
  return n.toLocaleString("en-US");
}

function UsageLine({ row }: { row: UsageRow }) {
  const share = row.used === null || row.limit <= 0 ? null : Math.min(1, row.used / row.limit);
  const tone = share === null ? "bg-muted" : share >= 0.9 ? "bg-rose-500" : share >= 0.7 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-medium">{row.label} <span className="text-xs font-normal text-muted-foreground">({row.period})</span></p>
        <p className="text-sm tabular-nums">
          {row.used === null ? <span className="text-muted-foreground">Unknown</span> : <>{amount(row.used, row.unit)} <span className="text-muted-foreground">of {amount(row.limit, row.unit)}</span></>}
        </p>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        {share !== null && <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.max(1, Math.round(share * 100))}%` }} />}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {row.source ? `Source: ${row.source === "Cloudflare" ? "Cloudflare analytics" : "GUCC's own count"}.` : "Needs the Cloudflare analytics token."}
        {row.note ? ` ${row.note}` : ""}
      </p>
    </li>
  );
}

function Switch({ label, on, keyName, controls, extra, canTurnOn = true }: { label: string; on: boolean; keyName: string; controls: Health["controls"]; extra?: React.ReactNode; canTurnOn?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div>
        <p className="font-medium">{label}</p>
        <p className={cn("text-sm", on ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>{on ? "On" : "Off"}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {extra}
        {on && controls.canSwitchOff && (
          <ActionForm action={switchAction.bind(null, keyName, false)} submitLabel={`Switch ${label.toLowerCase()} off`} variant="outline" inline
            confirm={`Switch ${label.toLowerCase()} off now? A Moderator switches it back on.`} />
        )}
        {!on && controls.canSwitchOn && canTurnOn && (
          <ActionForm action={switchAction.bind(null, keyName, true)} submitLabel={`Switch ${label.toLowerCase()} on`} inline />
        )}
      </div>
    </div>
  );
}

export default async function HealthPage() {
  await requireSignedIn("/dashboard/health");
  const h = await view<Health>("system.health", {}, "/dashboard/health");
  const checks = h.checks ?? [];
  const worst = (["ERROR", "WARNING", "UNKNOWN"] as const).find((s) => checks.some((c) => c.status === s)) ?? "HEALTHY";
  const controls = h.controls ?? { uploadsEnabled: true, emailEnabled: false, canSwitchOff: false, canSwitchOn: false, canTestEmail: false };
  return (
    <div className="space-y-6">
      <PageHeader title="System health" description={`Checked just now (${new Date(h.checkedAt).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "medium" })}). Each line is a live check, not a stored status.`}
        actions={<Link href="/dashboard/health" className="text-sm underline" prefetch={false}>Check again</Link>} />
      <Section title={worst === "HEALTHY" ? "Everything checked is working" : worst === "ERROR" ? "Something needs attention" : "Working, with notes"}>
        <ul className="divide-y">
          {checks.map((c) => (
            <li key={c.key} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{c.label}</p>
                <p className="text-sm text-muted-foreground">{c.detail}</p>
              </div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium", STYLE[c.status].cls)}>{STYLE[c.status].label}</span>
            </li>
          ))}
        </ul>
      </Section>

      {h.usage && (
        <Section title="Free plan usage" description={h.analytics?.configured
          ? h.analytics.available ? "Cloudflare's own figures next to GUCC's counts; the larger one is shown." : `Cloudflare analytics didn't answer${h.analytics.error ? ` (${h.analytics.error})` : ""}; GUCC's own counts are shown where they exist.`
          : "Cloudflare's figures appear once the read-only analytics token (CF_ANALYTICS_TOKEN) is set on the API; GUCC's own counts are shown meanwhile."}>
          <ul className="divide-y">{h.usage.map((r) => <UsageLine key={r.key} row={r} />)}</ul>
        </Section>
      )}

      <Section title="Switches" description="Anyone who can see this page can switch uploads or email off at once. Switching back on is a Moderator's decision.">
        <div className="divide-y">
          <Switch label="Uploads" keyName="media.uploads_enabled" on={controls.uploadsEnabled} controls={controls} />
          {/* Email can be switched on only after a test email Resend accepted (in the last 7 days). */}
          <Switch label="Email" keyName="email.enabled" on={controls.emailEnabled} controls={controls} canTurnOn={Boolean(h.email?.provider === "resend" && h.email.lastTestAt)}
            extra={controls.canTestEmail && <ActionForm action={testEmailAction} submitLabel="Send me a test email" variant="outline" inline />} />
        </div>
        {h.email && !controls.emailEnabled && controls.canSwitchOn && (
          <p className="mt-2 text-sm text-muted-foreground">
            {h.email.provider === "resend"
              ? h.email.lastTestAt ? `The last test email was accepted by Resend on ${when(h.email.lastTestAt)}. Switch email on once it has arrived.` : "Send a test email first; switching on needs a successful test from the last 7 days."
              : "Resend isn't configured on the API yet (RESEND_API_KEY and RESEND_FROM_EMAIL)."}
          </p>
        )}
      </Section>

      {h.email && (
        <Section title="Email (last 24 hours)" description={`${h.email.last24h.sent} sent, ${h.email.last24h.failed} failed, ${h.email.last24h.skipped} not sent (daily limit, personal choice or email off). Each line is Resend's answer.`}>
          {h.email.recent.length === 0 ? <p className="text-sm text-muted-foreground">No emails yet.</p> : (
            <ul className="divide-y text-sm">
              {h.email.recent.map((r, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2">
                  <span className="min-w-0"><span className="font-medium">{r.type}</span> to {r.recipient}{r.error ? <span className="block text-xs text-rose-700 dark:text-rose-300">{r.error}</span> : null}</span>
                  <span className="shrink-0 text-muted-foreground">{r.status.replace("_", " ")} · {when(r.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {h.errors && (
        <Section title="Errors (last 24 hours)" description={h.errors.last24h === 0 ? "No unexpected errors." : `${h.errors.last24h} unexpected error${h.errors.last24h === 1 ? "" : "s"}. Refused requests (wrong password, no permission) aren't errors and aren't listed.`}>
          {h.errors.recent.length > 0 && (
            <ul className="divide-y text-sm">
              {h.errors.recent.map((e, i) => (
                <li key={i} className="py-2">
                  <p><span className="font-medium">{e.procedure ?? "request"}</span> <span className="text-muted-foreground">· {e.code ?? "ERROR"} {e.status ?? ""} · {when(e.created_at)}</span></p>
                  {e.message && <p className="break-words text-xs text-muted-foreground">{e.message}</p>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {h.signIns && (
        <Section title="Sign-ins (last 24 hours)">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
            {([
              ["Successful", h.signIns.successful],
              ["Failed attempts", h.signIns.failed],
              ["Accounts paused", h.signIns.locked],
              ["New sign-ups", h.signIns.signUps],
              ["Rate-limited (hour)", h.signIns.limitedAddresses],
            ] as const).map(([label, n]) => (
              <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="text-xl font-semibold tabular-nums">{n}</dd></div>
            ))}
          </dl>
        </Section>
      )}
    </div>
  );
}
