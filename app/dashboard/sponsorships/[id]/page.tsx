import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Eye, Star } from "lucide-react";
import { view } from "@/lib/api/session";
import type { getSponsorship } from "@/lib/server/services/sponsorships";
import type { SponsorshipContent } from "@/lib/sponsorship/content";
import { PageHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { SITE_URL } from "@/lib/seo/site";
import { dhakaDateTime } from "@/lib/time";
import { saveSponsorshipAction } from "../../actions";
import { SponsorshipEditor } from "../editor";

export const metadata: Metadata = { title: "Edit sponsorship page", robots: { index: false, follow: false } };

/** Edit one sponsorship page: its address, title, summary, visibility and every section of its content. */
export default async function EditSponsorship({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await view<Awaited<ReturnType<typeof getSponsorship>>>("sponsorships.get", { id }, `/dashboard/sponsorships/${id}`);
  const state = p.is_default ? "The default: the navbar's Sponsors link opens this page." : p.status === "ACTIVE" ? "Public, listed at /become-a-sponsor." : "Hidden: only people who manage sponsorship pages see it, here and in the preview.";
  return (
    <>
      <PageHeader title={p.title} back={{ href: "/dashboard/sponsorships", label: "Sponsorship pages" }}
        description={`${state} Last saved ${dhakaDateTime(p.updated_at)}.`}
        actions={
          <div className="flex flex-wrap gap-2">
            {p.is_default ? <span className="inline-flex items-center gap-1 self-center rounded-full bg-primary px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-primary-foreground"><Star className="h-3 w-3" aria-hidden />Default</span> : null}
            <Button asChild variant="outline" className="min-h-10 gap-1.5"><Link href={`/sponsors/preview/${p.id}`} target="_blank" prefetch={false}><Eye className="h-4 w-4" aria-hidden />Preview</Link></Button>
            {p.status === "ACTIVE" && <Button asChild variant="outline" className="min-h-10 gap-1.5"><Link href={`/sponsors/${p.slug}`} target="_blank" prefetch={false}>View page<ExternalLink className="h-4 w-4" aria-hidden /></Link></Button>}
          </div>
        } />
      <SponsorshipEditor action={saveSponsorshipAction.bind(null, p.id)} siteHost={new URL(SITE_URL).host}
        page={{ id: p.id, title: p.title, slug: p.slug, summary: p.summary, status: p.status, isDefault: Boolean(p.is_default), updatedAt: p.updated_at, content: JSON.parse(p.content) as SponsorshipContent }} />
    </>
  );
}
