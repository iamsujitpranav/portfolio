/** @type {import('next').NextConfig} */

// Where the FastAPI (Python) backend runs. Overridable per environment.
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["three"],
  // Don't advertise the framework version to anyone scanning for known Next
  // CVEs. (The rest of the security headers are set at the edge, in
  // deploy/nginx.prod.conf.template, so they cover static files too.)
  poweredByHeader: false,
  // Emit the minimal self-contained Node server consumed by the production
  // Docker image instead of copying the full source tree and node_modules.
  output: "standalone",
  // The local preview is opened through both localhost and 127.0.0.1. Allow
  // the latter to receive dev HMR updates instead of leaving a stale card on
  // screen after JourneyOverlay changes.
  allowedDevOrigins: ["127.0.0.1"],
  async rewrites() {
    // Frontend code always fetches same-origin "/api/*".
    // In dev (and if a request ever reaches Node in prod) Next proxies it to
    // FastAPI. In production, Nginx routes /api/* straight to uvicorn so this
    // rewrite is just a safety net.
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
