# Sujit Pranav Reddy — Portfolio

An interactive developer portfolio: an immersive **3D "journey" homepage** (an
avatar walks a snowy procedural trail past résumé stops, a village, day↔night,
and mini-games), a WebGL hero, a ⌘K command palette, smooth scroll, an MDX
blog, and an **"Ask my résumé"** chat powered by Claude with pgvector RAG.
Frontend is Next.js; the AI + contact backend is FastAPI (Python).

The journey overlays the classic site (which stays in the DOM for SEO). It
auto-launches on capable desktops; mobile / reduced-motion / no-WebGL visitors
get the classic site with an opt-in pill. In the journey: click signposts to
walk, **Space** to jump obstacles, click snowmen to throw snowballs, walk
through gems for résumé facts, and find the tic-tac-toe kiosk in the village.
Optional extra assets are documented in `JOURNEY_ASSETS.md`.

## Architecture

```
                     Nginx (:443, TLS)
                       │
        ┌──────────────┴───────────────┐
        │ /                            │ /api/*
        ▼                              ▼
  Next.js (Node, :3000)         FastAPI (uvicorn/gunicorn, :8000)
  React · three.js/R3F ·        ├─ /api/chat    → Claude (Anthropic Python SDK)
  Framer Motion · Lenis ·       │                 + pgvector RAG retrieval
  cmdk · MDX blog               ├─ /api/contact → PostgreSQL lead + Resend email
                                └─ /api/health
        │                              │
        └──────────► PostgreSQL ◄──────┘
                (leads + documents/pgvector)
```

Both processes run under **PM2**; Nginx reverse-proxies them.

### Tech
- **Frontend:** Next.js 16 (App Router, Turbopack), React 19, TypeScript 5.9, CSS (design-token system), `three` + `@react-three/fiber` 9 + `@react-three/drei` + `@react-three/postprocessing` (3D journey + hero), Framer Motion, Lenis, `cmdk`, `next-nprogress-bar`, `react-hook-form` + Zod, `@mdx-js/mdx` (blog is compiled via `evaluate` in `src/lib/mdx.tsx` — bound to the app's own `react/jsx-runtime`).
- **Backend:** FastAPI, Anthropic Python SDK (streaming), SQLAlchemy 2.0 (async) + asyncpg, **pgvector**, Voyage/OpenAI embeddings, Resend.
- **Data:** PostgreSQL everywhere (leads + vector store). Résumé content lives once in `content/resume.json` (read by both frontend and backend).

## Project layout
```
content/resume.json          single source of truth for résumé content
content/articles/*.mdx        blog posts (drop new files here)
src/app/                      Next.js routes (home, /blog, /blog/[slug])
src/components/               UI (Hero+R3F, StatusBar, CommandPalette, chat, form…)
src/components/journey/       3D journey (Scene, Avatar, Terrain, Settlement, games…)
src/lib/journey/              journey logic (config knobs, curve, terrain, day/night…)
public/models/                avatar GLB + Kenney asset kits (nature/holiday/city/car)
backend/app/                  FastAPI (main, db, rag, embeddings, ingest, config)
ecosystem.config.js           PM2 (web + api)
deploy/nginx.conf             Nginx site config
```
> Kenney kits reference an **external** `Textures/colormap.png` next to their
> GLBs — when adding models from a new kit, copy its `Textures/` folder too or
> the meshes render untextured.

## Local development

### 1. Frontend
```bash
npm install
cp .env.example .env.local        # set NEXT_PUBLIC_SITE_URL, etc.
npm run dev                       # http://localhost:61991
```
Dev runs on **port 61991** (3000 is used by another local project; prod still
serves on 3000 — see `package.json` scripts). `/api/*` is proxied to the
FastAPI backend (see `next.config.mjs` → `BACKEND_URL`, default
`http://127.0.0.1:8000`; override with `BACKEND_URL=... npm run dev` if your
backend runs elsewhere).

### 2. Backend
```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # set ANTHROPIC_API_KEY at minimum
uvicorn app.main:app --reload --port 8000
```
With only `ANTHROPIC_API_KEY` set, the chat works via **full-context injection**
and the contact form emails (if Resend is configured). Postgres/pgvector are
optional until you want lead persistence + semantic retrieval.

### 3. PostgreSQL + pgvector (optional locally, standard in prod)
```bash
# Create DB + role, then enable the extension:
sudo -u postgres psql -c "CREATE ROLE portfolio LOGIN PASSWORD 'portfolio';"
sudo -u postgres psql -c "CREATE DATABASE portfolio OWNER portfolio;"
sudo -u postgres psql -d portfolio -c "CREATE EXTENSION IF NOT EXISTS vector;"

# In backend/.env set:
#   DATABASE_URL=postgresql+asyncpg://portfolio:portfolio@localhost:5432/portfolio
#   VOYAGE_API_KEY=...   (or OPENAI_API_KEY=...)   EMBED_DIM=1024 (voyage-3) / 1536 (openai small)

# Build the vector index over résumé + articles:
cd backend && source venv/bin/activate && python -m app.ingest
```
Tables are auto-created on startup; `app.ingest` fills the `documents` table.
Re-run `python -m app.ingest` whenever you add articles or edit the résumé.

## Tests

```bash
npm test          # frontend — Vitest + Testing Library (jsdom)
npm run lint      # eslint
npx tsc --noEmit  # typecheck

cd backend
./venv/bin/pip install -r requirements-dev.txt   # once
./venv/bin/python -m pytest                      # backend — pytest + FastAPI TestClient
```

Neither suite needs secrets, a database or the network. The backend fixtures
force the app into its unconfigured state, so a run can't spend Claude tokens,
write to Postgres or send mail; the frontend mocks `fetch`.

Coverage is the abuse protections (per-IP limits on chat/contact/admin-login,
the chat payload caps, admin token auth and lockout), the request contracts of
every public endpoint, the plain-DOM components — contact form, résumé chat and
the two rest-stop games — and the noise/terrain math the 3D world derives from.
The WebGL scene itself is deliberately not unit-tested: jsdom has no GPU, so
those components are verified by running the app.

## Deploy — Hostinger VPS (Ubuntu)

```bash
# --- prerequisites (once) ---
sudo apt update && sudo apt install -y nginx postgresql python3-venv
# Node 22 LTS:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm i -g pm2

# --- code ---
sudo mkdir -p /var/www/portfolio && sudo chown $USER /var/www/portfolio
git clone <your-repo> /var/www/portfolio && cd /var/www/portfolio

# --- frontend build ---
npm ci
cp .env.example .env.production   # set NEXT_PUBLIC_* before building
npm run build

# --- backend ---
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # set ANTHROPIC_API_KEY, DATABASE_URL, RESEND_*, embeddings
python -m app.ingest             # after Postgres + pgvector are ready
deactivate && cd ..

# --- run both under PM2 ---
pm2 start ecosystem.config.js
pm2 save && pm2 startup          # run the printed command so it survives reboot

# --- nginx + TLS ---
sudo cp deploy/nginx.conf /etc/nginx/sites-available/portfolio
sudo ln -s /etc/nginx/sites-available/portfolio /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d sujit.dev -d www.sujit.dev
```

Redeploy after changes:
```bash
git pull && npm ci && npm run build
cd backend && source venv/bin/activate && pip install -r requirements.txt && python -m app.ingest && deactivate && cd ..
pm2 reload ecosystem.config.js
```

## Editing content
- **Résumé:** edit `content/resume.json` (frontend + backend both pick it up; re-run `app.ingest` for RAG).
- **Blog:** add `content/articles/<slug>.mdx` with frontmatter (`title`, `description`, `date`, `tags`, `readingTime`).
- **Theme/colors:** CSS custom properties at the top of `src/app/globals.css` (the ruby accent is `--accent`).

## Environment variables
See `.env.example` (frontend) and `backend/.env.example` (backend) — every var is documented inline. Never commit real keys.

## Analytics (optional)
Set `NEXT_PUBLIC_UMAMI_SRC` + `NEXT_PUBLIC_UMAMI_WEBSITE_ID` (self-host Umami on the VPS or use Umami Cloud) — the script loads only when both are present.
