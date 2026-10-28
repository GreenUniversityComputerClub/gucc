import Link from "next/link";
import { ArrowRight, ArrowUpRight, Facebook, Github, Heart, Instagram, Linkedin, Mail, MapPin, Youtube } from "lucide-react";
import Image from "next/image";
import { Contributors } from "./contributors";

const SOCIALS = [
  { href: "https://www.facebook.com/GreenUniversityComputerClub/", label: "Facebook", icon: Facebook },
  { href: "https://www.linkedin.com/company/greenuniversitycomputerclub/", label: "LinkedIn", icon: Linkedin },
  { href: "https://www.instagram.com/GreenUniversityComputerClub/", label: "Instagram", icon: Instagram },
  { href: "https://www.youtube.com/@GreenUniversityComputerClub", label: "YouTube", icon: Youtube },
  { href: "https://github.com/GreenUniversityComputerClub", label: "GitHub", icon: Github },
];

const EXPLORE = [
  ["/events", "Events"],
  ["/blog", "Blog"],
  ["/news", "News"],
  ["/executives", "Executives"],
  ["/contests", "Contests"],
  ["/sponsors", "Sponsors"],
  ["/join", "Join GUCC"],
  ["/contact", "Contact"],
] as const;

const UNIVERSITY = [
  ["https://green.edu.bd", "Green University"],
  ["https://archive-cse.green.edu.bd/", "Department of CSE"],
] as const;

const linkClass =
  "group inline-flex min-h-8 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded";

export function Footer() {
  return (
    <footer className="relative isolate w-full overflow-hidden border-t border-border/60 bg-background">
      {/* Aurora light at the horizon */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-1/2 h-64 w-[80%] -translate-x-1/2 rounded-full bg-primary/15 blur-[100px]" />
        <div className="absolute -bottom-24 right-0 h-56 w-1/2 rounded-full bg-secondary/10 blur-[100px]" />
        <div className="absolute inset-0 bg-grid opacity-50" />
      </div>

      <div className="container px-4 py-14 md:px-6 md:py-20">
        {/* Call to action */}
        <div className="glass glow-border relative mb-16 flex flex-col items-start justify-between gap-6 rounded-3xl p-8 md:flex-row md:items-center md:p-10">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-secondary">Open to every CSE student</p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight md:text-3xl">
              Ready to build something <span className="text-gradient">extraordinary</span>?
            </h2>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link href="/join" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
              Join GUCC <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/contact" className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-background/50 px-6 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Get in touch
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <Link href="/" className="inline-flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Image src="/android-chrome-192x192.png" alt="" width={48} height={48} className="h-12 w-12" />
              <span className="leading-tight">
                <span className="block font-display text-lg font-bold">Green University</span>
                <span className="block font-mono text-xs tracking-[0.2em] text-muted-foreground">COMPUTER CLUB</span>
              </span>
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
              A dynamic, student-driven, non-profit and non-political organization working with the Department of
              Computer Science and Engineering at Green University of Bangladesh.
            </p>
            <div className="-ml-2 mt-5 flex flex-wrap">
              {SOCIALS.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={`GUCC on ${s.label}`}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <s.icon className="h-[18px] w-[18px]" aria-hidden />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-foreground">Explore</h2>
            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-1">
              {EXPLORE.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className={linkClass}>
                    <span className="h-px w-0 bg-primary transition-all duration-300 group-hover:w-3" aria-hidden />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-foreground">University</h2>
            <ul className="mt-4 space-y-1">
              {UNIVERSITY.map(([href, label]) => (
                <li key={href}>
                  <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    {label}
                    <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-foreground">Contact</h2>
            <address className="mt-4 space-y-3 text-sm not-italic text-muted-foreground">
              <p className="flex gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                Green University of Bangladesh, Purbachal American City, Kanchan, Rupganj, Narayanganj-1461, Dhaka, Bangladesh
              </p>
              <a href="mailto:gucc@green.edu.bd" className="flex items-center gap-2.5 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                gucc@green.edu.bd
              </a>
            </address>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center gap-4 border-t border-border/60 pt-8 text-center">
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            Built with <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" aria-label="love" /> by these GUCC members
          </p>
          <Contributors />
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Green University Computer Club. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
