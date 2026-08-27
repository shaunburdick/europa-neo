# Contracts: One-Command Self-Host Packaging (Docker) — Single-Port Deployment

This feature has NO wire-protocol contract change (`NETWORK_API_VERSION` unchanged). The contracts below are **deployment and host-configuration contracts** — the Dockerfile/compose/env surface and the GHCR workflow contract that other packages/docs/CI depend on. They are normative for reviewers and for the quickstart validation.

| Contract | File | Purpose |
|---|---|---|
| Docker image build | [docker-image.md](./docker-image.md) | Multi-stage build inputs, base pin, layer expectations, `EXPOSE`/`CMD` contract |
| Compose project | [docker-compose.md](./docker-compose.md) | Single port mapping, env passthrough, one-command guarantee |
| GHCR publish workflow | [ghcr-publish.md](./ghcr-publish.md) | Triggers, image name, tags, permissions, platform policy |
| Host env & single-port | [host-env.md](./host-env.md) | `HOST_*` vars, removed `HOST_STATIC_PORT`/`--static-port`, client same-origin fallback |
