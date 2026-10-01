import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";

/**
 * Crawling policy. Everything public is open; authenticated, transactional and
 * generated-document routes are kept out of the index so they cannot dilute it.
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = [
    "/api/",
    "/auth/",
    "/dashboard",
    "/admin",
    "/account",
    "/forms/dashboard",
    "/executives/certs/",
    "/certificates/hacktheai/verify",
    "/sponsors/preview/",
  ];

  return {
    rules: [
      {
        userAgent: "*",
        // Social cards: X and others obey robots.txt, and the longer rule wins over "/api/".
        allow: ["/", "/og-default.png", "/api/og"],
        disallow,
      },
      // Explicitly welcome the crawlers that matter, with no crawl delay.
      { userAgent: ["Googlebot", "Googlebot-Image", "Bingbot"], allow: ["/", "/og-default.png", "/api/og"], disallow },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
