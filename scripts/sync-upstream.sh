#!/usr/bin/env bash
# Sync upstream/pstack from cursor/plugins (default: GitHub main) onto the `upstream` vendor branch.
# Usage: ./scripts/sync-upstream.sh [local-cursor-plugins-dir-or-git-url]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-https://github.com/cursor/plugins.git}"

cd "$ROOT"

if [ -n "$(git status --porcelain)" ]; then
  echo "error: working tree is dirty; commit or stash changes before syncing upstream." >&2
  exit 1
fi

CURRENT_BRANCH="$(git symbolic-ref --short HEAD)"
if [ "$CURRENT_BRANCH" != "upstream" ]; then
  echo "Switching to vendor branch 'upstream' (was '$CURRENT_BRANCH')..."
  git checkout upstream
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ -d "$SRC/pstack" ]; then
  UP_PSTACK="$SRC/pstack"
  UP_COMMIT="$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo unknown)"
else
  git clone --depth 1 --filter=blob:none --sparse "$SRC" "$TMP/repo"
  git -C "$TMP/repo" sparse-checkout set pstack
  UP_PSTACK="$TMP/repo/pstack"
  UP_COMMIT="$(git -C "$TMP/repo" rev-parse --short HEAD)"
fi

UP_VERSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).version)" "$UP_PSTACK/plugin.json")"

rm -rf "$ROOT/upstream/pstack"
cp -R "$UP_PSTACK" "$ROOT/upstream/pstack"
find "$ROOT/upstream/pstack" -name '.DS_Store' -delete

cat > "$ROOT/upstream/UPSTREAM.json" <<EOF
{
  "repository": "https://github.com/cursor/plugins",
  "subpath": "pstack",
  "version": "${UP_VERSION}",
  "commit": "${UP_COMMIT}",
  "license": "MIT",
  "author": "Lauren Tan"
}
EOF

echo "Synced upstream/pstack to ${UP_VERSION} (${UP_COMMIT}) on branch 'upstream'."
echo "Next steps:"
echo "  1. Review changes: git status && git diff --stat"
echo "  2. Commit on vendor branch: git add upstream && git commit -m 'chore(upstream): sync cursor/plugins pstack ${UP_VERSION}'"
echo "  3. Merge into main and rebuild:"
echo "       git checkout main && git merge upstream"
echo "       # bump version in overlay/plugin.json if needed"
echo "       node scripts/build-antigravity-pstack.mjs"
echo "       node scripts/lint-port.mjs --with-agy"
