import type { Metadata } from "next";
import "./admin.css";

// Nothing under /admin is public. `noindex, nofollow` is belt-and-braces next
// to the password wall — the wall is what protects the data; this just keeps
// the URL out of search results and out of a crawler's link graph.
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
