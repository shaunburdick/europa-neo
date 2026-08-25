#!/usr/bin/env bash
#
# Self-hostability smoke test (constitution Principle VII, plan.md
# "Constitution Check", quickstart.md §8): builds the console, then
# fails if the built JS/CSS references any http(s) URL that would
# require internet access at runtime, and enforces the Q-P03
# gzipped-bundle budget (SC-003: initial bundle < 150 KB gzipped).
#
# Allowed URL occurrences (filtered by line context):
#   - XML/SVG namespace URIs (www.w3.org) — identifiers, never fetched.
#   - License header comment lines (@license / /*! banners / copyright).
#   - React's minified error-message URLs (react.dev/errors/…) — prose
#     embedded in thrown Error strings, not a resource fetch.
#
# Bundle budget: sum of per-file gzip sizes over the BROWSER-DELIVERED
# payload (dist/assets/**/*.{js,css} — the Vite SPA build). The tsc
# library tree also emitted into dist/ (index.js, src/, state/, …) is
# consumed by bundling hosts, never fetched by a browser, so it is
# out of scope for the Q-P03 "initial bundle" budget.
# Override with SELFHOST_BUNDLE_BUDGET_BYTES (default 153600 = 150 KB).
#
# Exit 0 = self-hostable within budget. Exit 1 = remote URL found,
# budget breached, or build failed.

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

if [ -n "${violations}" ]; then
  echo "[test-selfhost] FAIL: remote URLs found in built output:"
  echo "${violations}"
  exit 1
fi

BUDGET_BYTES="${SELFHOST_BUNDLE_BUDGET_BYTES:-153600}"
total_bytes=0
while IFS= read -r asset; do
  gz="$(gzip -c "${asset}" | wc -c)"
  total_bytes=$((total_bytes + gz))
done < <(find dist/assets -type f \( -name '*.js' -o -name '*.css' \) 2>/dev/null)

if [ ! -d dist/assets ]; then
  echo "[test-selfhost] FAIL: dist/assets missing — did the Vite build run?"
  exit 1
fi

printf '[test-selfhost] bundle size: %s bytes gzipped (budget %s bytes)\n' \
  "${total_bytes}" "${BUDGET_BYTES}"

if [ "${total_bytes}" -ge "${BUDGET_BYTES}" ]; then
  echo "[test-selfhost] FAIL: gzipped bundle exceeds the ${BUDGET_BYTES}-byte budget (Q-P03)."
  exit 1
fi

echo "[test-selfhost] PASS: no remote URLs in dist/ and bundle within budget (self-hostable)."
exit 0
