#!/usr/bin/env bash
#
# Self-hostability smoke test (constitution Principle VII, plan.md
# "Constitution Check", quickstart.md §8): builds the console, then
# fails if the built JS/CSS references any http(s) URL that would
# require internet access at runtime.
#
# Allowed URL occurrences (filtered by line context):
#   - XML/SVG namespace URIs (www.w3.org) — identifiers, never fetched.
#   - License header comment lines (@license / /*! banners / copyright).
#   - React's minified error-message URLs (react.dev/errors/…) — prose
#     embedded in thrown Error strings, not a resource fetch.
#
# Exit 0 = self-hostable. Exit 1 = remote URL found (or build failed).

set -euo pipefail
cd "$(dirname "$0")/.."

echo "[test-selfhost] building console..."
pnpm build

echo "[test-selfhost] scanning dist/ for remote URLs..."
violations="$(grep -REn 'https?://' dist --include='*.js' --include='*.css' \
  | grep -v 'www\.w3\.org' \
  | grep -vE 'react\.dev/errors|reactjs\.org/docs/error-decoder' \
  | grep -viE '@license|/\*!|copyright' \
  || true)"

if [ -z "${violations}" ]; then
  echo "[test-selfhost] PASS: no remote URLs in dist/ (self-hostable)."
  exit 0
fi

echo "[test-selfhost] FAIL: remote URLs found in built output:"
echo "${violations}"
exit 1
