import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

/**
 * /robots.txt
 *
 * Everything public is crawlable. /admin is behind a password wall and already
 * sends `noindex` in its metadata — repeating it here keeps crawlers from
 * spending requests on a login screen. /api is machine-only and includes the
 * metered Claude endpoint, which is the last thing that should be crawled.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/admin/", "/api/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
