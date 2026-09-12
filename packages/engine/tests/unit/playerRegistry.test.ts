/**
 * PlayerRegistry + resolver tests — issue #74, T012
 *
 * Covers the engine's only ID ↔ dense-index conversion:
 *   - canonical validation at construction (malformed/numeric/duplicate)
 *   - 2–4 player bounds
 *   - bijection between `ids` / `indexOfId` / `idAt`
 *   - insertion-order independence
 *   - seat/index reassignment preserves IDs
 *   - unknown/forged IDs fail closed (never coerced)
 *   - explicit UTF-16 code-unit ordering (punctuation + case edge cases)
 *   - `compareUtf16` is locale-independent
 *   - resolver paths (`getCell`, `getPlayer`, `validateCommand`) resolve
 *     through the registry
 */

import { parsePlayerId } from '@europa/core';
import { describe, expect, it } from 'vitest';
import { ENGINE_CONSTANTS } from '../../src/constants';
import { createWorld } from '../../src/create';
import {
    compareUtf16,
    createPlayerRegistry,
    MAX_PLAYERS_PER_MATCH,
    MIN_PLAYERS_PER_MATCH,
} from '../../src/playerRegistry';
import { getCell, getPlayer } from '../../src/read';
import type { MatchConfig, Order, PlayerId } from '../../src/types';
import { validateCommand } from '../../src/validate';
import { buildSmallBoard } from '../fixtures/board';
import { PLAYER_1, PLAYER_2, PLAYER_3, PLAYER_4, playerIds, UNKNOWN_PLAYER } from '../fixtures/ids';

// ---------------------------------------------------------------------------
// compareUtf16 — explicit code-unit ordering
// ---------------------------------------------------------------------------

describe('compareUtf16', () => {
    it('orders by UTF-16 code unit, not locale collation', () => {
        // Code units: '-' 45, '0' 48, 'A' 65, 'Z' 90, '_' 95, 'a' 97.
        expect(compareUtf16('-', '0')).toBeLessThan(0);
        expect(compareUtf16('0', 'A')).toBeLessThan(0);
        expect(compareUtf16('A', 'Z')).toBeLessThan(0);
        expect(compareUtf16('Z', '_')).toBeLessThan(0);
        expect(compareUtf16('_', 'a')).toBeLessThan(0);
        // Case-sensitive: uppercase sorts before lowercase.
        expect(compareUtf16('A', 'a')).toBeLessThan(0);
        expect(compareUtf16('Z', 'a')).toBeLessThan(0);
    });

    it('sorts a prefix before its extension and equal strings to 0', () => {
        expect(compareUtf16('ABC', 'ABCD')).toBeLessThan(0);
        expect(compareUtf16('ABCD', 'ABC')).toBeGreaterThan(0);
        expect(compareUtf16('ABCD', 'ABCD')).toBe(0);
        expect(compareUtf16('', 'A')).toBeLessThan(0);
        expect(compareUtf16('', '')).toBe(0);
    });

    it('is locale-independent for the canonical edge characters', () => {
        const edges = ['a', 'A', '_', '0', '-', 'Z'];
        const sorted = [...edges].sort(compareUtf16);
        expect(sorted).toEqual(['-', '0', 'A', 'Z', '_', 'a']);
        // Repeat to prove no hidden state / locale dependence.
        expect([...edges].sort(compareUtf16)).toEqual(sorted);
    });
});

// ---------------------------------------------------------------------------
// Construction + validation
// ---------------------------------------------------------------------------

describe('createPlayerRegistry — construction', () => {
    it('builds a 2–4 player registry with a frozen canonical ID array', () => {
        const registry = createPlayerRegistry(playerIds(4));
        expect(registry.count).toBe(4);
        expect(registry.ids).toEqual([PLAYER_1, PLAYER_2, PLAYER_3, PLAYER_4]);
        expect(Object.isFrozen(registry.ids)).toBe(true);
        expect(MIN_PLAYERS_PER_MATCH).toBe(2);
        expect(MAX_PLAYERS_PER_MATCH).toBe(4);
    });

    it('rejects fewer than 2 or more than 4 players', () => {
        expect(() => createPlayerRegistry([PLAYER_1])).toThrow(RangeError);
        expect(() => createPlayerRegistry([...playerIds(4), parsePlayerId('PLAYER000005')])).toThrow(RangeError);
    });

    it('rejects duplicate IDs', () => {
        expect(() => createPlayerRegistry([PLAYER_1, PLAYER_1])).toThrow(/duplicate/);
    });

    it('rejects malformed and numeric entries without coercion', () => {
        // Malformed canonical-shaped-but-wrong-length string.
        expect(() => createPlayerRegistry(['PLAYER00001' as unknown as PlayerId, PLAYER_2])).toThrow(TypeError);
        // Numeric identity (old `1 | 2` domain) is never accepted.
        expect(() => createPlayerRegistry([1 as unknown as PlayerId, PLAYER_2])).toThrow(TypeError);
        expect(() => createPlayerRegistry([null as unknown as PlayerId, PLAYER_2])).toThrow(TypeError);
    });
});

// ---------------------------------------------------------------------------
// Bijection and insertion-order independence
// ---------------------------------------------------------------------------

describe('PlayerRegistry — ID ↔ dense-index bijection', () => {
    it('maps every ID to its index and back', () => {
        const registry = createPlayerRegistry(playerIds(4));
        for (let i = 0; i < registry.count; i++) {
            const id = registry.requireIdAt(i);
            expect(registry.idAt(i)).toBe(id);
            expect(registry.indexOfId(id)).toBe(i);
            expect(registry.has(id)).toBe(true);
        }
    });

    it('canonicalizes order independent of insertion order', () => {
        const forward = createPlayerRegistry([PLAYER_1, PLAYER_2, PLAYER_3, PLAYER_4]);
        const reversed = createPlayerRegistry([PLAYER_4, PLAYER_3, PLAYER_2, PLAYER_1]);
        const shuffled = createPlayerRegistry([PLAYER_3, PLAYER_1, PLAYER_4, PLAYER_2]);

        expect(forward.ids).toEqual(reversed.ids);
        expect(forward.ids).toEqual(shuffled.ids);
        for (const id of forward.ids) {
            expect(reversed.indexOfId(id)).toBe(forward.indexOfId(id));
            expect(shuffled.indexOfId(id)).toBe(forward.indexOfId(id));
        }
    });

    it('orders canonical edge-case IDs by UTF-16 code units', () => {
        const hyphen = parsePlayerId('------------');
        const zero = parsePlayerId('000000000000');
        const upper = parsePlayerId('AAAAAAAAAAAA');
        const lower = parsePlayerId('aaaaaaaaaaaa');
        const registry = createPlayerRegistry([lower, upper, zero, hyphen]);
        expect(registry.ids).toEqual([hyphen, zero, upper, lower]);
    });
});

// ---------------------------------------------------------------------------
// Unknown / forged / out-of-range IDs fail closed
// ---------------------------------------------------------------------------

describe('PlayerRegistry — checked lookups', () => {
    const registry = createPlayerRegistry(playerIds(2));

    it('returns null for a canonical but unregistered (forged) ID', () => {
        expect(registry.indexOfId(UNKNOWN_PLAYER)).toBeNull();
        expect(registry.has(UNKNOWN_PLAYER)).toBe(false);
        expect(registry.idAt(registry.count)).toBeNull();
    });

    it('does not coerce numbers, malformed strings, or out-of-range indexes', () => {
        expect(registry.indexOfId(1 as unknown as PlayerId)).toBeNull();
        expect(registry.has(2 as unknown as PlayerId)).toBe(false);
        expect(registry.indexOfId('not-an-id' as unknown as PlayerId)).toBeNull();
        expect(registry.idAt(-1)).toBeNull();
        expect(registry.idAt(0.5)).toBeNull();
        expect(registry.idAt(99)).toBeNull();
    });

    it('requireIdAt throws rather than returning an invalid ID', () => {
        expect(registry.requireIdAt(0)).toBe(PLAYER_1);
        expect(() => registry.requireIdAt(registry.count)).toThrow(RangeError);
        expect(() => registry.requireIdAt(-1)).toThrow(RangeError);
    });
});

// ---------------------------------------------------------------------------
// Resolver paths
// ---------------------------------------------------------------------------

const baseConfig: MatchConfig = {
    boardSize: 8,
    playerIds: playerIds(2),
    tickIntervalMs: 250,
    seed: 0xc0ffee,
    visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault,
};

describe('resolver paths resolve IDs through the registry', () => {
    it('getCell returns canonical PlayerIds, never raw bytes', () => {
        const board = buildSmallBoard(8, [
            [1, 1, 1],
            [6, 6, 2],
        ]);
        const world = createWorld(baseConfig, board);
        expect(getCell(world, 1, 1).cityOwner).toBe(PLAYER_1);
        expect(getCell(world, 6, 6).cityOwner).toBe(PLAYER_2);
        expect(getCell(world, 0, 0).troopOwner).toBeNull();
    });

    it('maps terrain placement slots to IDs independently of registry order', () => {
        // Reverse the explicit list: terrain slot 1 = PLAYER_2, slot 2 = PLAYER_1.
        const config: MatchConfig = { ...baseConfig, playerIds: [PLAYER_2, PLAYER_1] };
        const board = buildSmallBoard(8, [
            [1, 1, 1], // slot 1 → PLAYER_2
            [6, 6, 2], // slot 2 → PLAYER_1
        ]);
        const world = createWorld(config, board);
        expect(world.playerRegistry.ids).toEqual([PLAYER_1, PLAYER_2]);
        expect(getCell(world, 1, 1).cityOwner).toBe(PLAYER_2);
        expect(getCell(world, 6, 6).cityOwner).toBe(PLAYER_1);
        // Players array follows canonical registry order.
        expect(world.players.map((p) => p.id)).toEqual([PLAYER_1, PLAYER_2]);
    });

    it('getPlayer throws for an unknown/forged ID', () => {
        const board = buildSmallBoard(8, []);
        const world = createWorld(baseConfig, board);
        expect(getPlayer(world, PLAYER_1).id).toBe(PLAYER_1);
        expect(() => getPlayer(world, UNKNOWN_PLAYER)).toThrow(/no player/);
    });

    it('validateCommand fails closed for an unregistered player', () => {
        const board = buildSmallBoard(8, [[1, 1, 1]]);
        const world = createWorld(baseConfig, board);
        const order: Order = { kind: 'setPipe', player: UNKNOWN_PLAYER, cell: { x: 1, y: 1 }, direction: 'E' };
        const result = validateCommand(world, order);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason.kind).toBe('unknown_player');
        }
    });
});
