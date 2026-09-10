#!/usr/bin/env bash
# Build and smoke-test the single-port Docker image, including semantic SPA
# entry paths. This exercises the image through one published port.

set -euo pipefail

# Git Bash rewrites absolute POSIX paths passed to Docker on Windows. The image
# checks intentionally inspect /app, so preserve those container paths verbatim.
export MSYS_NO_PATHCONV=1

IMAGE_NAME="${DOCKER_SMOKE_IMAGE:-europa:semantic-url-smoke}"
HOST_PORT="${DOCKER_SMOKE_PORT:-18080}"
CONTAINER_NAME="europa-semantic-url-smoke-$$"

cleanup() {
    docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[docker-smoke] validating Compose configuration..."
docker compose config -q

echo "[docker-smoke] building ${IMAGE_NAME} from a clean context..."
# Do not let an ignored developer dist tree or a cached build layer mask a
# missing design→console staging step.
docker build --no-cache --tag "${IMAGE_NAME}" .

echo "[docker-smoke] starting one-port container on localhost:${HOST_PORT}..."
docker run --detach --name "${CONTAINER_NAME}" --publish "${HOST_PORT}:8080" "${IMAGE_NAME}" >/dev/null

runtime_uid="$(docker exec "${CONTAINER_NAME}" id -u)"
[[ "${runtime_uid}" == "1000" ]] || {
    echo "[docker-smoke] FAIL: runtime user UID is ${runtime_uid}, expected non-root node UID 1000" >&2
    exit 1
}

if docker exec "${CONTAINER_NAME}" sh -c 'command -v pnpm || command -v corepack || command -v tsx' >/dev/null; then
    echo "[docker-smoke] FAIL: runtime image retains pnpm, Corepack, or tsx" >&2
    exit 1
fi

if docker exec "${CONTAINER_NAME}" sh -c 'find /app -type f \( -name "*.ts" -o -name "*.d.ts" -o -name "*.map" \) -print -quit | grep -q .'; then
    echo "[docker-smoke] FAIL: runtime image contains TypeScript, declarations, or source maps" >&2
    exit 1
fi

if docker exec "${CONTAINER_NAME}" sh -c 'find /app -type d \( -name src -o -name tests -o -name coverage \) -print -quit | grep -q .'; then
    echo "[docker-smoke] FAIL: runtime image contains source, test, or coverage directories" >&2
    exit 1
fi

docker exec "${CONTAINER_NAME}" test -s /app/packages/console/dist/host/host.js || {
    echo "[docker-smoke] FAIL: compiled host artifact is absent" >&2
    exit 1
}

for attempt in $(seq 1 30); do
    if curl --fail --silent "http://127.0.0.1:${HOST_PORT}/version" >/dev/null; then
        break
    fi
    if [[ "${attempt}" == 30 ]]; then
        echo "[docker-smoke] FAIL: container did not serve /version within 30 seconds" >&2
        docker logs "${CONTAINER_NAME}" >&2 || true
        exit 1
    fi
    sleep 1
done

check_spa_route() {
    local path="$1"
    local body
    body="$(curl --fail --silent "http://127.0.0.1:${HOST_PORT}${path}")"
    if [[ "${body}" != *"<div id=\"root\">"* ]]; then
        echo "[docker-smoke] FAIL: ${path} did not return the SPA shell" >&2
        exit 1
    fi
}

check_spa_route "/lobby"
check_spa_route "/match/m-123"
check_spa_route "/match/m-123/join"
check_spa_route "/match/m-123/spectate"

version_status="$(curl --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:${HOST_PORT}/version")"
[[ "${version_status}" == "200" ]] || {
    echo "[docker-smoke] FAIL: /version returned HTTP ${version_status}" >&2
    exit 1
}

asset_status="$(curl --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:${HOST_PORT}/assets/missing.css")"
[[ "${asset_status}" == "404" ]] || {
    echo "[docker-smoke] FAIL: missing asset returned HTTP ${asset_status}, expected 404" >&2
    exit 1
}

echo "[docker-smoke] checking staged brand assets in the console output..."
brand_count="$(docker exec "${CONTAINER_NAME}" sh -c 'find /app/packages/console/dist/assets/brand -type f -size +0c | wc -l')"
[[ "${brand_count}" -gt 0 ]] || {
    echo '[docker-smoke] FAIL: console output contains no staged brand assets' >&2
    exit 1
}

echo "[docker-smoke] performing WebSocket handshake on the mapped HTTP port..."
python3 - "${HOST_PORT}" <<'PY'
import base64
import hashlib
import socket
import sys

port = int(sys.argv[1])
key = base64.b64encode(b"0123456789abcdef").decode("ascii")
request = (
    "GET / HTTP/1.1\r\n"
    "Host: 127.0.0.1\r\n"
    "Upgrade: websocket\r\n"
    "Connection: Upgrade\r\n"
    f"Sec-WebSocket-Key: {key}\r\n"
    "Sec-WebSocket-Version: 13\r\n\r\n"
).encode("ascii")
expected_accept = base64.b64encode(
    hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode("ascii")).digest()
).decode("ascii")

with socket.create_connection(("127.0.0.1", port), timeout=5) as connection:
    connection.sendall(request)
    response = connection.recv(4096).decode("latin1")

if "HTTP/1.1 101 Switching Protocols" not in response:
    raise SystemExit(f"expected a WebSocket 101 response, got: {response!r}")
if "Upgrade: websocket" not in response:
    raise SystemExit(f"missing WebSocket Upgrade response header: {response!r}")
if f"Sec-WebSocket-Accept: {expected_accept}" not in response:
    raise SystemExit(f"invalid WebSocket accept response: {response!r}")
PY

mapped_port="$(docker port "${CONTAINER_NAME}" 8080/tcp)"
mapped_port="${mapped_port##*:}"
[[ "${mapped_port}" == "${HOST_PORT}" ]] || {
    echo "[docker-smoke] FAIL: Docker mapped ${mapped_port}, expected HTTP/WS port ${HOST_PORT}" >&2
    exit 1
}

exposed_ports="$(docker image inspect "${IMAGE_NAME}" --format '{{json .Config.ExposedPorts}}')"
[[ "${exposed_ports}" == '{"8080/tcp":{}}' ]] || {
    echo "[docker-smoke] FAIL: image exposes more than the single 8080/tcp port: ${exposed_ports}" >&2
    exit 1
}

echo "[docker-smoke] PASS: minimized non-root runtime, semantic SPA paths, /version, asset 404, HTTP+WS same-port handshake, and one EXPOSE port verified"
