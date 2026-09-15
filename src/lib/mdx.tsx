import { evaluate } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import type { ComponentPropsWithoutRef, ReactElement } from "react";

/**
 * Render MDX source to a React tree using the APP's own React runtime.
 *
 * We deliberately avoid `next-mdx-remote/rsc`: its `/rsc` entry bundles its own
 * copy of `react/jsx-runtime`, so the elements it creates come from a different
 * React instance. Next 15's server prerenderer rejects those with
 * "A React Element from an older version of React was rendered." Binding
 * `@mdx-js/mdx`'s `evaluate` to `react/jsx-runtime` here guarantees a single React.
 */

// Anchor: permit only safe navigations; MDX content is admin-authored but still
// treated as untrusted at render time.
function safeHref(raw: string): string {
  const href = raw.trim();
  if (!href || (href.startsWith("/") && !href.startsWith("//")) || href.startsWith("#") || href.startsWith("./") || href.startsWith("../")) return href;
  try {
    const url = new URL(href, "https://portfolio.invalid");
    if (["https:", "mailto:", "tel:"].includes(url.protocol)) return href;
  } catch {
    // Invalid URLs become inert links.
  }
  return "#";
}

export function assertSafeMdx(source: string): void {
  const plain = source.replace(/```[\s\S]*?```|`[^`]*`/g, "");
  if (
    /(?:^|\n)\s*(?:import|export)\b/m.test(plain) ||
    /<\s*\/?\s*[A-Za-z][^>]*>/.test(plain) ||
    /[{}]/.test(plain) ||
    /\]\(\s*(?:javascript|data|vbscript):/i.test(plain)
  ) {
    throw new Error("unsafe MDX content");
  }
}

function A({ href = "", ...props }: ComponentPropsWithoutRef<"a">) {
  const safe = safeHref(href);
  const external = /^https:\/\//.test(safe);
  return external ? (
    <a href={safe} target="_blank" rel="noopener noreferrer" {...props} />
  ) : (
    <a href={safe} {...props} />
  );
}

const components = { a: A };

export async function renderMdx(source: string): Promise<ReactElement> {
  assertSafeMdx(source);
  const { default: MDXContent } = await evaluate(source, {
    ...runtime,
    baseUrl: import.meta.url,
  });
  return <MDXContent components={components} />;
}
