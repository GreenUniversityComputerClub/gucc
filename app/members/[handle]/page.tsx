import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { BookOpen, CalendarDays, Eye, Facebook, Github, Globe, GraduationCap, Linkedin, Lock, Mail, MessageSquare, Pencil, Sparkles, Twitter, Users } from "lucide-react";
import { rpc } from "@/lib/api/session";
import type { PublicProfile } from "@/lib/server/services/profiles";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { mailtoHref } from "@/lib/utils";
import { dhakaDate } from "@/lib/time";
import { ShareButton } from "../share-button";

export const dynamic = "force-dynamic";

type Restricted = { restricted: true; name: string | null; visibility: string; signedIn: boolean };
type Result = PublicProfile | Restricted;

const load = cache(async (handle: string) => rpc<Result>("people.profile", { handle }));

const TYPE: Record<string, string> = { STUDENT: "Student", FACULTY: "Faculty", ALUMNI: "Alumni", EXTERNAL: "Guest" };
const ROLE: Record<string, string> = { SPEAKER: "Speaker", COORDINATOR: "Coordinator", PHOTOGRAPHER: "Photographer", JUDGE: "Judge", CHIEF_GUEST: "Chief guest", SPECIAL_GUEST: "Special guest", GUEST: "Guest" };
const VISIBILITY: Record<string, string> = { PUBLIC: "Visible to everyone", MEMBERS: "Visible to signed-in members", PRIVATE: "Only you can see this" };
const monthYear = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", month: "long", year: "numeric" }) : null);

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const r = await load(decodeURIComponent(handle));
  if (!r.ok || r.data.restricted) return { title: "Member profile", robots: { index: false, follow: false } };
  const p = r.data;
  const role = p.current[0] ? `${p.current[0].title}, GUCC` : `${TYPE[p.personType] ?? "Member"} at Green University Computer Club`;
  return {
    title: p.name,
    description: `${p.name} — ${role}.${p.bio ? ` ${p.bio.slice(0, 140)}` : ""}`,
    // Only profiles their owners made public are indexed.
    robots: p.visibility === "PUBLIC" ? undefined : { index: false, follow: false },
    alternates: { canonical: `/members/${p.handle}` },
  };
}

export default async function MemberProfile({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const r = await load(decodeURIComponent(handle));
  if (!r.ok) {
    if (r.code === "NOT_FOUND") notFound();
    throw new Error(r.error);
  }
  if (r.data.restricted) return <RestrictedProfile r={r.data} path={`/members/${handle}`} />;
  const p = r.data;
  // Opened by its internal id (or an old address): go to the readable one.
  if (decodeURIComponent(handle) !== p.handle) permanentRedirect(`/members/${p.handle}`);
  const links = [
    p.links.github && { href: p.links.github, label: "GitHub", icon: Github },
    p.links.linkedin && { href: p.links.linkedin, label: "LinkedIn", icon: Linkedin },
    p.links.facebook && { href: p.links.facebook, label: "Facebook", icon: Facebook },
    p.links.twitter && { href: p.links.twitter, label: "X (Twitter)", icon: Twitter },
    p.links.website && { href: p.links.website, label: "Website", icon: Globe },
    mailtoHref(p.links.email) && { href: mailtoHref(p.links.email)!, label: "Email", icon: Mail },
  ].filter(Boolean) as Array<{ href: string; label: string; icon: typeof Github }>;
  const subtitle = [p.designation ?? TYPE[p.personType], p.department, p.batch ? `Batch ${p.batch}` : null].filter(Boolean).join(" · ");
  const empty = !p.bio && p.skills.length === 0 && links.length === 0;

  return (
    <div className="container max-w-5xl py-6 sm:py-10">
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="h-28 bg-gradient-to-r from-emerald-700 via-emerald-500 to-teal-400 sm:h-36" aria-hidden />
        <div className="px-4 pb-5 sm:px-8 sm:pb-7">
          <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
            <PersonAvatar name={p.name} url={p.avatarUrl} size="xl" className="ring-4 ring-card" />
            <div className="flex flex-wrap gap-2">
              {p.canMessage && p.messageUserId && (
                <Button asChild className="min-h-11 gap-2 sm:min-h-10"><Link prefetch={false} href={`/dashboard/chat?to=${encodeURIComponent(p.messageUserId)}`}><MessageSquare className="h-4 w-4" aria-hidden />Message</Link></Button>
              )}
              {p.isSelf && <Button asChild variant="outline" className="min-h-11 gap-2 sm:min-h-10"><Link prefetch={false} href="/dashboard/profile"><Pencil className="h-4 w-4" aria-hidden />Edit profile</Link></Button>}
              <ShareButton title={p.name} path={`/members/${p.handle}`} />
            </div>
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">{p.name}</h1>
          {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
          {p.current.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Current positions">
              {p.current.map((c, i) => (
                <li key={i} className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">{c.title} · GUCC {c.year}{c.campus ? ` (${c.campus})` : ""}</li>
              ))}
            </ul>
          )}
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {p.memberSince && <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" aria-hidden />Member since {monthYear(p.memberSince)}</span>}
            {p.isSelf && <span className="inline-flex items-center gap-1.5"><Eye className="h-4 w-4" aria-hidden />{VISIBILITY[p.visibility]}</span>}
          </p>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-6">
          <Card title="About" icon={Sparkles}>
            {p.bio ? <p className="whitespace-pre-line break-words leading-relaxed">{p.bio}</p> : p.isSelf ? <SelfHint text="Add a short bio so members know who you are." /> : empty ? <p className="text-sm text-muted-foreground">{p.limited ? `${p.name} shares more with signed-in members.` : "Nothing here yet."}</p> : null}
            {p.skills.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Skills</h3>
                <ul className="flex flex-wrap gap-2">{p.skills.map((s) => <li key={s} className="rounded-md border bg-muted/50 px-2.5 py-1 text-sm">{s}</li>)}</ul>
              </div>
            )}
            {links.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Find {p.isSelf ? "me" : p.name.split(" ")[0]} on</h3>
                <ul className="flex flex-wrap gap-2">
                  {links.map((l) => (
                    <li key={l.label}>
                      <a href={l.href} target={l.href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer me"
                        className="inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <l.icon className="h-4 w-4" aria-hidden />{l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {p.journey.length > 0 && (
            <Card title="Club journey" icon={GraduationCap}>
              <ol className="relative space-y-4 border-l pl-5">
                {p.journey.map((j, i) => (
                  <li key={i} className="relative">
                    <span className={`absolute -left-[1.6rem] top-1.5 h-3 w-3 rounded-full border-2 border-card ${j.current ? "bg-primary" : "bg-muted-foreground/40"}`} aria-hidden />
                    <p className="font-medium">{j.title}</p>
                    <p className="text-sm text-muted-foreground">
                      <Link prefetch={false} href={`/executives/${j.year}`} className="hover:underline">{j.committee}</Link>{j.campus ? ` · ${j.campus}` : ""}{j.current ? " · now" : ""}
                    </p>
                  </li>
                ))}
              </ol>
            </Card>
          )}
          {p.posts.length > 0 && (
            <Card title="Writing" icon={BookOpen}>
              <ul className="divide-y">
                {p.posts.map((x) => (
                  <li key={x.href} className="py-3 first:pt-0 last:pb-0">
                    <Link prefetch={false} href={x.href} className="font-medium hover:underline">{x.title}</Link>
                    {x.excerpt && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{x.excerpt}</p>}
                    <p className="mt-0.5 text-xs text-muted-foreground">{dhakaDate(x.published_at)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {p.events.length > 0 && (
            <Card title="Events" icon={CalendarDays}>
              <ul className="divide-y">
                {p.events.map((e) => (
                  <li key={e.href} className="flex items-baseline justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <Link prefetch={false} href={e.href} className="min-w-0 font-medium hover:underline">{e.title}</Link>
                    <span className="shrink-0 text-xs text-muted-foreground">{ROLE[e.role] ?? "Team"}{e.start_at ? ` · ${dhakaDate(e.start_at)}` : ""}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {p.journey.length === 0 && p.posts.length === 0 && p.events.length === 0 && (
            <Card title="Contributions" icon={BookOpen}>
              {p.isSelf ? <SelfHint text="Write a blog post or propose an event: once approved, it shows here." href="/dashboard/posts/new?type=BLOG" cta="Write a blog post" /> : <p className="text-sm text-muted-foreground">No published posts or events yet.</p>}
            </Card>
          )}
        </div>
      </div>
      <p className="mt-8 text-center text-sm"><Link prefetch={false} href="/members" className="text-muted-foreground underline-offset-4 hover:underline">Browse the members directory</Link></p>
    </div>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: typeof Sparkles; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold"><Icon className="h-4 w-4 text-primary" aria-hidden />{title}</h2>
      {children}
    </section>
  );
}

function SelfHint({ text, href = "/dashboard/profile", cta = "Complete your profile" }: { text: string; href?: string; cta?: string }) {
  return (
    <div className="rounded-lg border border-dashed p-4 text-sm">
      <p className="text-muted-foreground">{text}</p>
      <Link prefetch={false} href={href} className="mt-2 inline-flex min-h-10 items-center font-medium text-primary hover:underline">{cta}</Link>
    </div>
  );
}

function RestrictedProfile({ r, path }: { r: Restricted; path: string }) {
  return (
    <div className="container flex max-w-lg flex-col items-center py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-muted"><Lock className="h-7 w-7 text-muted-foreground" aria-hidden /></span>
      <h1 className="mt-4 text-2xl font-bold">{r.name ?? "This profile is private"}</h1>
      <p className="mt-2 text-muted-foreground">
        {r.visibility === "PRIVATE" ? "This member keeps their profile private." : r.signedIn ? "This profile is visible to approved GUCC members." : "This profile is visible to signed-in GUCC members."}
      </p>
      {!r.signedIn && r.visibility !== "PRIVATE" && (
        <Button asChild className="mt-6 min-h-11"><Link href={`/auth/login?next=${encodeURIComponent(path)}`}>Sign in to view</Link></Button>
      )}
    </div>
  );
}
