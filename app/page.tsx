import { PohelaBoishakhGreetingClient as PohelaBoishakhGreeting } from "@/components/client-only";
import { HeroSection } from "@/components/hero";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getPublicEvents, getPublicSetting, getRecruitment } from "@/lib/public/data";
import { Award, BookOpen, CalendarDays, ChevronDown, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AnimatedStat } from "./component";
import { CollaborationScroll } from "./components/collaboration-scroll";
import { EventCard } from "./events/components";
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
  const roster = await getYearRoster(latestYear);
  const eventsData = await getPublicEvents();
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
      `GUCC Executive Committee ${latestYear}`,
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
    <div className="flex flex-col min-h-screen">
      <JsonLd id="home-schema" data={structuredData} />
      {new Date().getMonth() === 3 && new Date().getDate() === 14 && (
        <PohelaBoishakhGreeting />
      )}
      {/* Hero Section */}
      <HeroSection />
      {recruiting && (
        <div className="container relative z-10 -mt-5 flex justify-center px-4">
          <Link href="/recruitment" className="inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-500/40 bg-background/95 px-4 py-2 text-sm font-medium shadow-md backdrop-blur hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-500" aria-hidden />
            <span className="truncate">Recruitment is open{recruiting.closesAt ? `, closes ${new Date(recruiting.closesAt).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short" })}` : ""}</span>
            <span aria-hidden>→</span>
          </Link>
        </div>
      )}

      {/* About Section */}
      <section className="w-full py-16 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
            <div className="space-y-6">
              <div className="inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium">
                About Us
              </div>
              <h2 className="text-3xl font-bold tracking-tighter md:text-4xl lg:text-5xl">
                Who We Are
              </h2>
              <div className="space-y-4 text-muted-foreground md:text-lg">
                <p>
                  Welcome to the Green University Computer Club (GUCC), a
                  dynamic and student-driven non-profit and non-political
                  organization operating in collaboration with the Department of
                  Computer Science and Engineering (CSE) at the esteemed Green
                  University of Bangladesh. As the flagship club of the
                  university, GUCC boasts a thriving community of over 7000+
                  members.
                </p>
                <p>
                  Our primary objective is to empower and guide students within
                  the Department of CSE on their journey to carve out successful
                  careers in the ever-evolving realms of modern computer science
                  and engineering. Under the vigilant supervision of the
                  department, GUCC serves as a catalyst for excellence,
                  fostering development and leadership among its members.
                </p>
              </div>
            </div>
            <div className="space-y-8">
              <div className="space-y-4">
                <h3 className="text-2xl font-bold">Our Vision</h3>
                <p className="text-muted-foreground md:text-lg">
                  The vision of the Green University Computer Club is to
                  increase the leadership and develop the professional skills of
                  the CSE students of the Green University of Bangladesh.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-6">
                <Card className="hover:shadow-lg transition-shadow duration-300">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center">
                      <Users className="h-5 w-5 mr-2 text-primary" />
                      Community
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Building a vibrant community of tech enthusiasts
                    </p>
                  </CardContent>
                </Card>
                <Card className="hover:shadow-lg transition-shadow duration-300">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center">
                      <Award className="h-5 w-5 mr-2 text-primary" />
                      Excellence
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Striving for excellence in all our endeavors
                    </p>
                  </CardContent>
                </Card>
                <Card className="hover:shadow-lg transition-shadow duration-300">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center">
                      <BookOpen className="h-5 w-5 mr-2 text-primary" />
                      Learning
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Promoting continuous learning and growth
                    </p>
                  </CardContent>
                </Card>
                <Card className="hover:shadow-lg transition-shadow duration-300">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center">
                      <CalendarDays className="h-5 w-5 mr-2 text-primary" />
                      Events
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Organizing impactful events and workshops
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="w-full py-16 md:py-24 lg:py-32 bg-gradient-to-b from-background to-primary/5">
        <div className="container px-4 md:px-6">
          <div className="text-center space-y-6">
            <h2 className="text-3xl font-bold tracking-tighter md:text-4xl lg:text-5xl">
              GUCC in Numbers
            </h2>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-lg">
              Our impact in the university and beyond
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-16">
            {home.stats.map((st) => (
              <div key={st.label} className="text-center p-6 rounded-lg bg-background/50 backdrop-blur-sm hover:bg-background/80 transition-colors duration-300">
                <AnimatedStat
                  end={st.value}
                  suffix={st.suffix ?? ""}
                  className="text-4xl md:text-5xl font-bold text-primary"
                />
                <div className="text-sm text-muted-foreground mt-3">{st.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* Messages from Our Chairperson Section */}
      <section className="w-full py-12 md:py-16 lg:py-20">
        <div className="container px-4 md:px-6">
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-bold tracking-tighter md:text-4xl lg:text-5xl">
              {home.chairperson.heading}
            </h2>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-lg">
              {home.chairperson.subheading}
            </p>
          </div>
          <div className="flex justify-center mt-10">
            <Card className="hover:shadow-lg transition-shadow duration-300 border-primary/10 max-w-xl w-full">
              <CardContent className="p-5 flex flex-col items-center text-center space-y-3">
                <Avatar className="w-20 h-20">
                  <AvatarImage src={home.chairperson.person.photo} alt={home.chairperson.person.name} />
                  <AvatarFallback>{home.chairperson.person.initials}</AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <h3 className="font-semibold text-lg">{home.chairperson.person.name}</h3>
                  <p className="text-sm text-muted-foreground"> {home.chairperson.person.title}</p>
                </div>
                <blockquote className="text-sm text-muted-foreground italic leading-relaxed">
                  &quot;{home.chairperson.person.message}&quot;
                </blockquote>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Messages from Our Moderators Section */}
      <section className="w-full py-12 md:py-16 lg:py-20">
        <div className="container px-4 md:px-6">
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-bold tracking-tighter md:text-4xl lg:text-5xl">
              {home.moderators.heading}
            </h2>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-lg">
              {home.moderators.subheading}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-10">
            {home.moderators.people.map((m) => (
              <Card key={m.name} className="hover:shadow-lg transition-shadow duration-300 border-primary/10">
                <CardContent className="p-5">
                  <div className="flex flex-col items-center text-center space-y-3">
                    <Avatar className="w-16 h-16">
                      <AvatarImage src={m.photo} alt={m.name} />
                      <AvatarFallback>{m.initials}</AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                      <h3 className="font-semibold">{m.name}</h3>
                      <p className="text-xs text-muted-foreground">{m.title}</p>
                    </div>
                    <blockquote className="text-xs text-muted-foreground italic leading-relaxed">
                      &quot;{m.message}&quot;
                    </blockquote>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Club Collaborations Scroll Section */}
      <CollaborationScroll partners={partners} />

      {/* Featured Events Section */}
      <section className="w-full">
        <div className="container px-6">
          <div className="flex flex-col items-center justify-center space-y-6 text-center">
            <div className="space-y-4">
              <h2 className="text-3xl mt-12 font-bold tracking-tighter md:text-4xl lg:text-5xl">
                Recent and Upcoming Events
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-12">
            {[...eventsData]
              .sort(
                (a, b) =>
                  new Date(b.date).getTime() - new Date(a.date).getTime()
              )
              .slice(0, 6)
              .map((event, index) => (
                <EventCard key={index} event={event} index={index} />
              ))}
          </div>
        </div>
      </section>

      <div className="flex justify-center m-12">
        <Button
          asChild
          variant="outline"
          className="border-primary/20 hover:bg-primary/10"
        >
          <Link href="/events">View All Events</Link>
        </Button>
      </div>

      {/* Leadership — a keyword-anchored path into the executives section. */}
      <section className="w-full py-12 md:py-16">
        <div className="container px-4 md:px-6">
          <div className="rounded-2xl border border-primary/10 bg-primary/5 p-8 text-center md:p-12">
            <h2 className="text-3xl font-bold tracking-tighter md:text-4xl">
              Meet the GUCC Executives
            </h2>
            <p className="mx-auto mt-4 max-w-[720px] text-muted-foreground md:text-lg">
              The {latestYear} executive committee of the Green University
              Computer Club — {leadership.length} faculty advisors and student
              executives — plus every committee since 2016, each with a full
              profile.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Button asChild>
                <Link href="/executives">GUCC Executive Committee</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/executives/${latestYear}`}>
                  {latestYear} Committee
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ — visible answers backing the FAQPage structured data above. */}
      <section
        className="w-full py-12 md:py-16 lg:py-20"
        aria-labelledby="faq-heading"
      >
        <div className="container px-4 md:px-6">
          <div className="text-center space-y-4">
            <h2
              id="faq-heading"
              className="text-3xl font-bold tracking-tighter md:text-4xl lg:text-5xl"
            >
              Frequently Asked Questions
            </h2>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-lg">
              Everything people usually want to know about GUCC
            </p>
          </div>
          <div className="mx-auto mt-10 max-w-3xl space-y-4">
            {faq.map((item) => (
              <details
                key={item.question}
                className="group rounded-lg border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-lg font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                  <h3 className="inline">{item.question}</h3>
                  <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
