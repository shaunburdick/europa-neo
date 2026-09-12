/**
 * validateFixture tests — Feature 022 (Developer Debugging Tools)
 *
 * Covers:
 *   - Valid fixture with all required fields passes validation
 *   - Missing required fields throw descriptive errors
 *   - Wrong types for required fields throw descriptive errors
 *   - Extra fields are tolerated (spec FR-013)
 *   - Array input is rejected
 *   - Null/undefined/non-object input is rejected
 *   - Orders array validation (malformed entries)
 *   - Version field validation (must be 1)
 *   - finalStateHash format validation (8-char hex)
 *   - terminalTick must be non-negative integer
 */

import { describe, expect, it } from 'vitest';
import { validateFixture } from '../../src/replay/validate';
import { PLAYER_1, PLAYER_2, playerIds, UNKNOWN_PLAYER } from '../fixtures/ids';

/** A minimal valid fixture for reuse across tests. */
const VALID_FIXTURE = {
    version: 1,
    seed: 12345,
    settings: {
        boardSize: 32,
        playerIds: playerIds(2),
        tickIntervalMs: 250,
        seed: 12345,
        visibilityRadius: 6,
    },
    terrainSettings: {
        waterRatio: 0.1,
        roughness: 0.5,
        octaves: 4,
        citiesPerPlayer: 1,
        symmetryStrategy: 'point',
        minCityWaterDistance: 3,
        minCityCityDistance: 5,
        maxRegenAttempts: 5,
        terrainSmoothing: 4,
    },
    playerCount: 2,
    orders: [
        {
            tick: 0,
            playerId: PLAYER_1,
            order: { kind: 'setPipe', player: PLAYER_1, cell: { x: 0, y: 0 }, direction: 'E' },
        },
    ],
    terminalTick: 100,
    terminalResult: { kind: 'win', winner: PLAYER_1, tick: 100, reason: 'last_standing' },
    finalStateHash: 'a1b2c3d4',
    engineVersion: '0.2.0',
};

describe('validateFixture', () => {
    it('accepts a valid fixture with all required fields', () => {
        const fixture = validateFixture(VALID_FIXTURE);
        expect(fixture.version).toBe(1);
        expect(fixture.seed).toBe(12345);
        expect(fixture.settings.boardSize).toBe(32);
        expect(fixture.terrainSettings.waterRatio).toBe(0.1);
        expect(fixture.playerCount).toBe(2);
        expect(fixture.orders).toHaveLength(1);
        expect(fixture.terminalTick).toBe(100);
        expect(fixture.finalStateHash).toBe('a1b2c3d4');
        expect(fixture.engineVersion).toBe('0.2.0');
    });

    it('accepts an empty orders array', () => {
        const fixture = validateFixture({ ...VALID_FIXTURE, orders: [] });
        expect(fixture.orders).toHaveLength(0);
    });

    it('tolerates extra fields on the fixture', () => {
        const fixture = validateFixture({ ...VALID_FIXTURE, extraField: 'ignored' });
        expect(fixture.version).toBe(1);
    });

    it('tolerates extra fields on settings', () => {
        const fixture = validateFixture({
            ...VALID_FIXTURE,
            settings: { ...VALID_FIXTURE.settings, unknownField: 42 },
        });
        expect(fixture.settings.boardSize).toBe(32);
    });

    it('rejects null input', () => {
        expect(() => validateFixture(null)).toThrow('expected an object');
    });

    it('rejects undefined input', () => {
        expect(() => validateFixture(undefined)).toThrow('expected an object');
    });

    it('rejects primitive input', () => {
        expect(() => validateFixture(42)).toThrow('expected an object');
    });

    it('rejects array input', () => {
        expect(() => validateFixture([])).toThrow('expected an object');
    });

    it('rejects missing version', () => {
        const { version: _, ...rest } = VALID_FIXTURE;
        expect(() => validateFixture(rest)).toThrow("missing 'version'");
    });

    it('rejects missing seed', () => {
        const { seed: _, ...rest } = VALID_FIXTURE;
        expect(() => validateFixture(rest)).toThrow("missing 'seed'");
    });

    it('rejects missing settings', () => {
        const { settings: _, ...rest } = VALID_FIXTURE;
        expect(() => validateFixture(rest)).toThrow("missing 'settings'");
    });

    it('rejects missing terrainSettings', () => {
        const { terrainSettings: _, ...rest } = VALID_FIXTURE;
        expect(() => validateFixture(rest)).toThrow("missing 'terrainSettings'");
    });

    it('rejects missing orders', () => {
        const { orders: _, ...rest } = VALID_FIXTURE;
        expect(() => validateFixture(rest)).toThrow("missing 'orders'");
    });

    it('rejects missing terminalTick', () => {
        const { terminalTick: _, ...rest } = VALID_FIXTURE;
        expect(() => validateFixture(rest)).toThrow("missing 'terminalTick'");
    });

    it('rejects missing finalStateHash', () => {
        const { finalStateHash: _, ...rest } = VALID_FIXTURE;
        expect(() => validateFixture(rest)).toThrow("missing 'finalStateHash'");
    });

    it('rejects missing engineVersion', () => {
        const { engineVersion: _, ...rest } = VALID_FIXTURE;
        expect(() => validateFixture(rest)).toThrow("missing 'engineVersion'");
    });

    it('rejects wrong type for version (string)', () => {
        expect(() => validateFixture({ ...VALID_FIXTURE, version: '1' })).toThrow("'version' must be number");
    });

    it('rejects wrong type for seed (string)', () => {
        expect(() => validateFixture({ ...VALID_FIXTURE, seed: '12345' })).toThrow("'seed' must be number");
    });

    it('rejects wrong type for settings (array)', () => {
        expect(() => validateFixture({ ...VALID_FIXTURE, settings: [] })).toThrow("'settings' must be object");
    });

    it('rejects wrong type for orders (string)', () => {
        expect(() => validateFixture({ ...VALID_FIXTURE, orders: 'not-an-array' })).toThrow(
            "'orders' must be an array",
        );
    });

    it('rejects non-array orders', () => {
        expect(() => validateFixture({ ...VALID_FIXTURE, orders: { not: 'array' } })).toThrow(
            "'orders' must be an array",
        );
    });

    it('rejects version !== 1', () => {
        expect(() => validateFixture({ ...VALID_FIXTURE, version: 2 })).toThrow('unsupported version 2');
    });

    it('rejects finalStateHash that is not 8-char hex', () => {
        expect(() => validateFixture({ ...VALID_FIXTURE, finalStateHash: 'xyz' })).toThrow(
            "'finalStateHash' must be an 8-character hex string",
        );
    });

    it('rejects finalStateHash with uppercase hex', () => {
        expect(() => validateFixture({ ...VALID_FIXTURE, finalStateHash: 'A1B2C3D4' })).toThrow(
            "'finalStateHash' must be an 8-character hex string",
        );
    });

    it('rejects negative terminalTick', () => {
        expect(() => validateFixture({ ...VALID_FIXTURE, terminalTick: -1 })).toThrow(
            "'terminalTick' must be a non-negative integer",
        );
    });

    it('rejects non-integer terminalTick', () => {
        expect(() => validateFixture({ ...VALID_FIXTURE, terminalTick: 1.5 })).toThrow(
            "'terminalTick' must be a non-negative integer",
        );
    });

    it('rejects orders with missing tick', () => {
        const orders = [
            { playerId: PLAYER_1, order: { kind: 'setPipe', player: PLAYER_1, cell: { x: 0, y: 0 }, direction: 'E' } },
        ];
        expect(() => validateFixture({ ...VALID_FIXTURE, orders })).toThrow("'tick' must be a non-negative integer");
    });

    it('rejects orders with missing playerId', () => {
        const orders = [
            { tick: 0, order: { kind: 'setPipe', player: PLAYER_1, cell: { x: 0, y: 0 }, direction: 'E' } },
        ];
        expect(() => validateFixture({ ...VALID_FIXTURE, orders })).toThrow(
            "'playerId' must be a canonical 12-character player id",
        );
    });

    it('rejects orders with missing order object', () => {
        const orders = [{ tick: 0, playerId: PLAYER_1 }];
        expect(() => validateFixture({ ...VALID_FIXTURE, orders })).toThrow("'order' must be an object");
    });

    it('rejects orders with non-object entry', () => {
        const orders = ['not-an-order'];
        expect(() => validateFixture({ ...VALID_FIXTURE, orders })).toThrow('expected object');
    });

    it('rejects settings with missing boardSize', () => {
        const { boardSize: _, ...partialSettings } = VALID_FIXTURE.settings;
        expect(() => validateFixture({ ...VALID_FIXTURE, settings: partialSettings })).toThrow(
            "fixture.settings: missing 'boardSize'",
        );
    });

    it('rejects settings.playerIds containing a numeric entry', () => {
        const settings = { ...VALID_FIXTURE.settings, playerIds: [1, PLAYER_2] };
        expect(() => validateFixture({ ...VALID_FIXTURE, settings })).toThrow(
            "'playerIds[0]' must be a canonical 12-character player id",
        );
    });

    it('rejects orders whose playerId is numeric', () => {
        const orders = [
            { tick: 0, playerId: 1, order: { kind: 'setPipe', player: 1, cell: { x: 0, y: 0 }, direction: 'E' } },
        ];
        expect(() => validateFixture({ ...VALID_FIXTURE, orders })).toThrow(
            "'playerId' must be a canonical 12-character player id",
        );
    });

    it('rejects terrainSettings with missing waterRatio', () => {
        const { waterRatio: _, ...partialTerrain } = VALID_FIXTURE.terrainSettings;
        expect(() => validateFixture({ ...VALID_FIXTURE, terrainSettings: partialTerrain })).toThrow(
            "fixture.terrainSettings: missing 'waterRatio'",
        );
    });

    it('rejects multiple missing fields (fails on first)', () => {
        const { version: _v, seed: _s, ...rest } = VALID_FIXTURE;
        expect(() => validateFixture(rest)).toThrow("missing 'version'");
    });
});

describe('validateFixture — explicit identity strictness (issue #74)', () => {
    it('rejects a playerIds list with the wrong length', () => {
        const settings = { ...VALID_FIXTURE.settings, playerIds: [PLAYER_1] };
        expect(() => validateFixture({ ...VALID_FIXTURE, settings })).toThrow(/must contain 2–4 ids/);
    });

    it('rejects duplicate playerIds', () => {
        const settings = { ...VALID_FIXTURE.settings, playerIds: [PLAYER_1, PLAYER_1] };
        expect(() => validateFixture({ ...VALID_FIXTURE, settings })).toThrow(/duplicates/);
    });

    it('rejects a playerId of the wrong length', () => {
        const settings = { ...VALID_FIXTURE.settings, playerIds: ['PLAYER00001', PLAYER_2] };
        expect(() => validateFixture({ ...VALID_FIXTURE, settings })).toThrow(/canonical 12-character/);
    });

    it('rejects a playerId with a disallowed character', () => {
        const settings = { ...VALID_FIXTURE.settings, playerIds: ['PLAYER00000!', PLAYER_2] };
        expect(() => validateFixture({ ...VALID_FIXTURE, settings })).toThrow(/canonical 12-character/);
    });

    it('rejects a playerCount that disagrees with playerIds.length', () => {
        expect(() => validateFixture({ ...VALID_FIXTURE, playerCount: 3 })).toThrow(
            /must equal settings.playerIds.length/,
        );
    });

    it('rejects an order whose playerId is canonical but not registered', () => {
        const orders = [
            {
                tick: 0,
                playerId: UNKNOWN_PLAYER,
                order: { kind: 'setPipe', player: UNKNOWN_PLAYER, cell: { x: 0, y: 0 }, direction: 'E' },
            },
        ];
        expect(() => validateFixture({ ...VALID_FIXTURE, orders })).toThrow(/unknown player id/);
    });

    it('rejects an order whose inner player is not registered', () => {
        const orders = [
            {
                tick: 0,
                playerId: PLAYER_1,
                order: { kind: 'setPipe', player: UNKNOWN_PLAYER, cell: { x: 0, y: 0 }, direction: 'E' },
            },
        ];
        expect(() => validateFixture({ ...VALID_FIXTURE, orders })).toThrow(/unknown player id/);
    });

    it("rejects an order whose playerId disagrees with the order's player", () => {
        const orders = [
            {
                tick: 0,
                playerId: PLAYER_1,
                order: { kind: 'setPipe', player: PLAYER_2, cell: { x: 0, y: 0 }, direction: 'E' },
            },
        ];
        expect(() => validateFixture({ ...VALID_FIXTURE, orders })).toThrow(/does not match/);
    });

    it('rejects an unknown order kind', () => {
        const orders = [{ tick: 0, playerId: PLAYER_1, order: { kind: 'warpDrive', player: PLAYER_1 } }];
        expect(() => validateFixture({ ...VALID_FIXTURE, orders })).toThrow(/'kind' must be a known order kind/);
    });

    it('rejects a malformed order cell', () => {
        const orders = [
            {
                tick: 0,
                playerId: PLAYER_1,
                order: { kind: 'setPipe', player: PLAYER_1, cell: { x: 1.5, y: 0 }, direction: 'E' },
            },
        ];
        expect(() => validateFixture({ ...VALID_FIXTURE, orders })).toThrow(/'x' must be an integer/);
    });

    it('accepts a win terminalResult whose winner is a registered id', () => {
        const fixture = validateFixture({
            ...VALID_FIXTURE,
            terminalResult: { kind: 'win', winner: PLAYER_2, tick: 50, reason: 'all_surrendered' },
        });
        expect(fixture.terminalResult).toEqual({
            kind: 'win',
            winner: PLAYER_2,
            tick: 50,
            reason: 'all_surrendered',
        });
    });

    it('accepts a draw terminalResult', () => {
        const fixture = validateFixture({
            ...VALID_FIXTURE,
            terminalResult: { kind: 'draw', tick: 9, reason: 'mutual_elimination' },
        });
        expect(fixture.terminalResult).toEqual({ kind: 'draw', tick: 9, reason: 'mutual_elimination' });
    });

    it('rejects a numeric terminalResult winner', () => {
        expect(() =>
            validateFixture({
                ...VALID_FIXTURE,
                terminalResult: { kind: 'win', winner: 1, tick: 1, reason: 'last_standing' },
            }),
        ).toThrow(/winner' must be a registered player id/);
    });

    it('rejects a terminalResult winner outside the fixture player list', () => {
        expect(() =>
            validateFixture({
                ...VALID_FIXTURE,
                terminalResult: { kind: 'win', winner: UNKNOWN_PLAYER, tick: 1, reason: 'last_standing' },
            }),
        ).toThrow(/winner' must be a registered player id/);
    });

    it('rejects an unknown terminalResult kind', () => {
        expect(() => validateFixture({ ...VALID_FIXTURE, terminalResult: { kind: 'stalemate', tick: 1 } })).toThrow(
            /'terminalResult.kind' must be 'win' or 'draw'/,
        );
    });

    it('accepts a null terminalResult', () => {
        const fixture = validateFixture({ ...VALID_FIXTURE, terminalResult: null });
        expect(fixture.terminalResult).toBeNull();
    });

    it('accepts a missing terminalResult', () => {
        const { terminalResult: _t, ...rest } = VALID_FIXTURE;
        const fixture = validateFixture(rest);
        expect(fixture.terminalResult).toBeNull();
    });
});
