#!/usr/bin/env bash
# Validate the two externally visible version surfaces of a built image.
#
# This intentionally runs against the image itself rather than the checkout:
# the published artifact is what must carry the canonical application version.

set -euo pipefail

if [[ "$#" -ne 2 ]]; then
    echo "usage: $0 IMAGE_REF EXPECTED_APP_VERSION" >&2
    exit 2
fi

image_ref="$1"
expected_app_version="$2"
host_port="${DOCKER_VALIDATE_PORT:-18081}"
container_name="europa-version-validate-$$"

cleanup() {
    docker rm -f "${container_name}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --detach \
    --name "${container_name}" \
    --publish "127.0.0.1:${host_port}:8080" \
    "${image_ref}" >/dev/null

for attempt in $(seq 1 30); do
    if curl --fail --silent "http://127.0.0.1:${host_port}/version" >/dev/null; then
        break
    fi
    if [[ "${attempt}" == 30 ]]; then
        echo "[docker-validate] FAIL: image did not serve /version within 30 seconds" >&2
        docker logs "${container_name}" >&2 || true
        exit 1
    fi
    sleep 1
done

version_json="$(curl --fail --silent "http://127.0.0.1:${host_port}/version")"
actual_app_version="$(jq --exit-status --raw-output '.appVersion' <<<"${version_json}")"
protocol_version="$(jq --exit-status --raw-output '.protocolVersion' <<<"${version_json}")"

if [[ "${actual_app_version}" != "${expected_app_version}" ]]; then
    echo "[docker-validate] FAIL: /version reports ${actual_app_version@Q}, expected ${expected_app_version@Q}" >&2
    exit 1
fi

# Use only Python's standard library for the wire probe. This avoids making
# the workflow runner or the runtime image carry a second WebSocket client;
# the probe still exercises the image's real RFC 6455 and hello dispatch path.
python3 - "${host_port}" "${expected_app_version}" "${protocol_version}" <<'PY'
import base64
import hashlib
import json
import os
import socket
import sys

port = int(sys.argv[1])
expected_app_version = sys.argv[2]
protocol_version = sys.argv[3]
key = base64.b64encode(os.urandom(16)).decode("ascii")
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
hello = json.dumps(
    {
        "type": "hello",
        "version": protocol_version,
        "seq": 1,
        "payload": {"protocolVersion": protocol_version},
    }, separators=(",", ":")
).encode("utf-8")
mask = b"\x13\x57\x9b\xdf"
masked_hello = bytes(value ^ mask[index % 4] for index, value in enumerate(hello))
frame = b"\x81" + bytes([0x80 | len(hello)]) + mask + masked_hello

def receive_exact(connection, size):
    data = b""
    while len(data) < size:
        chunk = connection.recv(size - len(data))
        if not chunk:
            raise RuntimeError("server closed before helloAck")
        data += chunk
    return data

with socket.create_connection(("127.0.0.1", port), timeout=5) as connection:
    connection.sendall(request)
    response = b""
    while b"\r\n\r\n" not in response:
        response += connection.recv(4096)
    if b"HTTP/1.1 101 Switching Protocols" not in response:
        raise SystemExit(f"expected WebSocket 101 response, got: {response!r}")
    if f"Sec-WebSocket-Accept: {expected_accept}".encode("ascii") not in response:
        raise SystemExit("invalid WebSocket accept response")
    connection.sendall(frame)
    first, second = receive_exact(connection, 2)
    if first & 0x0F != 1:
        raise SystemExit("expected a text helloAck frame")
    length = second & 0x7F
    if length == 126:
        length = int.from_bytes(receive_exact(connection, 2), "big")
    elif length == 127:
        length = int.from_bytes(receive_exact(connection, 8), "big")
    payload = receive_exact(connection, length)
    hello_ack = json.loads(payload.decode("utf-8"))
    if hello_ack.get("type") != "helloAck":
        raise SystemExit(f"expected helloAck, got: {hello_ack!r}")
    actual_app_version = hello_ack.get("payload", {}).get("appVersion")
    if actual_app_version != expected_app_version:
        raise SystemExit(
            f"helloAck reports {actual_app_version!r}, expected {expected_app_version!r}"
        )
PY

echo "[docker-validate] PASS: /version and helloAck.appVersion equal ${expected_app_version}"
