import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Programming Contests — ICPC, IUPC & Hackathon Results",
  description: "Competitive programming results for Green University of Bangladesh: ICPC, IUPC, NCPC, Code Samurai and hackathon participation by GUCC teams, with team rosters, ranks and standings.",
  path: "/contests",
  keywords: ["GUCC contests", "GUB ICPC", "IUPC Bangladesh", "NCPC", "competitive programming Bangladesh", "Green University programming team", "Code Samurai"],
  image: {
    eyebrow: "Contests",
    title: "GUCC Programming Contests",
    subtitle: "ICPC, IUPC and hackathon results",
  },
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
