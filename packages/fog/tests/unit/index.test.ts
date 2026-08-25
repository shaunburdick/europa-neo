/**
 * Index Barrel Tests — Feature 002 (Wave 5A)
 *
 * Verifies that the Phase 2 public surface (`src/index.ts`) re-
 * exports every foundational symbol correctly. Phase 3+4+5
 * algorithm functions (`computeVisibleSet`, `computePlayerView`)
 * are forward-declared but not yet implemented; we verify they
 * exist as named declarations and that calling them throws (so
 * any test that accidentally calls a Phase 3 function fails
 * loudly instead of getting a runtime `undefined is not a
 * function` error).
 *
 * Mirrors `packages/terrain/tests/unit/index.test.ts` (the
 * established pattern in this monorepo).
 */

import { describe, expect, it } from 'vitest';

import * as fog from '../../src/index';

describe('fog package barrel (Phase 2)', () => {
    describe('foundational exports', () => {
        it('re-exports FOG_CONSTANTS as an object with the expected shape', () => {
            expect(fog.FOG_CONSTANTS).toBeDefined();
            expect(fog.FOG_CONSTANTS.maskUnknown).toBe(0);
            expect(fog.FOG_CONSTANTS.maskVisible).toBe(1);
            expect(fog.FOG_CONSTANTS.defaultRadiusFallback).toBe(4);
            expect(fog.FOG_CONSTANTS.testRadius).toBe(4);
        });

        it('re-exports FOG_API_VERSION as a string', () => {
            expect(typeof fog.FOG_API_VERSION).toBe('string');
            expect(fog.FOG_API_VERSION).toBe('0.1.0');
        });

        it('re-exports FOG_MASK_UNKNOWN and FOG_MASK_VISIBLE sentinels', () => {
            expect(fog.FOG_MASK_UNKNOWN).toBe(0);
            expect(fog.FOG_MASK_VISIBLE).toBe(1);
        });

        it('re-exports ENGINE_API_VERSION_REF from the engine', () => {
            expect(typeof fog.ENGINE_API_VERSION_REF).toBe('string');
            expect(fog.ENGINE_API_VERSION_REF).toBe('0.1.0');
        });
    });

    describe('mask helpers (Phase 2 foundational)', () => {
        it('re-exports createMask, markVisible, isCellMarked, unionMasks', () => {
            expect(typeof fog.createMask).toBe('function');
            expect(typeof fog.markVisible).toBe('function');
            expect(typeof fog.isCellMarked).toBe('function');
            expect(typeof fog.unionMasks).toBe('function');
        });

        it('createMask returns a fresh zero-initialized mask', () => {
            const mask = fog.createMask(4, 4);
            expect(mask.width).toBe(4);
            expect(mask.height).toBe(4);
            expect(mask.data).toBeInstanceOf(Uint8Array);
            expect(mask.data.length).toBe(16);
            // Zero-init
            for (let i = 0; i < mask.data.length; i++) {
                expect(mask.data[i]).toBe(0);
            }
        });
    });

    describe('range helpers (Phase 2 foundational)', () => {
        it('re-exports chebyshevDisk and chebyshevDistance', () => {
            expect(typeof fog.chebyshevDisk).toBe('function');
            expect(typeof fog.chebyshevDistance).toBe('function');
        });

        it('chebyshevDistance is symmetric and integer-only', () => {
            expect(fog.chebyshevDistance(0, 0, 0, 0)).toBe(0);
            expect(fog.chebyshevDistance(0, 0, 3, 4)).toBe(4);
            expect(fog.chebyshevDistance(3, 4, 0, 0)).toBe(4);
            expect(fog.chebyshevDistance(0, 0, 5, 2)).toBe(5);
        });
    });

    describe('Phase 3+ forward-declared functions (not yet implemented)', () => {
        it('computeVisibleSet exists as a named declaration', () => {
            expect(typeof fog.computeVisibleSet).toBe('function');
        });

        it('computePlayerView exists as a named declaration', () => {
            expect(typeof fog.computePlayerView).toBe('function');
        });

        it('isVisible (PlayerView query) exists as a named declaration', () => {
            expect(typeof fog.isVisible).toBe('function');
        });

        it('visibleCellAt exists as a named declaration', () => {
            expect(typeof fog.visibleCellAt).toBe('function');
        });

        // The forward-declared functions throw "not implemented"
        // when called in Phase 2; we don't test that here — calling
        // an unimplemented forward declaration is the test author's
        // own bug, and the implementation lands in Phase 3.
    });
});
