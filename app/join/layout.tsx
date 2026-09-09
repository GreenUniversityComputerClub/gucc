import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Join GUCC — Membership & Executive Recruitment",
  description: "Join the Green University Computer Club. Find out how membership and executive recruitment work at GUCC, what each role involves, and when the next recruitment cycle opens at Green University of Bangladesh.",
  path: "/join",
  keywords: ["join GUCC", "GUCC recruitment", "GUCC membership", "Green University Computer Club join", "GUB club recruitment", "student club application"],
  image: {
    eyebrow: "Membership",
    title: "Join GUCC",
    subtitle: "Membership and executive recruitment",
  },
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
