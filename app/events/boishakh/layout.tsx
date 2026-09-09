import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Pohela Boishakh at GUCC",
  description: "Pohela Boishakh celebrations hosted by the Green University Computer Club — the Bengali New Year programme at Green University of Bangladesh.",
  path: "/events/boishakh",
  keywords: ["Pohela Boishakh", "GUCC Boishakh", "Bengali New Year Green University", "Boishakh celebration Dhaka"],
  image: {
    eyebrow: "Celebration",
    title: "Pohela Boishakh",
    subtitle: "Bengali New Year at Green University",
  },
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
