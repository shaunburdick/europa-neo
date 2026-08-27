# Contract: GHCR Publish Workflow

**Artifact**: `.github/workflows/docker-publish.yml`  
**Applicable FR**: FR-014  
**Spec**: [../spec.md](../spec.md) | **Research**: [../research.md](../research.md) Finding 4

## Trigger contract

```yaml
on:
  push:
    branches: [main]
    tags: ['v*']
    paths:
      - 'Dockerfile'
      - 'docker-compose.yml'
      - '.dockerignore'
      - '.github/workflows/docker-publish.yml'
      - 'package.json'
      - 'pnpm-lock.yaml'
      - 'packages/**'
      - '!**/*.md'   # docs-only changes must not publish
  workflow_dispatch:
```

- `main` pushes path-filtered → build & push `:edge` (and optionally `:latest` if the project decides — non-required).
- `v*` tag pushes (via `feature 009` release flow) → `:X.Y.Z` + `vX.Y.Z` versioned tags (metadata-action derives from ref or from `APP_VERSION` with a verification step).
- `workflow_dispatch` is allowed but guarded by `if: github.repository == 'shaunburdick/europa-neo'` to block fork publishes.
- Pushes to feature branches/MRs (incl. `issue-*` branches) MUST NOT publish (path filter would still match but `branches: [main]` blocks them).

## Image & tags

| Field | Contract |
|---|---|
| `image` | `ghcr.io/shaunburdick/europa-neo` (lowercase owner). |
| `edge` | `type=edge,branch=main` → `ghcr.io/shaunburdick/europa-neo:edge` on every `main` push that changes watched paths. |
| `versioned` | `type=semver,pattern={{version}}` + `type=semver,pattern=v{{version}}` on `v*` tag pushes via `docker/metadata-action`. Exactly the tag's semver (no extra `latest` unless decided). |
| `tag source` | Either the triggering ref's `vX.Y.Z` or `APP_VERSION` extracted from `packages/version/src/app-version.ts` (`grep` + fail-loudly on malformed) — the workflow MUST assert `/version` inside the built image matches `APP_VERSION`. |

## Permissions & supply chain

- Top-level `permissions`: `contents: read`, `packages: write` (minimal for GHCR via `GITHUB_TOKEN`). Add `id-token: write` ONLY if provenance/SLSA attestation is enabled.
- `uses:` actions MUST be SHA-pinned with `# vX.Y.Z` version comments (pattern shared with every existing workflow): `actions/checkout`, `docker/setup-qemu-action`, `docker/setup-buildx-action`, `docker/login-action`, `docker/metadata-action`, `docker/build-push-action`.
- QEMU + Buildx setup BEFORE `build-push-action` (multi-arch requirement).
- Login via `docker/login-action` with `registry: ghcr.io`, `username: ${{ github.actor }}`, `password: ${{ secrets.GITHUB_TOKEN }}`.

## Platform & blocking policy (binding)

- **Mandatory**: `linux/amd64` MUST be built and published. A failure to build/push `amd64` fails the workflow (`exit 1`).
- **Stretch (non-blocking)**: `linux/arm64` is best-effort. The workflow MUST document and implement this as non-blocking:

  ```yaml
  # Header comment: "arm64 is best-effort non-blocking per plan D8 / research Finding 4 — amd64 MUST publish even when arm64 fails."
  strategy:
    fail-fast: false
    matrix:
      platform: [linux/amd64, linux/arm64]
  continue-on-error: ${{ matrix.platform == 'linux/arm64' }}
  # OR: two separate build-push jobs with `if: failure() && needs.arm64.result == 'failure'` push of the amd64 manifest always.
  ```

  Without this header comment, an `arm64` emulation OOM on free runners could block `:edge`.

## Concurrency & timeout

```yaml
concurrency:
  group: docker-publish-${{ github.ref }}
  cancel-in-progress: false  # releases MUST NOT cancel an in-flight push (FR-014 parity with release.yml)
```

Build job `timeout-minutes: 30` (QEMU+multi-arch can be slow).

## Reproducibility & provenance inside image

- `docker build` MUST use `--frozen-lockfile` through the Dockerfile stage (enforced by the stage, not by an `ARG`).
- Post-build verification (run inside the workflow on the freshly built image):

  ```bash
  docker run --rm IMAGE node -e "console.log(require('./packages/version/dist/app-version').APP_VERSION)"
  docker run -d -p 8080:8080 IMAGE && sleep 2 && curl -s http://localhost:8080/version | jq -e '.appVersion == "... "'
  ```

  Without this, drift between GHCR tag and internal `APP_VERSION` cannot be detected before publish.

## Self-exclusion note

Unlike `release.yml`'s deliberate self-exclusion (pushing `release.yml` itself before any version bump would mint a spurious release), `docker-publish.yml` SHOULD include itself in its `paths:` filter — Dockerfile/compose changes there ARE deployable and never spurious. Document the divergence from `release.yml`'s ruling in the workflow header to avoid a cargo-cult "exclude self" copy-paste.
