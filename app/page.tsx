import { PohelaBoishakhGreetingClient as PohelaBoishakhGreeting } from "@/components/client-only";
import { HeroSection } from "@/components/hero";

import { SectionHeading } from "@/components/section-heading";
import { getPublicEvents, getPublicSetting, getRecruitment } from "@/lib/public/data";
import { ArrowRight, Plus, Rocket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AboutSection } from "./components/about-section";
import { ChairpersonSection } from "./components/chairperson-section";
import { ImpactSection } from "./components/impact-section";
import { ModeratorsSection } from "./components/moderators-section";
import { CollaborationScroll } from "./components/collaboration-scroll";
import { EventTile } from "./events/event-tile";
import { eventPhase } from "./events/event-status";
import { JsonLd } from "@/components/seo/json-ld";
import { getHomeFaq } from "@/lib/seo/faq";
import { buildMetadata } from "@/lib/seo/metadata";
import { SITE, SITE_KEYWORDS } from "@/lib/seo/site";
import {
  faqSchema,
  graph,
  itemListSchema,
  personSchema,
  webPageSchema,
} from "@/lib/seo/schema";
import {
  getExecutiveAvatar,
  getLatestExecutiveYear,
  getYearRoster,
  isStudentId,
} from "@/app/executives/util";

// Home page reads committees and events from D1 (cached, tag-invalidated).
export const revalidate = 3600;

type Person = { name: string; title: string; photo: string; initials: string; message: string };
interface HomeContent {
  chairperson: { heading: string; subheading: string; person: Person };
  moderators: { heading: string; subheading: string; people: Person[] };
  stats: Array<{ value: number; suffix?: string; label: string }>;
}

/** "Md. Monirul Islam" and "Monirul Islam" are the same person: case, dots and titles are ignored. */
const personKey = (name: string) =>
  name.toLowerCase().replace(/[.,]/g, " ").split(/\s+/).filter((w) => w && !["mr", "mrs", "ms", "md", "dr", "prof"].includes(w)).join(" ");

/** Shown until the page.home setting exists (it's seeded with exactly this). */
const HOME_DEFAULTS: HomeContent = {
  chairperson: {
    heading: "Messages from Our Chairperson",
    subheading: "A message from the Chairperson of the Department of CSE",
    person: { name: "Mr. Syed Ahsanul Kabir", title: "Chairperson & Associate Professor", photo: "/executives/kabir.cse.png", initials: "SK",
      message: "It gives me great pride to see the Green University Computer Club (GUCC) flourishing as a platform for student innovation, leadership, and collaboration. GUCC is more than just a club — it's a space where ideas come to life, where students learn by doing, and where futures are shaped through teamwork and creativity. I wholeheartedly support the club's mission and encourage every student to take part in this journey of growth and excellence." },
  },
  moderators: {
    heading: "Messages from Our Moderators",
    subheading: "Inspiring messages from our faculty moderators who guide and shape our journey",
    people: [
      { name: "Md. Monirul Islam", title: "Assistant Professor & Moderator, GUCC", photo: "/executives/monirul.cse.png", initials: "MI",
        message: "At GUCC, we witness remarkable growth in our CSE students — not just in technical expertise, but also in leadership and teamwork. This platform has become a cornerstone for empowering the next generation of tech leaders." },
      { name: "Sagufta Sabah Nakshi", title: "Deputy Moderator, GUCC", photo: "/executives/nakshi.png", initials: "SN",
        message: "The energy and dedication our members bring to GUCC is truly inspiring. By bridging academic knowledge with real-world innovation, this club continues to nurture creativity, confidence, and community." },
      { name: "Montaser Abdul Quader", title: "Deputy Moderator, GUCC", photo: "/executives/montaser.cse.png", initials: "MQ",
        message: "GUCC embodies the spirit of collaboration and continuous improvement. It's a pleasure to watch our students take on challenges and transform them into meaningful impact, building a stronger tech future." },
    ],
  },
  stats: [
    { value: 7000, suffix: "+", label: "Members" },
    { value: 50, suffix: "+", label: "Events Per Year" },
    { value: 20, suffix: "+", label: "Workshops" },
    { value: 10, suffix: "+", label: "Years of Excellence" },
  ],
};

export const metadata: Metadata = {
  ...buildMetadata({
    title: `${SITE.name} (${SITE.shortName})`,
    description: SITE.description,
    path: "/",
    keywords: SITE_KEYWORDS,
  }),
  // The home page owns the brand query, so it skips the "| GUCC" template.
  title: {
    absolute: `${SITE.name} (${SITE.shortName}) — Official Website`,
  },
};

export default async function Home() {
  const faq = await getHomeFaq();
  const latestYear = await getLatestExecutiveYear();
  const roster = latestYear ? await getYearRoster(latestYear) : undefined;
  const eventsData = await getPublicEvents();
  // The page is cached for an hour; an event's "upcoming"/"past" badge is as of this render.
  const renderedAt = Date.now();
  // A small "Recruitment open" link under the hero while a call is open.
  const recruiting = (await getRecruitment().catch(() => null))?.open ?? null;
  const partners = (await getPublicSetting<{ partners: Array<{ name: string; image: string; description: string }> }>("page.collaborations"))?.partners ?? [];
  // Messages and figures are edited by leaders (Settings → Home page); the layout is fixed.
  const content = { ...HOME_DEFAULTS, ...((await getPublicSetting<HomeContent>("page.home")) ?? {}) };
  // A leader listed in the current committee shows their profile photo, so a new photo appears
  // here too; the setting's photo is only the fallback.
  const facultyPhoto = new Map(
    (roster?.facultyMembers ?? []).flatMap((p) => {
      const url = getExecutiveAvatar(p);
      return url ? [[personKey(p.name), url] as const] : [];
    }),
  );
  const livePhoto = (p: Person): Person => ({ ...p, photo: facultyPhoto.get(personKey(p.name)) ?? p.photo });
  const home: HomeContent = {
    ...content,
    chairperson: { ...content.chairperson, person: livePhoto(content.chairperson.person) },
    moderators: { ...content.moderators, people: content.moderators.people.map(livePhoto) },
  };
  const leadership = [
    ...(roster?.facultyMembers ?? []),
    ...(roster?.studentExecutives ?? []),
  ];

  const structuredData = graph(
    webPageSchema({
      name: `${SITE.name} (${SITE.shortName})`,
      description: SITE.description,
      path: "/",
    }),
    faqSchema(faq),
    itemListSchema(
      latestYear ? `GUCC Executive Committee ${latestYear}` : "GUCC Executive Committee",
      leadership.map((person) => ({
        name: person.name,
        path:
          person.studentId && isStudentId(person.studentId)
            ? `/executives/${person.studentId}`
            : undefined,
        image: getExecutiveAvatar(person),
        node: personSchema({
          name: person.name,
          path:
            person.studentId && isStudentId(person.studentId)
              ? `/executives/${person.studentId}`
              : undefined,
          position: person.position,
          designation: person.designation,
          image: getExecutiveAvatar(person),
          year: person.year,
          sameAs: [person.linkedin, person.github, person.facebook, person.twitter],
        }),
      }))
    )
  );

  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd id="home-schema" data={structuredData} />
      {new Date().getMonth() === 3 && new Date().getDate() === 14 && (
        <PohelaBoishakhGreeting />
      )}
      <HeroSection />
      {recruiting && (
        <div className="container relative z-10 -mt-6 flex justify-center px-4">
          <Link href="/recruitment" className="glass glow-border relative inline-flex max-w-full items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg shadow-primary/10 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-secondary" />
            </span>
            <span className="truncate">Recruitment is open{recruiting.closesAt ? `, closes ${new Date(recruiting.closesAt).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short" })}` : ""}</span>
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
          </Link>
        </div>
      )}

      <AboutSection members={home.stats.find((st) => /member/i.test(st.label))} />

      <ImpactSection stats={home.stats} />

      <ChairpersonSection {...home.chairperson} />

      <ModeratorsSection {...home.moderators} />

      <CollaborationScroll partners={partners} />

      {/* Events */}
      <section className="w-full py-16 md:py-24">
        <div className="container px-4 md:px-6">
          <SectionHeading index="06" eyebrow="What's happening" title="Recent and upcoming events">
            <Link href="/events" className="group inline-flex shrink-0 items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              View all events
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
          </SectionHeading>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...eventsData]
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .slice(0, 6)
              .map((event, index) => (
                <div key={index} className="reveal">
                  <EventTile event={event} phase={eventPhase(event, renderedAt)} now={null} headingLevel={3} />
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* Leadership — a keyword-anchored path into the executives section. */}
      <section className="w-full py-12 md:py-16">
        <div className="container px-4 md:px-6">
          <div className="dark dark-surface reveal relative isolate overflow-hidden rounded-[2rem] border border-white/10 bg-background px-8 py-14 text-center text-foreground md:px-16 md:py-20">
            <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_50%_120%,var(--color-brand-700),transparent_70%)]" />
            <div aria-hidden className="absolute left-[10%] top-[10%] -z-10 h-60 w-60 rounded-full bg-aurora-500/20 blur-[90px] animate-aurora" />
            <div aria-hidden className="absolute inset-0 -z-10 bg-grid" />
            <Rocket className="mx-auto h-10 w-10 text-aurora-300 animate-float" aria-hidden />
            <h2 className="mx-auto mt-6 max-w-3xl font-display text-3xl font-bold tracking-tight text-white md:text-5xl">
              Meet the <span className="text-gradient">GUCC Executives</span>
            </h2>
            <p className="mx-auto mt-5 max-w-[720px] text-white/75 md:text-lg">
              {latestYear
                ? <>The {latestYear} executive committee of the Green University Computer Club — {leadership.length} faculty advisors and student executives — plus every committee since 2016, each with a full profile.</>
                : <>Every executive committee of the Green University Computer Club since 2016, each member with a full profile.</>}
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/executives" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-400 to-aurora-400 px-7 font-semibold text-slate-950 shadow-[0_0_40px_-8px] shadow-brand-400/60 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                GUCC Executive Committee
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              {latestYear && (
                <Link href={`/executives/${latestYear}`} className="glass inline-flex min-h-12 items-center justify-center rounded-full px-7 font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  {latestYear} Committee
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ — visible answers backing the FAQPage structured data above. */}
      <section className="w-full py-16 md:py-24" aria-labelledby="faq-heading">
        <div className="container grid gap-12 px-4 md:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeading index="07" eyebrow="FAQ" id="faq-heading" title="Frequently asked questions" description="Everything people usually want to know about GUCC" />
            <Link href="/contact" className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline">
              Still curious? Ask us <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="space-y-3">
            {faq.map((item) => (
              <details
                key={item.question}
                className="group rounded-2xl border bg-card p-5 transition-[border-color,box-shadow] duration-300 open:border-primary/40 open:shadow-[0_12px_40px_-20px_hsl(var(--primary)/0.5)] hover:border-primary/40 md:p-6"
              >
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-lg font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                  <h3 className="inline font-display">{item.question}</h3>
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform duration-300 group-open:rotate-45" aria-hidden>
                    <Plus className="h-4 w-4" />
                  </span>
                </summary>
                <p className="mt-3 leading-relaxed text-muted-foreground">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
