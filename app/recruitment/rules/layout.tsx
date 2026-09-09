import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Recruitment Rules & Eligibility",
  description: "The official rules, eligibility criteria and code of conduct for Green University Computer Club executive recruitment.",
  path: "/recruitment/rules",
  keywords: ["GUCC recruitment rules", "GUCC eligibility", "GUCC code of conduct"],
  image: {
    eyebrow: "Recruitment",
    title: "Recruitment Rules",
    subtitle: "Eligibility and code of conduct",
  },
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
