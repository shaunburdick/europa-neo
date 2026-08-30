#!/usr/bin/env bash
#
# Self-hostability smoke test (constitution Principle VII, plan.md
# "Constitution Check", quickstart.md §8): builds the console, then
# fails if the built JS/CSS references any http(s) URL that would
# require internet access at runtime, and enforces the Q-P03
# gzipped-bundle budget (SC-003: initial bundle < 150 KB gzipped).
#
# Allowed URL occurrences (judged per extracted URL token):
#   - Bare `http://` / `https://` schemes — no host, never a fetch
#     target. These are the scheme-detection/translation literals the
#     lobby emits to UPGRADE caller-supplied URLs to ws/wss (feature
#     010 T-015); they are strings about schemes, not remote references.
#   - XML/SVG namespace URIs (www.w3.org) — identifiers, never fetched.
#   - React's minified error-message URLs (react.dev/errors/…) — prose
#     embedded in thrown Error strings, not a resource fetch.
#   - The branded footer's GitHub repo hyperlink (github.com/…) — a
#     navigation link rendered as an <a href>, never a runtime fetch.
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
# Judge individual URL TOKENS, not source lines: minified bundles pack an
# entire chunk onto one physical line, so line-level filtering would
# silently forgive co-located violations (and over-report benign ones).
# The token pattern runs from the scheme through URL-safe characters
# only — string and template delimiters terminate a token, so the
# scheme-translation literals extract as the bare schemes allowlisted
# below instead of dragging surrounding code into the verdict.
url_tokens="$(grep -REoh 'https?://[A-Za-z0-9._~:/?#@!$&*+,;=%-]+' dist --include='*.js' --include='*.css' | sort -u || true)"

violations=""
for url in ${url_tokens}; do
  case "${url}" in
    # Bare schemes carry no host (scheme detection/translation literals).
    http:// | https://) ;;
    # XML/SVG namespace identifiers — never fetched.
    *www.w3.org*) ;;
    # React error-decoder prose inside thrown Error strings.
    *react.dev/errors* | *reactjs.org/docs/error-decoder*) ;;
    # Footer hyperlink to the project repo — navigation only, never a runtime fetch.
    *github.com*) ;;
    *)
      violations="${violations}${url}
"
      ;;
  esac
done

if [ -n "${violations}" ]; then
  echo "[test-selfhost] FAIL: remote URLs found in built output:"
  while IFS= read -r url; do
    [ -n "${url}" ] || continue
    # Re-locate each offending token for file:line context.
    grep -rnF -- "${url}" dist --include='*.js' --include='*.css' || true
  done <<<"${violations}"
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
