import type { MetadataRoute } from "next";

import { getAllArticles } from "@/lib/articles";
import { siteUrl } from "@/lib/site";

// Articles live in Postgres and are published from /admin, so a sitemap frozen
// at build time would miss every post written after the last deploy. Rendered
// per request instead — it's a handful of rows and search engines fetch it
// rarely. getAllArticles degrades to [] when the backend is unreachable, so a
// build with no database still succeeds.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await getAllArticles();

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${siteUrl}/blog`,
      lastModified: articles[0]?.date ? new Date(articles[0].date) : new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...articles.map((article) => ({
      url: `${siteUrl}/blog/${article.slug}`,
      // Falls back to "now" for a post with no published_at — better a fuzzy
      // date than an Invalid Date, which Next renders as an empty tag.
      lastModified: article.date ? new Date(article.date) : new Date(),
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
}
