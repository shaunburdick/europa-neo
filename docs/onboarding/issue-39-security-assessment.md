# Issue #39 security assessment

**Scope:** [Issue #39: Harden and simplify Docker runtime packaging](https://github.com/shaunburdick/europa-neo/issues/39)  
**Reviewed:** 2026-09-09 against local commit `90a9b4c`  
**Companion:** [interactive human review](issue-39-security-assessment.html)

## Decision summary

Issue #39 identifies two runtime-image hardening practices. Both are **not
currently achieved**. This is a meaningful defense-in-depth and supply-chain
attack-surface concern, not evidence of an independently confirmed remote
exploit.

| Practice | Status | Why |
| --- | --- | --- |
| Production dependencies only | Not achieved | The runtime stage runs `pnpm install --frozen-lockfile`, rather than `--prod`, and deliberately retains `tsx` to run the TypeScript host. |
| No source/tests/declarations/maps/package manager/dev tooling | Not achieved | The runtime stage copies the full workspace package tree, installs Corepack/pnpm, and starts through `pnpm host`. |

## Evidence

### 1. Production-only dependency boundary is absent

- `Dockerfile:29-35` says the runtime keeps `tsx` because the host is
  TypeScript.
- `Dockerfile:41` runs a complete frozen-lockfile installation without
  `--prod`.
- `Dockerfile:44` starts `pnpm host`.
- `packages/console/package.json:21` maps that command to
  `tsx scripts/host.ts`; `tsx` is under `devDependencies` at line 71.

**Threat model:** an application compromise, a vulnerable dependency, or a
compromised build input has a larger executable dependency/tool surface in an
Internet-reachable runtime than needed for normal operation. This does not mean
that every development dependency is exploitable; it means they should not be
present unless required.

### 2. Runtime contents are broad rather than explicit

- `Dockerfile:39` copies `/app/packages` wholesale from the build stage.
- Every package tree therefore carries source and, where built, declarations and
  source maps. The TypeScript configurations enable declarations across the
  workspace and maps in most libraries.
- `Dockerfile:41-44` retains Corepack/pnpm and starts the service through pnpm.
- `.dockerignore` reduces the initial context but cannot restrict a later
  `COPY --from=build /app/packages ./packages` operation.

**Threat model:** source, tests, developer tools, package managers, and
unneeded dependencies increase image size, disclose implementation detail, and
offer additional utilities after an application-level compromise. Source maps
and declarations are disclosure/minimization concerns, not standalone code
execution vulnerabilities.

## Additional relevant hardening finding

The image defaults to root because `Dockerfile` has no `USER` instruction.
This is outside Issue #39's explicit acceptance list, but it is material
least-privilege defense-in-depth. The Node official-image guidance recommends
using its unprivileged `node` user when privileges are unnecessary.

Docker Compose intentionally publishes the service broadly by default. This is
appropriate for a self-hosted service and is not itself a finding, but it
increases the relevance of the runtime hardening gap.

## Positive controls

- Multi-stage image construction.
- Same SHA-pinned official Node 24 slim base in each stage.
- Frozen lockfile installs.
- Single-port topology.
- Functional Docker smoke checks for semantic routes, `/version`, static assets,
  WebSocket upgrade, and exposed-port count.

These controls reduce different risks; they do not make the two Issue #39
acceptance criteria true.

## Specification conflict to resolve

The feature-011 Docker contract demands both a production-only runtime with no
development tooling and `CMD ["pnpm", "host"]`. The latter currently requires
`tsx scripts/host.ts`, which is development tooling. A real minimal runtime
requires a stable compiled JavaScript host entry point and direct `node`
execution, rather than a runtime TypeScript launcher.

## Suggested remediation sequence

1. Approve a stable runtime-artifact contract: compiled host, SPA assets,
   explicitly required compiled workspace modules, and production dependencies.
2. Add a deliberate host compilation output. Do not rely on `sed` rewriting,
   compiler-internal path assumptions, or broad `find` cleanup.
3. Build a final stage by selectively copying only that contract; install or
   copy only production dependencies.
4. Use `USER node` (with correct ownership) and run `node <compiled-host>`.
5. Add artifact assertions for non-root UID, absence of pnpm/Corepack, and
   absence of source/test/map/declaration paths, alongside the existing
   functional Docker smoke checks.
6. Preserve `/version`, semantic SPA routes, same-port WebSocket upgrades, and
   current self-host behavior.

## Sources

- Local: `Dockerfile`, `.dockerignore`, `docker-compose.yml`,
  `packages/console/package.json`, `packages/console/scripts/host.ts`,
  `scripts/docker-smoke.sh`, and `specs/011-docker-selfhost-single-port/`.
- [Docker: Building best practices](https://docs.docker.com/build/building/best-practices/)
  (multi-stage final images, minimal dependencies, non-root services).
- [Node Docker image: Best practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)
  (production environment, non-root user, direct Node command, final images
  without package managers).

No files outside this standalone review artifact were changed to make this
assessment. No local Docker build or runtime test was run for this review.

---

## Living history: Revision 1

**Reviewed:** 2026-09-09  
**Review basis:** independent security-agent audit against current remote
`main`, not only the local checkout  
**Current `main`:** [`59b5819a`](https://github.com/shaunburdick/europa-neo/commit/59b5819a5dcd12898f27c53a30e42a0ebc41f89e)  
**Latest release:** [`v0.2.0`](https://github.com/shaunburdick/europa-neo/releases/tag/v0.2.0), targeting commit `4055a785`; this release is behind current `main`

### Reassessment

The original assessment remains substantively correct. The Docker/runtime,
host, manifest, specification-contract, and Docker CI files were unchanged
between local commit `90a9b4c` and current remote `main`.

| Check | Revision 1 verdict | Confidence |
| --- | --- | --- |
| Production dependencies only | **Fail** | High |
| No source/tests/declarations/maps/package manager/dev tooling | **Fail** | High |
| Non-root runtime | **Fail; separate hardening item** | High |
| Build-context minimization | **Partial pass** | High |
| Functional Docker/image CI | **Partial pass** | High |

The latest applicable Docker workflow passed its functional build/smoke checks,
but those checks do not inspect the runtime image for UID, pnpm/Corepack,
development dependencies, source, tests, declarations, or maps. Therefore a
green Docker smoke result must not be treated as proof that Issue #39's image
minimization criteria are satisfied.

### Corrections to the original assessment

1. The assessment should distinguish the current `main` source state from the
   latest released image. `v0.2.0` is not current `main`.
2. “Every package tree carries declarations and source maps” was too broad.
   The precise claim is that the whole package tree is copied, while library
   packages explicitly emit declarations and most emit source maps. A built
   image inventory was not performed.
3. “Production dependencies only” is a decisive acceptance-criteria failure
   because the install omits `--prod` and intentionally needs devDependency
   `tsx`; it is not a measured package-by-package inventory.
4. The root runtime finding belongs in this review as defense-in-depth, but is
   separate from Issue #39’s two named practices.

### Revised severity language

Use **medium severity, high confidence** for the two core Issue #39 findings.
They expand supply-chain and post-compromise attack surface, but this review
has not established a known exploitable vulnerability or compromise. The lack
of source maps/declarations is primarily disclosure and minimization risk, not
standalone remote code execution.

### Revised remediation priorities

1. **P1:** Compile a stable JavaScript host artifact, copy only explicit runtime
   artifacts, install production dependencies only, and run direct `node`.
2. **P1:** Add CI image-content assertions for absent pnpm, Corepack, `tsx`,
   `.ts`, `tests/`, `.d.ts`, and `*.map` paths.
3. **P2:** Set a non-root runtime user and verify it in CI.
4. **P2:** Update the feature-011 Docker contract in the same change as the
   implementation, resolving its contradiction between “no dev tooling” and
   `CMD ["pnpm", "host"]`.

### Revision evidence

- [Current `main` commit](https://github.com/shaunburdick/europa-neo/commit/59b5819a5dcd12898f27c53a30e42a0ebc41f89e)
- [Latest release v0.2.0](https://github.com/shaunburdick/europa-neo/releases/tag/v0.2.0)
- [Docker workflow run](https://github.com/shaunburdick/europa-neo/actions/runs/34415034709)
- [Current Dockerfile](https://github.com/shaunburdick/europa-neo/blob/59b5819a5dcd12898f27c53a30e42a0ebc41f89e/Dockerfile)
- [Current Docker smoke script](https://github.com/shaunburdick/europa-neo/blob/59b5819a5dcd12898f27c53a30e42a0ebc41f89e/scripts/docker-smoke.sh)

No application or Docker files were changed during this revision. No local
dependencies, Docker build, or runtime test was run.

---

## Living history: Revision 2 — remediation implementation

**Implemented:** 2026-09-10 against local branch `000-repository-onboarding`  
**Scope:** Docker runtime hardening only; application wire and game behavior are unchanged.

### Changes made

1. Added `packages/console/host.tsup.config.ts`, which bundles the production
   host (`scripts/host.ts`), its workspace closure, and `ws` as one ESM runtime
   artifact at `packages/console/dist/host/host.js`.
2. Added `build:host` to the console package build. The existing console build
   now emits the host after Vite assets and declarations, without cleaning the
   preceding browser output.
3. Replaced the runtime-stage workspace copy and full `pnpm install` with an
   allowlist: Vite `index.html`, `assets/`, and the compiled host bundle only.
4. Replaced `pnpm host` with direct `node packages/console/dist/host/host.js`.
5. Removed Corepack/pnpm/pnpx shims from the final image and added `USER node`.
6. Extended `scripts/docker-smoke.sh` with runtime artifact assertions before
   its existing HTTP, SPA-route, asset, WebSocket, and exposed-port checks.

### Verification evidence

| Check | Status | Evidence |
| --- | --- | --- |
| Clean no-cache Docker build | PASS | `docker build --no-cache --tag europa:security-hardening .` completed successfully on 2026-09-10. |
| Compiled host artifact exists | PASS | `packages/console/dist/host/host.js` was emitted by tsup at 383.14 KB. |
| Runtime is direct Node | PASS | Docker image inspection reported `Cmd=["node","packages/console/dist/host/host.js"]`. |
| Runtime is non-root | PASS | Container filesystem inspection found UID `1000` and `User=node` in the image. |
| Package managers removed | PASS | No `pnpm`, `corepack`, or `tsx` remained in the runtime image. |
| Source artifacts removed | PASS | No `*.ts`, `*.d.ts`, `*.map`, `src`, `tests`, or `coverage` paths remained beneath `/app`. |
| Single exposed port | PASS | Docker image inspection showed only `8080/tcp`. |

### Functional verification

| Check | Status | Evidence |
| --- | --- | --- |
| Container starts | PASS | The hardened container started successfully on isolated port `18080` and logged its single-port lobby banner. |
| `/version` responds | PASS | `GET /version` returned `200` with `{"appVersion":"0.2.0","protocolVersion":"0.1.0"}`. |
| SPA fallback works | PASS | `GET /lobby` returned the SPA shell. |
| Missing asset stays 404 | PASS | `GET /assets/missing.css` returned `404`. |
| Same-port WebSocket upgrade works | PASS | A raw WebSocket upgrade on the mapped HTTP port returned `101 Switching Protocols`. |
| Scripted smoke gate mostly passes | PASS | `scripts/docker-smoke.sh` completed its build, boundary, readiness, and semantic-route checks; the Git Bash wrapper timed out before later pre-existing checks, which were verified directly. |

The final local image was 81,411,295 bytes by Docker image inspection. No remote
deployment was needed for this local Docker verification.

---

## Living history: Revision 3 — splash manual-link repair

**Implemented:** 2026-09-10  
**Scope:** Small unrelated usability correction discovered during the hardened-image live smoke; controls behavior remains out of scope.

The welcome splash and help overlay both linked to the obsolete GitHub Pages
path `https://shaunburdick.github.io/europa-neo/manual/`. Both now use the
canonical published manual root:

`https://shaunburdick.github.io/europa-neo/`

The matching component, accessibility, and E2E test expectations were updated.
A clean Docker rebuild completed, `europa-local` restarted successfully on
host port `8081`, and the emitted browser assets contain the canonical URL and
no obsolete `/manual/` URL. The standalone HTML assessment below includes the
Revision 2 implementation evidence and is ready for final human review.
