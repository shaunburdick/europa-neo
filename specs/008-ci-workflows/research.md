# Research: Coverage-Gate Integrity + Test Infrastructure Consolidation

> Date: 2026-09-11
> Issue: #131
> Specs: 008 v1.1, 016 v1.1

## Coverage Configuration Audit

### Console Vitest Configs (3 files)

All three configs (`vitest.config.ts`, `vitest.config.browser.ts`, `vitest.config.coverage.ts`) share the same `coverage.exclude` array:

```typescript
exclude: ['src/main.tsx', 'src/internal/**', '**/*.d.ts']
```

**Bug 1 — a11y glob in coverage config**:
- `vitest.config.coverage.ts` browser project: `include: ['tests/a11y/**/*.test.ts']`
- `vitest.config.browser.ts`: `include: ['tests/a11y/**/*.test.{ts,tsx}']`
- **Impact**: 5 `.tsx` a11y files (~1,355 LOC) never measured by `pnpm coverage` / `console-coverage` CI job
- **Affected files**: `lobby-keyboard.test.tsx`, `lobby-roster-card.test.tsx`, `logo-accessibility.test.tsx`, `profile-view.test.tsx`, `semantic-route-a11y.test.tsx`

**Bug 2 — `src/internal/**` blanket exclusion**:
- 12 files, ~3,022 LOC, excluded from all three configs
- **Files in `src/internal/`**: `.gitkeep`, `demo-runtime.tsx`, `fake-match-client.ts`, `live-runtime.tsx`, `lobby-layout.tsx`, `lobby-runtime.tsx`, `lobby-view.tsx`, `match-adaptive-route.tsx`, `match-join-route.tsx`, `match-layout.tsx`, `match-spectate-route.tsx`, `profile-route.tsx`, `test-state.ts`

### Production vs Test-Only Analysis of `src/internal/`

| File | Production imports | Test imports | Verdict |
|------|-------------------|--------------|---------|
| `test-state.ts` | `App.tsx` (via `peekInjectedConsoleState`) | 2 component tests | **Production code** — keep in src |
| `fake-match-client.ts` | NONE | 0 test files (but used by `main.tsx` E2E demo) | **Test-only** — relocate to tests/fixtures |
| `live-runtime.tsx` | `main.tsx` E2E entry | Integration E2E | Production (DOM-bound) |
| `lobby-runtime.tsx` | `main.tsx` production bootstrap | E2E | Production (DOM-bound) |
| `demo-runtime.tsx` | `main.tsx` dev mount | — | Production (dev-only) |
| `lobby-layout.tsx` | `lobby-runtime.tsx` | — | Production |
| `lobby-view.tsx` | `lobby-runtime.tsx` | — | Production |
| `match-*.tsx` | `lobby-runtime.tsx` | — | Production |
| `profile-route.tsx` | `lobby-runtime.tsx` | — | Production |

**Decision**: Only `fake-match-client.ts` is truly test-only. `test-state.ts` is used by production code (`App.tsx`) and should stay in `src/internal/`. Per-file coverage exclusions needed for DOM-bound entry points: `live-runtime.tsx`, `lobby-runtime.tsx`, `demo-runtime.tsx`.

### Other Package Vitest Configs

| Package | Config files | Coverage config | Notes |
|---------|-------------|-----------------|-------|
| `@europa/design` | `vitest.config.ts`, `vitest.config.browser.ts` | Inline in both | `test:browser` script exists; CI job `design-browser-test` runs it. NO coverage CI job. |
| `@europa/version` | `vitest.config.ts` | Inline | NO test or coverage CI job anywhere. Only `version-drift.yml`. |
| `@europa/engine` | `vitest.config.ts` | Inline | Has `engine-ci.yml`. |
| `@europa/terrain` | `vitest.config.ts` | Inline | Has `terrain-ci.yml`. |
| `@europa/fog` | `vitest.config.ts` | Inline | Has `fog-ci.yml`. |
| `@europa/networking` | `vitest.config.ts` | Inline | Has `network-ci.yml`. |
| `@europa/matchmaking` | `vitest.config.ts` | Inline | Has `matchmaking-ci.yml`. |
| `@europa/logging` | `vitest.config.ts` | Inline | Has `logging-ci.yml`. |

### Orphaned Config Detection

Currently, `packages/design/vitest.config.browser.ts` is referenced by the `test:browser` npm script (`vitest run --config vitest.config.browser.ts`). The `design-browser-test` CI job runs `pnpm --filter @europa/design test:browser`. **Linkage is correct but implicit** — no guard catches future orphans.

All 13 vitest config files and their references:

| Config | Package scripts | CI job |
|--------|----------------|--------|
| `console/vitest.config.ts` | `test:unit`, `test:determinism`, `test:parity`, `test:keepalive`, `test:lobby-integration` | `console-test` |
| `console/vitest.config.browser.ts` | `test:component`, `test:a11y`, `test:perf` | `console-e2e` |
| `console/vitest.config.coverage.ts` | `coverage` | `console-coverage` |
| `design/vitest.config.ts` | `test` | (implicit via `pnpm test`) |
| `design/vitest.config.browser.ts` | `test:browser` | `design-browser-test` |
| `engine/vitest.config.ts` | `test` | `engine-ci` |
| `terrain/vitest.config.ts` | `test` | `terrain-ci` |
| `fog/vitest.config.ts` | `test` | `fog-ci` |
| `networking/vitest.config.ts` | `test` | `network-ci` |
| `matchmaking/vitest.config.ts` | `test` | `matchmaking-ci` |
| `logging/vitest.config.ts` | `test` | `logging-ci` |
| `core/vitest.config.ts` | `test` | (implicit) |
| `version/vitest.config.ts` | `test` | **NONE** (no CI job) |

**Finding**: `core/vitest.config.ts` and `version/vitest.config.ts` have no dedicated CI coverage jobs. `core` is tested implicitly via `client-ci.yml` (it's a workspace dependency). `version` has zero CI test coverage.

## Golden Fixture Analysis

### Current State

- **File**: `packages/console/tests/fixtures/golden-1000-tick.json` (1.7 MB)
- **Used by**: `packages/console/tests/integration/determinism.test.ts`
- **Generator**: `packages/console/scripts/generate-determinism-golden.ts`
- **Scenario**: `packages/console/tests/fixtures/determinism-scenario.ts` (pure, deterministic)

### How It Works

1. `runDeterminismScenario()` runs 1000 ticks through the real reducer pipeline
2. Each tick: `tick` event → reducer → player action → reducer → `buildMapView` → serialize
3. Serialized frames are `JSON.stringify`-compared against the golden fixture
4. Final `ConsoleState` is also compared

### Replacement Strategy

The scenario code is deterministic (pure arithmetic, no randomness, fixed clock). Instead of storing 1.7 MB of JSON, store a SHA-256 hash of the serialized output:

```typescript
const EXPECTED_HASH = 'abcdef1234...'; // 64 hex chars = 64 bytes

beforeAll(() => {
    const run = runDeterminismScenario();
    const actualHash = createHash('sha256')
        .update(JSON.stringify(run.frames))
        .update(JSON.stringify(run.finalState))
        .digest('hex');
    expect(actualHash).toBe(EXPECTED_HASH);
});
```

**Trade-off**: When the hash diverges, you can't diff the fixture to see WHAT changed. Mitigation: the generator script can be updated to emit both the hash AND a human-readable diff summary.

## setTimeout-for-Condition Audit

### Console Unit Tests (in scope for FR-024)

| File | Line | Pattern | Assessment |
|------|------|---------|------------|
| `tests/unit/runtime.test.ts:375` | `await new Promise(resolve => setTimeout(resolve, 50))` | **Replace** with `vi.waitFor()` — waiting for DOM render |
| `tests/unit/net/ws-lobby-client.test.ts:119` | `setTimeout(fn, ms)` — fake timer implementation | Already using fake timers — verify no wall-clock reliance |
| `tests/unit/net/ws-lobby-client.test.ts:286` | `setTimeout(resolve, 0)` | In fake timer context — verify |

### Console Integration Tests (EXEMPT from FR-024)

These test real networking with real timers — legitimate use of `setTimeout`:

| File | Pattern | Exemption Reason |
|------|---------|-----------------|
| `tests/integration/quiet-client-keepalive.test.ts:224,289` | Poll with setTimeout | Tests real idle-sweep behavior with real timers |
| `tests/integration/lobby-transport.test.ts:172,384` | Poll with setTimeout | Tests real transport stack |
| `tests/integration/semantic-route-security.test.ts:81` | setTimeout delay | Tests real timing behavior |
| `tests/integration/host-smoke-n-players.test.ts:80` | setTimeout wrapper | Integration test helper |

### Console A11y Tests (BROWSER MODE — exempt)

| File | Pattern | Exemption Reason |
|------|---------|-----------------|
| `tests/a11y/wcag-assertions.test.ts:153` | `setTimeout(resolve, 20)` | Browser-mode test, real timers needed |

## Unfalsifiable Assertion Audit

The grep found ~100 `toBeDefined()`/`not.toBeNull()` calls across packages. These are NOT inherently unfalsifiable — they fail when the value is `undefined`/`null`. However, some may be weak assertions that could be strengthened:

**Examples of weak-but-valid assertions** (KEEP):
- `expect(state.matchResult).not.toBeNull()` — verifies a state transition happened
- `expect(dialog).not.toBeNull()` — verifies a modal rendered
- `expect(button).not.toBeNull()` — verifies an element exists in DOM

**Examples that may be unfalsifiable** (INVESTIGATE):
- `expect(isTerminal(finalWorld)).toBeDefined()` — `isTerminal` returns `boolean`, never `undefined`
- `expect(result.terminal).toBeDefined()` — if `result` is always an object with `terminal` field
- `expect(info).toBeDefined()` in `pipe-intensities.test.ts` (6 instances) — need to verify

**Action**: For each candidate, check if the function under test can actually return `undefined`/`null`. If not, the assertion is unfalsifiable and should be replaced with a meaningful value check.

## Duplicate Fixture Analysis

### fakeMatchmakerBridge (NOT duplicated)

- `packages/networking/tests/fixtures/fakeMatchmakerBridge.ts` — implements `MatchmakerBridge` (networking's contract)
- `packages/matchmaking/tests/fixtures/fakeMatchmakerBridge.ts` — implements `Matchmaker` (matchmaking's contract)

These implement **different interfaces** (`MatchmakerBridge` vs `Matchmaker`). The matchmaking version also includes lifecycle event publication, scripted results, and additional methods. They share the same event type extraction pattern (both `Parameters<NonNullable<...>>`), but consolidation would require a shared package or cross-package import — not justified for this issue.

### Shared E2E Helpers (FR-022 scope)

Current state: No shared E2E helpers directory exists. Each package has its own `tests/fixtures/` with local helpers. Cross-package duplication is minimal (the `fakeMatchmakerBridge` files are structurally similar but functionally different).

**Assessment**: The spec's FR-022 (extract shared E2E helpers) may be over-scoped for the current codebase. The primary consolidation opportunity is the golden fixture replacement (FR-023). A shared helpers directory can be established proactively for future use without migrating existing package-local fixtures.
