/** @type {import('next').NextConfig} */

// Where the FastAPI (Python) backend runs. Overridable per environment.
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["three"],
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
