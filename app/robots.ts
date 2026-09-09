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
    "/protected/",
    "/forms/dashboard",
    "/executives/certs/",
    "/certificates/hacktheai/verify",
  ];

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/api/og"],
        disallow,
      },
      // Explicitly welcome the crawlers that matter, with no crawl delay.
      { userAgent: ["Googlebot", "Googlebot-Image", "Bingbot"], allow: ["/", "/api/og"], disallow },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
