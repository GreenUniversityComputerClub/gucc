import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Events — Seminars, Workshops, Hackathons & Contests",
  description: "Every Green University Computer Club event: seminars, workshops, programming contests, hackathons and cultural programmes at Green University of Bangladesh. Browse upcoming and past GUCC events with dates, speakers and venues.",
  path: "/events",
  keywords: ["GUCC events", "Green University Computer Club events", "GUB seminar", "tech workshop Bangladesh", "hackathon Bangladesh", "programming contest Dhaka", "university tech events"],
  image: {
    eyebrow: "Events",
    title: "GUCC Events",
    subtitle: "Seminars, workshops, hackathons and contests",
  },
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
