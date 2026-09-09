import type React from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./blog/[slug]/blog.css";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import FloatingChatbot from "@/components/chatbot/floating-chatbot";
import { ThemeProvider } from "@/components/theme-provider";
import DeadlinePopup from "@/components/DeadlinePopup";
import { JsonLd } from "@/components/seo/json-ld";
import { SITE, SITE_KEYWORDS, SITE_URL } from "@/lib/seo/site";
import { graph, organizationSchema, websiteSchema } from "@/lib/seo/schema";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE.name} (${SITE.shortName}) — Green University of Bangladesh`,
    // Page titles read "<page> | Green University Computer Club (GUCC)".
    template: `%s | ${SITE.name} (${SITE.shortName})`,
  },
  description: SITE.description,
  keywords: [...SITE_KEYWORDS],
  applicationName: SITE.name,
  category: "education",
  authors: [{ name: SITE.name, url: `${SITE_URL}/` }],
  creator: SITE.name,
  publisher: SITE.name,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: `${SITE.name} (${SITE.shortName})`,
    description: SITE.description,
    url: `${SITE_URL}/`,
    locale: SITE.locale,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} (${SITE.shortName})`,
    description: SITE.shortDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Large image previews are what put executive portraits in the SERP.
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/android-chrome-192x192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: ["/favicon.ico"],
  },
  manifest: "/site.webmanifest",
  appleWebApp: {
    capable: true,
    title: SITE.shortName,
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : {},
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        {/* Warm up the origins the first paint depends on. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://github.com" />
      </head>
      <body style={{ fontFamily: 'var(--font-sans)' }} suppressHydrationWarning>{/* Using system font fallback */}
        {/* Site-wide entity graph: consolidates GUCC as one entity for search engines. */}
        <JsonLd id="gucc-site-schema" data={graph(organizationSchema(), websiteSchema())} />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={true}
          disableTransitionOnChange={false}
        >
          <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
            <FloatingChatbot />
            <DeadlinePopup />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
