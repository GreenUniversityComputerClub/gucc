import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Sponsors & Partners",
  description: "The organisations that sponsor and support the Green University Computer Club. Meet GUCC's partners and learn how your company can sponsor our events, hackathons and programming contests.",
  path: "/sponsors",
  keywords: ["GUCC sponsors", "sponsor GUCC", "tech sponsorship Bangladesh", "hackathon sponsor Bangladesh", "student club sponsorship"],
  image: {
    eyebrow: "Partners",
    title: "GUCC Sponsors",
    subtitle: "The organisations backing our events",
  },
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
