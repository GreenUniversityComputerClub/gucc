import type { Metadata } from "next";
import { Laptop, Smartphone } from "lucide-react";
import { requireSignedIn, view } from "@/lib/api/session";
import type { mySessions } from "@/lib/server/services/account";
import { ActionForm, Field, PageHeader, Section } from "@/components/admin/ui";
import { changeEmailAction, deleteAccountAction, revokeOtherSessionsAction, revokeSessionAction } from "../profile/actions";
import type { mfaStatus } from "@/lib/server/services/mfa";
import { PasswordForm } from "./password-form";
import { TwoFactorSection } from "./two-factor-section";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Security", robots: { index: false, follow: false } };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }) : "—");

export default async function SecurityPage() {
  const session = await requireSignedIn("/dashboard/security");
  const [devices, mfa] = await Promise.all([
    view<Awaited<ReturnType<typeof mySessions>>>("account.sessions", {}, "/dashboard/security"),
    view<Awaited<ReturnType<typeof mfaStatus>>>("account.mfaStatus", {}, "/dashboard/security"),
  ]);
  const others = devices.filter((d) => !d.current).length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Security" description={`Signed in as ${session.user.email}.`} />
      <div className="space-y-6">
        <Section title="Password" description="Changing it signs you out everywhere else.">
          <PasswordForm />
        </Section>

        <Section title="Two-factor sign-in" id="two-factor" description="A code from your phone, as well as your password, when you sign in.">
          <TwoFactorSection status={mfa} />
        </Section>

        <Section title="Where you're signed in">
          <ul className="divide-y text-sm">
            {devices.map((d) => (
              <li key={d.ref} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="flex min-w-0 items-center gap-3">
                  {/Android|iOS/.test(d.device) ? <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> : <Laptop className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
                  <span className="min-w-0">
                    <span className="font-medium">{d.device}</span>{d.current && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">this device</span>}
                    <span className="block text-xs text-muted-foreground">Last active {when(d.last_seen_at ?? d.created_at)} · signed in {when(d.created_at)}</span>
                  </span>
                </span>
                {!d.current && <ActionForm action={revokeSessionAction.bind(null, d.ref)} submitLabel="Sign out" variant="outline" inline />}
              </li>
            ))}
          </ul>
          {others > 0 && (
            <div className="mt-3 border-t pt-3">
              <ActionForm action={revokeOtherSessionsAction} submitLabel="Sign out everywhere else" variant="outline" confirm="Sign out on every other device?" />
            </div>
          )}
        </Section>

        <Section title="Sign-in email" description="With club email working, a confirmation link goes to the new address and the change happens once you open it. Other devices are signed out either way.">
          <ActionForm action={changeEmailAction} submitLabel="Change email" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field name="email" label="New email" type="email" required />
              <Field name="password" label="Your password" type="password" required />
            </div>
          </ActionForm>
        </Section>

        <Section title="Delete my account" description="Your sign-in, roles and private details are removed. If you served on a committee, that listing stays in the club's history without your account.">
          <ActionForm action={deleteAccountAction} submitLabel="Delete my account" variant="destructive" confirm="Delete your account? This can't be undone.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field name="password" label="Your password" type="password" required />
              <Field name="confirm" label='Type "DELETE" to confirm' required />
            </div>
          </ActionForm>
        </Section>
      </div>
    </div>
  );
}
