/**
 * The canonical public origin, in one place.
 *
 * NEXT_PUBLIC_SITE_URL is baked in at build time (Dockerfile build arg, set
 * from .env.prod). The literal fallback is the production domain rather than
 * localhost so a build that forgot the variable still emits real canonical
 * URLs, sitemap entries and OG tags instead of advertising a dev server.
 *
 * Trailing slashes are stripped so callers can always write `${siteUrl}/path`.
 */
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://sujitpranavreddy.dev"
).replace(/\/+$/, "");
