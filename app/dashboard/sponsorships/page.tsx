import type { Metadata } from "next";
import Link from "next/link";
import { EyeOff, Globe, LayoutList, Star } from "lucide-react";
import { view } from "@/lib/api/session";
import { getSponsorship } from "@/lib/public/data";
import type { listSponsorships } from "@/lib/server/services/sponsorships";
import { EmptyState, PageHeader, Section } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import {
  deleteSponsorshipAction, duplicateSponsorshipAction, moveSponsorshipAction, saveSponsorshipAction, setDefaultSponsorshipAction, setSponsorshipStatusAction,
} from "../actions";
import { SponsorshipList } from "./list";
import { NewSponsorshipForm, type ClubParts } from "./new-page";

export const metadata: Metadata = { title: "Sponsorship pages", robots: { index: false, follow: false } };

/**
 * Sponsorship pages: each opportunity's public page (one event, or the whole club), which one the
 * navbar's Sponsors link opens (the default), which are public, their order on /become-a-sponsor,
 * and new ones from a template. Changing the default never hides the others.
 */
export default async function SponsorshipsAdmin() {
  const pages = await view<Awaited<ReturnType<typeof listSponsorships>>>("sponsorships.list", {}, "/dashboard/sponsorships");
  const def = pages.find((p) => p.is_default) ?? null;
  // New pages start with the club's real contacts, partner logos and record (from the default page).
  const defContent = def && def.status === "ACTIVE" ? (await getSponsorship(def.slug))?.content as ClubParts | undefined : undefined;
  const club: ClubParts | null = defContent ? { contacts: defContent.contacts, previousPartners: defContent.previousPartners, achievements: defContent.achievements } : null;
  const active = pages.filter((p) => p.status === "ACTIVE").length;
  const stats = [
    { label: "Pages", value: String(pages.length), icon: LayoutList },
    { label: "Public", value: String(active), icon: Globe },
    { label: "Hidden", value: String(pages.length - active), icon: EyeOff },
    { label: "Navbar opens", value: def?.title ?? "/become-a-sponsor", icon: Star, href: def ? `/dashboard/sponsorships/${def.id}` : undefined },
  ];
  return (
    <>
      <PageHeader title="Sponsorship pages"
        description="Every sponsorship opportunity has its own public page, and /become-a-sponsor lists the public ones. The default is where the navbar's Sponsors link goes; changing it never hides or removes the others."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild className="min-h-10"><Link href="#new-page">New page</Link></Button>
            <Button asChild variant="outline" className="min-h-10"><Link href="/become-a-sponsor" target="_blank" prefetch={false}>View /become-a-sponsor</Link></Button>
          </div>
        } />

      <dl className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          const body = (
            <>
              <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"><Icon className="h-3.5 w-3.5" aria-hidden />{s.label}</dt>
              <dd className="mt-1 truncate text-xl font-bold tracking-tight" title={s.value}>{s.value}</dd>
            </>
          );
          return s.href
            ? <Link key={s.label} href={s.href} prefetch={false} className="block min-w-0 rounded-xl border bg-card p-4 hover:border-primary/40">{body}</Link>
            : <div key={s.label} className="min-w-0 rounded-xl border bg-card p-4">{body}</div>;
        })}
      </dl>

      {pages.length === 0
        ? <EmptyState>No sponsorship pages yet. Start one below: the whole-club page works for any company.</EmptyState>
        : <SponsorshipList rows={pages} actions={{
            setDefault: setDefaultSponsorshipAction, setStatus: setSponsorshipStatusAction, duplicate: duplicateSponsorshipAction,
            remove: deleteSponsorshipAction, move: moveSponsorshipAction,
          }} />}

      <Section id="new-page" title="Start a new sponsorship page" className="mt-10 scroll-mt-20"
        description="It starts hidden: fill in its sections, check the preview, then make it public (or the default). To reuse a page's content and look, use Duplicate in the list.">
        <NewSponsorshipForm action={saveSponsorshipAction.bind(null, null)} club={club} />
      </Section>
    </>
  );
}
