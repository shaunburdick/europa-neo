#!/usr/bin/env bash
# ready.sh — Wait for a server to be ready by probing its health endpoint.
#
# Usage: ready.sh <server-type> [port] [timeout-seconds]
#
# Server types:
#   host — polls GET /version on the host server (default port 8080)
#   dev  — polls GET / on the Vite dev server (default port 5173)
#   docs — polls GET / on the Astro docs server (default port 4321)
#
# Exit 0 when ready, exit 1 on timeout.

set -euo pipefail

SERVER_TYPE="${1:?usage: ready.sh <host|dev|docs> [port] [timeout-seconds]}"

case "${SERVER_TYPE}" in
    host)
        PORT="${2:-8080}"
        HEALTH_URL="http://127.0.0.1:${PORT}/version"
        EXPECTED_STATUS="200"
        ;;
    dev)
        PORT="${2:-5173}"
        HEALTH_URL="http://127.0.0.1:${PORT}/"
        EXPECTED_STATUS="200"
        ;;
    docs)
        PORT="${2:-4321}"
        # Astro binds to `localhost` (IPv6 ::1 on this machine) and serves
        # under the `base: '/europa-neo'` prefix from astro.config.mjs.
        HEALTH_URL="http://localhost:${PORT}/europa-neo/"
        EXPECTED_STATUS="200"
        ;;
    *)
        echo "ready.sh: unknown server type '${SERVER_TYPE}' (expected: host, dev, docs)" >&2
        exit 1
        ;;
esac

TIMEOUT="${3:-30}"
# Poll every 0.5s using integer tenths-of-a-second arithmetic (no `bc`
# dependency — `bc` is not universally installed).
INTERVAL_TENTHS=5
TIMEOUT_TENTHS=$((TIMEOUT * 10))
ELAPSED_TENTHS=0

while true; do
    HTTP_CODE=$(curl -sS -o /dev/null -w '%{http_code}' "${HEALTH_URL}" 2>/dev/null || echo "000")
    if [ "${HTTP_CODE}" = "${EXPECTED_STATUS}" ]; then
        echo "ready.sh: ${SERVER_TYPE} server ready on port ${PORT} (HTTP ${HTTP_CODE})"
        exit 0
    fi
    ELAPSED_TENTHS=$((ELAPSED_TENTHS + INTERVAL_TENTHS))
    if [ "${ELAPSED_TENTHS}" -ge "${TIMEOUT_TENTHS}" ]; then
        echo "ready.sh: TIMEOUT after ${TIMEOUT}s waiting for ${SERVER_TYPE} on port ${PORT} (last HTTP ${HTTP_CODE})" >&2
        exit 1
    fi
    sleep 0.5
done
