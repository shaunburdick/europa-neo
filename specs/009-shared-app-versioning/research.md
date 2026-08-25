# Research: Shared Application Versioning (Feature 009)

**Branch**: `009-shared-app-versioning` | **Date**: 2026-08-25 | **Spec**: [./spec.md](./spec.md) | **Issue**: #11

Brief research record backing the plan's decisions. Every claim below was verified against the working tree on this branch (commit `f1b89d4`).

---

## 1. How Vite bundles workspace constants for the browser build

**Verified**: `packages/console/vite.config.ts` uses **no source aliases and no `define` injection** — workspace packages (`@europa/engine`, `@europa/fog`, …) resolve through plain pnpm workspace links to each package's **built `dist/` output** (stated in the config's own header comment; confirmed by the absence of `resolve.alias`/`define` keys).

Consequence for `@europa/version`:

- A plain `import { APP_VERSION } from '@europa/version'` in console source is bundled by Rollup at build time via the symlinked package's `dist/index.js` — the constant is inlined into the browser bundle with no runtime file access. This satisfies the spec's shallow-clone/Docker edge case (version comes from checked-in source, never `git describe`).
- Node consumers (`@europa/networking` server code, the host script) resolve the same `dist/index.js` through the workspace link — one constant, both runtimes.
- The package therefore needs the standard repo scaffold: `tsup` ESM + dts build (identical to `packages/fog/tsup.config.ts`), `"exports"` map pointing at `dist/`, `"type": "module"`, `"private": true`.
- **Rejected**: Vite `define: { __APP_VERSION__ }` injection — explicitly ruled out in the approved design (spec Out of Scope); it forks the truth (browser gets a compiler flag, Node reads a module) and breaks the single-constant claim of FR-002.

## 2. How the host static handler serves routes today

**Verified**: `packages/console/scripts/host.ts` → `serveStatic()` (line ~219):

1. Splits off the query string, decodes the path (malformed escapes → 404).
2. `/` → `index.html`; any other path resolves inside `DIST_DIR` with a traversal guard (`isPathInside`, plus a `realpath` re-check).
3. **Existing files stream with a MIME type; missing/extension-less paths fall back to `index.html`** (SPA safety net).

Key fact: **`GET /version` currently falls through to `index.html`** (extension-less path → SPA fallback). The endpoint must be intercepted *before* the fallback. The clean insertion point is the top of `serveStatic()` (or the `createHttpServer` callback), delegating to an extracted, unit-testable route function.

**Testability precedent**: script helpers are already unit-tested — `tests/unit/host-config.test.ts` imports `../../scripts/host-config` and `../../scripts/host` (`resolveConfig`). The `/version` handler follows this pattern: new `packages/console/scripts/version-route.ts`, tested from `tests/unit/version-route.test.ts` with mock `IncomingMessage`/`ServerResponse` pairs. Note `tsconfig.json` excludes `tests/**` and `scripts/**` (documented repo-wide tradeoff — do not restructure; CI compensates).

**FR-006 scoping**: the endpoint lives on the surface that "serves the console/static assets" — i.e., the host's static server (`:5173` under `pnpm host`), **not** on the WebSocket match server port. `createMatchServer` is pure WebSocket transport; adding HTTP handling there would be an unrequested networking-package change.

## 3. Where `HelloAckPayload` lives and what mirrors it

The wire change (additive optional `appVersion`) touches a known, fully-mirrored chain:

| File | Role | Update |
| --- | --- | --- |
| `specs/004-multiplayer-networking/contracts/network-types.ts` (~line 327) | Canonical spec contract (source of truth) | Add `readonly appVersion?: string` + JSDoc |
| `packages/networking/src/contracts/network-types.ts` | Local copy imported by the server | Same edit — kept in semantic sync by test (below) |
| `packages/networking/src/server.ts` (~line 692, `handleEnvelope` case `'hello'`) | Sole construction site of `HelloAckPayload` | Populate `appVersion: APP_VERSION` |
| `packages/console/contracts/*.ts` | Console-side contract mirrors (byte-identity-tested per feature 005 conformance suite) | Update only if they restate `HelloAckPayload` fields; `src/net/envelope-to-event.ts` derives its view via `Extract<NetworkPayload, { connectionId: string }>`, so the field flows through type-wise without structural edits |

**Drift guards already in place** (why both contract copies must change in one commit):

- `packages/networking/tests/contracts-conformance.test.ts` reads the `specs/004…/contracts/` files and compares them semantically (whitespace-normalized) against the local copies — divergence fails the suite.
- The engine/terrain/fog packages run the same pattern as `tests/contracts-drift.test.ts` ("NEVER edit only one side" is documented in the test header).

Additive-optional is safe for every existing guard: validators enforce *required* fields only (spec 004), JSON parsing ignores unknown fields for older clients, and `exactOptionalPropertyTypes` means console consumers must narrow `appVersion` presence before use — pinned by test.

## 4. How existing drift detectors are wired (precedent for the version check)

Two distinct precedents exist; the version drift check follows their *philosophy*, adapted to string equality:

1. **Per-package contract-drift/conformance tests** (engine/terrain/fog/networking): Vitest tests comparing local copies against spec contracts. Strength: zero new infrastructure. Weakness: scoped to one package's CI.
2. **Path-gated workflows** (all seven workflows post-issue #3): `push`/`pull_request` restricted to `[main]` + explicit path lists including the workflow file itself; SHA-pinned actions; `concurrency` group; least-privilege `permissions: contents: read`.

**Design that falls out** (details in plan.md):

- The checker's core is a **pure function** `checkVersionDrift(...)` living in `@europa/version` itself — so it inherits the standard package test infra and the constitution's ≥80% coverage gate naturally (SC-006 names the drift checker as coverage-mandatory logic).
- A thin CLI wrapper (`packages/version/scripts/check-version-drift.ts`, run via `tsx` — same runner as `pnpm host`) turns the pure function's verdict into an exit code. Exercised both directions by automated test against fixture trees (negative) and the real repo (positive) — SC-001 — without ever mutating real guarded files.
- Root `package.json` gains `"version:check"`, delegating via `pnpm --filter @europa/version version:check` (keeps `tsx` out of root devDependencies).
- CI wiring = **new path-gated workflow** (`.github/workflows/version-drift.yml`) following the issue-#3-hardened shape exactly: triggers on the guarded files themselves (`package.json`, `packages/**/package.json`, `README.md`, `docs/manual/index.md`, `packages/version/**`, the workflow file) — if none of them changed, drift is impossible; if any changes, the check runs. Action SHAs copied verbatim from `client-ci.yml` (checkout v4.4.0 / pnpm-action v6.0.10 / setup-node v6.5.0).

## 5. Supporting facts (verified)

- **`NETWORK_API_VERSION`** is exported from `@europa/networking`'s public barrel (`src/index.ts` line ~120) — the `/version` body's `protocolVersion` field imports it directly; no derivation from `APP_VERSION` anywhere (FR-004 boundary).
- **Logger seam**: the match server takes a `Logger` via `ServerDeps` (host passes `NULL_LOGGER`; launcher output goes through its own `say()` taps). FR-005 logging therefore lands in two places: structured `logger` calls inside networking (unit-tested with a captured fake) *and* the host's human-facing banner/join taps (so self-hosters actually see it).
- **HUD insertion point**: `packages/console/src/render/App.tsx` renders `<section id="hud" aria-label="Status bar" className="europa-hud">` containing `europa-hud__item` spans (Status, Tick). The version indicator joins as another real-DOM item — ordinary page content for assistive tech (US3 AC-2 rides the existing section semantics); contrast comes from CSS and is scanned by the axe-based a11y suite.
- **Runner**: `tsx ^4.23.12` is already a catalog dependency (added for `scripts/host.ts`); `@europa/version` declares it as a devDependency like console does.
- **Doc surfaces today**: README has a title + license badge near the top (no version line); `docs/manual/index.md` ends at the table-of-contents paragraph (no footer). Both get stable, greppable formats defined in plan.md §Decisions so the drift checker can pin them.
- **Pages republishing**: `docs/manual/index.md` edits trip the existing `pages-deploy.yml` path gate (`docs/manual/**`) — US4 AC-2 needs no workflow change.
