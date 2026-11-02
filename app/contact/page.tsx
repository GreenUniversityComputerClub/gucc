import Link from "next/link";
import { ArrowRight, CalendarDays, Clock, Facebook, Github, Instagram, Linkedin, Mail, MapPin, Search, UserPlus, Handshake, Youtube, Navigation } from "lucide-react";
import { ContactForm } from "@/components/contact-form";
import { PageHero } from "@/components/page-hero";
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

const mapEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(`${PARENT_ORGANIZATION.name}, Purbachal`)}&z=15&output=embed`;
const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${ADDRESS.latitude},${ADDRESS.longitude}`;
const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${ADDRESS.latitude},${ADDRESS.longitude}`;

export default function ContactPage() {
  return (
    <div>
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
      <PageHero
        icon={<Mail />}
        eyebrow="Contact"
        title={<>Let&apos;s build something <span className="text-gradient">together</span></>}
        description="Have a question, collaboration idea, or club request? Send GUCC a message and we will get back to you."
        aside={
          <div className="glass glow-border relative rounded-3xl p-5">
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-secondary">
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-secondary" />
              </span>
              Inbox open
            </p>
            <div className="mt-3 flex items-center gap-1">
              <a href={`mailto:${SITE.email}`} className="truncate font-display text-xl font-semibold text-foreground underline-offset-4 hover:underline">{SITE.email}</a>
              <CopyButton value={SITE.email} label="Copy email address" className="text-foreground/70 hover:bg-foreground/10 hover:text-foreground" />
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground/65"><Clock className="h-3.5 w-3.5" aria-hidden />We usually reply within a few days.</p>
          </div>
        }
      />

      <section className="container py-12 sm:py-16">
        {/* Phones: the form first, then the rest. Wide screens: channels on the left, the form on the right. */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-x-10">
          <div className="lg:sticky lg:top-24 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-start" id="message">
            <ContactForm />
          </div>

          {/* Where we are */}
          <div className="relative overflow-hidden rounded-3xl border bg-card lg:col-start-1 lg:row-start-1">
            {/* Loaded as it nears the screen; the space is reserved, and the links below work without it. */}
            <iframe
              src={mapEmbedUrl}
              title={`Map showing ${PARENT_ORGANIZATION.name}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              className="block h-64 w-full border-0 bg-muted sm:h-80"
            />
            <div className="p-5 sm:p-6">
              <h2 className="font-display text-lg font-semibold">Visit us</h2>
              <address className="mt-1 text-sm not-italic leading-6 text-muted-foreground">
                Department of CSE, {PARENT_ORGANIZATION.name}<br />
                {ADDRESS.streetAddress}, {ADDRESS.addressLocality}-{ADDRESS.postalCode}, Dhaka, Bangladesh
              </address>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><MapPin className="h-4 w-4" aria-hidden />Open in Maps</a>
                <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Navigation className="h-4 w-4" aria-hidden />Directions</a>
              </div>
            </div>
          </div>

          {/* Socials */}
          <div className="lg:col-start-1">
            <h2 className="font-display text-lg font-semibold">Follow GUCC</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">News, photos and event announcements.</p>
            <ul className="mt-4 grid grid-cols-5 gap-2 sm:gap-3">
              {socials.map(({ icon: Icon, href, label }) => (
                <li key={label}>
                  <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`GUCC on ${label}`}
                    className="lift group flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border bg-card text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Icon className="h-6 w-6 transition-transform duration-300 group-hover:scale-110" aria-hidden />
                    <span className="hidden text-[11px] font-medium sm:block">{label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Shortcuts */}
          <nav aria-labelledby="shortcuts-heading" className="lg:col-start-1">
            <h2 id="shortcuts-heading" className="font-display text-lg font-semibold">Maybe you&apos;re looking for</h2>
            <ul className="mt-4 divide-y divide-border/70 overflow-hidden rounded-3xl border bg-card">
              {shortcuts.map((s, i) => (
                <li key={s.href}>
                  <Link href={s.href} className="group flex min-h-16 items-center gap-4 px-5 py-3 transition-colors hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-none">
                    <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-secondary/15 text-primary transition-transform duration-300 group-hover:scale-110"><s.icon className="h-[18px] w-[18px]" aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{s.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{s.text}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 -translate-x-1 text-muted-foreground transition-all group-hover:translate-x-0 group-hover:text-primary" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>
    </div>
  );
}
