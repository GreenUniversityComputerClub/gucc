import type { Metadata } from "next";
import { view } from "@/lib/api/session";
import type { getSponsorship } from "@/lib/server/services/sponsorships";
import { PreviewClient } from "./preview-client";

// Per person (it needs the right to manage sponsorship pages) and never cached.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sponsorship page preview", robots: { index: false, follow: false } };

/**
 * A sponsorship page as the public will see it, hidden or not, for the people who edit it. With
 * the editor open in another tab it shows the unsaved edits as they're typed.
 */
export default async function SponsorshipPreview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ bare?: string }> }) {
  const { id } = await params;
  const bare = (await searchParams).bare === "1";
  const p = await view<Awaited<ReturnType<typeof getSponsorship>>>("sponsorships.get", { id }, `/sponsors/preview/${id}`);
  return <PreviewClient id={p.id} title={p.title} slug={p.slug} status={p.status} saved={JSON.parse(p.content) as Record<string, unknown>} savedAt={p.updated_at} bare={bare} />;
}
