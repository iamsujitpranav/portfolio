# Deploying sujitpranavreddy.dev

## Topology

The VPS (`82.29.162.82`) already hosts other sites. A shared **Caddy**
container (`arccaa_caddy_prod`, compose project `arccaa-prod`) owns `:80` and
`:443` for them and terminates TLS. This stack therefore never touches those
ports — it publishes exactly one, **61991**, and Caddy proxies the domain to
it:

```
internet ─443─▶ Caddy (shared edge, TLS)
                  │  reverse_proxy 172.17.0.1:61991
                  ▼
             gateway (nginx)  ── /api/* ─▶ backend  (FastAPI + gunicorn)
                              └── /*     ─▶ frontend (Next.js standalone)
                                              │
                                              ▼
                                        db (Postgres + pgvector)
                                     network: internal, no route off the host
```

Nothing but `61991` is published. Postgres and the app containers sit on
Docker networks the internet cannot reach, and no container of ours joins any
network belonging to the other projects — so there is no way for a service
name here to collide with one of theirs.

| Piece | Where |
| --- | --- |
| Server | `root@82.29.162.82` |
| Checkout | `/home/arccaa/portfolio` |
| Git origin | `/home/arccaa/portfolio.git` (bare repo on the same server) |
| Stack | `compose.prod.yaml` |
| App edge | `deploy/nginx.prod.conf` |
| Public edge | `/opt/arccaa/core/deploy/Caddyfile` — our block is `deploy/caddy-site.caddy` |
| Secrets/config | `/home/arccaa/portfolio/.env.prod` (never committed) |
| Backups | `/home/arccaa/portfolio-backups/` |

`compose.yaml` (no `.prod`) is the **local** preview stack — don't run it on
the server. `ecosystem.config.js` + `deploy/nginx.conf` are the older PM2
bare-metal path, kept for reference.

---

## Releasing — the tag flow

Releases are tags. `main` is what you work on; a `vX.Y.Z` tag is what
production runs, so "what's deployed" is always a name you can check out.

**1. From your machine** — commit to `main`, then:

```bash
git push origin main
./scripts/release.sh          # patch bump; minor | major | vX.Y.Z also work
```

`release.sh` tags **`origin/main`** (never your working tree), shows the
commits since the last release, asks for confirmation, and pushes the tag.

**2. On the server:**

```bash
ssh root@82.29.162.82
cd /home/arccaa/portfolio
./scripts/deploy.sh v1.0.1
```

`deploy.sh`:

1. dumps Postgres to `/home/arccaa/portfolio-backups/` **before** anything
   starts (the backend creates/extends tables on boot),
2. `git fetch` + hard checkout of the tag — production carries no local drift,
3. `docker compose up -d --build`, then restarts the gateway so nginx
   re-resolves the rebuilt containers' IPs (the classic post-rebuild 502),
4. polls `http://127.0.0.1:61991/api/health` for up to 3 minutes,
5. **rolls back** to the previous commit and rebuilds if that check fails,
   printing the path to the dump in case the database needs restoring too.

`INGEST=1 ./scripts/deploy.sh v1.0.1` also rebuilds the pgvector index — needed
only when `content/resume.json` changed and RAG is enabled.

> The remote is a bare repo **on the server itself**, so releasing needs no
> GitHub. If you later push this to GitHub, add it as a second remote (or
> repoint `origin`) and `.github/workflows/deploy.yml` will run step 2 for you
> on every tag push.

---

## First-time setup (already done — recorded here for a rebuild)

```bash
# --- on the server ---
mkdir -p /home/arccaa/portfolio-backups
git init --bare /home/arccaa/portfolio.git

# --- from your machine ---
git remote add origin ssh://root@82.29.162.82/home/arccaa/portfolio.git
git push origin main && ./scripts/release.sh

# --- on the server ---
git clone /home/arccaa/portfolio.git /home/arccaa/portfolio
cd /home/arccaa/portfolio
cp .env.prod.example .env.prod && chmod 600 .env.prod && $EDITOR .env.prod
./scripts/deploy.sh v1.0.0

# --- put the domain in front of it (once) ---
CADDYFILE=/opt/arccaa/core/deploy/Caddyfile
cp "$CADDYFILE" "$CADDYFILE.bak.$(date +%F-%H%M%S)"
cat deploy/caddy-site.caddy >> "$CADDYFILE"
docker exec arccaa_caddy_prod caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec arccaa_caddy_prod caddy reload  --config /etc/caddy/Caddyfile --adapter caddyfile
```

`caddy reload` validates before swapping and keeps the running config if the
new one is bad — a typo in our block cannot take the other sites down.

### DNS

Caddy issues the certificate itself over ACME, which only works once the name
resolves here:

```
A  sujitpranavreddy.dev      -> 82.29.162.82
A  www.sujitpranavreddy.dev  -> 82.29.162.82
```

```bash
dig +short sujitpranavreddy.dev      # must print 82.29.162.82
```

Until then Caddy retries issuance in the background and the site is reachable
at `http://82.29.162.82:61991`. Nothing needs restarting when DNS lands.

### Closing the plain-HTTP door

`APP_BIND=0.0.0.0` in `.env.prod` is what makes `http://82.29.162.82:61991`
work — useful before DNS moves, but it is unencrypted and bypasses Caddy.
Once the domain resolves here:

```bash
sed -i 's/^APP_BIND=.*/APP_BIND=172.17.0.1/' .env.prod
docker compose -f compose.prod.yaml --env-file .env.prod up -d
```

`172.17.0.1` is the host as seen from a container — Caddy can still reach the
port, the internet can't.

---

## Configuration

`.env.prod` on the server, from `.env.prod.example`. What must be set:

| Variable | Notes |
| --- | --- |
| `POSTGRES_PASSWORD` | `openssl rand -base64 24 \| tr -d '/+='` — it goes inside a URL, keep it URL-safe |
| `ANTHROPIC_API_KEY` | without it the résumé chat is disabled; the rest of the site is fine |
| `ADMIN_PASSWORD` + `SESSION_SECRET` | both required before `/admin` does anything |
| `SMTP_*` | optional — contact submissions still persist to Postgres without it |
| `VOYAGE_API_KEY` *or* `OPENAI_API_KEY` | optional — enables pgvector RAG; keep `EMBED_DIM` aligned with the model |

> `NEXT_PUBLIC_*` values are compiled **into** the frontend image. Changing one
> needs a rebuild (which `deploy.sh` always does), not a restart.

---

## Verify

```bash
curl -s http://127.0.0.1:61991/api/health | jq     # on the server
curl -s https://sujitpranavreddy.dev/api/health    # once DNS + TLS are live
```

The flags in that response are how you confirm a deploy without reading the
env: `claude`, `db`, `rag`, `smtp`, `admin`, `analytics`, `rate_limit` and the
chat cost controls.

Check the other sites still answer after any Caddy change:

```bash
curl -sI https://aaits.in | head -1
```

---

## Operations

```bash
cd /home/arccaa/portfolio
C="docker compose -f compose.prod.yaml --env-file .env.prod"

$C ps                          # what's up, and healthy?
$C logs -f gateway backend     # tail the app edge + API
$C exec db psql -U portfolio portfolio
$C restart backend             # after a non-NEXT_PUBLIC_ config change
```

**Manual backup**

```bash
$C exec -T db pg_dump -U portfolio portfolio | gzip > backup-$(date +%F).sql.gz
```

**Restore** (destructive — replaces current contents):

```bash
gunzip -c backup-2026-08-04.sql.gz | $C exec -T db psql -U portfolio portfolio
```

`deploy.sh` keeps the last 20 pre-deploy dumps. They live on the same disk as
the database, so copy them off the box if they're meant to survive losing it.

---

## Rate limits

Two layers, deliberately:

* **nginx** (`deploy/nginx.prod.conf`) — per-IP zones on `/api/chat` (6r/m),
  `/api/contact` (3r/m), `/api/admin/login` (10r/m) and everything else
  (30r/s), plus connection caps. The real ceiling, since it sits in front of
  every worker.
* **the app** (`backend/app/ratelimit.py`) — per-IP budgets from `.env.prod`
  that return a friendly 429. Counted per gunicorn worker, which is why nginx
  is there too.

Both need the visitor's real address, and behind Caddy the socket address is a
Docker bridge IP. `deploy/nginx.prod.conf` therefore takes the client IP from
`X-Forwarded-For` — but only when the request came from a private range, so a
client hitting `:61991` directly can't forge one. That's also why
`TRUST_PROXY_HEADERS=1` is safe here: nginx overwrites `X-Real-IP` before the
backend sees it.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `502` right after a deploy | nginx cached an old upstream IP — `$C restart gateway` (deploy.sh does this). |
| Domain serves someone else's site | DNS still points elsewhere — `dig +short sujitpranavreddy.dev`. |
| Caddy logs ACME failures | Same cause. It retries on its own; nothing to restart once DNS lands. |
| Caddy won't reload | Run `caddy validate` first — the running config is kept, so the other sites stay up. Restore `Caddyfile.bak.*` if needed. |
| Chat answers "unavailable" | `ANTHROPIC_API_KEY` missing — check `/api/health`. |
| Chat answer arrives all at once | `flush_interval -1` missing from the Caddy block (the response is `text/plain`, which Caddy buffers by default). |
| `/admin` won't accept the password | `ADMIN_PASSWORD` **and** `SESSION_SECRET` must both be set; `$C restart backend` after changing them. |
| Metadata/canonical shows the wrong host | `NEXT_PUBLIC_SITE_URL` is baked in at build time — fix `.env.prod` and redeploy (rebuild), not restart. |
| Port 61991 already in use | Something else grabbed it — `ss -ltnp \| grep 61991`. Change `APP_PORT` in `.env.prod` **and** the port in the Caddy block. |
