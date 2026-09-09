import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
  description: "The page you are looking for does not exist.",
  // Required: without it the root layout's `index, follow` is inherited and
  // contradicts the `noindex` Next emits for not-found.
  robots: { index: false, follow: true },
};

const SUGGESTIONS = [
  { href: "/executives", label: "Executives" },
  { href: "/events", label: "Events" },
  { href: "/contests", label: "Contests" },
  { href: "/blog", label: "Blog" },
  { href: "/join", label: "Join GUCC" },
  { href: "/contact", label: "Contact" },
];

export default function NotFound() {
  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
        404
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
        This page doesn&apos;t exist
      </h1>
      <p className="mt-4 max-w-md text-muted-foreground">
        The link may be out of date, or the page may have moved. Here is where
        most people go next.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((item) => (
          <Button key={item.href} asChild variant="outline" size="sm">
            <Link href={item.href}>{item.label}</Link>
          </Button>
        ))}
      </div>

      <Button asChild className="mt-8">
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
