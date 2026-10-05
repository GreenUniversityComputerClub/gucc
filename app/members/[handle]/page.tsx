import { getProfileCertificates } from "@/lib/public/data";
import { formatIssued, KIND_LABEL, type CertificateKind } from "@/lib/certificates/config";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import {
  ArrowUpRight, BadgeCheck, BookOpen, CalendarDays, Eye, Facebook, Github, Globe, GraduationCap, Linkedin, Lock, Mail, MessageSquare, Pencil, Sparkles, Twitter, Users, Award } from "lucide-react";
import { rpc } from "@/lib/api/session";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata } from "@/lib/seo/metadata";
import { absoluteUrl } from "@/lib/seo/site";
import { breadcrumbSchema, graph, profilePageSchema } from "@/lib/seo/schema";
import type { PublicProfile } from "@/lib/server/services/profiles";
import { positionShort } from "@/lib/server/person-badge";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { cn, mailtoHref } from "@/lib/utils";
import { dhakaDate } from "@/lib/time";
import { ShareButton } from "../share-button";
import { ProfileTools } from "../profile-tools";

export const dynamic = "force-dynamic";

type Restricted = { restricted: true; name: string | null; visibility: string; signedIn: boolean };
type Result = PublicProfile | Restricted;

const load = cache(async (handle: string) => rpc<Result>("people.profile", { handle }));

const TYPE: Record<string, string> = { STUDENT: "Student", FACULTY: "Faculty", ALUMNI: "Alumni", EXTERNAL: "Guest" };
const ROLE: Record<string, string> = { SPEAKER: "Speaker", COORDINATOR: "Coordinator", PHOTOGRAPHER: "Photographer", JUDGE: "Judge", CHIEF_GUEST: "Chief guest", SPECIAL_GUEST: "Special guest", GUEST: "Guest" };
const VISIBILITY: Record<string, string> = { PUBLIC: "Visible to everyone", MEMBERS: "Visible to signed-in members", PRIVATE: "Only you can see this" };
const POST_TYPE: Record<string, string> = { BLOG: "Blog", NEWS: "News", ANNOUNCEMENT: "Announcement" };
const monthYear = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", month: "long", year: "numeric" }) : null);
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** "General Secretary, GUCC 2026", else "Former …", else "Faculty · CSE", else "Member of GUCC". */
function roleLine(p: PublicProfile): string {
  if (p.current[0]) return `${p.current[0].title}, GUCC ${p.current[0].year}`;
  const last = p.journey[0];
  if (last) return `Former ${last.title}, GUCC ${last.year}`;
  return [p.designation ?? TYPE[p.personType] ?? "Member", p.department].filter(Boolean).join(" · ") || "Member of GUCC";
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const r = await load(decodeURIComponent(handle));
  if (!r.ok || r.data.restricted) return { title: "Member profile", robots: { index: false, follow: false } };
  const p = r.data;
  const role = roleLine(p);
  const about = p.bio ? ` ${p.bio.replace(/\s+/g, " ").slice(0, 160)}` : "";
  const skills = p.skills.length ? ` Skills: ${p.skills.slice(0, 6).join(", ")}.` : "";
  return buildMetadata({
    title: `${p.name} — ${role}`,
    description: `${p.name}, ${role} at the Green University Computer Club (GUCC), Green University of Bangladesh.${about}${skills}`,
    path: `/members/${p.handle}`,
    type: "profile",
    keywords: [p.name, `${p.name} GUCC`, `${p.name} Green University`, ...p.skills.slice(0, 5), "GUCC member", "Green University Computer Club"],
    // A card with their photo, name and role for link previews (Facebook, WhatsApp, LinkedIn, X).
    image: { eyebrow: p.served ? "GUCC executive" : "GUCC member", title: p.name, subtitle: role, photo: p.avatarUrl ?? undefined, variant: "portrait" },
    modifiedTime: p.updatedAt ?? undefined,
    // Indexed when public, or when they served on a committee (what's shown then is already public
    // on the executives pages).
    noIndex: p.visibility !== "PUBLIC" && !p.served,
  });
}

/**
 * A member's profile: who they are (photo, name, positions with their year, department and batch),
 * what they've done for the club (roles by year, writing, events), how to reach them (Message,
 * their links), and ways to pass it on (share, copy the link, a QR code). People who served on a
 * committee land here from their executive page. Their owner sees how complete it is and who can
 * see it.
 */
export default async function MemberProfile({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const r = await load(decodeURIComponent(handle));
  if (!r.ok) {
    if (r.code === "NOT_FOUND") notFound();
    throw new Error(r.error);
  }
  if (r.data.restricted) return <RestrictedProfile r={r.data} path={`/members/${handle}`} />;
  const p = r.data;
  // Opened by its internal id, a student ID or an old address: go to the readable one.
  if (decodeURIComponent(handle) !== p.handle) permanentRedirect(`/members/${p.handle}`);
  const path = `/members/${p.handle}`;
  const first = p.name.split(" ")[0];
  // Certificates the club issued them that they show on their profile.
  const certificates = await getProfileCertificates(p.handle);
  // Structured data for search engines, for the profiles that are indexed.
  const schema = p.visibility === "PUBLIC" || p.served ? graph(
    breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Members", path: "/members" }, { name: p.name, path }]),
    profilePageSchema({
      name: p.name, path, position: p.current[0]?.title ?? p.journey[0]?.title, designation: p.designation ?? undefined,
      image: p.avatarUrl ?? undefined, year: p.current[0]?.year ?? p.journey[0]?.year,
      description: `${p.name} — ${roleLine(p)} at the Green University Computer Club.${p.bio ? ` ${p.bio.replace(/\s+/g, " ").slice(0, 200)}` : ""}`,
      sameAs: [p.links.linkedin, p.links.github, p.links.facebook, p.links.twitter, p.links.website, p.executivePage ? absoluteUrl(p.executivePage) : null],
    }, p.updatedAt ?? undefined),
  ) : null;
  const links = [
    p.links.github && { href: p.links.github, label: "GitHub", icon: Github },
    p.links.linkedin && { href: p.links.linkedin, label: "LinkedIn", icon: Linkedin },
    p.links.facebook && { href: p.links.facebook, label: "Facebook", icon: Facebook },
    p.links.twitter && { href: p.links.twitter, label: "X (Twitter)", icon: Twitter },
    p.links.website && { href: p.links.website, label: "Website", icon: Globe },
    mailtoHref(p.links.email) && { href: mailtoHref(p.links.email)!, label: "Email", icon: Mail, text: p.links.email },
  ].filter(Boolean) as Array<{ href: string; label: string; icon: typeof Github; text?: string | null }>;
  const subtitle = [p.designation ?? TYPE[p.personType], p.department, p.batch ? `Batch ${p.batch}` : null].filter(Boolean).join(" · ");
  const years = [...new Set(p.journey.map((j) => j.year))];
  const stats = [
    { label: p.journey.length === 1 ? "Role held" : "Roles held", value: p.journey.length },
    { label: years.length === 1 ? "Committee year" : "Committee years", value: years.length },
    { label: p.posts.length === 1 ? "Post" : "Posts", value: p.posts.length },
    { label: p.events.length === 1 ? "Event" : "Events", value: p.events.length },
  ].filter((s) => s.value > 0);
  // The owner's checklist: what makes a profile useful to others.
  const checklist = [
    { done: Boolean(p.avatarUrl), text: "A clear photo of you" },
    { done: Boolean(p.bio), text: "A short bio" },
    { done: p.skills.length > 0, text: "Your skills" },
    { done: links.some((l) => l.label !== "Email"), text: "A link (GitHub, LinkedIn…)" },
    { done: Boolean(p.department), text: "Your department" },
  ];
  const complete = Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100);
  // Journey grouped by committee year, newest first.
  const byYear = years.map((y) => ({ year: y, roles: p.journey.filter((j) => j.year === y) }));

  return (
    <div className="container max-w-6xl px-4 py-6 sm:py-10">
      {schema && <JsonLd id={`member-${p.handle}`} data={schema} />}

      {/* ── Who they are ── */}
      <section className="relative overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="relative h-32 bg-gradient-to-br from-emerald-800 via-emerald-600 to-teal-500 sm:h-44" aria-hidden>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.22)_1px,transparent_0)] [background-size:18px_18px]" />
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-teal-300/20 blur-3xl" />
        </div>
        <div className="px-5 pb-6 sm:px-8 sm:pb-8">
          {/* The photo overlaps the cover; the name and the buttons start just below it. */}
          <div className="-mt-14 flex flex-col gap-4 sm:-mt-16 sm:flex-row sm:items-start sm:gap-6">
            <div className="relative w-fit shrink-0">
              <PersonAvatar name={p.name} url={p.avatarUrl} size="xl" className="h-28 w-28 text-3xl shadow-lg ring-4 ring-card sm:h-32 sm:w-32" />
              {p.current.length > 0 && (
                <span className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow ring-4 ring-card" title="Serving on the current committee">
                  <BadgeCheck className="h-4 w-4" aria-hidden /><span className="sr-only">Current executive</span>
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1 sm:pt-[4.5rem]">
              <h1 className="text-2xl font-bold tracking-tight break-words sm:text-3xl">{p.name}</h1>
              <p className="mt-1 text-base text-foreground/80">{roleLine(p)}</p>
              {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            <div className="flex flex-wrap gap-2 sm:pt-[4.5rem]">
              {p.canMessage && p.messageUserId && (
                <Button asChild className="min-h-11 gap-2 sm:min-h-10"><Link prefetch={false} href={`/dashboard/chat?to=${encodeURIComponent(p.messageUserId)}`}><MessageSquare className="h-4 w-4" aria-hidden />Message</Link></Button>
              )}
              {p.isSelf && <Button asChild variant={p.canMessage ? "outline" : "default"} className="min-h-11 gap-2 sm:min-h-10"><Link prefetch={false} href="/dashboard/profile"><Pencil className="h-4 w-4" aria-hidden />Edit profile</Link></Button>}
              <ShareButton title={p.name} path={path} />
              <ProfileTools name={p.name} path={path} />
            </div>
          </div>

          {p.current.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Current positions">
              {p.current.map((c, i) => (
                <li key={i} className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 py-1 pl-1 pr-3 text-sm font-medium text-primary">
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold tracking-wide text-primary-foreground" aria-hidden>{positionShort(c.title)}-{c.year}</span>
                  {c.title}{c.campus ? ` · ${c.campus}` : ""}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {p.memberSince && <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" aria-hidden />Member since {monthYear(p.memberSince)}</span>}
            {p.isSelf && <span className="inline-flex items-center gap-1.5"><Eye className="h-4 w-4" aria-hidden />{VISIBILITY[p.visibility]}</span>}
            {links.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label={`${first}'s links`}>
                {links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} target={l.href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer me" aria-label={l.label} title={l.label}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border bg-background text-foreground/80 transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <l.icon className="h-4 w-4" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {stats.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border bg-card px-4 py-3 shadow-sm">
              <dd className="text-2xl font-bold tabular-nums text-primary">{s.value}</dd>
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
            </div>
          ))}
        </dl>
      )}

      {p.isSelf && complete < 100 && (
        <section className="mt-4 rounded-2xl border border-dashed bg-card p-5" aria-label="Complete your profile">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">Your profile is {complete}% complete</p>
              <p className="text-sm text-muted-foreground">Members find and recognise people with a full profile.</p>
            </div>
            <Button asChild size="sm" className="min-h-10"><Link prefetch={false} href="/dashboard/profile">Complete it</Link></Button>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={complete} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${complete}%` }} />
          </div>
          <ul className="mt-3 flex flex-wrap gap-2 text-xs">
            {checklist.filter((c) => !c.done).map((c) => <li key={c.text} className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">+ {c.text}</li>)}
          </ul>
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* ── About ── */}
        <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <Card title="About" icon={Sparkles}>
            {p.bio ? <p className="whitespace-pre-line break-words leading-relaxed">{p.bio}</p>
              : p.isSelf ? <SelfHint text="Add a short bio so members know who you are." />
                : <p className="text-sm text-muted-foreground">{p.limited ? `${first} shares more with signed-in members.` : "Nothing here yet."}</p>}
            {p.skills.length > 0 && (
              <div className="mt-5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Skills</h3>
                <ul className="flex flex-wrap gap-2">{p.skills.map((s) => <li key={s} className="rounded-full border bg-muted/50 px-3 py-1 text-sm">{s}</li>)}</ul>
              </div>
            )}
          </Card>

          {links.length > 0 && (
            <Card title={`Find ${p.isSelf ? "me" : first} on`} icon={Globe}>
              <ul className="space-y-1">
                {links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} target={l.href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer me"
                      className="group flex min-h-12 items-center gap-3 rounded-xl px-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><l.icon className="h-4 w-4" aria-hidden /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{l.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">{l.text ?? hostOf(l.href)}</span>
                      </span>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* ── What they've done ── */}
        <div className="min-w-0 space-y-6">
          {byYear.length > 0 && (
            <Card title="Club journey" icon={GraduationCap}>
              <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[1.25rem] before:top-2 before:w-px before:bg-border">
                {byYear.map((y) => {
                  const now = y.roles.some((r) => r.current);
                  return (
                    <li key={y.year} className="relative flex gap-4">
                      <Link prefetch={false} href={`/executives/${y.year}`} aria-label={`GUCC ${y.year} committee`}
                        className={cn("relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          now ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-primary")}>
                        {y.year.slice(-2)}
                      </Link>
                      <div className="min-w-0 flex-1 pb-1">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <Link prefetch={false} href={`/executives/${y.year}`} className="hover:text-primary hover:underline">{y.roles[0]!.committee}</Link>
                          {now && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">Now</span>}
                        </p>
                        <ul className="mt-1 space-y-1">
                          {y.roles.map((j, i) => (
                            <li key={i} className="font-medium">{j.title}{j.campus ? <span className="font-normal text-muted-foreground"> · {j.campus}</span> : null}</li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  );
                })}
              </ol>
              {p.executivePage && (
                <Link prefetch={false} href={p.executivePage} className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary hover:underline">Executive page<ArrowUpRight className="h-4 w-4" aria-hidden /></Link>
              )}
            </Card>
          )}

          {certificates.length > 0 && (
            <Card title="Certificates" icon={Award}>
              <ul className="grid gap-3 sm:grid-cols-2">
                {certificates.map((c) => (
                  <li key={c.code}>
                    <Link prefetch={false} href={`/c/${c.code}`} className="group flex h-full min-h-14 items-start gap-3 rounded-xl border p-3 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Award className="h-4 w-4" aria-hidden /></span>
                      <span className="min-w-0">
                        <span className="block font-medium group-hover:text-primary">{c.name}</span>
                        <span className="block text-xs text-muted-foreground">{KIND_LABEL[c.kind as CertificateKind] ?? "Certificate"} · {formatIssued(c.issuedOn)}{c.roleLine ? ` · ${c.roleLine}` : ""}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {p.posts.length > 0 && (
            <Card title="Writing" icon={BookOpen}>
              <ul className="grid gap-3 sm:grid-cols-2">
                {p.posts.map((x) => (
                  <li key={x.href}>
                    <Link prefetch={false} href={x.href} className="group flex h-full flex-col rounded-xl border p-4 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">{POST_TYPE[x.type] ?? "Post"}</span>
                      <span className="mt-1 line-clamp-2 font-semibold group-hover:underline">{x.title}</span>
                      {x.excerpt && <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">{x.excerpt}</span>}
                      <span className="mt-auto pt-2 text-xs text-muted-foreground">{dhakaDate(x.published_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {p.events.length > 0 && (
            <Card title="Events" icon={CalendarDays}>
              <ul className="divide-y">
                {p.events.map((e) => {
                  const d = e.start_at ? new Date(e.start_at) : null;
                  return (
                    <li key={e.href}>
                      <Link prefetch={false} href={e.href} className="group flex items-center gap-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border bg-muted/40 leading-none" aria-hidden>
                          {d ? (
                            <>
                              <span className="text-[10px] font-semibold uppercase text-primary">{d.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", month: "short" })}</span>
                              <span className="text-lg font-bold tabular-nums">{d.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric" })}</span>
                            </>
                          ) : <CalendarDays className="h-5 w-5 text-muted-foreground" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium group-hover:underline">{e.title}</span>
                          <span className="block text-xs text-muted-foreground">{ROLE[e.role] ?? "Team"}{e.start_at ? ` · ${dhakaDate(e.start_at)}` : ""}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
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
      <p className="mt-10 text-center text-sm"><Link prefetch={false} href="/members" className="text-muted-foreground underline-offset-4 hover:underline">Browse the members directory</Link></p>
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
    <div className="rounded-xl border border-dashed p-4 text-sm">
      <p className="text-muted-foreground">{text}</p>
      <Link prefetch={false} href={href} className="mt-2 inline-flex min-h-10 items-center font-medium text-primary hover:underline">{cta}</Link>
    </div>
  );
}

function RestrictedProfile({ r, path }: { r: Restricted; path: string }) {
  return (
    <div className="container flex max-w-lg flex-col items-center px-4 py-16 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-700 to-teal-500 shadow-lg"><Lock className="h-8 w-8 text-white" aria-hidden /></span>
      <h1 className="mt-5 text-2xl font-bold">{r.name ?? "This profile is private"}</h1>
      <p className="mt-2 text-muted-foreground">
        {r.visibility === "PRIVATE" ? "This member keeps their profile private." : r.signedIn ? "This profile is visible to approved GUCC members." : "This profile is visible to signed-in GUCC members."}
      </p>
      {!r.signedIn && r.visibility !== "PRIVATE" && (
        <Button asChild className="mt-6 min-h-11"><Link href={`/auth/login?next=${encodeURIComponent(path)}`}>Sign in to view</Link></Button>
      )}
      <Link prefetch={false} href="/members" className="mt-4 text-sm text-muted-foreground underline-offset-4 hover:underline">Browse the members directory</Link>
    </div>
  );
}
