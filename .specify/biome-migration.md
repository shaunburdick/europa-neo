# Biome migration policy

**Baseline date:** 2026-08-24
**Config:** `biome-config-shaunburdick@1.0.0`
**Biome:** `@biomejs/biome@2.5.9` (peer-compatible with the published config)
**Runtime:** Node.js >= 22 (required by the adopted config and CI)

## Adopted configuration

The root `biome.json` extends the published package. The repository's existing
package configs continue to extend the root config; `root: false` makes that
relationship explicit for Biome 2 when configurations are validated together.
The repository keeps its established formatter settings (two-space indentation,
100-column lines, single quotes, semicolons) for this staged migration. The
published preset's four-space/120-column formatter is therefore not applied yet.

The root excludes dependencies, build and coverage output, TypeScript build
metadata, the immutable `europa-source/` archive, the lockfile, contract mirrors,
and the committed determinism golden artifact. Contract and golden files are
validated by their dedicated byte-identity tests instead of a formatter.

## Enforcement stages

All rules from the published preset are enabled; no broad rule group is disabled.
The following high-volume findings are warning-level during Phase 1 so local and
CI checks report migration work without making an unsafe repository-wide rewrite
the merge gate:

- `style/noMagicNumbers`
- `style/useBlockStatements`
- `style/useConsistentArrayType`
- `style/useConsistentMemberAccessibility`
- `style/useDestructuring`
- `style/useNamingConvention`
- `suspicious/noBitwiseOperators`
- `correctness/noUndeclaredDependencies`

The existing recommended rules, `noExplicitAny`, `noDebugger`, and the remaining
published rules stay error-level. Formatting remains report-only against the
current repository style; no bulk formatting is permitted in Phase 1. Warnings
must be reduced package-by-package in later phases, then promoted to errors.
Inline suppressions are not an approved migration mechanism.

## Package order and exit criteria

Remediation order follows dependency direction: engine, terrain, fog, networking,
matchmaking, then console. Console retains its three intentional accessibility
exceptions (`useSemanticElements`, `useFocusableInteractive`, and
`noNoninteractiveTabindex`) because the ARIA grid overlay deliberately uses
custom keyboard semantics; the exceptions are scoped only to that package.

Phase 1 exits when the adopted config resolves, all config files parse, the
existing test/typecheck/build gates remain green, and a warning baseline is
recorded. The migration exits when the staged categories have zero diagnostics,
formatting has been consciously migrated or retained by a documented decision,
and the warning overrides can be removed without broad suppressions.

## Required validation

```bash
pnpm install --frozen-lockfile
pnpm exec biome check biome.json packages/*/biome.json
pnpm typecheck
pnpm lint
pnpm test
git diff --check
```

The package's published installation contract is documented in its npm README:
install it alongside Biome and extend `biome-config-shaunburdick` from the
project config. This repository uses the equivalent pnpm catalog entry.

## Engine Phase 2 exceptions

The engine package's `biome.json` contains narrow, package-local,
rule-level exceptions for patterns that are part of its existing deterministic
contract:

- `src/**` retains `noBitwiseOperators` because unsigned coercion, masks, and
  fixed-point arithmetic are deliberate simulation primitives.
- `src/rng.ts` and `src/serialize.ts` retain `noMagicNumbers` for PRNG/hash
  constants and binary wire-layout widths; these are protocol/algorithm
  constants rather than tunable gameplay values.
- `tests/**` retains `noMagicNumbers` and `noBitwiseOperators` for fixtures,
  protocol vectors, and determinism assertions.
- The direction-key table in `src/validate.ts` and existing phase-local names
  in `src/tick.ts` retain `useNamingConvention`; these names mirror the public
  direction vocabulary and established resolution terminology.
- The engine package retains `useDestructuring` for focused test assertions
  and benchmark state transitions, where indexed access makes the asserted
  element or reassigned result clearer.

These exceptions do not suppress diagnostics inline or disable a broad rule
family repository-wide.

## Terrain Phase 2 exceptions

Terrain keeps `noMagicNumbers` only in `src/fbm.ts`, `src/hash.ts`,
`src/rng-adapter.ts`, and `src/value-noise.ts`, plus the explicitly listed
terrain algorithm/vector fixtures and tests in `packages/terrain/biome.json`,
where literals are PRNG, hash, noise, or fixed-width integer-math constants.
Its `noBitwiseOperators`
exceptions are limited to those same integer-math sources plus
`src/elevation.ts`, and to the exact seed/algorithm vector tests
`tests/fixtures/seeds.ts`, `tests/unit/{elevation,fbm,rng-adapter,seed-fixtures,value-noise,water}.test.ts`.
Validation, placement, symmetry, and unrelated test files therefore continue
to report the staged warnings rather than being hidden by package-wide
overrides.
