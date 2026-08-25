# Implementation Plan: Shared Application Versioning (Feature 009)

**Branch**: `009-shared-app-versioning` | **Date**: 2026-08-25 | **Spec**: [./spec.md](./spec.md) | **Research**: [./research.md](./research.md) | **Issue**: #11 (milestone v0.1.0)

---

## Summary

One private workspace package (`@europa/version`) owns `APP_VERSION`; every guarded surface — the WebSocket hello acknowledgment, an unauthenticated `GET /version` HTTP endpoint, the console HUD footer, the README header, and the player-manual index footer — projects that single value; a pure-function drift checker (CI + local script) fails loudly when any surface disagrees. The initial lockstep value is **`0.0.1`** (Clarifications v1.1: PO ruling — `0.1.0` is deferred to release issue #4's bump-then-tag flow). Protocol version semantics are **untouched**: this feature adds a *release identity* next to spec 004's *compatibility contract*, never conflating them (FR-004 boundary).

## Technical Context

- pnpm monorepo, Node ≥ 22, TypeScript strict, Biome 2 (4-space/120-col), Vitest 4 + v8 coverage, tsup for package builds, `tsx` for script entry points.
- New package joins the existing six under `packages/*`; all packages remain `"private": true`.
- No new third-party runtime dependencies anywhere: `@europa/version` is zero-dependency; consumers use existing workspace links; the drift check compares strings for equality (no semver library).

## Constitution Alignment

| Principle | Status |
| --- | --- |
| I — Type safety | ✅ Strict TS; no `any`; no suppressions; optional wire field handled under `exactOptionalPropertyTypes` |
| II — Determinism | ✅ No simulation code touched; version strings are static constants |
| III — ≥80% coverage on new logic | ✅ Drift checker lives inside `@europa/version`'s standard vitest gate; `/version` handler unit-tested in console (SC-006) |
| IV — Specs as documentation | ✅ FR-011 companion amendments to specs 004/005/007 land in the same change set; AGENTS.md scrub included |
| V — Simplicity | ✅ String equality, one constant module, one route function, one pure checker — no semver parsing, no changesets tooling, no build-time injection |
| VI — Accessibility | ✅ HUD version is real DOM text in the existing labelled status-bar section; AA contrast via CSS; axe suite stays green |
| VII — Self-hostable | ✅ Unauthenticated `/version` on the console-serving origin; version visible via `curl`, logs, HUD, and docs without any tooling |

## Architecture

### 1. Package scaffold — `packages/version`

Mirrors the fog package's shape exactly (repo convention):

```
packages/version/
├── package.json        # @europa/version, private, version 0.0.0 → bumped to 0.0.1 with everyone
├── tsconfig.json       # strict, extends tsconfig.base.json
├── tsup.config.ts      # ESM + dts, target es2022 (identical to fog's)
├── vitest.config.ts    # v8 coverage, 80% thresholds on every metric
├── biome.jsonc         # extends root config
├── README.md           # what it is, how to bump (one chore(release) commit)
├── scripts/
│   └── check-version-drift.ts   # CLI wrapper → exit code (tsx-run)
├── src/
│   ├── index.ts        # public barrel
│   ├── app-version.ts  # export const APP_VERSION = '0.0.0'; (+ JSDoc: single source rules)
│   └── check-version-drift.ts   # pure function: sources → { ok, mismatches[] }
└── tests/
    ├── unit/check-version-drift.test.ts    # fixture inputs; mismatch naming; ok path
    └── integration/cli.test.ts             # real repo → exit 0; temp fixture trees → non-zero naming files (SC-001)
```

**Export surface** (deliberately tiny): `APP_VERSION` (the constant), `checkVersionDrift` (the pure checker + its `VersionSource`/`DriftReport` types). The CLI script imports the checker from `../src/` directly (tsx executes TS; no build needed for the script path — same pattern as `scripts/host.ts`, same documented scripts-excluded-from-tsconfig tradeoff).

### 2. Wire change — additive optional field

- `specs/004-multiplayer-networking/contracts/network-types.ts` + local copy `packages/networking/src/contracts/network-types.ts`: `HelloAckPayload` gains `readonly appVersion?: string` (JSDoc: presence = server of this generation or later; clients MUST tolerate absence).
- `packages/networking/package.json`: add `"@europa/version": "workspace:*"` dependency.
- `packages/networking/src/server.ts` (`handleEnvelope`, case `'hello'`): populate `appVersion: APP_VERSION` at the sole construction site.
- Both contract copies change in the same commit — networking's conformance test semantic-diffs them (research §3).
- Client side needs **no structural change**: `envelope-to-event.ts` derives its payload view via `Extract<NetworkPayload, …>`. Tolerance is pinned by tests both directions (old server ↔ new client, new server ↔ old client).

**FR-004 boundary (explicit)**: `NETWORK_API_VERSION`, `validateVersion`, envelope `version` fields, and the compatibility policy are untouched. No code path derives either value from the other; a test pins that `appVersion !== protocolVersion` today and both may evolve independently.

### 3. `/version` endpoint — host static surface

- New `packages/console/scripts/version-route.ts`: exports `handleVersionRoute(req, res, urlPath): boolean` — matches `GET /version` exactly (query-string tolerant), responds `200` + `application/json; charset=utf-8` + `STATIC_SECURITY_HEADERS` with body `{ "appVersion": "<semver>", "protocolVersion": "<string>" }`; any other method on `/version` → `405` with `Allow: GET`, no side effects; returns `false` for every other path so the SPA flow is untouched.
- `serveStatic()` calls it first, before the extension-less→`index.html` fallback (which would otherwise swallow `/version`).
- Values: `APP_VERSION` from `@europa/version`; `protocolVersion` from `NETWORK_API_VERSION` (`@europa/networking` — already a host.ts import).
- Placement rationale: FR-006 names "the HTTP surface that serves the console/static assets" — the host's static server, not the WebSocket port. `createMatchServer` stays pure WS.

### 4. HUD footer — console

- `packages/console/package.json`: add `"@europa/version": "workspace:*"`.
- `src/render/App.tsx`: add one `<span className="europa-hud__item europa-hud__version">v{APP_VERSION}</span>` inside the existing `<section id="hud" aria-label="Status bar">` — real DOM text, all connection states (it renders from the bundled constant, so the serverless `/` demo shows it too, per spec edge case).
- `src/styles/index.css`: subtle muted color for `.europa-hud__version` meeting WCAG 2.2 AA against the HUD background; no pointer/keyboard interception (inherits the section's non-interactive styling).
- **Display decision**: the HUD shows the *bundled* constant (`v`-prefixed per Clarifications presentation ruling), not the hello-ack field. The wire field exists for API-level verification (US1); rendering a server-reported version could show a *different* version than the running client code (stale tab), which is worse than useless. SC-004 is read through the Clarifications v1.0 presentation ruling: visible text equals `` `v${APP_VERSION}` ``.
- Console tolerance: adapter/store ignore `helloAck.appVersion` beyond passthrough; a unit test pins that a helloAck without the field flows through cleanly (old-server tolerance) and nothing crashes.

### 5. Doc surfaces (stable grep targets)

Exact formats the drift checker pins (defined here so tasks and checker agree):

- `README.md` — directly under the license badge: `Current release: **v0.0.1**`
- `docs/manual/index.md` — final line: `*This manual documents Europa Neo v0.0.1.*`
- Checker regexes capture the version token from each line and compare against `APP_VERSION`; a missing line counts as a mismatch naming the file.
- Manual edits trip the existing `pages-deploy.yml` path gate — US4 AC-2 needs no workflow change.
- House-rule rider (spec 007 FR-012 discipline): `docs/manual/reading-the-screen.md` (the HUD tour) gets a one-line mention of the new version indicator in the same change set, so the manual never describes a HUD that no longer exists.

### 6. Drift-check mechanism

- **Pure core**: `checkVersionDrift(sources)` where each source carries `{ kind, file, version }` extracted by thin readers (JSON parse for `package.json`s; exact-string read for `APP_VERSION`; regex for the two doc lines). Returns `{ ok, mismatches: Array<{ file, expected, actual }> }` — mismatches name **every** disagreeing file (FR-009), not just the first.
- **CLI**: `scripts/check-version-drift.ts` resolves the repo root relative to its own location (no cwd dependence), gathers real sources, prints one line per mismatch to stderr, exits `0`/`1`. Accepts an explicit root argument so the integration test can point it at temp fixture trees without touching real files (SC-001 both directions).
- **Local script**: root `package.json` → `"version:check": "pnpm --filter @europa/version version:check"` (keeps `tsx` out of root devDependencies).
- **CI**: new `.github/workflows/version-drift.yml`, issue-#3-hardened shape: `push`/`pull_request` on `[main]` path-gated to the guarded files themselves + `packages/version/**` + the workflow file; `workflow_dispatch`; concurrency group `${{ github.workflow }}-${{ github.head_ref || github.run_id }}` with `cancel-in-progress: true`; top-level `permissions: contents: read`; actions SHA-pinned with version comments copied verbatim from `client-ci.yml` (checkout v4.4.0, pnpm/action-setup v6.0.10, setup-node v6.5.0); steps: checkout → pnpm setup → node 22 + cache → `pnpm install --frozen-lockfile` → `pnpm version:check`.

### 7. Logging taps (FR-005)

- Networking (structured seam): `deps.logger.info` at server boot (`appVersion` alongside host/port details) and on each successful seat join (`appVersion` + seat/player details) — unit-tested with a captured fake logger, matching the existing `Logger` injection pattern.
- Host (human-facing seam): the `pnpm host` banner gains a `Version : v0.0.1` line and the seat-join tap includes the version, because production runs with `NULL_LOGGER` and the launcher's own output *is* the operator-visible log.

### 8. Lockstep bump

One task flips **all eight** files — root `package.json` + seven workspace `package.json`s (six shipped + the new `@europa/version`) + the `APP_VERSION` constant — from `0.0.0` to **`0.0.1`**, then runs `pnpm version:check` green as acceptance (SC-007). The bump lands after the checker exists so machinery verifies it the moment it happens.

## Decisions

| # | Decision | Choice | Rationale / rejected alternative |
| --- | --- | --- | --- |
| AD-1 | Version source | Plain exported constant from built `dist/`, workspace-linked | Spec Out of Scope rejects `define` injection, git-describe, runtime root-package reads; one module serves Node + browser (research §1) |
| AD-2 | Initial value | `0.0.1` in this change set; `0.1.0` deferred to issue #4 bump-then-tag | Clarifications v1.1 PO ruling; supersedes v1.0 ruling #2 |
| AD-3 | Drift-checker home | Pure function inside `@europa/version` + thin CLI script | Inherits standard package test infra + 80% gate (SC-006) without inventing root-level test plumbing; repo has no root test project |
| AD-4 | Endpoint location | Host static server route, extracted testable handler | FR-006's operative wording; keeps `createMatchServer` pure WS; unit-testable per `host-config.test.ts` precedent |
| AD-5 | HUD source | Bundled constant, `v`-prefixed; hello-ack field tolerated-but-not-rendered | Stale-tab mixed-version display is harmful; wire field's job is API verification (US1); Clarifications presentation ruling |
| AD-6 | CI wiring | Dedicated path-gated workflow over the guarded files | Issue-#3 house shape; if guarded files didn't change, drift is impossible — gating on them is sound and cheap |
| AD-7 | Doc formats | Fixed literal lines (README under badge; manual index last line) | Deterministic grep targets; checker treats missing line as mismatch |
| AD-8 | Protocol version | Untouched | FR-004 boundary: separate lifecycles, no derivation; pinned by independence test (SC-003) |

## Files to Modify / Create

| File | Change |
| --- | --- |
| `packages/version/**` | **New package** (scaffold per §1) |
| `package.json` (root) | `version:check` script; version bump |
| `packages/{engine,terrain,fog,networking,matchmaking,console}/package.json` | Version bump to `0.0.1` |
| `packages/networking/package.json` | + `@europa/version` workspace dep |
| `packages/networking/src/contracts/network-types.ts` | `HelloAckPayload.appVersion?` |
| `specs/004-multiplayer-networking/contracts/network-types.ts` | Same (canonical copy) |
| `packages/networking/src/server.ts` | Populate field; boot/join logger lines |
| `packages/console/package.json` | + `@europa/version` dep; version bump |
| `packages/console/scripts/host.ts` | Route interception; banner/tap version lines |
| `packages/console/scripts/version-route.ts` | **New** — endpoint handler |
| `packages/console/src/render/App.tsx`, `src/styles/index.css` | HUD version item |
| `README.md`, `docs/manual/index.md`, `docs/manual/reading-the-screen.md` | Version surfaces (§5) |
| `AGENTS.md` | "Next" §: drop stale "spec-driven feature 008" wording from the #6 line (issue-linked, number-free) |
| `.github/workflows/version-drift.yml` | **New** — CI drift gate |
| Specs 004/005/007 | FR-011 companion amendments (same change set as implementation) |
| `pnpm-lock.yaml` | Refreshed by `pnpm install` after scaffold |

## Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Editing only one contract copy → conformance failure | Both copies in one commit; existing semantic-diff tests catch it immediately (research §3) |
| Drift check vs monorepo reality (lockfile, demos) | Checker guards exactly FR-009's declared surfaces; nothing else |
| Coverage gate on a near-trivial package | Thresholds apply to the checker logic (branches: missing lines, malformed JSON, partial mismatches) — genuinely exercised, not gamed |
| Bundle budget creep | One string constant; perf suite re-runs in console CI regardless |
| `exactOptionalPropertyTypes` friction on the optional field | Presence-narrowing pinned by test; no suppressions |
