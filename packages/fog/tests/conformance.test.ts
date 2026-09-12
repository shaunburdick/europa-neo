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

import { describe, expect, it } from 'vitest';

import type * as Contract from '../src/contracts/engine-to-fog';
import * as fog from '../src/index';
import type { PlayerView, VisibleSet } from '../src/types';

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
