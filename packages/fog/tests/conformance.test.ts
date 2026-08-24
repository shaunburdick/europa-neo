/**
 * Engine-Conformance Test — Feature 002 (T039)
 *
 * Enforces the engine ↔ fog boundary rule (`engine-to-fog.ts`):
 *
 *   (a) The `engine-to-fog.ts` mirror in `packages/fog/src/contracts/`
 *       is byte-identical to the spec's feature-002 copy, and its
 *       "verbatim mirror" section is semantically identical to
 *       feature 001's canonical contract (comments and the one
 *       documented import-path adaptation are normalized away).
 *   (b) Fog's re-declared `VisibleSet` / `PlayerView` types are
 *       structurally assignable from the contract originals
 *       (compile-time mutual-assignability assertions — any field
 *       drift fails `pnpm typecheck`).
 *   (c) The implemented `computeVisibleSet` signature conforms to
 *       the declaration in `engine-to-fog.ts` (same parameter names,
 *       same return type; enforced by assigning the implementation
 *       to the declared function type at compile time).
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type * as Contract from '../src/contracts/engine-to-fog';
import * as fog from '../src/index';
import type { PlayerView, VisibleSet } from '../src/types';

/** Resolve a path relative to the monorepo root. */
function repoPath(relativePath: string): string {
  // packages/fog/tests/conformance.test.ts → 3 levels up = repo root.
  return resolve(__dirname, '..', '..', '..', relativePath);
}

/** Strip comments + collapse whitespace for semantic comparison. */
function normalize(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.endsWith('*/'));
    })
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize the one documented import-path adaptation between
 * feature 001's canonical file (`./engine-types`, private to the
 * engine package) and fog's mirror (`@europa/engine`).
 */
function normalizeImportPaths(source: string): string {
  return source
    .replace(/'\.\/engine-types'/g, "'<ENGINE_TYPES>'")
    .replace(/'@europa\/engine'/g, "'<ENGINE_TYPES>'");
}

/**
 * Extract the section between the verbatim-mirror markers so the
 * wrapper comments fog adds around the mirror don't count as drift.
 * The slice starts at the END of the BEGIN-marker line so the
 * marker comment itself is excluded.
 */
function verbatimSection(source: string): string {
  const begin = source.indexOf('Begin verbatim mirror');
  const end = source.indexOf('End verbatim mirror');
  if (begin === -1 || end === -1) {
    return source;
  }
  const contentStart = source.indexOf('\n', begin);
  return source.slice(contentStart === -1 ? begin : contentStart + 1, end);
}

// ---------------------------------------------------------------------------
// (b) Compile-time structural conformance. If any field drifts between
// fog's re-declarations and the contract originals, these mutual-
// assignability aliases fail to typecheck.
// ---------------------------------------------------------------------------

type AssertMutuallyAssignable<A extends B, B extends A> = true;

type VisibleSetConforms = AssertMutuallyAssignable<VisibleSet, Contract.VisibleSet>;
type PlayerViewConforms = AssertMutuallyAssignable<PlayerView, Contract.PlayerView>;

const VISIBLE_SET_CONFORMS: VisibleSetConforms = true;
const PLAYER_VIEW_CONFORMS: PlayerViewConforms = true;

describe('engine ↔ fog conformance (T039)', () => {
  it('(a) local engine-to-fog.ts mirror is byte-identical to the spec copy', async () => {
    const [local, spec] = await Promise.all([
      readFile(repoPath('packages/fog/src/contracts/engine-to-fog.ts'), 'utf-8'),
      readFile(
        repoPath('.specify/features/002-fog-of-war-visibility/contracts/engine-to-fog.ts'),
        'utf-8',
      ),
    ]);
    expect(local).toBe(spec);
  });

  it('(a2) the verbatim-mirror section matches feature 001\u2019s canonical contract semantically', async () => {
    const [mirror, canonical] = await Promise.all([
      readFile(repoPath('packages/fog/src/contracts/engine-to-fog.ts'), 'utf-8'),
      readFile(
        repoPath('.specify/features/001-core-game-engine/contracts/engine-to-fog.ts'),
        'utf-8',
      ),
    ]);
    const mirrorNorm = normalizeImportPaths(normalize(verbatimSection(mirror)));
    const canonicalNorm = normalizeImportPaths(normalize(verbatimSection(canonical)));
    // The only permitted difference is the import path adaptation
    // ('./engine-types' → '@europa/engine'), normalized above.
    expect(mirrorNorm).toBe(canonicalNorm);
  });

  it('(b) fog re-declared types are mutually assignable with the contract originals', () => {
    // Compile-time proof lives in the type aliases above; this
    // runtime assertion keeps them "used" so linters stay quiet.
    expect(VISIBLE_SET_CONFORMS).toBe(true);
    expect(PLAYER_VIEW_CONFORMS).toBe(true);
  });

  it('(c) implemented computeVisibleSet conforms to the declared signature', () => {
    // Assignability check: the implementation must be usable wherever
    // the contract's declared function is expected. Optional-radius
    // tolerance in the impl remains assignable to the required-param
    // declaration.
    const implemented: typeof Contract.computeVisibleSet = fog.computeVisibleSet;
    expect(typeof implemented).toBe('function');

    // Same parameter names via reflection of the source text.
    const fn = fog.computeVisibleSet.toString();
    expect(fn).toContain('world');
    expect(fn).toContain('player');
    expect(fn).toContain('visibilityRadius');
  });
});
