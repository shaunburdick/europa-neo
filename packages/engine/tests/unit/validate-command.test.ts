/**
 * validateCommand total-coverage regression tests — Issue #121 (P0)
 *
 * Proves that `validateCommand` returns a `CommandResult` (never
 * `undefined`) for every input — including bogus order kinds and
 * invalid directions. This prevents the server crash where an
 * unhandled `undefined` dereference in `applyCommand` killed the
 * tick `setInterval`.
 *
 * These tests exercise the engine's `validateCommand` directly,
 * bypassing the networking wire layer, so the validation boundary
 * is testable in isolation.
 */

import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/applyCommand';
import type { Order, World } from '../../src/types';
import { validateCommand } from '../../src/validate';
import { buildSmallBoard } from '../fixtures/board';
import { PLAYER_1, playerIds } from '../fixtures/ids';
import { runScenario } from '../fixtures/scenarios';

// ---------------------------------------------------------------------------
// Minimal world helper
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
    boardSize: 8,
    playerIds: playerIds(2),
    tickIntervalMs: 250,
    seed: 42,
    visibilityRadius: 4,
};

function makeWorld(extraCities: ReadonlyArray<readonly [x: number, y: number, owner: number]> = []): World {
    const board = buildSmallBoard(8, [[0, 0, 1], [7, 7, 2], ...extraCities]);
    const { finalWorld } = runScenario(DEFAULT_CONFIG, board, [], 0);
    return finalWorld;
}

// ---------------------------------------------------------------------------
// Total switch coverage: unknown order kinds
// ---------------------------------------------------------------------------

describe('validateCommand — unknown order kinds', () => {
    it('rejects { kind: "bogus" } with unknown_order', () => {
        const world = makeWorld();
        const order = { kind: 'bogus', player: 1 } as unknown as Order;
        const result = validateCommand(world, order);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toEqual({ kind: 'unknown_order' });
        }
    });

    it('rejects {} (empty object) with unknown_order', () => {
        const world = makeWorld();
        const order = {} as unknown as Order;
        const result = validateCommand(world, order);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toEqual({ kind: 'unknown_order' });
        }
    });

    it('rejects { kind: 123 } (non-string kind) with unknown_order', () => {
        const world = makeWorld();
        const order = { kind: 123, player: 1 } as unknown as Order;
        const result = validateCommand(world, order);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toEqual({ kind: 'unknown_order' });
        }
    });

    it('rejects { kind: "setPipe" } with missing fields as unknown_order', () => {
        const world = makeWorld();
        // A partially-valid setPipe missing required fields. The
        // hasRequiredFields guard catches missing fields before the
        // switch arms can dereference undefined.
        const order = { kind: 'setPipe' } as unknown as Order;
        const result = validateCommand(world, order);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason.kind).toBe('unknown_order');
        }
    });

    it('rejects { kind: "setPipe" } with missing direction as unknown_order', () => {
        const world = makeWorld();
        const order = {
            kind: 'setPipe',
            player: 1,
            cell: { x: 0, y: 0 },
            // direction missing
        } as unknown as Order;
        const result = validateCommand(world, order);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            // direction is undefined → hasRequiredFields sees the
            // missing field → unknown_order (the field-presence guard).
            expect(result.reason.kind).toBe('unknown_order');
        }
    });

    it('never returns undefined for any input', () => {
        const world = makeWorld();
        // Exhaustive set of inputs that could have caused undefined before.
        const orders: unknown[] = [
            { kind: 'bogus' },
            {},
            { kind: 123 },
            { kind: 'setPipe' },
            { kind: 'clearPipe' },
            { kind: 'setReserves' },
            { kind: 'paratroop' },
            { kind: 'gun' },
            { kind: 'surrender' },
            null,
            42,
            'string',
            [],
        ];
        for (const order of orders) {
            const result = validateCommand(world, order as Order);
            // result must be an object with `ok` boolean — never undefined
            // (validateCommand always returns CommandResult, never undefined).
            expect(typeof result).toBe('object');
            expect(typeof result.ok).toBe('boolean');
        }
    });
});

// ---------------------------------------------------------------------------
// Direction validation
// ---------------------------------------------------------------------------

describe('validateCommand — invalid direction', () => {
    it('rejects setPipe with direction "X"', () => {
        const world = makeWorld();
        const order: Order = {
            kind: 'setPipe',
            player: PLAYER_1,
            cell: { x: 0, y: 0 },
            direction: 'X' as unknown as 'N' | 'E' | 'S' | 'W',
        };
        const result = validateCommand(world, order);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason.kind).toBe('invalid_direction');
        }
    });

    it('rejects clearPipe with direction ""', () => {
        const world = makeWorld();
        const order: Order = {
            kind: 'clearPipe',
            player: PLAYER_1,
            cell: { x: 0, y: 0 },
            direction: '' as unknown as 'N' | 'E' | 'S' | 'W',
        };
        const result = validateCommand(world, order);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason.kind).toBe('invalid_direction');
        }
    });

    it('rejects setPipesExclusive with direction "north"', () => {
        const world = makeWorld();
        const order: Order = {
            kind: 'setPipesExclusive',
            player: PLAYER_1,
            cell: { x: 0, y: 0 },
            direction: 'north' as unknown as 'N' | 'E' | 'S' | 'W',
        };
        const result = validateCommand(world, order);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason.kind).toBe('invalid_direction');
        }
    });
});

// ---------------------------------------------------------------------------
// applyCommand integration: unknown orders stage without crashing
// ---------------------------------------------------------------------------

describe('applyCommand — unknown orders do not crash', () => {
    it('applyCommand returns result with unknown_order for bogus kind', () => {
        const world = makeWorld();
        const order = { kind: 'bogus', player: 1 } as unknown as Order;
        const { result, world: returnedWorld } = applyCommand(world, order);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason.kind).toBe('unknown_order');
        }
        // World should be unchanged.
        expect(returnedWorld).toBe(world);
    });
});
