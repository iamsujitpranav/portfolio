// Server-side data layer for blog articles, backed by the FastAPI + Postgres API.
// The database is the source of truth (the old content/articles/*.mdx files were
// migrated in and are now just a seed). These run in Server Components, so they
// hit the backend DIRECTLY — not through the Next /api proxy.

const API_BASE = process.env.BACKEND_URL || "http://127.0.0.1:8010";

export type ArticleMeta = {
  slug: string;
  title: string;
  description: string;
  date: string; // ISO — from the API's published_at
  tags: string[];
  readingTime: string;
};

export type Article = ArticleMeta & { content: string };

type ApiMeta = {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  reading_time: string;
  published_at: string | null;
};

type ApiDetail = ApiMeta & { body: string };

// Map the API's snake_case shape onto the camelCase shape the pages already use.
function mapMeta(a: ApiMeta): ArticleMeta {
  return {
    slug: a.slug,
    title: a.title,
    description: a.description,
    date: a.published_at ?? "",
    tags: a.tags ?? [],
    readingTime: a.reading_time ?? "",
  };
}

export async function getAllArticles(): Promise<ArticleMeta[]> {
  try {
    const res = await fetch(`${API_BASE}/api/articles`, { cache: "no-store" });
    if (!res.ok) return [];
    const data: ApiMeta[] = await res.json();
    return data.map(mapMeta);
  } catch {
    // Backend down (e.g. during a build with no DB) — degrade to an empty list.
    return [];
  }
}

export async function getArticle(slug: string): Promise<Article | null> {
  try {
    const res = await fetch(`${API_BASE}/api/articles/${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const a: ApiDetail = await res.json();
    return { ...mapMeta(a), content: a.body };
  } catch {
    return null;
  }
}

export async function getArticleSlugs(): Promise<string[]> {
  const all = await getAllArticles();
  return all.map((a) => a.slug);
}
