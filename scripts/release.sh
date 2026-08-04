#!/usr/bin/env bash
#
# Cut a release: tag the current origin/main tip with the next vX.Y.Z version
# and push the tag. If the GitHub deploy workflow is wired up, the tag push IS
# the "ship it" step; otherwise pass the new tag to scripts/deploy.sh on the
# server.
#
# Run from a dev checkout, never the server. Always tags what the remote says
# main is, so a stale or dirty working tree can't ship the wrong commit.
#
# Usage:
#   ./scripts/release.sh            # patch:  v1.2.3 -> v1.2.4
#   ./scripts/release.sh minor      # minor:  v1.2.3 -> v1.3.0
#   ./scripts/release.sh major      # major:  v1.2.3 -> v2.0.0
#   ./scripts/release.sh v1.4.0     # explicit version
set -euo pipefail

BUMP="${1:-patch}"

git fetch --prune --tags --force origin main
TARGET_SHA="$(git rev-parse origin/main)"

# Latest release tag, version-sorted so v1.10.0 outranks v1.9.0. The glob only
# matches vX.Y.Z, so unrelated tags are ignored.
LAST_TAG="$(git tag -l 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -n1)"

case "$BUMP" in
  v[0-9]*.[0-9]*.[0-9]*)
    NEW_TAG="$BUMP"
    ;;
  major|minor|patch)
    if [ -z "$LAST_TAG" ]; then
      NEW_TAG="v1.0.0"                     # first release of the tag system
    else
      IFS=. read -r MAJ MIN PAT <<<"${LAST_TAG#v}"
      case "$BUMP" in
        major) NEW_TAG="v$((MAJ + 1)).0.0" ;;
        minor) NEW_TAG="v${MAJ}.$((MIN + 1)).0" ;;
        patch) NEW_TAG="v${MAJ}.${MIN}.$((PAT + 1))" ;;
      esac
    fi
    ;;
  *)
    echo "Usage: $0 [major|minor|patch|vX.Y.Z]" >&2
    exit 1
    ;;
esac

if git rev-parse -q --verify "refs/tags/$NEW_TAG" >/dev/null; then
  echo "!! Tag $NEW_TAG already exists — pick another version." >&2
  exit 1
fi

if [ -n "$LAST_TAG" ] && \
   [ "$(git rev-parse "refs/tags/$LAST_TAG^{commit}")" = "$TARGET_SHA" ]; then
  echo "!! origin/main is already released as $LAST_TAG — nothing new to ship." >&2
  exit 1
fi

echo ">> Last release: ${LAST_TAG:-<none>}"
echo ">> New release:  $NEW_TAG -> $TARGET_SHA (origin/main)"
if [ -n "$LAST_TAG" ]; then
  echo ">> Commits since $LAST_TAG:"
  git log --oneline "refs/tags/$LAST_TAG..$TARGET_SHA"
fi

read -r -p ">> Tag and push? This RELEASES PRODUCTION. [y/N] " CONFIRM
case "$CONFIRM" in
  y|Y|yes|YES) ;;
  *) echo ">> Aborted — nothing tagged, nothing pushed."; exit 1 ;;
esac

git tag -a "$NEW_TAG" -m "release $NEW_TAG" "$TARGET_SHA"
git push origin "refs/tags/$NEW_TAG"
echo ">> Pushed $NEW_TAG."
