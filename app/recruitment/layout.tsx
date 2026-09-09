import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Executive Recruitment",
  description: "GUCC executive recruitment for Green University of Bangladesh students: available positions, selection rounds, eligibility and how to apply to join the Green University Computer Club executive committee.",
  path: "/recruitment",
  keywords: ["GUCC recruitment", "GUCC executive recruitment", "GUCC apply", "Green University Computer Club recruitment", "GUB club executive"],
  image: {
    eyebrow: "Recruitment",
    title: "GUCC Executive Recruitment",
    subtitle: "Positions, rounds and how to apply",
  },
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
