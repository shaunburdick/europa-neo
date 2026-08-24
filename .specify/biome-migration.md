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
