#!/usr/bin/env bash
# Build and smoke-test the single-port Docker image, including semantic SPA
# entry paths. This exercises the image through one published port.

set -euo pipefail

IMAGE_NAME="${DOCKER_SMOKE_IMAGE:-europa:semantic-url-smoke}"
HOST_PORT="${DOCKER_SMOKE_PORT:-18080}"
CONTAINER_NAME="europa-semantic-url-smoke-$$"

cleanup() {
    docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[docker-smoke] validating Compose configuration..."
docker compose config -q

echo "[docker-smoke] building ${IMAGE_NAME}..."
docker build --tag "${IMAGE_NAME}" .

echo "[docker-smoke] starting one-port container on localhost:${HOST_PORT}..."
docker run --detach --name "${CONTAINER_NAME}" --publish "${HOST_PORT}:8080" "${IMAGE_NAME}" >/dev/null

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

exposed_ports="$(docker image inspect "${IMAGE_NAME}" --format '{{json .Config.ExposedPorts}}')"
[[ "${exposed_ports}" == '{"8080/tcp":{}}' ]] || {
    echo "[docker-smoke] FAIL: image exposes more than the single 8080/tcp port: ${exposed_ports}" >&2
    exit 1
}

echo "[docker-smoke] PASS: semantic SPA paths, /version, asset 404, and one EXPOSE port verified"
