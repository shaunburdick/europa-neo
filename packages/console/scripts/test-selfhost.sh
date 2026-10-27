#!/usr/bin/env bash
#
# Self-hostability smoke test (constitution Principle VII, plan.md
# "Constitution Check", quickstart.md §8): builds the console, then
# fails if the built JS/CSS references any http(s) URL that would
# require internet access at runtime, reports the Q-P03 browser-payload
# reference target, and verifies the real one-port HTTP/WS host surface.
#
# Allowed URL occurrences (judged per extracted URL token):
#   - Bare `http://` / `https://` schemes — no host, never a fetch
#     target. These are the scheme-detection/translation literals the
#     lobby emits to UPGRADE caller-supplied URLs to ws/wss (feature
#     010 T-015); they are strings about schemes, not remote references.
#   - XML/SVG namespace URIs (www.w3.org) — identifiers, never fetched.
#   - React's minified error-message URLs (react.dev/errors/…) — prose
#     embedded in thrown Error strings, not a resource fetch.
#   - The branded footer's GitHub repo hyperlink (github.com/…) and player
#     manual link (shaunburdick.github.io/…) — navigation links, not runtime fetches.
#
# Bundle budget: sum of per-file gzip sizes over the BROWSER-DELIVERED
# payload (dist/assets/**/*.{js,css} — the Vite SPA build). The tsc
# library tree also emitted into dist/ (index.js, src/, state/, …) is
# consumed by bundling hosts, never fetched by a browser, so it is
# out of scope for the Q-P03 "initial bundle" budget.
# The 155,648-byte (152 KiB) value is an advisory reference target. At or above
# it the script reports the exact total and excess, then continues to the host
# smoke. It does not suppress or downgrade any other failure.
#
# After the bundle checks, the script also boots the real one-port host and
# checks the production HTTP/WS surface. This catches a surprisingly easy
# regression: a perfectly valid SPA build served by a host that cannot reload
# a deep link. (The browser E2E suite owns application behavior; this script
# owns the host boundary.)
#
# Exit 0 = remote-URL scan and host smoke pass. Nonzero = build, scan, probe,
# asset, or host failure (invalid measurements return the helper's status).
# The numeric payload target is warning-only.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "[test-selfhost] building console..."
pnpm build

if [ ! -d dist/assets ]; then
  echo "[test-selfhost] FAIL: dist/assets missing — did the Vite build run?"
  exit 1
fi

. scripts/browser-bundle-budget.sh
browser_assets="$(find dist/assets -type f \( -name '*.js' -o -name '*.css' \) -print)"
require_browser_assets "dist/assets" "${browser_assets}"

echo "[test-selfhost] scanning dist/ for remote URLs..."
# Judge individual URL TOKENS, not source lines: minified bundles pack an
# entire chunk onto one physical line, so line-level filtering would
# silently forgive co-located violations (and over-report benign ones).
url_tokens="$(grep -REoh 'https?://[A-Za-z0-9._~:/?#@!$&*+,;=%-]+' dist/assets --include='*.js' --include='*.css' | sort -u || true)"

violations=""
for url in ${url_tokens}; do
  case "${url}" in
    # Bare schemes carry no host (scheme detection/translation literals).
    http:// | https://) ;;
    # TanStack Router SSR fallback origin — not fetched at runtime in the browser.
    http://localhost) ;;
    # XML/SVG namespace identifiers — never fetched.
    *www.w3.org*) ;;
    # React error-decoder prose inside thrown Error strings.
    *react.dev/errors* | *reactjs.org/docs/error-decoder*) ;;
    # Footer hyperlink to the project repo — navigation only, never a runtime fetch.
    *github.com*) ;;
    # Player manual link — navigation only, never a runtime fetch.
    *shaunburdick.github.io*) ;;
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
    # Re-locate each offending token for file:line context. Options and the
    # end-of-options marker precede the pattern; `dist` is the file operand.
    grep -rnF --include='*.js' --include='*.css' -- "${url}" dist/assets || true
  done <<<"${violations}"
  exit 1
fi

REFERENCE_TARGET_BYTES=155648
total_bytes=0
while IFS= read -r asset; do
  gz="$(gzip -c -- "${asset}" | wc -c)"
  total_bytes=$((total_bytes + gz))
done <<<"${browser_assets}"
report_browser_bundle_budget "${total_bytes}" "${REFERENCE_TARGET_BYTES}"

echo "[test-selfhost] starting one-port host smoke..."
port="$(node -e "const net=require('node:net'); const s=net.createServer(); s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port)); s.close();});")"
host_log="$(mktemp)"
host_pid=''
cleanup() {
  if [ -n "${host_pid}" ] && kill -0 "${host_pid}" 2>/dev/null; then
    kill -TERM "${host_pid}" 2>/dev/null || true
    wait "${host_pid}" 2>/dev/null || true
  fi
  rm -f "${host_log}"
}
trap cleanup EXIT

pnpm host --port "${port}" >"${host_log}" 2>&1 &
host_pid=$!
ready=0
for _ in $(seq 1 100); do
  if curl -fsS "http://127.0.0.1:${port}/version" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.1
done
if [ "${ready}" -ne 1 ]; then
  printf '%s\n' '[test-selfhost] FAIL: one-port host did not become ready.'
  cat "${host_log}"
  exit 1
fi

assert_header() {
  local headers="$1"
  local name="$2"
  local value="$3"
  printf '%s\n' "${headers}" | grep -Fqi "${name}: ${value}" || {
    printf '%s\n' "[test-selfhost] FAIL: expected header ${name}: ${value}"
    exit 1
  }
}

for route in /lobby /match/selfhost /match/selfhost/join /match/selfhost/spectate /unknown-route /match/; do
  for reload in 1 2; do
    response="$(curl --fail-with-body -sS -D - "http://127.0.0.1:${port}${route}")"
    printf '%s\n' "${response}" | grep -Fq '<div id="root">' || {
      printf '%s\n' "[test-selfhost] FAIL: ${route} reload ${reload} did not serve the SPA shell"
      exit 1
    }
    assert_header "${response}" 'x-content-type-options' 'nosniff'
    assert_header "${response}" 'referrer-policy' 'no-referrer'
  done
done

version_body="$(curl --fail-with-body -sS "http://127.0.0.1:${port}/version")"
node -e 'const value=JSON.parse(process.argv[1]); if (Object.keys(value).sort().join(",") !== "appVersion,protocolVersion" || typeof value.appVersion !== "string" || typeof value.protocolVersion !== "string") process.exit(1)' "${version_body}" || {
  printf '%s\n' '[test-selfhost] FAIL: /version did not return the exact version shape.'
  exit 1
}

asset="$(find dist/assets -type f \( -name '*.js' -o -name '*.css' \) -print -quit)"
asset_path="/${asset#dist/}"
asset_headers="$(curl --fail-with-body -sS -D - -o /dev/null "http://127.0.0.1:${port}${asset_path}")"
printf '%s\n' "${asset_headers}" | grep -Fqi 'content-type:' || {
  printf '%s\n' '[test-selfhost] FAIL: known asset did not return a content type.'
  exit 1
}
if curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/assets/missing-selfhost.js" | grep -Fq '200'; then
  printf '%s\n' '[test-selfhost] FAIL: missing asset was swallowed by SPA fallback.'
  exit 1
fi

ws_headers="$(curl --http1.1 -sS -D - -o /dev/null \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  "http://127.0.0.1:${port}/match/selfhost")"
printf '%s\n' "${ws_headers}" | grep -Fq ' 101 ' || {
  printf '%s\n' '[test-selfhost] FAIL: WebSocket upgrade did not return 101.'
  exit 1
}

traversal_status="$(curl --path-as-is -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/%2e%2e/%2e%2e/package.json")"
[ "${traversal_status}" = '403' ] || {
  printf '%s\n' "[test-selfhost] FAIL: traversal request returned ${traversal_status}, expected 403."
  exit 1
}

echo "[test-selfhost] PASS: remote-URL scan and one-port host surface are self-hostable."
exit 0
