import Link from "next/link";
import { requireAdmin, rpc, view } from "@/lib/api/session";
import type { getPerson } from "@/lib/server/services/people";
import { ActionForm, Field, PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import { MediaField } from "@/components/admin/media-field";
import { mediaHref } from "@/lib/api/config";
import { PersonAccess, type PersonAccessData } from "@/components/admin/person-access";
import { ActivityList } from "@/components/admin/activity-list";
import type { activityFeed } from "@/lib/server/services/activity";
import type { listTasks } from "@/lib/server/services/work";
import { cn } from "@/lib/utils";
import { PersonPicker } from "@/components/admin/person-picker";
import { deletePersonAction, invitePersonAction, mergePeopleAction, updatePersonAction } from "../../actions";

type View = Awaited<ReturnType<typeof getPerson>>;

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "organization", label: "Organization" },
  { key: "access", label: "Access" },
  { key: "tasks", label: "Tasks" },
  { key: "activity", label: "Activity" },
] as const;

export default async function PersonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireAdmin("/dashboard/people");
  const { id } = await params;
  const sp = await searchParams;
  const { person: p, history } = await view<View>("people.get", { id }, `/dashboard/people/${id}`);
  const userId = (p.user_id as string | null) ?? null;
  // The Access tab needs a linked account and the right to read access.
  const tabs = TABS.filter((t) => (t.key !== "access" || (userId && (session.caps["roles.read"] || session.caps["roles.assign"] || session.caps["permissions.assign"]))) && (t.key !== "activity" || (userId && session.caps["audit.read"]))
    && (t.key !== "tasks" || (userId && session.caps["tasks.manage"])));
  const tab = tabs.find((t) => t.key === sp.tab)?.key ?? "overview";
  const access = tab === "access" && userId ? await rpc<PersonAccessData>("access.person", { userId }) : null;
  const feed = tab === "activity" && userId ? await rpc<Awaited<ReturnType<typeof activityFeed>>>("activity.feed", { actor: userId }) : null;
  const tasks = tab === "tasks" && userId ? await rpc<Awaited<ReturnType<typeof listTasks>>>("tasks.list", { assignee: userId }) : null;
  const current = history.filter((h) => h.committee_status === "CURRENT" && !h.end_date && h.is_active);
  const v = (k: string) => (p[k] as string | null) ?? null;
  const avatarUrl = v("avatar_object_key") ? mediaHref(`/media/${v("avatar_object_key")}`) : v("avatar_legacy_path") ?? v("avatar_external_url");
  const hasAccount = Boolean(v("user_id")) && Boolean(v("last_login_at") || v("account_status") === "ACTIVE");
  const studentId = v("student_id");

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/people", label: "People" }}
        title={String(p.full_name)}
        description={[current.map((h) => h.position_title).join(", ") || null, studentId, v("email")].filter(Boolean).join(" · ") || "No student ID or account yet"}
        actions={
          <>
            {v("account_status") && <StatusBadge status={String(v("account_status"))} />}
            {studentId && <Link prefetch={false} href={`/executives/${studentId}`} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Public profile</Link>}
          </>
        }
      />
      <nav aria-label="Profile sections" className="mb-5 flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <Link key={t.key} prefetch={false} href={`/dashboard/people/${encodeURIComponent(id)}${t.key === "overview" ? "" : `?tab=${t.key}`}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm", tab === t.key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "overview" && (
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Section title="Profile">
          <ActionForm action={updatePersonAction.bind(null, id)} submitLabel="Save profile">
            <input type="hidden" name="expectedUpdatedAt" value={String(p.updated_at ?? "")} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="fullName" label="Full name" defaultValue={v("full_name")} required />
              <Field name="personType" label="Type" type="select" defaultValue={v("person_type")} options={[{ value: "STUDENT", label: "Student" }, { value: "FACULTY", label: "Faculty" }, { value: "ALUMNI", label: "Alumni" }, { value: "EXTERNAL", label: "Guest / external" }]} />
              <Field name="studentId" label="Student ID" defaultValue={studentId} disabled={v("user_id") === session.user.id} hint={v("user_id") === session.user.id ? "You cannot change your own student ID." : undefined} />
              <Field name="designation" label="Designation (faculty)" defaultValue={v("designation")} placeholder="Lecturer, Dept. of CSE" />
              <Field name="department" label="Department" defaultValue={v("department")} />
              <Field name="batch" label="Batch" defaultValue={v("batch")} />
              <Field name="publicEmail" label="Public email (shown on the site)" type="email" defaultValue={v("public_email")} />
              <Field name="linkedin" label="LinkedIn" type="url" defaultValue={v("linkedin_url")} />
              <Field name="github" label="GitHub" type="url" defaultValue={v("github_url")} />
              <Field name="facebook" label="Facebook" type="url" defaultValue={v("facebook_url")} />
              <Field name="twitter" label="X / Twitter" type="url" defaultValue={v("twitter_url")} />
              <Field name="website" label="Website" type="url" defaultValue={v("website_url")} />
            </div>
            {v("user_id") === session.user.id && studentId && <input type="hidden" name="studentId" value={studentId} />}
            <Field name="bio" label="Bio" type="textarea" rows={4} defaultValue={v("bio")} />
            <MediaField name="avatarMediaId" label="Photo" defaultId={v("avatar_media_id")} defaultUrl={avatarUrl} shape="portrait" />
          </ActionForm>
        </Section>
        <div className="space-y-6">
          <Section title="Account">
            {hasAccount ? (
              <p className="text-sm">Signs in as <strong>{v("email")}</strong>{v("last_login_at") ? `; last seen ${String(v("last_login_at")).slice(0, 10)}` : ""}.</p>
            ) : (
              <>
                <p className="mb-3 text-sm text-muted-foreground">{p.invite_pending ? "An invitation is waiting to be accepted." : "No account yet. Invite them to set a password; the account is linked to this profile."}</p>
                {session.caps["executives.assign"] && (
                  <ActionForm action={invitePersonAction.bind(null, id)} submitLabel={p.invite_pending ? "Resend invitation" : "Send invitation"} successMessage="Invitation sent.">
                    <Field name="email" label="Email" type="email" defaultValue={v("email")} required />
                  </ActionForm>
                )}
              </>
            )}
          </Section>
          <Section title="Duplicates">
            <details>
              <summary className="cursor-pointer text-sm">Merge a duplicate into {String(v("full_name") ?? "this person")}</summary>
              <p className="mt-2 text-sm text-muted-foreground">Listings, event roles and posts of the duplicate move here; a photo, student ID or account fills in what this profile is missing. The duplicate is hidden, and the change is recorded.</p>
              <ActionForm action={mergePeopleAction.bind(null, id)} submitLabel="Merge" variant="destructive" confirm="Merge the chosen duplicate into this person? This can't be undone from the dashboard." className="mt-3 space-y-3">
                <PersonPicker name="dropId" label="The duplicate" required />
                <Field name="reason" label="Why are they the same person?" required />
              </ActionForm>
            </details>
            {!hasAccount && (
              <details className="mt-3 border-t pt-3">
                <summary className="cursor-pointer text-sm text-destructive">Delete (entered by mistake)</summary>
                <p className="mt-2 text-sm text-muted-foreground">Only for someone with no listings, event roles, posts or account. Otherwise merge them into the right person.</p>
                <ActionForm action={deletePersonAction.bind(null, id)} submitLabel="Delete" variant="destructive" redirectTo="/dashboard/people" confirm="Delete this person?" className="mt-3 space-y-3">
                  <Field name="reason" label="Why?" required />
                </ActionForm>
              </details>
            )}
          </Section>
        </div>
      </div>
      )}
      {tab === "organization" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Current position">
            {current.length === 0 ? <p className="text-sm text-muted-foreground">Not in the current committee.</p> : (
              <ul className="space-y-1 text-sm">
                {current.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span><span className="font-medium">{h.position_title}</span> <span className="text-muted-foreground">· {h.committee_name}{h.unit_key && h.unit_key !== "gucc" ? ` · ${String(h.unit_key).toUpperCase()} (separate committee)` : ""}</span></span>
                    {session.caps["executives.assign"] && <Link prefetch={false} href={`/dashboard/committees/${h.committee_id}`} className="text-xs underline">Change position</Link>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Committee history">
            {history.length === 0 ? <p className="text-sm text-muted-foreground">Not listed in any committee.</p> : (
              <ul className="space-y-2 text-sm">
                {history.map((h) => (
                  <li key={h.id}>
                    <Link prefetch={false} href={`/dashboard/committees/${h.committee_id}`} className="font-medium hover:underline">{h.committee_slug}</Link> · {h.position_title}
                    {h.committee_status === "CURRENT" && !h.end_date ? <span className="ml-1 text-xs text-emerald-600">current</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}
      {tab === "tasks" && tasks && (
        <Section title="Tasks for this person">
          {!tasks.ok ? <p className="text-sm text-destructive">{tasks.error}</p> : tasks.data.rows.length === 0 ? <p className="text-sm text-muted-foreground">No tasks.</p> : (
            <ul className="divide-y text-sm">
              {tasks.data.rows.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link prefetch={false} href={`/dashboard/tasks/${t.id}`} className="min-w-0 hover:underline">{t.title}</Link>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">{t.due_at ? `due ${String(t.due_at).slice(0, 10)}` : null}<StatusBadge status={t.status} /></span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
      {tab === "activity" && userId && (
        feed?.ok ? (feed.data.entries.length ? <><ActivityList entries={feed.data.entries} /><p className="mt-4 text-sm"><Link prefetch={false} href={`/dashboard/activity?actor=${encodeURIComponent(userId)}`} className="underline">See all in the activity log</Link></p></> : <p className="text-sm text-muted-foreground">No activity yet.</p>)
          : <p className="text-sm text-destructive">{feed && !feed.ok ? feed.error : "No activity information."}</p>
      )}
      {tab === "access" && userId && (
        access?.ok ? <PersonAccess a={access.data} session={session} userId={userId} /> : <p className="text-sm text-destructive">{access && !access.ok ? access.error : "No access information."}</p>
      )}
    </>
  );
}
