# Local Contract Copies — `@europa/terrain`

This directory contains **local copies** of the terrain package's public
type contracts. The spec-side source of truth lives at
`specs/003-procedural-terrain-generation/contracts/`.

## Why local copies?

The terrain package's `tsconfig.json` declares `rootDir: "./src"` and
`include: ["src/**/*"]`. Importing TypeScript files from outside
`./src` (e.g., `.specify/...`) violates `rootDir` and trips the
compiler's "files must be under rootDir" check. Rather than relax that
constraint (which is a constitution-friendly boundary for monorepo
package layout), the engine-side precedent (see
`packages/engine/src/contracts/README.md`) is to keep bit-for-bit
copies of the spec contracts under the package's own `src/contracts/`
directory.

## Drift detection

Drift between this directory and the spec contracts is a bug. The
engine's contract-drift test (`packages/engine/tests/contracts-drift.test.ts`)
demonstrates the mechanism; terrain can adopt the same approach in a
later wave if drift becomes a recurring problem.

## Maintenance rule

When the spec contract changes:

1. Update the spec file (`.specify/.../contracts/*.ts`) first.
2. Copy the spec file into the corresponding local file in this
   directory in the same change set.
3. Never edit one side without the other.

The spec is authoritative; the local copy is a build-time convenience.
