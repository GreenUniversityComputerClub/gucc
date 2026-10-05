import Link from "next/link";
import { requireAdmin, rpc, view } from "@/lib/api/session";
import type { MemberListRow } from "@/lib/server/services/members";
import { ActionForm, EmptyState, Field, PageHeader, Pager, StatusBadge } from "@/components/admin/ui";
import { PersonPicker } from "@/components/admin/person-picker";
import { ResetLinkButton, ResetMfaButton } from "@/components/admin/reset-link";
import type { rolesOverview } from "@/lib/server/views/governance";
import { PAGE_SIZES, pageOf, pageSizeOf } from "@/lib/pagination";
import { GrantRoleBar } from "./grant-role-bar";
import { BulkDeleteBar } from "./bulk-delete-bar";
import { MemberSheet } from "./member-sheet";
import {
  approveAndLinkAction, approveMemberAction, changeMemberEmailAction, deleteAccountByLeaderAction, linkProfileAction, reactivateUserAction, rejectMemberAction,
  requestCorrectionAction, reviewNoteAction, suspendUserAction,
} from "../actions";
import { PersonAvatar } from "@/components/person-avatar";

const TABS: Array<[string, string]> = [["PENDING_APPROVAL", "Waiting for approval"], ["ACTIVE", "Active"], ["EMAIL_VERIFICATION_PENDING", "Email not verified"], ["SUSPENDED", "Suspended"], ["REJECTED", "Rejected"], ["ALL", "All"]];
const SORTS: Array<[string, string]> = [["newest", "Newest first"], ["oldest", "Oldest first"], ["name", "Name (A–Z)"], ["login", "Last signed in"], ["batch", "Batch"]];
/** Applications that never became members: these can be deleted together. */
const APPLICATION_TABS = new Set(["PENDING_APPROVAL", "EMAIL_VERIFICATION_PENDING", "REJECTED"]);
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" }) : "—");
const inputCls = "h-10 w-full min-w-0 rounded-md border bg-background px-3 text-base md:h-9 md:text-sm";
const selectCls = "h-10 rounded-md border bg-background px-2 text-base md:h-9 md:text-sm";

export default async function MembersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireAdmin("/dashboard/members");
  const sp = await searchParams;
  const status = sp.status ?? "PENDING_APPROVAL";
  const page = pageOf(sp.page);
  const size = pageSizeOf(sp.size, 25);
  const sort = SORTS.some(([k]) => k === sp.sort) ? sp.sort! : "newest";
  const [{ rows, total }, options] = await Promise.all([
    view<{ rows: MemberListRow[]; total: number }>("members.list", { status: status === "ALL" || !status ? undefined : status, q: sp.q || undefined, page, size, sort, batch: sp.batch || undefined, department: sp.department || undefined }, "/dashboard/members"),
    // Optional: an API older than this page has no filter lists; the boxes stay free text then.
    rpc<{ batches: string[]; departments: string[] }>("members.options", {}).then((r) => (r.ok ? r.data : null)),
  ]);
  const mayApprove = Boolean(session.caps["members.approve"]);
  const mayReject = Boolean(session.caps["members.reject"]);
  const maySuspend = Boolean(session.caps["users.suspend"]);
  const mayLink = Boolean(session.caps["members.manage"]);
  const mayReset = Boolean(session.caps["users.reset_password"]);
  const mayAudit = Boolean(session.caps["audit.read"]);
  const mayDelete = Boolean(session.caps["accounts.manage"]);
  const mayEmail = Boolean(session.caps["accounts.email"]);
  const mayGrant = Boolean(session.caps["roles.assign"]) && status === "ACTIVE";
  const mayBulkDelete = mayDelete && APPLICATION_TABS.has(status);
  // Roles that can be given in bulk: not protected, and (unless a Moderator) without sensitive permissions.
  const rolesList = mayGrant ? await rpc<Awaited<ReturnType<typeof rolesOverview>>>("views.roles", {}) : null;
  const bulkRoles = rolesList?.ok
    ? rolesList.data
      .filter((r) => !r.is_protected && (session.isModerator || !r.sensitive) && !["member", "executive", "unit-executive"].includes(r.key))
      .map((r) => ({ key: r.key, name: r.name }))
    : [];
  const selectable = (mayGrant && bulkRoles.length > 0) || mayBulkDelete;
  const filters = { q: sp.q, batch: sp.batch, department: sp.department, sort: sort === "newest" ? undefined : sort, size: size === 25 ? undefined : String(size) };
  const qs = (extra: Record<string, string>) => new URLSearchParams(Object.fromEntries(Object.entries({ ...filters, ...extra }).filter(([, v]) => v)) as Record<string, string>).toString();

  /** Everything you can do with one member, shown in their sheet. */
  const actions = (m: MemberListRow) => {
    const name = m.full_name ?? m.email;
    return (
      <>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Email</dt><dd className="min-w-0 break-words">{m.email} {m.email_verified_at ? <span className="text-xs text-emerald-600">verified</span> : <span className="text-xs text-amber-700 dark:text-amber-400">not verified</span>}</dd>
          <dt className="text-muted-foreground">Student ID</dt><dd>{m.student_id ?? (m.claim ? <span className="text-amber-700 dark:text-amber-300">{m.claim} (claimed)</span> : "—")}</dd>
          <dt className="text-muted-foreground">Department</dt><dd>{m.department ?? "—"}{m.batch ? ` · batch ${m.batch}` : ""}</dd>
          {m.phone && <><dt className="text-muted-foreground">Phone</dt><dd>{m.phone}</dd></>}
          <dt className="text-muted-foreground">Registered</dt><dd>{date(m.created_at)}{m.last_login_at ? ` · last sign-in ${date(m.last_login_at)}` : ""}</dd>
          {(m.roles || m.positions) && <><dt className="text-muted-foreground">Holds</dt><dd>{[m.roles, m.positions].filter(Boolean).join(" · ")}</dd></>}
          <dt className="text-muted-foreground">Two-factor</dt><dd>{m.mfa ? "On" : "Off"}</dd>
        </dl>
        {m.claim && (
          <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
            Claims student ID {m.claim}, which belongs to {m.claim_name ? <strong>{m.claim_name}</strong> : "an existing profile"}{m.claim_holds ? ` (${m.claim_holds})` : ""}. Confirm it&apos;s them (e.g. their student ID card) before linking.
          </p>
        )}
        {m.review_note && <p className="rounded-md bg-muted p-2 text-xs">Reviewer note: {m.review_note}</p>}
        {m.correction_note && <p className="rounded-md bg-amber-500/10 p-2 text-xs">Correction requested: {m.correction_note}</p>}

        <div className="flex flex-wrap gap-2">
          {mayApprove && mayLink && m.claim_profile_id && (m.status === "PENDING_APPROVAL" || m.status === "EMAIL_VERIFICATION_PENDING") && (
            <ActionForm action={approveAndLinkAction.bind(null, m.id, m.claim_profile_id)} submitLabel={`Approve and link to ${m.claim_name ?? "their profile"}`} inline confirm={`Approve ${name} and attach the account to ${m.claim_name ?? "the claimed profile"}${m.claim_holds ? ` (${m.claim_holds})` : ""}? Its positions' permissions apply immediately.`} />
          )}
          {mayApprove && m.status === "PENDING_APPROVAL" && (
            <ActionForm action={approveMemberAction.bind(null, m.id)} submitLabel={m.claim_profile_id ? "Approve without linking" : "Approve"} variant={m.claim_profile_id ? "outline" : "default"} inline confirm={`Approve ${name} as a GUCC member?`} />
          )}
          {mayApprove && m.status === "EMAIL_VERIFICATION_PENDING" && (
            <ActionForm action={approveMemberAction.bind(null, m.id)} submitLabel="Approve without email verification" variant="outline" inline confirm={`${name} hasn't verified their email. Approve only if you know this address belongs to them.`} />
          )}
          {maySuspend && (m.status === "SUSPENDED" || m.status === "INACTIVE") && <ActionForm action={reactivateUserAction.bind(null, m.id)} submitLabel="Reactivate" variant="outline" inline />}
          {mayReset && ["ACTIVE", "PENDING_APPROVAL", "EMAIL_VERIFICATION_PENDING"].includes(m.status) && <ResetLinkButton userId={m.id} name={name} />}
          {mayReset && m.mfa === 1 && <ResetMfaButton userId={m.id} name={name} />}
          {mayAudit && <Link prefetch={false} href={`/dashboard/activity?actor=${encodeURIComponent(m.id)}`} className="inline-flex min-h-10 items-center rounded-md border px-3 text-sm hover:bg-muted">History</Link>}
          {m.status === "ACTIVE" && (session.caps["roles.read"] || session.caps["roles.assign"]) && <Link prefetch={false} href={`/dashboard/access/${encodeURIComponent(m.id)}`} className="inline-flex min-h-10 items-center rounded-md border px-3 text-sm hover:bg-muted">Access &amp; roles</Link>}
          {m.status === "ACTIVE" && session.caps["executives.assign"] && <Link prefetch={false} href="/dashboard/committees" className="inline-flex min-h-10 items-center rounded-md border px-3 text-sm hover:bg-muted">Assign a position</Link>}
        </div>

        {mayApprove && m.status === "PENDING_APPROVAL" && (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Request a correction</summary>
            <ActionForm action={requestCorrectionAction.bind(null, m.id)} submitLabel="Send" className="mt-2 space-y-2"><input name="note" required aria-label="What needs correcting" placeholder="e.g. Student ID doesn't match your ID card" className={inputCls} /></ActionForm>
          </details>
        )}
        {mayReject && m.status === "PENDING_APPROVAL" && (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium text-destructive">Reject</summary>
            <ActionForm action={rejectMemberAction.bind(null, m.id)} submitLabel="Reject" variant="destructive" className="mt-2 space-y-2"><input name="reason" required aria-label="Reason" placeholder="Reason (sent to the applicant)" className={inputCls} /></ActionForm>
          </details>
        )}
        {maySuspend && m.status === "ACTIVE" && (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Suspend</summary>
            <ActionForm action={suspendUserAction.bind(null, m.id)} submitLabel="Suspend" variant="destructive" confirm="Suspend this account? Their sessions end immediately." className="mt-2 space-y-2"><input name="reason" required aria-label="Reason" placeholder="Reason" className={inputCls} /></ActionForm>
          </details>
        )}
        {(mayApprove || mayLink) && (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Reviewer note</summary>
            <ActionForm action={reviewNoteAction.bind(null, m.id)} submitLabel="Save note" className="mt-2 space-y-2"><input name="note" defaultValue={m.review_note ?? ""} aria-label="Reviewer note" placeholder="Only reviewers see this" className={inputCls} /></ActionForm>
          </details>
        )}
        {mayLink && m.claim && (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Link to their existing profile</summary>
            <ActionForm action={linkProfileAction.bind(null, m.id)} submitLabel="Link profile" confirm="Attach this account to the existing profile and its committee history?" className="mt-2 space-y-2">
              <PersonPicker name="profileId" label="Existing profile" required hint={`Search ${m.claim} to find the profile.`} />
            </ActionForm>
          </details>
        )}
        {mayEmail && m.id !== session.user.id && (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Change sign-in email</summary>
            <p className="mt-2 text-xs text-muted-foreground">For someone who lost access to {m.email}. They&apos;re signed out everywhere, and both addresses are told.</p>
            <ActionForm action={changeMemberEmailAction.bind(null, m.id)} submitLabel="Change email" className="mt-2 space-y-2">
              <Field name="email" label="New sign-in email" type="email" required />
              <Field name="reason" label="Reason" required placeholder="e.g. Lost their university mailbox" />
            </ActionForm>
          </details>
        )}
        {mayDelete && m.id !== session.user.id && (
          <details className="rounded-lg border border-destructive/40 p-3">
            <summary className="cursor-pointer text-sm font-medium text-destructive">Delete account</summary>
            <p className="mt-2 text-xs text-muted-foreground">Their sign-in, roles and private details are erased. Committee listings stay in the club&apos;s history by name and position. They&apos;re told by email. This can&apos;t be undone.</p>
            <ActionForm action={deleteAccountByLeaderAction.bind(null, m.id)} submitLabel="Delete account" variant="destructive" confirm={`Delete ${name}'s account? This can't be undone.`} className="mt-2 space-y-2">
              <Field name="reason" label="Reason (told to them)" required />
              <Field name="confirmName" label={`Type "${name}" to confirm`} required />
            </ActionForm>
          </details>
        )}
      </>
    );
  };

  return (
    <>
      <PageHeader title="Members" description={`New accounts wait here (after confirming their email, when email is set up) until club leadership approves them. Approving makes them members only; positions and roles are given separately.`}
        actions={mayLink ? <a href={`/api/admin/members/export?${qs({ status })}`} className="inline-flex min-h-10 items-center rounded-md border px-3 text-sm hover:bg-muted" title="The accounts in this view, with the filters above">Download CSV</a> : undefined} />
      <nav aria-label="Account status" className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1 text-sm">
        {TABS.map(([k, label]) => (
          <Link prefetch={false} key={k} href={`/dashboard/members?${qs({ status: k })}`} aria-current={status === k ? "page" : undefined}
            className={`inline-flex min-h-10 shrink-0 items-center rounded-full border px-3.5 ${status === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{label}</Link>
        ))}
      </nav>
      <form className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]" role="search">
        <input type="hidden" name="status" value={status} />
        {size !== 25 && <input type="hidden" name="size" value={size} />}
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Name, email or student ID" aria-label="Search members" className={inputCls} />
        {options?.batches.length ? (
          <select name="batch" defaultValue={sp.batch ?? ""} aria-label="Batch" className={selectCls}>
            <option value="">All batches</option>
            {options.batches.map((b) => <option key={b} value={b}>Batch {b}</option>)}
          </select>
        ) : <input name="batch" defaultValue={sp.batch ?? ""} placeholder="Batch" aria-label="Batch" className={`${inputCls} sm:w-24`} />}
        {options?.departments.length ? (
          <select name="department" defaultValue={sp.department ?? ""} aria-label="Department" className={selectCls}>
            <option value="">All departments</option>
            {options.departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        ) : <input name="department" defaultValue={sp.department ?? ""} placeholder="Department" aria-label="Department" className={`${inputCls} sm:w-32`} />}
        <select name="sort" defaultValue={sort} aria-label="Order" className={selectCls}>
          {SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <button className="h-10 rounded-md border px-4 text-sm font-medium hover:bg-muted md:h-9">Search</button>
      </form>
      {rows.length === 0 ? (
        <EmptyState>{status === "PENDING_APPROVAL" ? "No applications are waiting. New registrations appear here (after the applicant confirms their email, when email is set up)." : "No accounts match."}</EmptyState>
      ) : (
        <div className="space-y-3">
          {mayGrant && bulkRoles.length > 0 && <GrantRoleBar roles={bulkRoles} />}
          {mayBulkDelete && <BulkDeleteBar />}
          {/* Computers: a table. */}
          <div className="hidden overflow-hidden rounded-xl border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {selectable && <th className="w-10 px-3 py-2"><span className="sr-only">Select</span></th>}
                  <th className="px-3 py-2 font-medium">Member</th>
                  <th className="px-3 py-2 font-medium">Student ID</th>
                  <th className="px-3 py-2 font-medium">Department · batch</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Joined · last sign-in</th>
                  <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((m) => (
                  <tr key={m.id} className="align-middle hover:bg-muted/30">
                    {selectable && <td className="px-3 py-2"><input type="checkbox" data-member-id value={m.id} aria-label={`Select ${m.full_name ?? m.email}`} className="h-4 w-4" /></td>}
                    <td className="px-3 py-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <PersonAvatar name={m.full_name ?? m.email} url={m.avatarUrl} size="md" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{m.full_name ?? "—"}</p>
                          <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                          {(m.positions || m.roles) && <p className="truncate text-xs text-primary">{[m.positions, m.roles].filter(Boolean).join(" · ")}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{m.student_id ?? (m.claim ? <span className="text-amber-700 dark:text-amber-300">{m.claim}?</span> : "—")}</td>
                    <td className="px-3 py-2">{[m.department, m.batch].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-3 py-2"><StatusBadge status={m.status} /></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{date(m.created_at)}<br />{m.last_login_at ? date(m.last_login_at) : "never signed in"}</td>
                    <td className="px-3 py-2 text-right"><MemberSheet name={m.full_name ?? m.email} subtitle={m.email}>{actions(m)}</MemberSheet></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Phones: cards. */}
          <ul className="space-y-2 md:hidden">
            {rows.map((m) => (
              <li key={m.id} className="rounded-xl border bg-card p-3">
                <div className="flex items-start gap-3">
                  {selectable && <input type="checkbox" data-member-id value={m.id} aria-label={`Select ${m.full_name ?? m.email}`} className="mt-3 h-5 w-5 shrink-0" />}
                  <PersonAvatar name={m.full_name ?? m.email} url={m.avatarUrl} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 font-medium"><span className="min-w-0 truncate">{m.full_name ?? "—"}</span><StatusBadge status={m.status} /></p>
                    <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                    <p className="text-xs text-muted-foreground">{[m.student_id, m.department, m.batch ? `batch ${m.batch}` : null].filter(Boolean).join(" · ") || "No details yet"}</p>
                  </div>
                </div>
                <div className="mt-2 flex justify-end"><MemberSheet name={m.full_name ?? m.email} subtitle={m.email}>{actions(m)}</MemberSheet></div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Pager page={page} hasMore={rows.length === size} total={total} pageSize={size} sizes={PAGE_SIZES} base="/dashboard/members"
        params={{ status, q: sp.q, batch: sp.batch, department: sp.department, sort: sort === "newest" ? undefined : sort }} />
    </>
  );
}
