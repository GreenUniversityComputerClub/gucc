import Link from "next/link";
import { Facebook, Github, Linkedin, Mail, MapPin } from "lucide-react";
import { ContactForm } from "@/components/contact-form";
import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata } from "@/lib/seo/metadata";
import { ADDRESS, PARENT_ORGANIZATION, SITE } from "@/lib/seo/site";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/schema";

export const metadata: Metadata = buildMetadata({
  title: "Contact GUCC",
  description: `Get in touch with the Green University Computer Club. Email ${SITE.email}, use the contact form, or find us at ${PARENT_ORGANIZATION.name}, ${ADDRESS.addressLocality}, Bangladesh.`,
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
  {
    icon: Github,
    href: "https://github.com/GreenUniversityComputerClub/",
    label: "Github",
  },
  {
    icon: Linkedin,
    href: "https://www.linkedin.com/company/greenuniversitycomputerclub",
    label: "LinkedIn",
  },
  {
    icon: Facebook,
    href: "https://www.facebook.com/groups/greenuniversitycomputerclub",
    label: "Facebook",
  },
];

export default function ContactPage() {
  return (
    <main className="bg-background">
      <JsonLd
        id="contact-schema"
        data={graph(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Contact", path: "/contact" },
          ]),
          webPageSchema({
            name: "Contact GUCC",
            description: `Contact details for the ${SITE.name}.`,
            path: "/contact",
            type: "ContactPage",
          })
        )}
      />
      <section className="container mx-auto px-4 py-16 sm:py-24">
        <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              Contact
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Get In Touch
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              Have a question, collaboration idea, or club request? Send GUCC a
              message and we will get back to you.
            </p>

            <div className="mt-8 space-y-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Mail className="h-5 w-5" />
                </span>
                <span>Reach the club through the contact form.</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <MapPin className="h-5 w-5" />
                </span>
                <span>Green University Computer Club</span>
              </div>
            </div>

            <div className="mt-8 flex items-center gap-3">
              {socials.map(({ icon: Icon, href, label }) => (
                <Link
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <Icon className="h-5 w-5" />
                </Link>
              ))}
            </div>
          </div>

          <ContactForm />
        </div>
      </section>
    </main>
  );
}
