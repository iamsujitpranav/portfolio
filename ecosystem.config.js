// PM2 manages BOTH processes on the Hostinger VPS:
//   portfolio-web  -> Next.js Node server  (localhost:61991)
//   portfolio-api  -> FastAPI via gunicorn (localhost:8000)
// Nginx sits in front and routes / -> :61991 and /api -> :8000.
//
// Deploy:  pm2 start ecosystem.config.js  &&  pm2 save  &&  pm2 startup
// Adjust `cwd` to wherever you cloned the repo on the server.
const ROOT = "/var/www/portfolio";

module.exports = {
  apps: [
    {
      name: "portfolio-web",
      cwd: ROOT,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 61991",
      interpreter: "node",
      instances: 1,
      autorestart: true,
      max_memory_restart: "400M",
      env: { NODE_ENV: "production", PORT: "61991" },
    },
    {
      name: "portfolio-api",
      cwd: `${ROOT}/backend`,
      // Use the venv's gunicorn with uvicorn workers (production ASGI server).
      script: "venv/bin/gunicorn",
      args: "app.main:app -k uvicorn.workers.UvicornWorker -w 2 -b 127.0.0.1:8000 --timeout 120",
      interpreter: "none",
      autorestart: true,
      max_memory_restart: "500M",
      // config.py loads backend/.env itself, so no env block needed here.
    },
  ],
};
