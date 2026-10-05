import Link from "next/link";
import { ArrowRight, CalendarDays, Clock, Facebook, Github, Instagram, Linkedin, Mail, MapPin, Search, UserPlus, Handshake, Youtube, Navigation } from "lucide-react";
import { ContactForm } from "@/components/contact-form";
import { CopyButton } from "@/components/copy-button";
import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata } from "@/lib/seo/metadata";
import { ADDRESS, PARENT_ORGANIZATION, SITE } from "@/lib/seo/site";
import { ORGANIZATION_ID, breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/schema";

export const metadata: Metadata = buildMetadata({
  title: "Contact Us — Email, Address and Message Form",
  description: `Contact Green University Computer Club (GUCC): email ${SITE.email}, send us a message, or visit us at ${PARENT_ORGANIZATION.name}, Purbachal.`,
  path: "/contact",
  keywords: [
    "contact GUCC",
    "GUCC email",
    "Green University Computer Club contact",
    "GUCC address",
    "Green University of Bangladesh CSE club",
  ],
  image: {
    eyebrow: "Contact",
    title: "Contact GUCC",
    subtitle: `${SITE.email} · ${PARENT_ORGANIZATION.name}`,
  },
});

const socials = [
  { icon: Facebook, href: "https://www.facebook.com/GreenUniversityComputerClub", label: "Facebook" },
  { icon: Linkedin, href: "https://www.linkedin.com/company/greenuniversitycomputerclub", label: "LinkedIn" },
  { icon: Instagram, href: "https://www.instagram.com/GreenUniversityComputerClub/", label: "Instagram" },
  { icon: Youtube, href: "https://www.youtube.com/@GreenUniversityComputerClub", label: "YouTube" },
  { icon: Github, href: "https://github.com/GreenUniversityComputerClub/", label: "GitHub" },
];

/** Where people usually want to go instead of writing. */
const shortcuts = [
  { icon: UserPlus, title: "Join the club", text: "Become a GUCC member", href: "/join" },
  { icon: CalendarDays, title: "Find an event", text: "Dates, places and registration", href: "/events" },
  { icon: Handshake, title: "Sponsor or partner", text: "See who supports us", href: "/sponsors" },
  { icon: Search, title: "Lost something?", text: "Campus lost & found", href: "/lost-found" },
];

const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${ADDRESS.latitude},${ADDRESS.longitude}`;
const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${ADDRESS.latitude},${ADDRESS.longitude}`;

export default function ContactPage() {
  return (
    <div className="bg-linear-to-b from-primary/5 via-background to-background">
      <JsonLd
        id="contact-schema"
        data={graph(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Contact", path: "/contact" },
          ]),
          {
            ...webPageSchema({
              name: "Contact GUCC",
              description: `Contact details for the ${SITE.name}.`,
              path: "/contact",
              type: "ContactPage",
            }),
            mainEntity: { "@id": ORGANIZATION_ID },
          },
        )}
      />
      <section className="container py-12 sm:py-20">
        <header className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Contact</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Get In Touch</h1>
          <p className="mt-4 text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
            Have a question, collaboration idea, or club request? Send GUCC a message and we will get back to you.
          </p>
        </header>

        {/* Phones: how to reach us, the form, then the rest. Wide screens: two columns, the form on the right. */}
        <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-x-12">
          <div className="lg:col-start-1">
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)]">
              <li className="flex min-w-0 items-start gap-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Mail className="h-5 w-5" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">Email us</h2>
                  <div className="flex items-center gap-1">
                    <a href={`mailto:${SITE.email}`} className="truncate text-primary underline-offset-4 hover:underline">{SITE.email}</a>
                    <CopyButton value={SITE.email} label="Copy email address" className="-my-2" />
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><Clock className="h-3.5 w-3.5" aria-hidden />We usually reply within a few days.</p>
                </div>
              </li>
              <li className="flex min-w-0 items-start gap-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><MapPin className="h-5 w-5" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">Visit us</h2>
                  <address className="mt-0.5 text-sm not-italic leading-6 text-muted-foreground">
                    Department of CSE, {PARENT_ORGANIZATION.name}<br />
                    {ADDRESS.streetAddress}, {ADDRESS.addressLocality}-{ADDRESS.postalCode}, Dhaka, Bangladesh
                  </address>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 font-medium text-primary hover:underline"><MapPin className="h-4 w-4" aria-hidden />Open in Maps</a>
                    <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 font-medium text-primary hover:underline"><Navigation className="h-4 w-4" aria-hidden />Directions</a>
                  </div>
                </div>
              </li>
            </ul>
          </div>

          <div className="lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start" id="message">
            <ContactForm />
          </div>

          <div className="space-y-6 lg:col-start-1">
            <div className="rounded-2xl border bg-card p-5 shadow-sm">
              <h2 className="font-semibold">Follow GUCC</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">News, photos and event announcements.</p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {socials.map(({ icon: Icon, href, label }) => (
                  <li key={label}>
                    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`GUCC on ${label}`}
                      className="inline-flex h-10 items-center gap-2 rounded-full border bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                      <Icon className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">{label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <nav aria-labelledby="shortcuts-heading" className="rounded-2xl border bg-card p-5 shadow-sm">
              <h2 id="shortcuts-heading" className="font-semibold">Maybe you&apos;re looking for</h2>
              <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                {shortcuts.map((s) => (
                  <li key={s.href}>
                    <Link href={s.href} className="group flex min-h-14 items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"><s.icon className="h-4 w-4" aria-hidden /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{s.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{s.text}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      </section>
    </div>
  );
}
