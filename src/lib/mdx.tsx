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

// Anchor: open external links safely; keep internal links as plain anchors.
function A({ href = "", ...props }: ComponentPropsWithoutRef<"a">) {
  const external = /^https?:\/\//.test(href);
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props} />
  ) : (
    <a href={href} {...props} />
  );
}

const components = { a: A };

export async function renderMdx(source: string): Promise<ReactElement> {
  const { default: MDXContent } = await evaluate(source, {
    ...runtime,
    baseUrl: import.meta.url,
  });
  return <MDXContent components={components} />;
}
