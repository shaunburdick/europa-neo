# Tasks: Shared Application Versioning (Feature 009)

**Branch**: `009-shared-app-versioning` | **Spec**: [./spec.md](./spec.md) | **Plan**: [./plan.md](./plan.md)

Global constraints for every task (constitution + AGENTS.md):

- TypeScript strict; **zero inline suppressions** (`@ts-ignore`/`eslint-disable`/biome-ignore — fix the code); no `any`.
- Biome clean: `pnpm lint` and `pnpm format:check` pass repo-wide before each commit; 4-space/120-col.
- Tests stay excluded from package tsconfigs (documented repo-wide tradeoff — do NOT restructure).
- Never modify anything under `europa-source/`.
- New logic meets **≥80% coverage on every metric** (drift checker, `/version` handler — SC-006).
- Conventional commits; never push; commit only on this feature branch.

Wave execution order: **W1 → W2 → W3 → W4 → W5**. Within a wave, `[P]` tasks are mutually independent and may dispatch in parallel.

---

## Wave 1 — Foundation

- [x] **T-001: Scaffold the `@europa/version` package**
    - Create exactly (plan §1): `packages/version/package.json` (`@europa/version`, `"private": true`, `"version": "0.0.0"`, zero runtime deps, devDeps `tsup`/`typescript`/`vitest`/`@vitest/coverage-v8`/`@biomejs/biome` all `catalog:` except coverage, scripts mirroring fog's — T-007 later adds `version:check`), `tsconfig.json` (strict, extends `tsconfig.base.json`, excludes `tests/**`, `scripts/**`, `dist`), `tsup.config.ts` (ESM + dts, es2022 — copy fog's), `vitest.config.ts` (v8 coverage, 80% thresholds on every metric), `biome.jsonc` (extends root), `README.md` (what it owns; the one-commit bump convention), `src/app-version.ts` (`export const APP_VERSION = '0.0.0';` with JSDoc stating FR-001's single-source rules), `src/index.ts` (barrel).
    - Run `pnpm install` from root so the workspace links (and `pnpm-lock.yaml`) refresh.
    - **Accepts**: `pnpm --filter @europa/version build && pnpm --filter @europa/version lint && pnpm --filter @europa/version test` all green; from `packages/version/`: `node -e "import('./dist/index.js').then(m => console.log(m.APP_VERSION))"` prints `0.0.0`; root `pnpm typecheck` still green.
    - **Proves**: build/typecheck pipelines; no dedicated behavior tests yet (constant only).

- [x] **T-002: Pure drift-checker function + unit tests**
    - Create `packages/version/src/check-version-drift.ts`: exported types `VersionSource` (`{ kind: 'root-package' | 'workspace-package' | 'constant' | 'readme' | 'manual-index', file: string, version: string | null }` — `null` = required surface missing/unparseable) and `DriftReport` (`{ ok: boolean; mismatches: Array<{ file: string; expected: string; actual: string | null }> }`); exported `checkVersionDrift(sources): DriftReport` comparing every source against the `constant` source's value, collecting **every** mismatch (FR-009: never first-fail). No I/O, no `node:*` imports — pure.
    - Export both from `src/index.ts`.
    - Create `packages/version/tests/unit/check-version-drift.test.ts`: all-agree → `ok: true`, empty mismatches; each single-surface mismatch named with exact file path + expected/actual; multiple simultaneous mismatches all reported; missing doc line (`null`) reported; empty source list behaves explicitly (documented choice: not ok — the constant must be present).
    - **Accepts**: `pnpm --filter @europa/version test` green; `pnpm --filter @europa/version coverage` ≥80% on every metric for `check-version-drift.ts`; lint/format clean.
    - **Proves**: SC-001 logic half + SC-006 (checker coverage).

## Wave 2 — Consumers (all depend only on T-001; T-004–T-006 parallel)

- [x] **T-003: Additive `appVersion` on `HelloAckPayload` (wire change)**
    - Edit BOTH contract copies identically (same commit — conformance semantic-diff guards them): `.specify/features/004-multiplayer-networking/contracts/network-types.ts` and `packages/networking/src/contracts/network-types.ts` — `HelloAckPayload` gains `readonly appVersion?: string;` with JSDoc ("additive release identity; presence = server of feature-009 generation or later; clients MUST tolerate absence; never derived from or related to `protocolVersion`").
    - `packages/networking/package.json`: add `"@europa/version": "workspace:*"` to dependencies; `pnpm install`.
    - `packages/networking/src/server.ts` (`handleEnvelope`, case `'hello'`, ~line 692): populate `appVersion: APP_VERSION` (import from `@europa/version`). Touch nothing else in the hello path — `validateVersion`/`NETWORK_API_VERSION` semantics untouched (FR-004).
    - Update console contract mirrors ONLY if they restate `HelloAckPayload` fields verbatim (check `packages/console/contracts/console-to-networking.ts`; `envelope-to-event.ts` derives via `Extract` and should need no edit).
    - Tests — create `packages/networking/tests/integration/hello-app-version.test.ts`: (a) scripted WS handshake ack carries `appVersion === APP_VERSION` (SC-003 first half); (b) independence: `appVersion !== protocolVersion`, both present (SC-003 second half); (c) old-client tolerance: a raw client ignoring unknown fields completes handshake; (d) envelope shape otherwise byte-stable vs existing fixtures.
    - **Accepts**: networking suite green (`pnpm --filter @europa/networking test`), including existing `contracts-conformance.test.ts`; repo typecheck green.
    - **Proves**: FR-003, FR-004, SC-003; US1 AC-2.

- [x] **[P] T-004: `GET /version` endpoint on the host static surface**
    - Create `packages/console/scripts/version-route.ts`: `export function handleVersionRoute(req: IncomingMessage, res: ServerResponse, urlPath: string): boolean` — `GET /version` (query-string tolerant) → `200`, `content-type: application/json; charset=utf-8`, `STATIC_SECURITY_HEADERS` (reuse from `host-config.ts`), body exactly `{"appVersion":"<APP_VERSION>","protocolVersion":"<NETWORK_API_VERSION>"}`; any other method on `/version` → `405` + `Allow: GET` header, no body side effects; every other path → return `false` untouched. JSDoc throughout; no `any`; no suppressions.
    - Edit `packages/console/scripts/host.ts`: call `handleVersionRoute(req, res, urlPath)` at the top of `serveStatic()` before the SPA fallback (short-circuit when true).
    - Create `packages/console/tests/unit/version-route.test.ts` (mock req/res pairs, following `host-config.test.ts` precedent): GET returns 200 + exact JSON body parseable to `{appVersion: string, protocolVersion: string}` with no auth (SC-002); POST/PUT/DELETE → 405 without side effects; `/version/extra`, `/Version` (case), other paths → `false`; headers include security set.
    - **Accepts**: `pnpm --filter @europa/console test:unit` green; coverage on `version-route.ts` ≥80% every metric; lint/format clean.
    - **Proves**: FR-006, SC-002, SC-006 (endpoint half); US1 AC-1.

- [x] **[P] T-005: HUD version footer (console)**
    - `packages/console/package.json`: add `"@europa/version": "workspace:*"` dependency; `pnpm install`.
    - Edit `packages/console/src/render/App.tsx`: inside `<section id="hud" aria-label="Status bar">` add `<span className="europa-hud__item europa-hud__version">v{APP_VERSION}</span>` (import from `@europa/version`; renders in ALL connection states — bundled constant, works on serverless `/` demo).
    - Edit `packages/console/src/styles/index.css`: `.europa-hud__version` muted color meeting WCAG 2.2 AA contrast on the HUD background; no pointer/keyboard interception.
    - Tests: extend/add component test asserting the HUD's visible text contains `` `v${APP_VERSION}` `` as real DOM text (SC-004, read through Clarifications presentation ruling); net/store unit test pinning that a `helloAck` WITHOUT `appVersion` flows through cleanly — no crash, no wrong display (old-server tolerance, spec Edge Cases); full a11y suite stays green (axe scan over mounted App).
    - **Accepts**: `pnpm --filter @europa/console test:unit test:component test:a11y` green; lint/format clean.
    - **Proves**: FR-007, SC-004; US3 AC-1/AC-2.

- [x] **[P] T-006: Documentation surfaces + AGENTS.md scrub**
    - `README.md`: insert `Current release: **v0.0.0**` directly under the license badge, and `docs/manual/index.md`: append final line `*This manual documents Europa Neo v0.0.0.*` — exact literal formats from plan §5 (these are the drift-check grep targets). Land both at `v0.0.0` so the tree stays drift-consistent at every commit; **T-010 flips both to `v0.0.1` together with the package versions** (the tree must never fail its own checker mid-series).
    - `docs/manual/reading-the-screen.md`: one-line mention of the new HUD version indicator in the HUD tour (spec 007 FR-012 same-change-set discipline).
    - `AGENTS.md`: "Next" section — rewrite the #6 line dropping the stale reserved-number wording: `#6 enhancement: 3–4 player support end-to-end (blocked by #2)` (issue-linked, number-free; PO explicitly wants this inside this PR).
    - **Accepts**: manual renders correctly (Jekyll-front-matter intact); `rg -n "Current release" README.md` and `rg -n "documents Europa Neo" docs/manual/index.md` hit exactly one line each; no CI expected to run (docs-only) but `pnpm format:check` still clean.
    - **Proves**: FR-008 structure, FR-011 AGENTS.md clause; US4 AC-1 (value correctness lands with T-010).

## Wave 3 — Enforcement & companion specs

- [x] **T-007: Drift-check CLI + local script + integration tests**
    - Create `packages/version/scripts/check-version-drift.ts`: resolves repo root relative to the script location (optional `--root <dir>` override for tests), gathers real sources (root + `packages/*/package.json` via `node:fs` readdir sorted for stable output; `APP_VERSION` via direct import of `../src/index.ts`; README/manual lines via regex reads per plan §5), prints one `mismatch:` line per offending file to stderr using `process.stderr.write` (host.ts `say()` precedent — no `console`), exits `0`/`1`. Zero new dependencies; `tsx` runs it (devDep already catalog'd).
    - `packages/version/package.json`: `"version:check": "tsx scripts/check-version-drift.ts"`.
    - Root `package.json`: `"version:check": "pnpm --filter @europa/version version:check"`.
    - Create `packages/version/tests/integration/cli.test.ts`: (a) run against the REAL repo root → exit 0 (positive lockstep proof); (b) build temp fixture trees under `os.tmpdir()` with injected mismatches (one edited package.json; one stale README line; one missing manual footer) → exit non-zero AND stderr names each offending file (SC-001 both directions, real files never mutated); (c) fixture with everything agreeing → exit 0.
    - **Accepts**: `pnpm version:check` exits 0 from repo root; `pnpm --filter @europa/version coverage` ≥80% every metric incl. the script's gather/report logic; lint/format clean.
    - **Proves**: FR-009, SC-001, SC-005, SC-006; US2 AC-1/AC-2/AC-3.

- [x] **[P] T-008: Boot/join version logging taps (FR-005)**
    - `packages/networking/src/server.ts`: `deps.logger.info('match server listening', { appVersion: APP_VERSION, …existing boot detail })` in the listen path; `deps.logger.info('seat joined', { appVersion: APP_VERSION, playerId/connection detail })` on successful seat claim — matching the existing `Logger` interface and call-site style.
    - `packages/console/scripts/host.ts`: banner gains a `Version : v${APP_VERSION}` line rendered from the constant (via `say()`); seat-join bridge tap includes the version (production runs `NULL_LOGGER`, so the launcher's output IS the operator log).
    - Tests: networking unit test with captured fake logger asserting both lines carry `appVersion` equal to the constant (extend an existing server unit test file or add `tests/unit/version-logging.test.ts`).
    - **Accepts**: networking suite green; console `test:unit` green; lint/format clean. (Depends on T-003's import landing first — same file.)
    - **Proves**: FR-005; US1 AC-3.

- [x] **[P] T-009: Companion spec amendments (FR-011 — same change set as implementation)**
    - `.specify/features/004-multiplayer-networking/spec.md`: document `HelloAckPayload.appVersion` (additive optional, tolerance rule) wherever the payload shape is enumerated; add the app-vs-protocol distinction note next to FR-004 ("app version = release identity (feature 009); protocol version = compatibility contract; neither implies the other").
    - `.specify/features/005-client-console/spec.md`: HUD version-footer requirement in the status-display area (FR-008 neighborhood) — real DOM text, all connection states, AA contrast, shows bundled `v`-prefixed constant.
    - `.specify/features/007-player-manual/spec.md`: manual index footer requirement (consistent with FR-012's same-change-set rule).
    - Cross-check each amendment against the actual code landed in T-003/T-005/T-006 — specs stay truthful, no aspirational wording.
    - **Accepts**: the three specs read as implemented; no contradictions with their Clarifications sections; markdown lint/format conventions of sibling specs matched.
    - **Proves**: FR-011; constitution IV.

## Wave 4 — Lockstep bump + CI gate

- [x] **T-010: Lockstep bump to `0.0.1` (SC-007)**
    - Flip version `0.0.0` → `0.0.1` in: root `package.json`, `packages/{engine,terrain,fog,networking,matchmaking,console,version}/package.json` (seven), and `packages/version/src/app-version.ts` (`APP_VERSION = '0.0.1'`), plus the two doc lines from T-006 (`README.md` → `Current release: **v0.0.1**`, `docs/manual/index.md` → `*This manual documents Europa Neo v0.0.1.*`). Single commit — the first exercise of the one-commit bump convention.
    - **Accepts**: `pnpm version:check` exits 0; `pnpm install && pnpm build && pnpm typecheck` green; quick smoke: boot `pnpm host` headless (or run console e2e) and observe the version in the banner/HUD.
    - **Proves**: FR-010 (first lockstep value `0.0.1` per Clarifications v1.1), SC-007; US4 AC-1/AC-2 final values.

- [x] **[P] T-011: CI drift workflow**
    - Create `.github/workflows/version-drift.yml` on the issue-#3-hardened house shape: name `Version Drift`; `push`/`pull_request` branches `[main]`, `workflow_dispatch`; paths = `package.json`, `packages/**/package.json`, `packages/version/**`, `README.md`, `docs/manual/index.md`, `.github/workflows/version-drift.yml`; `concurrency` group `${{ github.workflow }}-${{ github.head_ref || github.run_id }}` + `cancel-in-progress: true`; top-level `permissions: contents: read`; actions SHA-pinned with version comments copied verbatim from `client-ci.yml` (checkout v4.4.0 `11d5960a…`, pnpm/action-setup v6.0.10 `0977fd99…`, setup-node v6.5.0 `24997072…`); steps: checkout → pnpm setup → node 22 + `cache: 'pnpm'` → `pnpm install --frozen-lockfile` → `pnpm version:check`.
    - Validate: YAML parses (`python3 -c "import yaml; yaml.safe_load(open('.github/workflows/version-drift.yml'))"`); trigger/permission/concurrency shape matches sibling workflows.
    - **Accepts**: workflow_dispatch run green once pushed (post-merge verification note for PM); local YAML validation passes.
    - **Proves**: FR-009 CI half; US2 AC-1 in automation.

## Wave 5 — Verification & state

- [x] **T-012: Repo-wide gates + project-state update**
    - Full gates from a clean slate: `pnpm install`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm version:check` — all green; confirm zero inline suppressions in the diff (`rg -n "biome-ignore|@ts-ignore|@ts-nocheck|eslint-disable" packages/version packages/console/scripts packages/console/src packages/networking/src` → no hits).
    - Confirm coverage reports for `@europa/version` and the console unit project show ≥80% on every metric for the new modules (SC-006).
    - Update `AGENTS.md` "Current state" (feature 009 entry: scope, key decisions AD-2/AD-4/AD-5, suite deltas) and flip `specs/009-shared-app-versioning/spec.md` `**Status:**` to Implemented when acceptance is complete.
    - **Proves**: constitution verification-before-commit; SC-001..SC-007 all demonstrably green; hand-off ready.
