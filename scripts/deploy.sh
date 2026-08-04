#!/usr/bin/env bash
#
# Production deploy runbook, executed ON the server from the checkout at
# $REPO_DIR (default /opt/sujit-portfolio). It does what a bare
# `git pull && docker compose up -d --build` does, plus the three rails a bare
# pull can't give:
#
#   1. a Postgres dump taken BEFORE the new backend starts (it creates/extends
#      tables on boot),
#   2. a post-deploy health check against the public edge, and
#   3. an automatic rollback to the previous commit if that check fails,
#
# so a bad build can't leave the site down unattended.
#
# Usage:
#   ./scripts/deploy.sh              # deploy origin/main
#   ./scripts/deploy.sh v1.2.0       # deploy a release tag (what CI passes)
#   INGEST=1 ./scripts/deploy.sh     # also rebuild the pgvector index
#
# Env overrides: REPO_DIR, ENV_FILE, BACKUP_DIR, HEALTH_RETRIES, INGEST.
set -euo pipefail

# Everything lives inside main() so bash parses the WHOLE file before running
# any of it: the checkout below can rewrite this very script, and a script
# that mutates while bash is still reading it executes garbage. The function
# wrapper makes the running copy immune to that.
main() {

REF="${1:-main}"
REPO_DIR="${REPO_DIR:-/home/arccaa/portfolio}"
ENV_FILE="${ENV_FILE:-.env.prod}"
BACKUP_DIR="${BACKUP_DIR:-/home/arccaa/portfolio-backups}"
HEALTH_RETRIES="${HEALTH_RETRIES:-45}"      # x4s = 3 min; the Next build is slow

cd "$REPO_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "!! $REPO_DIR/$ENV_FILE not found. Copy .env.prod.example and fill it in." >&2
  exit 1
fi

COMPOSE="docker compose -f compose.prod.yaml --env-file $ENV_FILE"

# Read the few values this script needs out of the same file compose reads.
#
# Parsed, NOT sourced: an env file is not a shell script. Compose is happy with
# `CHAT_RATE_LIMIT=12/300, 60/3600`, but `.` on that line makes bash try to run
# `60/3600` as a command — which, under `set -e`, kills the deploy before it
# starts. (It did, on the first run.)
envval() {
  sed -n "s/^[[:space:]]*$1=//p" "$ENV_FILE" | tail -n1 \
    | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/" -e 's/[[:space:]]*$//'
}
POSTGRES_USER="$(envval POSTGRES_USER)"; POSTGRES_USER="${POSTGRES_USER:-portfolio}"
POSTGRES_DB="$(envval POSTGRES_DB)";     POSTGRES_DB="${POSTGRES_DB:-portfolio}"
APP_PORT="$(envval APP_PORT)";           APP_PORT="${APP_PORT:-61991}"
APP_BIND="$(envval APP_BIND)";           APP_BIND="${APP_BIND:-0.0.0.0}"
# Check the stack on its own published port rather than through Caddy: this has
# to work before DNS points here, and it isolates "did MY deploy come up" from
# "is the shared edge routing correctly". A wildcard bind is reached over
# loopback; a specific bind (e.g. 172.17.0.1) has to be addressed as itself.
# (if/fi rather than `[ ... ] && ...`: under `set -e` a false test as the last
# command of an && list ends the script.)
HEALTH_HOST="$APP_BIND"
if [ "$HEALTH_HOST" = "0.0.0.0" ]; then
  HEALTH_HOST="127.0.0.1"
fi
HEALTH_URL="http://${HEALTH_HOST}:${APP_PORT}/api/health"

# Remember where we are so a failed deploy can go straight back.
PREV_SHA="$(git rev-parse HEAD)"
echo ">> Current commit: $PREV_SHA"

# Match the remote exactly — production must never carry local drift.
# --force on tags so a re-pointed tag still deploys what the remote has,
# mirroring the hard reset used for branches.
git fetch --prune --tags --force origin

if git rev-parse -q --verify "refs/tags/$REF" >/dev/null; then
  git checkout --force --detach "refs/tags/$REF^{commit}"
else
  git checkout "$REF"
  git reset --hard "origin/$REF"
fi
NEW_SHA="$(git rev-parse HEAD)"
echo ">> Target commit:  $NEW_SHA"

# Same commit is NOT a reason to skip: the checkout can already sit at the
# target without the images having been built from it (manual server prep, a
# re-deploy of the current tag after a config fix). `up -d --build` is a near
# no-op when nothing changed, thanks to the layer cache.
if [ "$PREV_SHA" = "$NEW_SHA" ]; then
  echo ">> Already at target commit — rebuilding anyway so the images match."
fi

# --- Back up before anything touches the database ---------------------------
# The backend creates tables and the pgvector extension on boot, and the admin
# blog lives entirely in Postgres. This dump is the restore point if a deploy
# goes wrong in a way the code rollback below can't undo.
if $COMPOSE ps --status running --services 2>/dev/null | grep -qx db; then
  mkdir -p "$BACKUP_DIR"
  BACKUP_FILE="$BACKUP_DIR/pre-deploy-$(date +%Y%m%d-%H%M%S).sql.gz"
  echo ">> Backing up Postgres -> $BACKUP_FILE"
  $COMPOSE exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$BACKUP_FILE"
  # Keep the last 20 dumps; a portfolio DB is small, but not unbounded.
  ls -1t "$BACKUP_DIR"/pre-deploy-*.sql.gz 2>/dev/null | tail -n +21 | xargs -r rm --
else
  echo ">> Postgres isn't running yet (first deploy?) — skipping the backup."
  BACKUP_FILE="<none>"
fi

# --- Build + restart --------------------------------------------------------
echo ">> Building and starting the stack"
$COMPOSE up -d --build --remove-orphans
# nginx caches the upstream IPs it resolved at start-up; a rebuilt frontend or
# backend lands on a new container IP, and a stale cache is the classic
# post-rebuild 502. Restarting the edge re-resolves them.
$COMPOSE restart gateway

# --- Re-index the résumé/articles for RAG (opt-in) --------------------------
# Only needed when content/resume.json or the articles changed, and it costs
# embedding-API calls, so it is off unless asked for.
if [ "${INGEST:-0}" != "0" ]; then
  echo ">> Rebuilding the pgvector index"
  $COMPOSE --profile tools run --rm ingest
fi

# --- Health check -----------------------------------------------------------
echo ">> Waiting for the edge to answer at $HEALTH_URL"
healthy=0
for _ in $(seq 1 "$HEALTH_RETRIES"); do
  if curl -skf "$HEALTH_URL" >/dev/null 2>&1; then healthy=1; break; fi
  sleep 4
done

if [ "$healthy" -ne 1 ]; then
  echo "!! Health check FAILED — rolling back to $PREV_SHA"
  git reset --hard "$PREV_SHA"
  $COMPOSE up -d --build
  $COMPOSE restart gateway
  echo "!! Code rolled back to $PREV_SHA."
  echo "!! If the database needs restoring too: $BACKUP_FILE"
  exit 1
fi

echo ">> Deploy OK ($NEW_SHA)."
curl -sk "$HEALTH_URL" || true
echo
echo ">> Pruning dangling images."
docker image prune -f

}

main "$@"
