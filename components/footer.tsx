import Link from "next/link";
import { Facebook, Linkedin, Mail, ChevronRight, Youtube, Instagram, Github } from "lucide-react";
import Image from "next/image";
import { Contributors } from "./contributors";

export function Footer() {
  return (
    <footer className="w-full border-t bg-background">
      <div className="container py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Image
                src="/android-chrome-512x512.png"
                alt="GUCC Logo"
                width={48}
                height={48}
                className="h-12 w-auto"
              />
              <h2 className="text-lg font-semibold">
                Green University Computer Club
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              A dynamic and student-driven non-profit and non-political
              organization operating in collaboration with the Department of
              Computer Science and Engineering (CSE) at Green University of
              Bangladesh.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-4">Quick Links</h2>
            <ul className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2">
              {[
                ["/events", "Events"],
                ["/blog", "Blog"],
                ["/news", "News"],
                ["/executives", "Executives"],
                ["/contests", "Contests"],
                ["/join", "Join GUCC"],
                ["/sponsors", "Sponsors"],
                ["/contact", "Contact"],
              ].map(([href, label]) => (
                <li key={href}>
                  <Link href={href!} className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center">
                    <ChevronRight className="h-4 w-4 mr-1" aria-hidden />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="space-y-2">
              <li>
                <Link
                  href="https://green.edu.bd"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center"
                >
                  <ChevronRight className="h-4 w-4 mr-1" />
                  Main Website
                </Link>
              </li>

              <li>
                <Link
                  href="https://archive-cse.green.edu.bd/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center"
                >
                  <ChevronRight className="h-4 w-4 mr-1" />
                  Computer Science and Engineering
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-4">Contact Us</h2>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Green University of Bangladesh, Purbachal American City,
                Kanchan, Rupganj, Narayanganj-1461, Dhaka, Bangladesh
              </p>
              <p className="text-sm text-muted-foreground">
                Email: gucc@green.edu.bd
              </p>
              <div className="-ml-2.5 mt-3 flex flex-wrap">
                <Link
                  href="https://www.facebook.com/GreenUniversityComputerClub/"
                  aria-label="GUCC on Facebook"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                >
                  <Facebook size={20} aria-hidden />
                </Link>

                <Link
                  href="https://www.linkedin.com/company/greenuniversitycomputerclub/"
                  aria-label="GUCC on LinkedIn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                >
                  <Linkedin size={20} aria-hidden />
                </Link>
                <Link
                  href="mailto:gucc@green.edu.bd"
                  aria-label="Email GUCC"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                >
                  <Mail size={20} aria-hidden />
                </Link>
                <Link
                  href="https://www.instagram.com/GreenUniversityComputerClub/"
                  aria-label="GUCC on Instagram"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                >
                  <Instagram size={20} aria-hidden />
                </Link>
                <Link
                  href="https://www.youtube.com/@GreenUniversityComputerClub"
                  aria-label="GUCC on YouTube"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                >
                  <Youtube size={20} aria-hidden />
                </Link>
                <Link
                  href="https://github.com/GreenUniversityComputerClub"
                  aria-label="GUCC on GitHub"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                >
                  <Github size={20} aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t text-center">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Green University Computer Club. All
            rights reserved.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Built with ❤️ by the following GUCC Members
          </p>
          <div className="mt-4 flex justify-center">
            <Contributors />
          </div>
        </div>
      </div>
    </footer>
  );
}
