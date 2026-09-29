import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import type { personAccess } from "@/lib/server/services/access";
import type { Session } from "@/lib/api/session";
import { ActionForm, Field, Section } from "@/components/admin/ui";
import { GrantPermissionForm } from "@/components/admin/grant-permission-form";
import { AREA_ORDER, areaOf, describeScope } from "@/lib/governance/permission-areas";
import { ExplainTool } from "@/app/dashboard/rules/explain";
import { grantRoleAction, revokeDirectAction, revokeRoleAction, trustAuthorAction } from "@/app/dashboard/actions";

export type PersonAccessData = Awaited<ReturnType<typeof personAccess>>;
const date = (iso: unknown) => (iso ? new Date(String(iso)).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" }) : "");

/** Where a grant comes from, in words. */
function sourceLabel(source: string): { label: string; inherited: boolean } {
  if (source === "direct") return { label: "Given directly to this person", inherited: false };
  const [kind, key] = source.split(":");
  const name = (key ?? source).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  if (kind === "position") return { label: `${name} position`, inherited: true };
  if (kind === "role") return { label: `${name} role`, inherited: true };
  return { label: source, inherited: true };
}

/**
 * One person's access: what they can do (in plain language, with "Why?"), where it comes
 * from, and, for leaders, the controls to change it.
 */
export function PersonAccess({ a, session, userId }: { a: PersonAccessData; session: Session; userId: string }) {
  const self = session.user.id === userId;
  const who = a.person.name ?? a.person.email;
  const areas = AREA_ORDER.map((area) => ({ area, grants: a.effective.filter((g) => areaOf(g.permission) === area) })).filter((x) => x.grants.length > 0);
  const hasPublish = (k: string) => a.effective.some((g) => g.permission === k && g.sources.some((s) => s.scope === "ALL" || s.scope === "OWN"));
  const affiliated = a.positions.filter((p) => !p.governing);
  const manage = !self && (a.canGrant || a.canAssignRoles) && a.grantOptions && a.person.status === "ACTIVE";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-6">
        {a.pending.length > 0 && (
          <Section title="Waiting for approval">
            <ul className="space-y-1 text-sm">
              {a.pending.map((r) => (
                <li key={String(r.id)}><Link prefetch={false} href={`/dashboard/approvals/${String(r.id)}`} className="hover:underline">{String(r.title)}</Link> <span className="text-xs text-muted-foreground">· {date(r.created_at)}</span></li>
              ))}
            </ul>
          </Section>
        )}

        {affiliated.length > 0 && (
          <p className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-sm">
            Listed in {[...new Set(affiliated.map((p) => String(p.unit_key ?? "").toUpperCase()))].join(", ")}, a separate committee: an account and their own posts and events, which the President or General Secretary approves. No club management.
          </p>
        )}

        <Section title={self ? "What you can do" : "What they can do"} description="Grouped by area. Open “Why?” to see where each one comes from.">
          {a.isModerator ? <p className="text-sm">Moderator: every permission, present and future.</p> : areas.length === 0 ? <p className="text-sm text-muted-foreground">Nothing beyond what every visitor can do.</p> : (
            <div className="space-y-4">
              {areas.map(({ area, grants }) => (
                <div key={area}>
                  <h3 className="mb-1.5 text-sm font-semibold">{area}</h3>
                  <ul className="divide-y rounded-lg border">
                    {grants.map((g) => {
                      const sources = g.sources.map((s) => ({ ...sourceLabel(s.source), scope: describeScope(s.scope, s.scopeValue) }));
                      const direct = sources.some((s) => !s.inherited);
                      return (
                        <li key={g.permission} className="px-3 py-2 text-sm">
                          <details>
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="text-emerald-600" aria-hidden>✓</span>
                                <span className="truncate">{g.description ?? g.permission}</span>
                                {g.sensitive && <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" aria-label="sensitive" />}
                              </span>
                              <span className="flex shrink-0 items-center gap-2 text-xs">
                                <span className={direct ? "rounded bg-primary/10 px-1.5 py-0.5 text-primary" : "rounded bg-muted px-1.5 py-0.5 text-muted-foreground"}>{direct ? "Direct" : "Inherited"}</span>
                                <span className="text-muted-foreground underline">Why?</span>
                              </span>
                            </summary>
                            <ul className="mt-2 space-y-0.5 pl-6 text-xs text-muted-foreground">
                              {sources.map((s, i) => <li key={i}>✓ {s.label} · {s.scope}</li>)}
                              <li className="font-mono">{g.permission}</li>
                            </ul>
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Roles">
          {a.roles.length === 0 ? <p className="text-sm text-muted-foreground">No roles besides what a position gives.</p> : (
            <ul className="divide-y text-sm">
              {a.roles.map((r) => (
                <li key={String(r.id)} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{String(r.name)}</span>
                    <span className="block text-xs text-muted-foreground">
                      since {date(r.granted_at)}{r.expires_at ? ` · until ${date(r.expires_at)}` : ""}{r.granted_by_name ? ` · by ${String(r.granted_by_name)}` : ""}{r.reason ? ` · ${String(r.reason)}` : ""}
                    </span>
                  </span>
                  {a.canAssignRoles && !self && String(r.key) !== "member" && (!r.is_protected || session.isModerator) && (
                    <ActionForm action={revokeRoleAction.bind(null, String(r.id))} submitLabel="Revoke" variant="outline" inline confirm={`Remove the ${String(r.name)} role from ${who}?`} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Given directly" description="Permissions given to this person alone, often for a limited time.">
          {a.direct.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
            <ul className="divide-y text-sm">
              {a.direct.map((g) => (
                <li key={String(g.id)} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{String(g.description ?? g.permission)}</span>
                    {g.is_sensitive ? <ShieldAlert className="ml-1 inline h-3.5 w-3.5 text-amber-700 dark:text-amber-400" aria-label="sensitive" /> : null}
                    <span className="block text-xs text-muted-foreground">
                      {describeScope(String(g.scope), String(g.scope_value))}{g.expires_at ? ` · until ${date(g.expires_at)}` : ""}{g.granted_by_name ? ` · by ${String(g.granted_by_name)}` : ""}{g.reason ? ` · ${String(g.reason)}` : ""}
                    </span>
                  </span>
                  {a.canGrant && !self && <ActionForm action={revokeDirectAction.bind(null, String(g.id))} submitLabel="Remove" variant="outline" inline confirm="Remove this permission?" />}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {manage && a.grantOptions && (
        <div className="space-y-6">
          {a.canAssignRoles && (
            <Section title="Give a role">
              <ActionForm action={grantRoleAction} submitLabel="Grant role" resetOnSuccess>
                <input type="hidden" name="userId" value={userId} />
                <Field name="roleKey" label="Role" type="select" options={a.grantOptions.roles.filter((r) => !r.is_protected || session.isModerator).map((r) => ({ value: r.key, label: r.sensitive && !session.isModerator ? `${r.name} (a Moderator approves)` : r.name }))} />
                {a.grantOptions.roles.some((r) => r.sensitive) && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {session.isModerator
                      ? "Some roles include sensitive permissions: whoever holds them must turn on two-factor sign-in."
                      : "Roles marked “a Moderator approves” include sensitive permissions: the grant waits for approval unless you're a Moderator, the President or the General Secretary, and the person must turn on two-factor sign-in."}
                  </p>
                )}
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field name="expiresAt" label="Until (optional)" type="date" />
                  <Field name="reason" label="Reason" />
                </div>
              </ActionForm>
            </Section>
          )}
          {a.canGrant && (
            <>
              <Section title="Trust as an author" description="Their own posts or events go live without an approval step.">
                <div className="grid gap-3">
                  {(["posts", "events"] as const).map((kind) => (
                    hasPublish(`${kind}.publish`)
                      ? <p key={kind} className="text-sm text-emerald-700 dark:text-emerald-400">Already publishes their own {kind} directly.</p>
                      : (
                        <ActionForm key={kind} action={trustAuthorAction.bind(null, userId, kind)} submitLabel={`Trust with ${kind}`} variant="outline">
                          <Field name="expiresAt" label="Until (optional)" type="date" />
                        </ActionForm>
                      )
                  ))}
                </div>
              </Section>
              <Section title="Give a permission">
                <GrantPermissionForm userId={userId} permissions={a.grantOptions.permissions} scopes={a.grantOptions.scopes} />
              </Section>
            </>
          )}
          <Section title="Check access" description="Would they be allowed to do something? The answer comes with the reason.">
            <ExplainTool userId={userId} permissions={a.grantOptions.permissions.map((p) => p.key)} />
          </Section>
        </div>
      )}
    </div>
  );
}
