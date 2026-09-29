import Link from "next/link";
import { requireAdmin, rpc, view } from "@/lib/api/session";
import type { MemberListRow } from "@/lib/server/services/members";
import { ActionForm, EmptyState, PageHeader, Pager, StatusBadge } from "@/components/admin/ui";
import { PersonPicker } from "@/components/admin/person-picker";
import { ResetLinkButton, ResetMfaButton } from "@/components/admin/reset-link";
import type { rolesOverview } from "@/lib/server/views/governance";
import { GrantRoleBar } from "./grant-role-bar";
import { approveAndLinkAction, approveMemberAction, linkProfileAction, reactivateUserAction, rejectMemberAction, requestCorrectionAction, reviewNoteAction, suspendUserAction } from "../actions";
import { PersonAvatar } from "@/components/person-avatar";

const TABS: Array<[string, string]> = [["PENDING_APPROVAL", "Waiting for approval"], ["ACTIVE", "Active"], ["EMAIL_VERIFICATION_PENDING", "Email not verified"], ["SUSPENDED", "Suspended"], ["REJECTED", "Rejected"], ["ALL", "All"]];
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" }) : "—");
const inputCls = "h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm sm:w-56";

export default async function MembersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireAdmin("/dashboard/members");
  const sp = await searchParams;
  const status = sp.status ?? "PENDING_APPROVAL";
  const page = Number(sp.page ?? 1);
  const { rows, total } = await view<{ rows: MemberListRow[]; total: number }>("members.list", { status: status === "ALL" || !status ? undefined : status, q: sp.q || undefined, page, batch: sp.batch || undefined, department: sp.department || undefined }, "/dashboard/members");
  const mayApprove = Boolean(session.caps["members.approve"]);
  const mayReject = Boolean(session.caps["members.reject"]);
  const maySuspend = Boolean(session.caps["users.suspend"]);
  const mayLink = Boolean(session.caps["members.manage"]);
  const mayReset = Boolean(session.caps["users.reset_password"]);
  const mayAudit = Boolean(session.caps["audit.read"]);
  const mayGrant = Boolean(session.caps["roles.assign"]) && status === "ACTIVE";
  // Roles that can be given in bulk: not protected, and (unless a Moderator) without sensitive permissions.
  const rolesList = mayGrant ? await rpc<Awaited<ReturnType<typeof rolesOverview>>>("views.roles", {}) : null;
  const bulkRoles = rolesList?.ok
    ? rolesList.data
      .filter((r) => !r.is_protected && (session.isModerator || !r.sensitive) && !["member", "executive", "unit-executive"].includes(r.key))
      .map((r) => ({ key: r.key, name: r.name }))
    : [];
  const filters = { q: sp.q, batch: sp.batch, department: sp.department };
  const qs = (extra: Record<string, string>) => new URLSearchParams(Object.fromEntries(Object.entries({ ...filters, ...extra }).filter(([, v]) => v)) as Record<string, string>).toString();

  return (
    <>
      <PageHeader title="Members" description={`${total} account${total === 1 ? "" : "s"} in this view. New accounts wait here (after confirming their email, when email is set up) until club leadership approves them. Approving makes them members only — positions and roles are assigned separately.`}
        actions={mayLink ? <a href={`/api/admin/members/export?${qs({ status })}`} className="inline-flex min-h-9 items-center rounded-md border px-3 text-sm hover:bg-muted" title="The accounts in this view, with the filters above">Download CSV</a> : undefined} />
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {TABS.map(([k, label]) => (
          <Link prefetch={false} key={k} href={`/dashboard/members?${qs({ status: k })}`} className={`inline-flex min-h-9 items-center rounded-full border px-3 ${status === k || (k === "ALL" && !status) ? "bg-primary text-primary-foreground" : ""}`}>{label}</Link>
        ))}
      </div>
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input type="hidden" name="status" value={status} />
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Name, email or student ID" aria-label="Search members" className="h-10 md:h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-base md:text-sm sm:min-w-56" />
        <input name="batch" defaultValue={sp.batch ?? ""} placeholder="Batch" aria-label="Batch" className="h-10 md:h-9 w-24 rounded-md border bg-background px-3 text-base md:text-sm" />
        <input name="department" defaultValue={sp.department ?? ""} placeholder="Department" aria-label="Department" className="h-10 md:h-9 w-32 rounded-md border bg-background px-3 text-base md:text-sm" />
        <button className="h-9 rounded-md border px-4 text-sm">Search</button>
      </form>
      {rows.length === 0 ? (
        <EmptyState>{status === "PENDING_APPROVAL" ? "No applications are waiting. New registrations appear here (after the applicant confirms their email, when email is set up)." : "No accounts match."}</EmptyState>
      ) : (
        <div className="space-y-3">
          {mayGrant && bulkRoles.length > 0 && <GrantRoleBar roles={bulkRoles} />}
          {rows.map((m) => (
            <article key={m.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  {mayGrant && bulkRoles.length > 0 && m.status === "ACTIVE" && <input type="checkbox" data-member-id value={m.id} aria-label={`Select ${m.full_name ?? m.email}`} className="mt-1.5 h-4 w-4 shrink-0" />}
                  <PersonAvatar name={m.full_name ?? m.email} url={m.avatarUrl} size="md" />
                <div className="min-w-0">
                  <h2 className="font-medium">{m.full_name ?? "—"} <StatusBadge status={m.status} /></h2>
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                    <dt className="text-muted-foreground">Email</dt><dd className="truncate">{m.email} {m.email_verified_at ? <span className="text-xs text-emerald-600">verified</span> : <span className="text-xs text-amber-700 dark:text-amber-400">not verified</span>}</dd>
                    <dt className="text-muted-foreground">Student ID</dt><dd>{m.student_id ?? (m.claim ? <span className="text-amber-700 dark:text-amber-300">{m.claim} (claimed)</span> : "—")}</dd>
                    <dt className="text-muted-foreground">Department</dt><dd>{m.department ?? "—"}{m.batch ? ` · batch ${m.batch}` : ""}</dd>
                    {m.phone && <><dt className="text-muted-foreground">Phone</dt><dd>{m.phone}</dd></>}
                    <dt className="text-muted-foreground">Registered</dt><dd>{date(m.created_at)}{m.last_login_at ? ` · last sign-in ${date(m.last_login_at)}` : ""}</dd>
                    {(m.roles || m.positions) && <><dt className="text-muted-foreground">Holds</dt><dd>{[m.roles, m.positions].filter(Boolean).join(" · ")}</dd></>}
                  </dl>
                  {m.claim && (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                      Claims student ID {m.claim}, which belongs to {m.claim_name ? <strong>{m.claim_name}</strong> : "an existing profile"}{m.claim_holds ? ` (${m.claim_holds})` : ""}. Confirm it&apos;s them (e.g. their student ID card) before linking.
                    </p>
                  )}
                  {m.review_note && <p className="mt-2 rounded-md bg-muted p-2 text-xs">Reviewer note: {m.review_note}</p>}
                  {m.correction_note && <p className="mt-2 rounded-md bg-amber-500/10 p-2 text-xs">Correction requested: {m.correction_note}</p>}
                </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-start gap-2 border-t pt-3">
                {mayApprove && m.status === "EMAIL_VERIFICATION_PENDING" && (
                  <ActionForm action={approveMemberAction.bind(null, m.id)} submitLabel="Approve without email verification" variant="outline" inline confirm={`${m.full_name ?? m.email} hasn't verified their email. Approve only if you know this address belongs to them.`} />
                )}
                {mayApprove && mayLink && m.claim_profile_id && (m.status === "PENDING_APPROVAL" || m.status === "EMAIL_VERIFICATION_PENDING") && (
                  <ActionForm action={approveAndLinkAction.bind(null, m.id, m.claim_profile_id)} submitLabel={`Approve and link to ${m.claim_name ?? "their profile"}`} inline confirm={`Approve ${m.full_name ?? m.email} and attach the account to ${m.claim_name ?? "the claimed profile"}${m.claim_holds ? ` (${m.claim_holds})` : ""}? Its positions' permissions apply immediately.`} />
                )}
                {mayApprove && m.status === "PENDING_APPROVAL" && (
                  <>
                    <ActionForm action={approveMemberAction.bind(null, m.id)} submitLabel={m.claim_profile_id ? "Approve without linking" : "Approve"} variant={m.claim_profile_id ? "outline" : "default"} inline confirm={`Approve ${m.full_name ?? m.email} as a GUCC member?`} />
                    <details>
                      <summary className="cursor-pointer rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Request correction</summary>
                      <div className="mt-2"><ActionForm action={requestCorrectionAction.bind(null, m.id)} submitLabel="Send" inline><input name="note" required aria-label="What needs correcting" placeholder="e.g. Student ID doesn't match your ID card" className={inputCls} /></ActionForm></div>
                    </details>
                  </>
                )}
                {mayReject && m.status === "PENDING_APPROVAL" && (
                  <details>
                    <summary className="cursor-pointer rounded-md border px-3 py-1.5 text-sm text-destructive hover:bg-muted">Reject</summary>
                    <div className="mt-2"><ActionForm action={rejectMemberAction.bind(null, m.id)} submitLabel="Reject" variant="destructive" inline><input name="reason" required aria-label="Reason" placeholder="Reason (sent to the applicant)" className={inputCls} /></ActionForm></div>
                  </details>
                )}
                {maySuspend && m.status === "ACTIVE" && (
                  <details>
                    <summary className="cursor-pointer rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Suspend</summary>
                    <div className="mt-2"><ActionForm action={suspendUserAction.bind(null, m.id)} submitLabel="Suspend" variant="destructive" inline confirm="Suspend this account? Their sessions end immediately."><input name="reason" required aria-label="Reason" placeholder="Reason" className={inputCls} /></ActionForm></div>
                  </details>
                )}
                {maySuspend && (m.status === "SUSPENDED" || m.status === "INACTIVE") && <ActionForm action={reactivateUserAction.bind(null, m.id)} submitLabel="Reactivate" variant="outline" inline />}
                {mayReset && ["ACTIVE", "PENDING_APPROVAL", "EMAIL_VERIFICATION_PENDING"].includes(m.status) && <ResetLinkButton userId={m.id} name={m.full_name ?? m.email} />}
                {mayReset && m.mfa === 1 && <ResetMfaButton userId={m.id} name={m.full_name ?? m.email} />}
                {(mayApprove || mayLink) && (
                  <details>
                    <summary className="cursor-pointer rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Reviewer note</summary>
                    <div className="mt-2"><ActionForm action={reviewNoteAction.bind(null, m.id)} submitLabel="Save note" inline><input name="note" defaultValue={m.review_note ?? ""} aria-label="Reviewer note" placeholder="Only reviewers see this" className={inputCls} /></ActionForm></div>
                  </details>
                )}
                {mayAudit && <Link prefetch={false} href={`/dashboard/activity?actor=${encodeURIComponent(m.id)}`} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">History</Link>}
                {m.status === "ACTIVE" && (session.caps["roles.read"] || session.caps["roles.assign"]) && <Link prefetch={false} href={`/dashboard/access/${encodeURIComponent(m.id)}`} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Access &amp; roles</Link>}
                {m.status === "ACTIVE" && session.caps["executives.assign"] && <Link prefetch={false} href="/dashboard/committees" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Assign a position</Link>}
                {mayLink && m.claim && (
                  <details className="w-full">
                    <summary className="cursor-pointer text-sm text-muted-foreground">Link to their existing profile</summary>
                    <div className="mt-2 max-w-md">
                      <ActionForm action={linkProfileAction.bind(null, m.id)} submitLabel="Link profile" confirm="Attach this account to the existing profile and its committee history?">
                        <PersonPicker name="profileId" label="Existing profile" required hint={`Search ${m.claim} to find the profile.`} />
                      </ActionForm>
                    </div>
                  </details>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <Pager page={page} hasMore={rows.length === 50} base="/dashboard/members" params={{ status, q: sp.q, batch: sp.batch, department: sp.department }} />
    </>
  );
}
