import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticle } from "@/lib/articles";
import { renderMdx } from "@/lib/mdx";
import Footer from "@/components/Footer";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) return { title: "Not found" };
  return { title: `${article.title} — Sujit Pranav Reddy`, description: article.description };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) notFound();

  const body = await renderMdx(article.content);

  return (
    <main>
      <article className="article">
        <Link className="back" href="/blog">← all writing</Link>
        <h1>{article.title}</h1>
        <div className="meta">
          <span>{formatDate(article.date)}</span>
          {article.readingTime && <span>{article.readingTime}</span>}
          {article.tags.map((t) => (
            <span key={t} style={{ color: "var(--accent)" }}>
              #{t}
            </span>
          ))}
        </div>
        <div className="prose">{body}</div>
      </article>
      <Footer />
    </main>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
