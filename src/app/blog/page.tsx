import type { Metadata } from "next";
import Link from "next/link";
import { getAllArticles } from "@/lib/articles";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Writing — Sujit Pranav Reddy",
  description: "Notes on engineering leadership, Rails, and shipping AI in production.",
};

export const dynamic = "force-dynamic";

export default async function BlogIndex() {
  const articles = await getAllArticles();
  return (
    <main>
      <div className="article" style={{ paddingBottom: 40 }}>
        <Link className="back" href="/">← back to portfolio</Link>
        <div className="eyebrow">writing</div>
        <h1 style={{ marginBottom: 8 }}>Notes on building</h1>
        <p className="meta" style={{ marginBottom: 0 }}>
          Engineering leadership · Rails · shipping AI in production
        </p>
      </div>
      <div className="wrap" style={{ paddingBottom: 110 }}>
        <div className="cardlist">
          {articles.length === 0 && (
            <p className="lede">No articles yet — drop an <code>.mdx</code> file in <code>content/articles/</code>.</p>
          )}
          {articles.map((a) => (
            <Link className="card" key={a.slug} href={`/blog/${a.slug}`}>
              <h3>{a.title}</h3>
              <p>{a.description}</p>
              <div className="cmeta">
                <span>{formatDate(a.date)}</span>
                {a.readingTime && <span>{a.readingTime}</span>}
                {a.tags.slice(0, 3).map((t) => (
                  <span className="t" key={t}>
                    #{t}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </div>
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
