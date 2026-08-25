# Engine Contract Copies (Local)

This directory contains LOCAL COPIES of the engine's type contracts. The
canonical source of truth lives at
`specs/001-core-game-engine/contracts/`.

## Why local copies exist

TypeScript's `tsc` compiler rejects imports from outside the engine
package's `rootDir: "./src"`. The canonical contracts live in the
`.specify/` directory (which is outside `packages/engine/`), so the
engine package can't import them directly without changing the project
structure.

The compromise: the engine keeps a verbatim copy of each contract it
imports, so the TypeScript compiler can resolve imports without
violating the package boundary.

## Drift detection

The `packages/engine/tests/contracts-drift.test.ts` test compares each
local copy with its spec counterpart (whitespace-normalized) and
fails the test suite if they diverge.

**If the test fails:**

1. Run `diff -u specs/001-core-game-engine/contracts/<file>.ts packages/engine/src/contracts/<file>.ts` to see the divergence.
2. **The spec is the source of truth.** If the spec was updated
   intentionally, copy the spec file into the local copy:
   ```sh
   cp specs/001-core-game-engine/contracts/engine-types.ts packages/engine/src/contracts/engine-types.ts
   ```
3. If only the local copy was updated (accidental edit), revert the
   local copy to match the spec.
4. NEVER edit only one side — the two must stay in lock-step.

## Files in this directory

| File                          | Spec counterpart                                          |
| ----------------------------- | --------------------------------------------------------- |
| `engine-types.ts`             | `specs/001-core-game-engine/contracts/engine-types.ts` |
| `engine-api.ts`               | `specs/001-core-game-engine/contracts/engine-api.ts`   |
