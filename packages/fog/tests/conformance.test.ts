/**
 * Engine-Conformance Test — Feature 002 (T039)
 *
 * Enforces the engine ↔ fog boundary rule ("engine-to-fog.ts"):
 *
 *   (b) Fog's re-declared "VisibleSet" / "PlayerView" types are
 *       structurally assignable from the contract originals
 *       (compile-time mutual-assignability assertions — any field
 *       drift fails "pnpm typecheck").
 *   (c) The implemented "computeVisibleSet" signature conforms to
 *       the declaration in "engine-to-fog.ts" (same parameter names,
 *       same return type; enforced by assigning the implementation
 *       to the declared function type at compile time).
 *
 * NOTE: Parts (a) and (a2) -- byte-identical file comparisons between
 * src/contracts/engine-to-fog.ts and the spec-side copies -- were
 * removed because the spec-side .ts files no longer exist. The
 * package copies in each package's src/contracts/ are now the sole
 * source of truth.
 */

import { describe, expect, expectTypeOf, it } from 'vitest';

import type * as Contract from '../src/contracts/engine-to-fog';
import * as fog from '../src/index';
import type { PlayerView, VisibleSet } from '../src/types';

describe('engine ↔ fog conformance (T039)', () => {
    it('(b) fog re-declared types are mutually assignable with the contract originals', () => {
        // Compile-time proof: `typecheck:conformance` fails on either drift.
        expectTypeOf<VisibleSet>().toExtend<Contract.VisibleSet>();
        expectTypeOf<Contract.VisibleSet>().toExtend<VisibleSet>();
        expectTypeOf<PlayerView>().toExtend<Contract.PlayerView>();
        expectTypeOf<Contract.PlayerView>().toExtend<PlayerView>();
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
