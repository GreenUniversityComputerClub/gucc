/**
 * A sponsorship page, from its content: the hero, then its sections in the order the dashboard set.
 * Rendered on the server (everything is in the HTML: readable without JavaScript, by search
 * engines and before scripts load) with a few small islands (typed phrases, the partners strip,
 * videos, the section chips and the phone action bar). Colours come from the site's theme, so
 * every block reads in light and dark mode; the page's accent colours highlights only.
 *
 * Also rendered in the browser by the dashboard's live preview, so nothing here is server-only.
 */
import Link from "next/link";
import Image from "next/image";
import type { CSSProperties, ElementType, ReactNode } from "react";
import {
  ArrowRight, Award, Briefcase, Building2, Calendar, Check, ChevronDown, Code2, Download, ExternalLink, Gift, GraduationCap, HelpCircle, Laptop, Lightbulb, Mail, MapPin,
  Medal, Megaphone, Mic, Phone, Quote, Server, Share2, Shield, Shirt, Sigma, Sparkles, Star, Trophy, Users, Utensils, Wrench, X, Zap,
} from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";
import type { SponsorIcon, SponsorshipContent, SponsorPackage, SponsorProgram, SponsorReason, SponsorAchievement, SponsorOpportunity, SponsorContact, SponsorComparison } from "@/lib/sponsorship/content";
import { ACCENTS, comparisonTiers, comparisonValue, isBlock, SECTION_LABEL, visibleSections, type BlockData, type SectionedContent, type SectionEntry } from "@/lib/sponsorship/sections";
import { cn } from "@/lib/utils";
import { TypedPhrases } from "./typing";
import { PartnersStrip, type Partner } from "./partners";
import { VideoFacade } from "./video";
import { SectionNav } from "./section-nav";

const ICONS: Record<SponsorIcon, ElementType> = {
  Users, Megaphone, Briefcase, Share2, MapPin, GraduationCap, Lightbulb, Mic, Trophy, Gift, Shirt, Utensils, Server, Code2, Laptop, Shield, Sparkles, Building2,
};
const iconOf = (name: string | undefined, fallback: ElementType) => (name && name in ICONS ? ICONS[name as SponsorIcon] : fallback);
const OPPORTUNITY_ICONS: Record<string, ElementType> = { "T-Shirt Partner": Shirt, "Food & Beverage Partner": Utensils, "Gift & Award Partner": Gift, "Platform / Server Partner": Server };

/** How each part of a program is shown (the Carnival's parts); others get a plain card. */
const PROGRAM_CARDS: Record<string, { title: string; subtitle: string; desc: string; icon: ElementType }> = {
  iupc: { title: "IUPC", subtitle: "Inter University Programming Contest", desc: "A competitive platform bringing together the best problem solvers from universities across the country.", icon: Code2 },
  ctf: { title: "CTF", subtitle: "Cyber Security Contest", desc: "Capture The Flag competition designed to challenge and sharpen cybersecurity skills.", icon: Shield },
  "ict olympiad": { title: "ICT Olympiad", subtitle: "ICT Knowledge Competition", desc: "An academic and technical competition to encourage ICT knowledge and innovation.", icon: Laptop },
  "math olympiad": { title: "Math Olympiad", subtitle: "Mathematics Competition", desc: "A problem-solving competition that promotes analytical thinking and mathematical excellence.", icon: Sigma },
  workshops: { title: "Workshops", subtitle: "Hands-on workshops", desc: "Build practical skills and industry relevant knowledge.", icon: Wrench },
  "industry sessions": { title: "Industry Sessions", subtitle: "Learn from experts", desc: "Keynote talks and expert-led sessions.", icon: Mic },
  networking: { title: "Networking", subtitle: "Connect and collaborate", desc: "Grow with peers, mentors and industry professionals.", icon: Users },
  awards: { title: "Awards", subtitle: "Recognizing excellence", desc: "Celebrating innovation and outstanding performances.", icon: Trophy },
  "programming contests": { title: "Programming Contests", subtitle: "IUPC, intra-university and practice rounds", desc: "Competitive programming contests that bring together the strongest problem solvers.", icon: Code2 },
  hackathons: { title: "Hackathons", subtitle: "Build in a weekend", desc: "Teams turn ideas into working products, with mentors, judges and prizes.", icon: Zap },
  "tech talks": { title: "Tech Talks", subtitle: "Seminars and keynotes", desc: "Engineers and founders share what they build and how they hire.", icon: Mic },
  "career events": { title: "Career Events", subtitle: "Hiring and internships", desc: "Job fairs, internship drives and portfolio reviews with partner companies.", icon: Briefcase },
  "community programs": { title: "Community Programs", subtitle: "Learning for everyone", desc: "Study circles, bootcamps and outreach that grow the next generation of engineers.", icon: GraduationCap },
};
const CARNIVAL_PHRASES = ["Inter University Programming Contest", "Cyber Security Contest (CTF)", "ICT Olympiad", "Math Olympiad"];
const DEFAULT_FACTS = [{ value: "500+", label: "Participants" }, { value: "Multi-day", label: "Event" }, { value: "Competitions", label: "& Awards" }, { value: "Sponsor", label: "Visibility" }];
const FACT_ICONS = [Users, Calendar, Trophy, Building2];
const DEFAULT_STATS = [{ value: "7,000+", label: "Community members" }, { value: "50+", label: "University connections" }, { value: "10+", label: "Club partners" }, { value: "12+", label: "Company collaborations" }];
const GALLERY = [65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 78];

/** Gold, silver and bronze keep their colours (readable in both themes); other tiers use the accent. */
const TIER: Record<string, { icon: ElementType; text: string; ring: string; soft: string; glow: string }> = {
  gold: { icon: Trophy, text: "text-amber-700 dark:text-amber-300", ring: "border-amber-500/40", soft: "bg-amber-500/10", glow: "shadow-amber-500/15 ring-1 ring-inset ring-amber-500/40" },
  silver: { icon: Medal, text: "text-slate-600 dark:text-slate-300", ring: "border-slate-400/40", soft: "bg-slate-500/10", glow: "shadow-slate-500/15 ring-1 ring-inset ring-slate-400/40" },
  bronze: { icon: Award, text: "text-orange-800 dark:text-orange-300", ring: "border-orange-700/30", soft: "bg-orange-700/10", glow: "shadow-orange-700/15 ring-1 ring-inset ring-orange-700/30" },
};
const tierStyle = (tier: string) => TIER[Object.keys(TIER).find((k) => tier.toLowerCase().includes(k)) ?? ""]
  ?? { icon: Award, text: "text-sp", ring: "border-sp/30", soft: "bg-sp/10", glow: "shadow-sp/15 ring-1 ring-inset ring-sp/30" };

const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const money = (p: SponsorPackage) => `${p.currency === "BDT" || !p.currency ? "৳" : `${p.currency} `}${Number(p.price).toLocaleString("en-US")}`;

function Eyebrow({ icon: Icon, children }: { icon: ElementType; children: ReactNode }) {
  return (
    <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-sp/30 bg-sp/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-sp">
      <Icon className="h-3 w-3" aria-hidden />{children}
    </span>
  );
}

function Highlight({ children }: { children: ReactNode }) {
  return <span className="text-sp">{children}</span>;
}

/** One section: an anchor, the eyebrow, a heading, a line, and its content. */
function Shell({ id, icon, eyebrow, heading, sub, muted, wide, children }: {
  id: string; icon: ElementType; eyebrow: string; heading: ReactNode; sub?: ReactNode; muted?: boolean; wide?: boolean; children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={cn("scroll-mt-32 py-16 sm:py-24", muted && "bg-muted/40")}>
      <div className={cn("container mx-auto px-4", wide ? "max-w-7xl" : "max-w-6xl")}>
        <header className="sp-reveal mx-auto mb-10 max-w-3xl text-center sm:mb-14">
          <Eyebrow icon={icon}>{eyebrow}</Eyebrow>
          <h2 id={`${id}-h`} className="text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">{heading}</h2>
          {sub && <p className="mt-4 text-pretty text-base text-muted-foreground sm:text-lg">{sub}</p>}
        </header>
        {children}
      </div>
    </section>
  );
}

/** A heading that may be overridden in the dashboard ("Our Partners" → "Trusted by"). */
const headingOf = (s: SectionEntry, fallback: ReactNode) => (s.heading ? s.heading : fallback);

// ───────────────────────────── the page ─────────────────────────────

export function SponsorshipView({ content: raw }: { content: SponsorshipContent }) {
  const c = raw as SectionedContent;
  const event = c.event ?? {};
  const programs = list<SponsorProgram>(c.programs);
  const program = programs.find((p) => p.featured) ?? programs[0] ?? null;
  const packages = list<SponsorPackage>(c.packages);
  const contacts = list<SponsorContact>(c.contacts);
  const partners = list<Partner>(c.previousPartners).filter((p) => p.logo);
  const reasons = list<SponsorReason>(c.whySponsorReasons);
  const achievements = list<SponsorAchievement>(c.achievements);
  const opportunities = list<SponsorOpportunity>(c.otherOpportunities);
  const comparison = list<SponsorComparison & { values?: Record<string, boolean> }>(c.comparisonFeatures);
  const sections = visibleSections(c);
  const accent = ACCENTS[c.theme?.accent ?? "green"] ?? ACCENTS.green;

  const parts = program?.components ?? [];
  const short = (x: string) => x.replace(/\s*\(.*\)\s*$/, "").trim();
  const featuring = parts.slice(0, 4).map(short);
  const joinList = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`);
  const eventName = event.fullName ?? event.name ?? "our events";
  const heroSubtitle = c.heroSubtitle ?? `Partner with Green University Computer Club to sponsor ${program?.name ?? eventName}${featuring.length ? `, featuring ${joinList(featuring)}` : ""}.`;
  const phrases = c.typingPhrases?.length ? c.typingPhrases.map(String)
    : program?.id === "cse-carnival" ? CARNIVAL_PHRASES
      : featuring.length ? parts.slice(0, 4).map((x) => x.match(/\((.*)\)\s*$/)?.[1] ?? x) : [eventName];
  const stats = c.heroStats?.length ? c.heroStats : DEFAULT_STATS;

  const shows = (type: string) => sections.some((s) => s.type === type);
  const contactHref = contacts.length && shows("contact") ? "#contact" : "/contact?topic=partnership";
  const ctaHref = packages.length && shows("packages") ? "#packages" : contactHref;
  const download = sections.find((s) => s.type === "download")?.data as BlockData["download"] | undefined;
  const firstFaq = sections.find((s) => s.type === "faq");
  const navItems = [
    program && shows("programs") ? { id: "programs", label: "Programs" } : null,
    packages.length && shows("packages") ? { id: "packages", label: "Packages" } : null,
    reasons.length && shows("why") ? { id: "why", label: "Why sponsor" } : null,
    partners.length && shows("partners") ? { id: "partners", label: "Partners" } : null,
    firstFaq ? { id: firstFaq.id, label: "Questions" } : null,
    contacts.length && shows("contact") ? { id: "contact", label: "Contact" } : null,
  ].filter((x): x is { id: string; label: string } => x !== null);

  const render = (s: SectionEntry): ReactNode => {
    switch (s.type) {
      case "recognition":
        return (
          <Shell key={s.id} id="recognition" icon={Trophy} eyebrow="Recognition" heading={headingOf(s, <>Recognition That <Highlight>Speaks for Itself</Highlight></>)} sub={s.subheading}>
            <Link href="/events/gucc-receives-club-excellence-award-2026" className="sp-reveal group mx-auto block max-w-2xl rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent p-6 transition-transform hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-10">
              <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
                <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10"><Trophy className="h-10 w-10 text-amber-600 dark:text-amber-400" aria-hidden /></span>
                <div>
                  <span className="mb-3 inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">2026</span>
                  <h3 className="mb-2 text-xl font-bold sm:text-2xl">Club Excellence Award</h3>
                  <p className="mb-1 font-medium text-amber-700 dark:text-amber-200/80">Best Computer Science &amp; Programming Club</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">Recognized for outstanding contributions to technical education, community building, and student development at Green University of Bangladesh.</p>
                </div>
              </div>
            </Link>
          </Shell>
        );

      case "programs":
        if (!program) return null;
        return (
          <Shell key={s.id} id="programs" icon={Star} eyebrow="Programs" muted heading={headingOf(s, <>Sponsor the Programs That <Highlight>Matter</Highlight></>)}
            sub={s.subheading ?? "GUCC organizes a diverse portfolio of technical programs, each offering unique brand exposure and student engagement opportunities."}>
            <div className="sp-reveal mb-6 rounded-2xl border bg-card p-6 shadow-sm sm:p-10">
              <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr] lg:gap-16">
                <div>
                  <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-sp/30 bg-sp/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-sp">
                    <Star className="h-3 w-3" aria-hidden />{!program.category || program.category === "Flagship" ? "Flagship Program" : program.category}
                  </span>
                  <h3 className="mb-4 text-2xl font-bold tracking-tight sm:text-4xl">{program.name ?? eventName}</h3>
                  {program.description && <p className="mb-8 max-w-lg leading-relaxed text-muted-foreground">{program.description}</p>}
                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {(program.facts?.length ? program.facts : DEFAULT_FACTS).slice(0, 4).map((f, i) => {
                      const Icon = FACT_ICONS[i % FACT_ICONS.length]!;
                      return (
                        <div key={i} className="flex flex-col gap-1.5">
                          <Icon className="h-5 w-5 text-sp" aria-hidden />
                          <dt className="order-2 text-xs text-muted-foreground">{f.label}</dt>
                          <dd className="order-1 text-sm font-semibold">{f.value}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
                {(program.sponsorValue ?? []).length > 0 && (
                  <div>
                    <p className="mb-5 text-xs font-bold uppercase tracking-[0.15em]">Sponsor value</p>
                    <ul className="space-y-3.5">
                      {(program.sponsorValue ?? []).map((v, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-sp/40"><Check className="h-3 w-3 text-sp" aria-hidden /></span>{v}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            {parts.length > 0 && (
              <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                {parts.map((x) => PROGRAM_CARDS[short(x).toLowerCase()] ?? { title: short(x), subtitle: x.match(/\((.*)\)\s*$/)?.[1] ?? "", desc: "", icon: Star }).map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <li key={i} className="sp-reveal flex h-full flex-col rounded-xl border bg-card p-4 transition-colors hover:border-sp/40 sm:p-6">
                      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border"><Icon className="h-5 w-5 text-sp" aria-hidden /></span>
                      <h4 className="font-bold">{item.title}</h4>
                      {item.subtitle && <p className="mt-0.5 text-[11px] font-semibold leading-tight text-sp">{item.subtitle}</p>}
                      {item.desc && <p className="mt-2 hidden text-xs leading-relaxed text-muted-foreground sm:block">{item.desc}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Shell>
        );

      case "why":
        if (!reasons.length) return null;
        return (
          <Shell key={s.id} id="why" icon={Megaphone} eyebrow="Why sponsor" heading={headingOf(s, <>Why <Highlight>Partner with Us?</Highlight></>)}
            sub={s.subheading ?? "Gain access to an unmatched talent pool, premium brand exposure, and a direct pipeline to Bangladesh's brightest tech minds."}>
            <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
              {reasons.map((r, i) => {
                const Icon = iconOf(r.icon, Lightbulb);
                return (
                  <li key={`${r.title}-${i}`} className="sp-reveal rounded-2xl border bg-card p-4 transition-colors hover:border-sp/50 sm:p-6">
                    <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-sp/20 bg-sp/10"><Icon className="h-5 w-5 text-sp" aria-hidden /></span>
                    <h3 className="mb-1.5 text-sm font-semibold">{r.title}</h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">{r.description}</p>
                  </li>
                );
              })}
            </ul>
          </Shell>
        );

      case "achievements":
        if (!achievements.length) return null;
        return (
          <Shell key={s.id} id="achievements" icon={Trophy} eyebrow="Track record" muted heading={headingOf(s, <>Our <Highlight>Achievements</Highlight></>)}
            sub={s.subheading ?? "A proven track record of organizing events that make a real impact."}>
            <ul className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 sm:gap-5">
              {achievements.map((a, i) => {
                const card = (
                  <div className="relative flex h-full gap-4 rounded-2xl border bg-card p-5 transition-colors hover:border-amber-500/50 sm:p-6">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400"><Trophy className="h-6 w-6" aria-hidden /></span>
                    <div>
                      <p className="mb-1 flex items-center gap-1.5 font-bold">{a.title}{a.eventSlug && <ExternalLink className="h-3.5 w-3.5 text-amber-600" aria-hidden />}</p>
                      <p className="text-sm leading-relaxed text-muted-foreground">{a.description}</p>
                    </div>
                  </div>
                );
                return (
                  <li key={`${a.title}-${i}`} className="sp-reveal">
                    {a.eventSlug ? <Link href={`/events/${a.eventSlug}`} className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{card}</Link> : card}
                  </li>
                );
              })}
            </ul>
          </Shell>
        );

      case "partners":
        if (!partners.length) return null;
        return (
          <section key={s.id} id="partners" aria-labelledby="partners-h" className="scroll-mt-32 py-16 sm:py-20">
            <header className="sp-reveal container mx-auto mb-8 max-w-3xl px-4 text-center">
              <Eyebrow icon={Star}>Previous partners</Eyebrow>
              <h2 id="partners-h" className="text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">{headingOf(s, <>Trusted by Our <Highlight>Previous Partners</Highlight></>)}</h2>
              <p className="mt-3 text-muted-foreground">{s.subheading ?? "Brands and organizations that have trusted GUCC."}</p>
            </header>
            <PartnersStrip partners={partners} />
          </section>
        );

      case "packages":
        if (!packages.length) return null;
        return <Packages key={s.id} s={s} packages={packages} comparison={comparison} tiers={comparisonTiers(c)} contactHref={contactHref} />;

      case "opportunities":
        if (!opportunities.length) return null;
        return (
          <Shell key={s.id} id="opportunities" icon={Gift} eyebrow="Partnership options" muted heading={headingOf(s, <>Other <Highlight>Partnership</Highlight> Opportunities</>)}
            sub={s.subheading ?? "In-kind partnerships with their own brand touchpoints, beyond traditional sponsorship."}>
            <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {opportunities.map((o, i) => {
                const Icon = iconOf(o.icon, OPPORTUNITY_ICONS[o.title] ?? Gift);
                return (
                  <li key={`${o.title}-${i}`} className="sp-reveal rounded-2xl border bg-card p-4 text-center sm:p-6">
                    <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-sp/20 bg-sp/10 text-sp"><Icon className="h-6 w-6" aria-hidden /></span>
                    <p className="font-bold">{o.title}</p>
                    {o.detail && <span className="mt-1 inline-block rounded-full border border-sp/30 px-2 py-0.5 text-[11px] font-semibold text-sp">{o.detail}</span>}
                    {o.description && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{o.description}</p>}
                  </li>
                );
              })}
            </ul>
          </Shell>
        );

      case "gallery":
        return (
          <section key={s.id} id="gallery" aria-labelledby="gallery-h" className="sp-gallery scroll-mt-32 overflow-hidden py-16 sm:py-24">
            <header className="sp-reveal container mx-auto mb-10 max-w-3xl px-4 text-center">
              <Eyebrow icon={Sparkles}>Flashbacks</Eyebrow>
              <h2 id="gallery-h" className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">{headingOf(s, <>Moments from <Highlight>Our Events</Highlight></>)}</h2>
            </header>
            <div className="flex flex-col gap-4 sm:gap-6">
              {[GALLERY.slice(0, 6), GALLERY.slice(6)].map((row, r) => (
                <div key={r} className="sp-gallery-row">
                  <div className={cn("sp-gallery-track flex w-max gap-4 sm:gap-6", r === 1 && "sp-gallery-reverse")}>
                    {[...row, ...row].map((n, i) => (
                      <div key={`${n}-${i}`} aria-hidden={i >= row.length ? true : undefined} className={cn("relative shrink-0 overflow-hidden rounded-2xl border shadow-md", r === 0 ? "aspect-[4/3] w-64 sm:w-96" : "aspect-video w-56 sm:w-80")}>
                        <Image src={`/events/${n}.jpg`} alt={i >= row.length ? "" : "A GUCC event"} fill loading="lazy" sizes="(max-width: 640px) 256px, 384px" className="object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );

      case "contact":
        if (!contacts.length) return null;
        return (
          <Shell key={s.id} id="contact" icon={Mail} eyebrow="Get in touch" heading={headingOf(s, <>Ready to <Highlight>Partner With Us?</Highlight></>)}
            sub={s.subheading ?? "Reach out to our team directly. We'd love to discuss a partnership that works for your brand."}>
            <div className="sp-reveal mb-10 flex justify-center">
              <a href={`mailto:${event.email ?? "gucc@green.edu.bd"}`} className="inline-flex max-w-full items-center gap-3 rounded-2xl bg-primary px-5 py-4 text-base font-semibold text-primary-foreground shadow-lg transition-transform hover:-translate-y-0.5 sm:px-8 sm:text-lg">
                <Mail className="h-5 w-5 shrink-0" aria-hidden /><span className="truncate">{event.email ?? "gucc@green.edu.bd"}</span>
              </a>
            </div>
            <ul className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {contacts.map((p, i) => (
                <li key={`${p.name}-${i}`} className="sp-reveal rounded-2xl border bg-card p-6">
                  <div className="mb-5 flex items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sp/20 bg-sp/10 text-xl font-bold text-sp" aria-hidden>{p.name.charAt(0)}</span>
                    <div className="min-w-0">
                      <p className="font-bold">{p.name}</p>
                      <p className="text-sm font-medium text-sp">{p.role}</p>
                      <p className="text-xs text-muted-foreground">{p.organization}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {p.email && <a href={`mailto:${p.email}`} className="flex min-h-11 items-center gap-3 text-sm text-muted-foreground hover:text-foreground"><Mail className="h-4 w-4 shrink-0" aria-hidden /><span className="break-all">{p.email}</span></a>}
                    {p.phone && <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="flex min-h-11 items-center gap-3 text-sm text-muted-foreground hover:text-foreground"><Phone className="h-4 w-4 shrink-0" aria-hidden />{p.phone}</a>}
                  </div>
                </li>
              ))}
            </ul>
          </Shell>
        );

      default:
        return isBlock(s.type) ? <Block key={s.id} s={s} /> : null;
    }
  };

  return (
    <div style={{ "--sp-accent": accent } as CSSProperties} className="sp-page relative pb-24 md:pb-0">
      <Hero c={c} event={event} heroSubtitle={heroSubtitle} phrases={phrases} stats={stats} ctaHref={ctaHref} secondary={download?.href ? { label: download.label || "Download the proposal", href: download.href } : { label: "Talk to us", href: contactHref }} />
      <SectionNav items={navItems} cta={{ label: "Become a sponsor", href: ctaHref }} contact={contactHref} />
      {sections.map(render)}
    </div>
  );
}

// ───────────────────────────── hero ─────────────────────────────

function Hero({ c, event, heroSubtitle, phrases, stats, ctaHref, secondary }: {
  c: SectionedContent; event: NonNullable<SponsorshipContent["event"]>; heroSubtitle: string; phrases: string[]; stats: Array<{ value: string; label: string }>;
  ctaHref: string; secondary: { label: string; href: string };
}) {
  const title = c.heroTitle?.trim();
  const hero = c.theme?.heroImage;
  return (
    <section aria-label="Become a sponsor" className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-sp/10 via-background to-background" />
      <div aria-hidden className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle,currentColor_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black_30%,transparent_90%)] text-sp" />
      <div className="container relative mx-auto max-w-7xl px-4 pb-16 pt-12 sm:pb-24 sm:pt-20 lg:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            {event.organizer && (
              <span className="mb-6 inline-flex max-w-full items-center gap-1.5 rounded-full border border-sp/30 bg-background/70 px-4 py-1.5 text-xs font-medium text-sp backdrop-blur-sm sm:text-sm">
                <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{event.organizer}</span>
              </span>
            )}
            <h1 className="mb-6 text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              {title ?? <>Become <span className="bg-gradient-to-r from-sp via-emerald-500 to-teal-500 bg-clip-text text-transparent">Our Partner</span></>}
            </h1>
            <p className="mb-4 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">{heroSubtitle}</p>
            <div className="mb-8 flex flex-wrap items-center gap-3">
              {event.name && (
                <span className="inline-flex items-center gap-2 rounded-xl border border-sp/20 bg-sp/10 px-3 py-1.5 text-sm font-semibold text-sp">
                  <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden />{event.name}
                </span>
              )}
              <TypedPhrases phrases={phrases} />
            </div>
            <div className="mb-12 flex flex-col gap-3 sm:flex-row">
              <a href={ctaHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Become a Sponsor<ArrowRight className="h-4 w-4" aria-hidden />
              </a>
              <a href={secondary.href} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border bg-background/70 px-8 text-base font-medium backdrop-blur-sm transition-colors hover:border-sp/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {secondary.label}{secondary.href.endsWith(".pdf") ? <Download className="h-4 w-4" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
              </a>
            </div>
            <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              {stats.slice(0, 4).map((x) => (
                <div key={x.label} className="text-center sm:text-left">
                  <dt className="order-2 mt-1 text-xs leading-snug text-muted-foreground">{x.label}</dt>
                  <dd className="order-1 text-2xl font-extrabold leading-none text-sp sm:text-3xl">{x.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="hidden lg:block">
            {hero ? (
              <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border shadow-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element -- a picture chosen in the dashboard (any allowed host) */}
                <img src={hero} alt="" className="h-full w-full object-cover" fetchPriority="high" />
              </div>
            ) : <CodeCard name={event.name ?? event.fullName ?? ""} fullName={event.fullName ?? event.name ?? ""} />}
          </div>
        </div>
      </div>
      <ChevronDown className="absolute bottom-6 left-1/2 hidden h-6 w-6 -translate-x-1/2 text-muted-foreground/50 motion-safe:animate-bounce lg:block" aria-hidden />
    </section>
  );
}

/** The hero's picture on computers when no photo is set: the event as a few lines of code. */
function CodeCard({ name, fullName }: { name: string; fullName: string }) {
  const kind = /carnival/i.test(fullName) ? "Carnival" : /partner/i.test(fullName) ? "Partnership" : "Event";
  const facts = kind === "Partnership" ? ['    community="7,000+ students",', '    calendar="year-round",'] : ["    contests=4,", "    participants=500,"];
  const lines: Array<[string, string?, string?]> = [
    [`# ${name.toUpperCase()} · GUCC`, "text-muted-foreground/60"], [""], ["from", "text-sky-600 dark:text-sky-400", ` gucc import ${kind}, Contest`], [""],
    [kind.toLowerCase(), "text-violet-600 dark:text-violet-400", ` = ${kind}(`], [`    name="${fullName}",`, "text-muted-foreground"], [facts[0]!, "text-muted-foreground"], [facts[1]!, "text-muted-foreground"],
    ['    venue="Green University"', "text-muted-foreground"], [")", "text-muted-foreground"], [""], [`${kind.toLowerCase()}.run()`, "text-sp", "  # starting…"],
  ];
  return (
    <div aria-hidden className="relative mx-4 select-none overflow-hidden rounded-2xl border bg-card/90 shadow-2xl backdrop-blur">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-red-400/70" /><span className="h-3 w-3 rounded-full bg-yellow-400/70" /><span className="h-3 w-3 rounded-full bg-green-400/70" />
        <span className="ml-3 font-mono text-xs text-muted-foreground">{kind === "Partnership" ? "partnership.py" : "contest_runner.py"}</span>
      </div>
      <div className="space-y-0.5 px-5 py-4 font-mono text-xs leading-relaxed">
        {lines.map(([t, cls, rest], i) => (
          <div key={i} className="flex gap-4">
            <span className="w-5 shrink-0 text-right text-muted-foreground/40">{i + 1}</span>
            <span><span className={cls}>{t}</span>{rest && <span className="text-foreground/70">{rest}</span>}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────── packages ─────────────────────────────

function Packages({ s, packages, comparison, tiers, contactHref }: {
  s: SectionEntry; packages: SponsorPackage[]; comparison: Array<SponsorComparison & { values?: Record<string, boolean> }>; tiers: string[]; contactHref: string;
}) {
  return (
    <Shell id="packages" icon={Zap} eyebrow="Packages" wide heading={headingOf(s, <>Choose Your <Highlight>Sponsorship Tier</Highlight></>)}
      sub={s.subheading ?? "Select the package that fits your brand's goals and budget. Every tier delivers real, measurable impact."}>
      {/* Phones: one card at a time, swiped; tablets and up: side by side. */}
      <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:none] md:mx-0 md:grid md:snap-none md:items-end md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden"
        style={{ gridTemplateColumns: `repeat(${Math.min(packages.length, 4)}, minmax(0, 1fr))` }} aria-label="Packages">
        {packages.map((p, i) => {
          const t = tierStyle(p.tier);
          const Icon = t.icon;
          const priced = Number(p.price) > 0;
          return (
            <li key={`${p.tier}-${i}`} className={cn("sp-reveal w-[85%] shrink-0 snap-center sm:w-[60%] md:w-auto", p.highlight && "md:-translate-y-4")}>
              <div className={cn("flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm", p.highlight && cn(t.ring, t.glow, "shadow-xl"))}>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                  <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider", t.ring, t.soft, t.text)}>
                    {p.highlight ? "Recommended" : `${p.slots} slot${p.slots === 1 ? "" : "s"}`}
                  </span>
                  {p.highlight && <span className={cn("text-[11px] font-semibold uppercase tracking-wider", t.text)}>{p.slots} slot{p.slots === 1 ? "" : "s"} only</span>}
                </div>
                <span className={cn("mb-4 flex h-12 w-12 items-center justify-center rounded-xl border", t.ring, t.soft)}><Icon className={cn("h-6 w-6", t.text)} aria-hidden /></span>
                <h3 className="text-xl font-bold">{p.tier}</h3>
                <p className="mb-5 mt-3 flex flex-wrap items-baseline gap-x-2">
                  <span className={cn("font-extrabold", p.highlight ? "text-4xl" : "text-3xl")}>{priced ? money(p) : "On request"}</span>
                  {(p.period || (priced && p.currency)) && <span className="text-xs text-muted-foreground">{p.period ?? ""}</span>}
                </p>
                <div className="mb-5 h-px bg-border" />
                <ul className="mb-6 flex-1 space-y-3">
                  {p.benefits.map((b, j) => (
                    <li key={j} className="flex items-start gap-3 text-sm">
                      <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", t.ring, t.soft)}><Check className={cn("h-2.5 w-2.5", t.text)} aria-hidden /></span>
                      <span className="leading-snug text-muted-foreground">{b}</span>
                    </li>
                  ))}
                </ul>
                <a href={contactHref} className={cn("inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  p.highlight ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border bg-muted/50 hover:bg-muted")}>
                  Become a {p.tier.replace(/\s*sponsor$/i, "")} Sponsor<ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              </div>
            </li>
          );
        })}
      </ul>
      {packages.length > 1 && <p className="mt-1 text-center text-xs text-muted-foreground md:hidden">Swipe to see every package</p>}

      {comparison.length > 0 && (
        <div className="sp-reveal mx-auto mt-14 max-w-4xl">
          <h3 className="mb-4 text-center text-lg font-semibold">Compare the packages</h3>
          {/* Computers: a table. */}
          <div className="hidden overflow-hidden rounded-xl border md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Feature</th>
                  {tiers.map((t) => <th key={t} scope="col" className={cn("px-4 py-3 text-center font-semibold", tierStyle(t).text)}>{t.replace(/\s*sponsor$/i, "")}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {comparison.map((row, i) => (
                  <tr key={`${row.feature}-${i}`}>
                    <th scope="row" className="px-4 py-2.5 font-normal text-muted-foreground">{row.feature}</th>
                    {tiers.map((t) => (
                      <td key={t} className="px-4 py-2.5 text-center">
                        {comparisonValue(row, t) ? <Check className={cn("mx-auto h-4 w-4", tierStyle(t).text)} aria-label="Included" /> : <X className="mx-auto h-4 w-4 text-muted-foreground/40" aria-label="Not included" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Phones: what each package includes. */}
          <div className="space-y-2 md:hidden">
            {tiers.map((t, k) => (
              <details key={t} className="rounded-xl border bg-card" open={k === 0}>
                <summary className={cn("flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold", tierStyle(t).text)}>
                  {t}<ChevronDown className="h-4 w-4" aria-hidden />
                </summary>
                <ul className="space-y-2 border-t px-4 py-3 text-sm">
                  {comparison.map((row, i) => {
                    const yes = comparisonValue(row, t);
                    return (
                      <li key={i} className={cn("flex items-start gap-2", !yes && "text-muted-foreground/70")}>
                        {yes ? <Check className={cn("mt-0.5 h-4 w-4 shrink-0", tierStyle(t).text)} aria-hidden /> : <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
                        <span>{row.feature}<span className="sr-only">{yes ? ": included" : ": not included"}</span></span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}

// ───────────────────────────── blocks ─────────────────────────────

function Block({ s }: { s: SectionEntry }) {
  const label = SECTION_LABEL[s.type];
  const heading = s.heading || label;
  switch (s.type) {
    case "text": {
      const d = s.data as BlockData["text"] | undefined;
      if (!d?.markdown?.trim()) return null;
      return (
        <section id={s.id} aria-label={heading} className="scroll-mt-32 py-12 sm:py-16">
          <div className="container mx-auto max-w-3xl px-4">
            {s.heading && <h2 className="mb-6 text-balance text-3xl font-bold tracking-tight sm:text-4xl">{s.heading}</h2>}
            <div className="sp-reveal text-base leading-relaxed text-muted-foreground [&_a]:font-medium [&_a]:text-sp [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:mb-1.5 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-4 [&_strong]:text-foreground [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(d.markdown) }} />
          </div>
        </section>
      );
    }
    case "stats": {
      const d = s.data as BlockData["stats"] | undefined;
      if (!d?.items?.length) return null;
      return (
        <section id={s.id} aria-label={heading} className="scroll-mt-32 bg-muted/40 py-12 sm:py-16">
          <div className="container mx-auto max-w-6xl px-4">
            {s.heading && <h2 className="mb-8 text-center text-3xl font-bold tracking-tight sm:text-4xl">{s.heading}</h2>}
            <dl className="grid grid-cols-2 gap-6 text-center sm:grid-cols-4">
              {d.items.map((x, i) => (
                <div key={i} className="sp-reveal flex flex-col">
                  <dt className="order-2 mt-1 text-sm text-muted-foreground">{x.label}</dt>
                  <dd className="order-1 text-3xl font-extrabold text-sp sm:text-4xl">{x.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      );
    }
    case "faq": {
      const d = s.data as BlockData["faq"] | undefined;
      if (!d?.items?.length) return null;
      return (
        <Shell id={s.id} icon={HelpCircle} eyebrow="Questions" heading={heading === label ? <>Frequently Asked <Highlight>Questions</Highlight></> : heading} sub={s.subheading}>
          <div className="mx-auto max-w-3xl space-y-3">
            {d.items.map((x, i) => (
              <details key={i} className="sp-reveal group rounded-xl border bg-card">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 font-medium">
                  {x.q}<ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="whitespace-pre-line border-t px-5 py-4 text-sm leading-relaxed text-muted-foreground">{x.a}</p>
              </details>
            ))}
          </div>
        </Shell>
      );
    }
    case "testimonials": {
      const d = s.data as BlockData["testimonials"] | undefined;
      if (!d?.items?.length) return null;
      return (
        <Shell id={s.id} icon={Quote} eyebrow="Partners say" muted heading={heading === label ? <>What Our <Highlight>Partners Say</Highlight></> : heading} sub={s.subheading}>
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {d.items.map((x, i) => (
              <li key={i} className="sp-reveal">
                <figure className="flex h-full flex-col rounded-2xl border bg-card p-6">
                  <Quote className="mb-3 h-6 w-6 text-sp" aria-hidden />
                  <blockquote className="flex-1 text-pretty leading-relaxed">{x.quote}</blockquote>
                  {x.name && <figcaption className="mt-4 text-sm"><span className="font-semibold">{x.name}</span>{x.role && <span className="block text-muted-foreground">{x.role}</span>}</figcaption>}
                </figure>
              </li>
            ))}
          </ul>
        </Shell>
      );
    }
    case "timeline": {
      const d = s.data as BlockData["timeline"] | undefined;
      if (!d?.items?.length) return null;
      return (
        <Shell id={s.id} icon={Calendar} eyebrow="Timeline" heading={heading === label ? <>Key <Highlight>Dates</Highlight></> : heading} sub={s.subheading}>
          <ol className="relative mx-auto max-w-2xl border-l-2 border-sp/30 pl-6">
            {d.items.map((x, i) => (
              <li key={i} className="sp-reveal relative mb-8 last:mb-0">
                <span className="absolute -left-[33px] top-1 h-4 w-4 rounded-full border-4 border-background bg-sp" aria-hidden />
                {x.date && <p className="text-xs font-semibold uppercase tracking-wider text-sp">{x.date}</p>}
                <p className="mt-1 font-semibold">{x.title}</p>
                {x.detail && <p className="mt-1 text-sm text-muted-foreground">{x.detail}</p>}
              </li>
            ))}
          </ol>
        </Shell>
      );
    }
    case "video": {
      const d = s.data as BlockData["video"] | undefined;
      if (!d?.url) return null;
      return (
        <section id={s.id} aria-label={heading} className="scroll-mt-32 py-12 sm:py-16">
          <div className="container mx-auto max-w-4xl px-4">
            {s.heading && <h2 className="mb-6 text-center text-3xl font-bold tracking-tight sm:text-4xl">{s.heading}</h2>}
            <VideoFacade url={d.url} title={d.caption || s.heading || "Video"} />
            {d.caption && <p className="mt-3 text-center text-sm text-muted-foreground">{d.caption}</p>}
          </div>
        </section>
      );
    }
    case "cta": {
      const d = s.data as BlockData["cta"] | undefined;
      if (!d?.label) return null;
      return (
        <section id={s.id} aria-label={heading} className="scroll-mt-32 px-4 py-12 sm:py-16">
          <div className="sp-reveal container mx-auto flex max-w-5xl flex-col items-center gap-6 rounded-3xl border border-sp/30 bg-gradient-to-br from-sp/15 to-transparent p-8 text-center sm:p-12 md:flex-row md:justify-between md:text-left">
            <div>
              {s.heading && <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">{s.heading}</h2>}
              {d.text && <p className="mt-2 text-pretty text-muted-foreground">{d.text}</p>}
            </div>
            <a href={d.href} className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground shadow-lg">{d.label}<ArrowRight className="h-4 w-4" aria-hidden /></a>
          </div>
        </section>
      );
    }
    case "images": {
      const d = s.data as BlockData["images"] | undefined;
      if (!d?.items?.length) return null;
      return (
        <Shell id={s.id} icon={Sparkles} eyebrow="Pictures" heading={heading} sub={s.subheading}>
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            {d.items.map((x, i) => (
              <li key={i} className="sp-reveal relative aspect-[4/3] overflow-hidden rounded-2xl border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- pictures from the media library or another https host */}
                <img src={x.src} alt={x.alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              </li>
            ))}
          </ul>
        </Shell>
      );
    }
    case "download": {
      const d = s.data as BlockData["download"] | undefined;
      if (!d?.href) return null;
      return (
        <section id={s.id} aria-label={heading} className="scroll-mt-32 px-4 py-10">
          <a href={d.href} target="_blank" rel="noopener" className="sp-reveal container mx-auto flex max-w-3xl items-center gap-4 rounded-2xl border bg-card p-5 transition-colors hover:border-sp/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sp/10 text-sp"><Download className="h-6 w-6" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{d.label}</span>
              {d.note && <span className="block text-sm text-muted-foreground">{d.note}</span>}
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          </a>
        </section>
      );
    }
    default:
      return null;
  }
}
