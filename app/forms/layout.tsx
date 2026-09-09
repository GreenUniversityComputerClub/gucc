import type { Metadata } from "next";

/** Private / transactional area — kept out of the search index. */
export const metadata: Metadata = {
  title: "Forms",
  description: "GUCC forms.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
