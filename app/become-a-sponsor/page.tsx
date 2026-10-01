import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Handshake, Mail, Package, Sparkles, Star } from "lucide-react";
import { getSponsorships } from "@/lib/public/data";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata } from "@/lib/seo/metadata";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/schema";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Cached; refreshed when a sponsorship page is edited in the dashboard.
export const revalidate = 21600;

const DESCRIPTION = "Sponsor the Green University Computer Club: every sponsorship opportunity open now, from flagship events to contests and workshops, with packages and how to reach us.";

export const metadata: Metadata = buildMetadata({
  title: "Become a Sponsor",
  description: DESCRIPTION,
  path: "/become-a-sponsor",
  keywords: ["sponsor GUCC", "GUCC sponsorship", "tech sponsorship Bangladesh", "hackathon sponsor Bangladesh", "student club sponsorship"],
  image: { eyebrow: "Partners", title: "Become a Sponsor", subtitle: "Every GUCC sponsorship opportunity" },
});

/**
 * Every active sponsorship opportunity, the featured one (the dashboard's default, where the
 * navbar's Sponsors link goes) first and highlighted. Each card opens that opportunity's page.
 */
export default async function BecomeASponsor() {
  const pages = await getSponsorships();
  const featured = pages.find((p) => p.isDefault) ?? null;
  const others = pages.filter((p) => p !== featured);
  return (
    <div className="relative overflow-hidden">
      <JsonLd id="become-a-sponsor" data={graph(
        breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Become a sponsor", path: "/become-a-sponsor" }]),
        webPageSchema({ name: "Become a Sponsor", description: DESCRIPTION, path: "/become-a-sponsor" }),
      )} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent" aria-hidden />
      <div className="container relative max-w-6xl px-4 py-12 sm:py-16">
        <header className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            <Handshake className="h-3.5 w-3.5" aria-hidden />Partner with GUCC
          </span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">Become a sponsor</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Reach 7,000+ students and the next generation of engineers. Choose an opportunity below, or tell us what you have in mind.
          </p>
        </header>

        {pages.length === 0 ? (
          <div className="mx-auto mt-12 max-w-lg rounded-2xl border border-dashed bg-card p-8 text-center">
            <p className="font-medium">No sponsorship opportunity is open right now.</p>
            <p className="mt-1 text-sm text-muted-foreground">We still welcome partners: write to us and we&apos;ll find the right fit.</p>
            <Button asChild className="mt-5 min-h-11 gap-2"><Link href="/contact?topic=partnership"><Mail className="h-4 w-4" aria-hidden />Contact us</Link></Button>
          </div>
        ) : (
          <div className="mt-12 space-y-6">
            {featured && <OpportunityCard page={featured} featured />}
            {others.length > 0 && (
              <section aria-label="More sponsorship opportunities">
                {featured && <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">More opportunities</h2>}
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {others.map((p) => <li key={p.slug} className="h-full"><OpportunityCard page={p} /></li>)}
                </ul>
              </section>
            )}
          </div>
        )}

        <section className="mt-12 flex flex-col items-start gap-4 rounded-2xl border bg-card p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="text-lg font-semibold">Something else in mind?</h2>
            <p className="mt-1 text-sm text-muted-foreground">Workshops, hiring events, prizes or a long-term partnership: we&apos;ll shape it with you.</p>
          </div>
          <Button asChild variant="outline" className="min-h-11 shrink-0 gap-2"><Link href="/contact?topic=partnership"><Mail className="h-4 w-4" aria-hidden />Talk to us</Link></Button>
        </section>
      </div>
    </div>
  );
}

function OpportunityCard({ page, featured = false }: { page: Awaited<ReturnType<typeof getSponsorships>>[number]; featured?: boolean }) {
  const name = page.event?.fullName ?? page.event?.name ?? page.title;
  return (
    <Link href={`/sponsors/${page.slug}`} prefetch={false}
      className={cn("group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        featured && "border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8")}>
      {featured && <span className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" aria-hidden />}
      <div className="relative flex flex-wrap items-center gap-2">
        {featured ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary-foreground"><Star className="h-3 w-3" aria-hidden />Featured</span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><Sparkles className="h-3 w-3" aria-hidden />Open</span>
        )}
        {page.packages > 0 && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Package className="h-3.5 w-3.5" aria-hidden />{page.packages} package{page.packages === 1 ? "" : "s"}</span>}
      </div>
      <h3 className={cn("relative mt-3 font-bold tracking-tight group-hover:text-primary", featured ? "text-2xl sm:text-3xl" : "text-lg")}>{name}</h3>
      {page.title !== name && <p className="relative text-sm font-medium text-muted-foreground">{page.title}</p>}
      {page.summary && <p className={cn("relative mt-2 text-muted-foreground", featured ? "max-w-2xl" : "line-clamp-3 text-sm")}>{page.summary}</p>}
      <span className={cn("relative mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold text-primary")}>
        {featured ? "See packages and benefits" : "View opportunity"}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
      </span>
    </Link>
  );
}
