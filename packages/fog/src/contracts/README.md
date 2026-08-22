# Local Contract Copies — `@europa/fog`

This directory contains **local copies** of the fog package's public
type contracts. The spec-side source of truth lives at
`.specify/features/002-fog-of-war-visibility/contracts/`.

## Why local copies?

The fog package's `tsconfig.json` declares `rootDir: "./src"` and
`include: ["src/**/*"]`. Importing TypeScript files from outside
`./src` (e.g., `.specify/...`) violates `rootDir` and trips the
compiler's "files must be under rootDir" check. Rather than relax that
constraint (which is a constitution-friendly boundary for monorepo
package layout), the engine-side and terrain-side precedent (see
`packages/engine/src/contracts/README.md` and
`packages/terrain/src/contracts/README.md`) is to keep bit-for-bit
copies of the spec contracts under the package's own `src/contracts/`
directory.

## Files in this directory

| File                       | Spec counterpart                                                          |
| -------------------------- | ------------------------------------------------------------------------- |
| `fog-types.ts`             | `.specify/features/002-fog-of-war-visibility/contracts/fog-types.ts`     |
| `fog-api.ts`               | `.specify/features/002-fog-of-war-visibility/contracts/fog-api.ts`       |
| `engine-to-fog.ts`         | `.specify/features/002-fog-of-war-visibility/contracts/engine-to-fog.ts` |
| `fog-to-networking.ts`     | `.specify/features/002-fog-of-war-visibility/contracts/fog-to-networking.ts` |

The `engine-to-fog.ts` local copy **MUST** remain byte-identical to
the engine's `packages/engine/contracts/engine-to-fog.ts`. The
conformance test (lands in Wave 5B Polish phase, T039) enforces this.

## Maintenance rule

When the spec contract changes:

1. Update the spec file (`.specify/.../contracts/*.ts`) first.
2. Copy the spec file into the corresponding local file in this
   directory in the same change set.
3. Never edit one side without the other.

The spec is authoritative; the local copy is a build-time convenience.
