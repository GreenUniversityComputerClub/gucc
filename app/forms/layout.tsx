import type { Metadata } from "next";

/** Each form page decides whether it is indexed (listed, open forms are; the rest are link-only). */
export const metadata: Metadata = {
  title: "Forms",
  description: "Forms from the Green University Computer Club (GUCC).",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
