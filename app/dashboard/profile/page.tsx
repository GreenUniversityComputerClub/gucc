import Link from "next/link";
import type { Metadata } from "next";
import { KeyRound, ShieldCheck } from "lucide-react";
import { requireSignedIn, rpc, view } from "@/lib/api/session";
import type { accountView } from "@/lib/server/views/admin";
import type { emailPreferences } from "@/lib/server/services/system-controls";
import { Badge } from "@/components/ui/badge";
import { AvatarUploader, EmailPreferences, ProfileEditor } from "./forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your profile", robots: { index: false, follow: false } };

const STATUS: Record<string, { title: string; text: string; tone: string }> = {
  PENDING_APPROVAL: { title: "Awaiting approval", text: "Your account has been created and is awaiting GUCC approval. You'll see a notification here when a club leader reviews it.", tone: "border-amber-400/60 bg-amber-500/5" },
  EMAIL_VERIFICATION_PENDING: { title: "Verify your email", text: "Open the link we emailed you to verify your address. Then your application goes to club leadership for approval.", tone: "border-amber-400/60 bg-amber-500/5" },
  ACTIVE: { title: "Active member", text: "Your GUCC membership is approved. Register for events and keep your profile up to date.", tone: "border-emerald-500/40 bg-emerald-500/5" },
  APPROVED: { title: "Approved", text: "Your GUCC account has been approved.", tone: "border-emerald-500/40 bg-emerald-500/5" },
  REJECTED: { title: "Needs attention", text: "Your registration needs attention. Contact the club's leaders.", tone: "border-rose-400/60 bg-rose-500/5" },
  SUSPENDED: { title: "Suspended", text: "Your account is suspended.", tone: "border-rose-400/60 bg-rose-500/5" },
};

/** Which profile details are filled in, as a share and a hint for the next one. */
function completeness(p: Record<string, unknown>, hasPhoto: boolean) {
  const checks: Array<[boolean, string]> = [
    [hasPhoto, "a photo"],
    [Boolean(p.department), "your department"],
    [Boolean(p.batch), "your batch"],
    [Boolean(p.bio), "a few words about you"],
    [Boolean(p.skills_json && p.skills_json !== "[]"), "your skills"],
    [Boolean(p.linkedin_url || p.github_url || p.facebook_url || p.twitter_url || p.website_url), "a link to your profile elsewhere"],
    [Boolean(p.phone), "a phone number"],
  ];
  const done = checks.filter(([ok]) => ok).length;
  return { percent: Math.round((done / checks.length) * 100), next: checks.find(([ok]) => !ok)?.[1] ?? null };
}

export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireSignedIn("/dashboard/profile");
  const sp = await searchParams;
  const [data, prefs] = await Promise.all([
    view<Awaited<ReturnType<typeof accountView>>>("account.view", {}, "/dashboard/profile"),
    // Optional: an API older than this page simply doesn't show the section.
    rpc<Awaited<ReturnType<typeof emailPreferences>>>("email.preferences", {}),
  ]);
  const status = data.account?.status ?? session.user.status;
  const st = STATUS[status] ?? { title: status.replace(/_/g, " ").toLowerCase(), text: "Contact the club's leaders about your account.", tone: "" };
  const profile = (data.profile ?? {}) as Record<string, unknown>;
  const name = (profile.full_name as string | undefined) ?? session.user.email;
  const c = completeness(profile, Boolean(data.avatarUrl));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {sp.welcome && <p role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">Welcome! Your account is active.</p>}

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:p-6">
        <AvatarUploader url={data.avatarUrl} name={name} canUpload={status === "ACTIVE" || status === "PENDING_APPROVAL"} />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h1 className="truncate text-2xl font-bold tracking-tight">{name}</h1>
            <p className="truncate text-sm text-muted-foreground">{session.user.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={status === "ACTIVE" ? "default" : "secondary"}>{st.title}</Badge>
            {session.positions.map((p) => <Badge key={p.key} variant="outline">{p.name}</Badge>)}
          </div>
          {data.profile && (
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Profile {c.percent}% complete{c.next ? ` · add ${c.next}` : ""}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={c.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness">
                <div className="h-full rounded-full bg-primary" style={{ width: `${c.percent}%` }} />
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 sm:flex-col">
          <Link prefetch={false} href="/dashboard/security" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-muted"><KeyRound className="h-4 w-4" aria-hidden />Security</Link>
          <Link prefetch={false} href={`/dashboard/access/${encodeURIComponent(session.user.id)}`} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-muted"><ShieldCheck className="h-4 w-4" aria-hidden />Your access</Link>
        </div>
      </section>

      <section className={`rounded-xl border p-4 text-sm sm:p-5 ${st.tone}`}>
        <p>{st.text}</p>
        {data.account?.correction_note && status === "PENDING_APPROVAL" && <p className="mt-2 rounded-md bg-amber-500/10 p-3"><strong>Please update your details:</strong> {data.account.correction_note} Save your profile below when done.</p>}
        {status === "SUSPENDED" && data.account?.suspended_reason && <p className="mt-2">Reason: {data.account.suspended_reason}</p>}
        {status === "REJECTED" && data.account?.rejected_reason && <p className="mt-2">Reason: {data.account.rejected_reason}</p>}
      </section>

      {data.profile ? (
        <ProfileEditor profile={profile} locked={status === "ACTIVE"} />
      ) : (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">Your account isn&apos;t linked to a profile yet. A club leader can link it for you.</p>
      )}

      {prefs.ok && status === "ACTIVE" && <EmailPreferences choices={prefs.data.choices} emailOn={prefs.data.emailOn} address={prefs.data.address} />}

      {data.history.length > 0 && (
        <section className="rounded-xl border bg-card p-4 sm:p-6">
          <h2 className="mb-3 text-base font-semibold">Committee history</h2>
          <ul className="space-y-1 text-sm">
            {data.history.map((h, i) => (
              <li key={i}><Link href={`/executives/${h.committee_slug}`} className="font-medium hover:underline">{h.committee_slug}</Link> · {h.position_title}{h.is_active ? <span className="ml-1 text-xs text-emerald-600">current</span> : null}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
