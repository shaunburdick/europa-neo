/**
 * serializeWorld / deserializeWorld / hashWorld tests — Feature 001, T051
 * + issue #74 Wave 3 (T017)
 *
 * Covers:
 *   - Round-trip: `deserializeWorld(serializeWorld(w))` preserves the
 *     runtime state, config (including `tickIntervalMs` and the explicit
 *     placement-slot order of `config.playerIds`), and the canonical ID
 *     table. Re-serializing the decoded world is byte-identical (lossless).
 *   - Version boundaries: a wrong `ENGINE_API_VERSION` header throws
 *     `EngineVersionMismatchError`; a wrong payload format version throws
 *     `EngineFormatVersionMismatchError`.
 *   - Strict ID-table rejection: malformed, duplicate, missing, extra,
 *     numeric, permuted, and inconsistently-referenced tables fail closed.
 *   - Encode strictness: `serializeWorld` refuses to silently corrupt a
 *     non-canonical world (`EngineSerializationError`).
 *   - `hashWorld` determinism: same world → same hash; different tick →
 *     different hash; byte-identical buffers for the same world.
 */

import { describe, expect, it } from 'vitest';
import { ENGINE_CONSTANTS } from '../../src/constants';
import { createWorld } from '../../src/create';
import { createPlayerRegistry } from '../../src/playerRegistry';
import {
    deserializeWorld,
    EngineFormatError,
    EngineFormatVersionMismatchError,
    EngineSerializationError,
    EngineVersionMismatchError,
    hashWorld,
    permutationProblem,
    SERIALIZE_FORMAT_VERSION,
    serializeWorld,
} from '../../src/serialize';
import type { CityPlacement, MatchConfig, Player, PlayerId, World } from '../../src/types';
import { ENGINE_API_VERSION } from '../../src/types';
import { buildSmallBoard } from '../fixtures/board';
import { PLAYER_1, PLAYER_2, playerIds, UNKNOWN_PLAYER } from '../fixtures/ids';
import { runScenario } from '../fixtures/scenarios';

const cfg: MatchConfig = {
    boardSize: 8,
    playerIds: playerIds(2),
    tickIntervalMs: 250,
    seed: 1,
    visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault,
};

/** Board with one city for each player (placement slots 1 and 2). */
const TWO_CITY_BOARD = buildSmallBoard(8, [
    [1, 1, 1],
    [6, 6, 2],
]);

describe('serializeWorld / deserializeWorld round-trip', () => {
    it('round-trip preserves the mutable parts of a tick-0 world', () => {
        const w = createWorld(cfg, TWO_CITY_BOARD);
        const bytes = serializeWorld(w);
        const restored = deserializeWorld(bytes);

        expect(restored.board.width).toBe(w.board.width);
        expect(restored.board.height).toBe(w.board.height);
        expect(restored.board.cities.length).toBe(w.board.cities.length);
        expect(restored.board.cities[0]?.cell).toEqual(w.board.cities[0]?.cell);
        expect(restored.board.cities[0]?.owner).toBe(w.board.cities[0]?.owner);

        expect(restored.players.length).toBe(w.players.length);
        for (let i = 0; i < w.players.length; i++) {
            expect(restored.players[i]?.id).toBe(w.players[i]?.id);
            expect(restored.players[i]?.status).toBe(w.players[i]?.status);
            expect(restored.players[i]?.citiesOwned).toBe(w.players[i]?.citiesOwned);
            expect(restored.players[i]?.displayName).toBe(w.players[i]?.displayName);
        }

        expect(restored.tick).toBe(w.tick);
        expect(restored.rngSeed).toBe(w.rngSeed);
        expect(Array.from(restored.rngState)).toEqual(Array.from(w.rngState));
        expect(Array.from(restored.state.troopCounts)).toEqual(Array.from(w.state.troopCounts));
        expect(Array.from(restored.state.troopOwners)).toEqual(Array.from(w.state.troopOwners));
        expect(Array.from(restored.state.pipeMasks)).toEqual(Array.from(w.state.pipeMasks));
        expect(Array.from(restored.state.cityOwners)).toEqual(Array.from(w.state.cityOwners));

        expect(restored.config.boardSize).toBe(w.config.boardSize);
        expect(restored.config.playerIds).toEqual(w.config.playerIds);
        expect(restored.config.seed).toBe(w.config.seed);
        expect(restored.config.tickIntervalMs).toBe(w.config.tickIntervalMs);
        expect(restored.config.visibilityRadius).toBe(w.config.visibilityRadius);
        expect(restored.playerRegistry.ids).toEqual(w.playerRegistry.ids);
    });

    it('re-serializing a decoded world reproduces the exact bytes (lossless)', () => {
        const w = createWorld(cfg, TWO_CITY_BOARD);
        const bytes = serializeWorld(w);
        const restored = deserializeWorld(bytes);
        expect(Array.from(serializeWorld(restored))).toEqual(Array.from(bytes));
    });

    it('round-trip preserves a world with non-trivial state (post-tick)', () => {
        const { finalWorld } = runScenario(cfg, TWO_CITY_BOARD, [], 30);
        expect(finalWorld.state.troopCounts.some((c) => c > 0)).toBe(true);

        const restored = deserializeWorld(serializeWorld(finalWorld));
        expect(restored.tick).toBe(finalWorld.tick);
        expect(restored.state.troopCounts.length).toBe(finalWorld.state.troopCounts.length);
        for (let i = 0; i < finalWorld.state.troopCounts.length; i++) {
            expect(restored.state.troopCounts[i]).toBe(finalWorld.state.troopCounts[i]);
            expect(restored.state.troopOwners[i]).toBe(finalWorld.state.troopOwners[i]);
        }
    });

    it('preserves placement-slot order even when it differs from canonical order', () => {
        // Slot 1 = PLAYER_2, slot 2 = PLAYER_1. The registry is canonical
        // (PLAYER_1, PLAYER_2) but `config.playerIds` is slot order.
        const reversed: MatchConfig = { ...cfg, playerIds: [PLAYER_2, PLAYER_1] };
        const w = createWorld(reversed, TWO_CITY_BOARD);
        expect(w.playerRegistry.ids).toEqual([PLAYER_1, PLAYER_2]);

        const bytes = serializeWorld(w);
        const restored = deserializeWorld(bytes);
        expect(restored.playerRegistry.ids).toEqual([PLAYER_1, PLAYER_2]);
        expect(restored.config.playerIds).toEqual([PLAYER_2, PLAYER_1]);
        expect(Array.from(serializeWorld(restored))).toEqual(Array.from(bytes));
    });

    it('emits byte-identical ID tables for the same ID set in different slot orders', () => {
        const canonical = createWorld(cfg, TWO_CITY_BOARD);
        const reversed = createWorld({ ...cfg, playerIds: [PLAYER_2, PLAYER_1] }, TWO_CITY_BOARD);
        const canonicalBytes = serializeWorld(canonical);
        const reversedBytes = serializeWorld(reversed);

        // Byte layout before the ID table (N3):
        //   version header = 2 magic bytes + 1 length byte + N ASCII chars
        //   fixed payload  = format(1) + boardSize(1) + playerCount(1) +
        //                    tick(4) + seed(4) + tickIntervalMs(4) +
        //                    visibilityRadius(1) + rngState(4×4) = 32 bytes
        //   table count    = 1 byte
        // So the table ENTRIES start at versionHeaderLen + 32 + 1, NOT 33.
        const versionHeaderLen = 3 + (canonicalBytes[2] ?? 0);
        const FIXED_PAYLOAD_BYTES = 32;
        const TABLE_START = versionHeaderLen + FIXED_PAYLOAD_BYTES + 1;
        const TABLE_LEN = 2 * (1 + 12);

        const canonicalTable = canonicalBytes.subarray(TABLE_START, TABLE_START + TABLE_LEN);
        const reversedTable = reversedBytes.subarray(TABLE_START, TABLE_START + TABLE_LEN);

        // Prove the slice really is the table, not arbitrary payload bytes:
        // the first byte is an entry length (12) and the entries are the
        // canonical sorted IDs.
        expect(canonicalTable[0]).toBe(12);
        expect(Array.from(canonicalTable.subarray(1, 13))).toEqual(PLAYER_1_BYTES);
        expect(Array.from(canonicalTable.subarray(14, 26))).toEqual(PLAYER_2_BYTES);
        expect(Array.from(reversedTable)).toEqual(Array.from(canonicalTable));
    });

    it('serializeWorld returns the same bytes for the same world (determinism)', () => {
        const w = createWorld(cfg, TWO_CITY_BOARD);
        const a = serializeWorld(w);
        const b = serializeWorld(w);
        expect(Array.from(a)).toEqual(Array.from(b));
    });

    it('serializeWorld returns different bytes for different ticks', () => {
        const { finalWorld: w0 } = runScenario(cfg, TWO_CITY_BOARD, [], 0);
        const { finalWorld: w1 } = runScenario(cfg, TWO_CITY_BOARD, [], 5);
        expect(Array.from(serializeWorld(w0))).not.toEqual(Array.from(serializeWorld(w1)));
    });
});

describe('hashWorld', () => {
    it('produces an 8-character lowercase hex string', () => {
        const w = createWorld(cfg, TWO_CITY_BOARD);
        expect(hashWorld(w)).toMatch(/^[0-9a-f]{8}$/);
    });

    it('is deterministic: same world → same hash', () => {
        const w = createWorld(cfg, TWO_CITY_BOARD);
        expect(hashWorld(w)).toBe(hashWorld(w));
    });

    it('is different for worlds at different ticks', () => {
        const { finalWorld: w0 } = runScenario(cfg, TWO_CITY_BOARD, [], 0);
        const { finalWorld: w1 } = runScenario(cfg, TWO_CITY_BOARD, [], 5);
        expect(hashWorld(w0)).not.toBe(hashWorld(w1));
    });
});

// ---------------------------------------------------------------------------
// Hand-crafted payloads (strict rejection)
// ---------------------------------------------------------------------------

/** Version header bytes for the current `ENGINE_API_VERSION`. */
const VERSION_BYTES = Array.from(new TextEncoder().encode(ENGINE_API_VERSION));

/** Canonical 12-character fixture IDs as byte arrays. */
const PLAYER_1_BYTES = Array.from(new TextEncoder().encode('PLAYER000001'));
const PLAYER_2_BYTES = Array.from(new TextEncoder().encode('PLAYER000002'));

/** Little-endian uint32 byte list. */
function u32(value: number): number[] {
    return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

/** ASCII bytes for a test field. */
function ascii(value: string): number[] {
    return Array.from(new TextEncoder().encode(value));
}

/**
 * A player record: table index, status, citiesOwned, troopsHeld(u32),
 * displayName length + ASCII bytes.
 */
function playerRecord(tableIndex: number, statusByte: number, name: string): number[] {
    return [tableIndex, statusByte, 0, ...u32(0), name.length, ...ascii(name)];
}

/** Options for {@link buildPayload}. */
interface PayloadOptions {
    readonly formatVersion?: number;
    readonly boardSize?: number;
    readonly playerCount?: number;
    readonly idTableCount?: number;
    readonly visibilityRadius?: number;
    /** Raw table entries: each is the ID bytes (length may be wrong). */
    readonly tableEntries?: ReadonlyArray<readonly number[]>;
    readonly slotOrder?: readonly number[];
    readonly playerRecords?: ReadonlyArray<readonly number[]>;
    readonly cityCount?: number;
    readonly cities?: ReadonlyArray<readonly [number, number, number]>;
    readonly cells?: readonly number[];
    readonly trailing?: readonly number[];
}

/** Build a complete payload body (before the version header). */
function buildPayload(opts: PayloadOptions = {}): number[] {
    const p: number[] = [];
    p.push(opts.formatVersion ?? SERIALIZE_FORMAT_VERSION);
    p.push(opts.boardSize ?? 8);
    p.push(opts.playerCount ?? 2);
    p.push(...u32(0)); // tick
    p.push(...u32(1)); // seed
    p.push(...u32(250)); // tickIntervalMs
    p.push(opts.visibilityRadius ?? 4);
    p.push(...u32(0), ...u32(0), ...u32(0), ...u32(0)); // rngState
    p.push(opts.idTableCount ?? 2);

    const entries = opts.tableEntries ?? [PLAYER_1_BYTES, PLAYER_2_BYTES];
    for (const bytes of entries) {
        p.push(bytes.length);
        p.push(...bytes);
    }

    for (const slot of opts.slotOrder ?? [0, 1]) {
        p.push(slot);
    }

    const records = opts.playerRecords ?? [playerRecord(0, 0x01, 'A'), playerRecord(1, 0x01, 'B')];
    for (const record of records) {
        p.push(...record);
    }

    const cities = opts.cities ?? [];
    const cityCount = opts.cityCount ?? cities.length;
    p.push(cityCount & 0xff, (cityCount >>> 8) & 0xff);
    for (const [x, y, owner] of cities) {
        p.push(x, y, owner);
    }

    p.push(...(opts.cells ?? new Array<number>(64 * 8).fill(0)));
    if (opts.trailing !== undefined) {
        p.push(...opts.trailing);
    }
    return p;
}

/** Wrap a payload body with a valid version header. */
function bufferOf(body: number[]): Uint8Array {
    return new Uint8Array([0x00, 0x00, VERSION_BYTES.length, ...VERSION_BYTES, ...body]);
}

/** A fully valid hand-crafted buffer. */
function validBuffer(): Uint8Array {
    return bufferOf(buildPayload());
}

/** First `count` bytes of the valid buffer — used for truncation tests. */
function truncated(count: number): Uint8Array {
    return validBuffer().slice(0, count);
}

/** Replace the first cell's fields for the cell-range tests. */
function cellsWithFirstCell(
    fields: Partial<Record<'troopOwner' | 'pipeMask' | 'reservesPct' | 'cityOwner', number>>,
): number[] {
    const cells = new Array<number>(64 * 8).fill(0);
    cells[4] = fields.troopOwner ?? 0;
    cells[5] = fields.pipeMask ?? 0;
    cells[6] = fields.reservesPct ?? 0;
    cells[7] = fields.cityOwner ?? 0;
    return cells;
}

describe('deserializeWorld — version boundaries', () => {
    it('accepts a hand-crafted valid payload', () => {
        const restored = deserializeWorld(validBuffer());
        expect(restored.tick).toBe(0);
        expect(restored.config.playerIds).toEqual([PLAYER_1, PLAYER_2]);
        expect(restored.playerRegistry.ids).toEqual([PLAYER_1, PLAYER_2]);
    });

    it('throws EngineVersionMismatchError on a wrong API version', () => {
        const version = new TextEncoder().encode('9.9.9');
        const buffer = new Uint8Array(3 + version.length + buildPayload().length);
        buffer[0] = 0x00;
        buffer[1] = 0x00;
        buffer[2] = version.length;
        buffer.set(version, 3);
        buffer.set(buildPayload(), 3 + version.length);
        expect(() => deserializeWorld(buffer)).toThrow(EngineVersionMismatchError);
    });

    it('throws EngineFormatVersionMismatchError on an unsupported payload format version', () => {
        const buffer = bufferOf(buildPayload({ formatVersion: SERIALIZE_FORMAT_VERSION + 1 }));
        expect(() => deserializeWorld(buffer)).toThrow(EngineFormatVersionMismatchError);
        // It is also a format error so generic handlers still catch it.
        expect(() => deserializeWorld(buffer)).toThrow(EngineFormatError);
    });

    it('throws EngineFormatError on a missing magic prefix', () => {
        expect(() => deserializeWorld(new Uint8Array([0x01, 0x01, 0x00]))).toThrow(EngineFormatError);
    });

    it('throws EngineFormatError on a zero version length', () => {
        expect(() => deserializeWorld(new Uint8Array([0x00, 0x00, 0x00]))).toThrow(EngineFormatError);
    });

    it('throws EngineFormatError when the buffer is truncated mid-version', () => {
        expect(() => deserializeWorld(new Uint8Array([0x00, 0x00, 0x05, 0x30, 0x2e]))).toThrow(EngineFormatError);
    });
});

describe('deserializeWorld — strict ID table rejection', () => {
    it('rejects an ID table count that disagrees with the header', () => {
        expect(() => deserializeWorld(bufferOf(buildPayload({ idTableCount: 3 })))).toThrow(EngineFormatError);
    });

    it('rejects a malformed table entry (wrong length)', () => {
        const buffer = bufferOf(buildPayload({ tableEntries: [PLAYER_1_BYTES.slice(0, 11), PLAYER_2_BYTES] }));
        expect(() => deserializeWorld(buffer)).toThrow(/length 11 must be 12/);
    });

    it('rejects a numeric identity encoded as a short table entry', () => {
        const buffer = bufferOf(buildPayload({ tableEntries: [[0x31], PLAYER_2_BYTES] }));
        expect(() => deserializeWorld(buffer)).toThrow(EngineFormatError);
    });

    it('rejects a table entry outside the canonical alphabet', () => {
        const buffer = bufferOf(buildPayload({ tableEntries: [ascii('!!!!!!!!!!!!'), PLAYER_2_BYTES] }));
        expect(() => deserializeWorld(buffer)).toThrow(/not a canonical player id/);
    });

    it('rejects a duplicate table entry', () => {
        const buffer = bufferOf(buildPayload({ tableEntries: [PLAYER_1_BYTES, PLAYER_1_BYTES] }));
        expect(() => deserializeWorld(buffer)).toThrow(/strict canonical order/);
    });

    it('rejects a permuted (non-canonical) table', () => {
        const buffer = bufferOf(buildPayload({ tableEntries: [PLAYER_2_BYTES, PLAYER_1_BYTES] }));
        expect(() => deserializeWorld(buffer)).toThrow(/strict canonical order/);
    });

    it('rejects a player record referencing the wrong table index', () => {
        const buffer = bufferOf(
            buildPayload({ playerRecords: [playerRecord(1, 0x01, 'A'), playerRecord(0, 0x01, 'B')] }),
        );
        expect(() => deserializeWorld(buffer)).toThrow(/canonical registry order/);
    });

    it('rejects a slot order that is not a permutation', () => {
        expect(() => deserializeWorld(bufferOf(buildPayload({ slotOrder: [0, 0] })))).toThrow(
            /slot order is not a permutation/,
        );
    });

    it('rejects a slot order with an out-of-range index', () => {
        expect(() => deserializeWorld(bufferOf(buildPayload({ slotOrder: [0, 2] })))).toThrow(/missing table index/);
    });

    it('rejects a player record referencing an out-of-range table index', () => {
        // The record ordinal 0 must reference table index 0; 0xff is
        // beyond the 2-entry table, so the registry lookup fails closed
        // before the canonical-order check.
        const buffer = bufferOf(
            buildPayload({ playerRecords: [playerRecord(0xff, 0x01, 'A'), playerRecord(1, 0x01, 'B')] }),
        );
        expect(() => deserializeWorld(buffer)).toThrow(/table index 255 is out of range/);
    });

    it('rejects an unknown player status byte', () => {
        const buffer = bufferOf(
            buildPayload({ playerRecords: [playerRecord(0, 0xff, 'A'), playerRecord(1, 0x01, 'B')] }),
        );
        expect(() => deserializeWorld(buffer)).toThrow(/unknown player status byte/);
    });

    it('rejects a non-ASCII player display name', () => {
        const record = [0, 0x01, 0, ...u32(0), 1, 0xff];
        const buffer = bufferOf(buildPayload({ playerRecords: [record, playerRecord(1, 0x01, 'B')] }));
        expect(() => deserializeWorld(buffer)).toThrow(/non-ASCII byte/);
    });

    it('rejects extra trailing bytes after the payload', () => {
        expect(() => deserializeWorld(bufferOf(buildPayload({ trailing: [0x00] })))).toThrow(/trailing bytes/);
    });

    it('rejects a player count outside [2, 4]', () => {
        expect(() => deserializeWorld(bufferOf(buildPayload({ playerCount: 1, idTableCount: 1 })))).toThrow(
            /player count 1 is outside/,
        );
    });

    it('rejects a board size below the minimum', () => {
        expect(() => deserializeWorld(bufferOf(buildPayload({ boardSize: 4 })))).toThrow(/below the minimum/);
    });
});

describe('deserializeWorld — city and cell strictness', () => {
    it('rejects a city owner outside the placement-slot range', () => {
        const buffer = bufferOf(buildPayload({ cities: [[1, 1, 3]] }));
        expect(() => deserializeWorld(buffer)).toThrow(/placement-slot range/);
    });

    it('rejects a city coordinate outside the board', () => {
        const buffer = bufferOf(buildPayload({ cities: [[9, 1, 1]] }));
        expect(() => deserializeWorld(buffer)).toThrow(/out of bounds/);
    });

    it('rejects duplicate city cells', () => {
        const buffer = bufferOf(
            buildPayload({
                cities: [
                    [1, 1, 1],
                    [1, 1, 2],
                ],
            }),
        );
        expect(() => deserializeWorld(buffer)).toThrow(/duplicate city/);
    });

    it('rejects a city block whose declared count exceeds the data', () => {
        expect(() => deserializeWorld(bufferOf(buildPayload({ cityCount: 1, cities: [] })))).toThrow(EngineFormatError);
    });

    it('rejects a cell troopOwner above the player count', () => {
        const buffer = bufferOf(buildPayload({ cells: cellsWithFirstCell({ troopOwner: 3 }) }));
        expect(() => deserializeWorld(buffer)).toThrow(/troopOwner 3 exceeds/);
    });

    it('rejects a cell cityOwner above the player count', () => {
        const buffer = bufferOf(buildPayload({ cells: cellsWithFirstCell({ cityOwner: 3 }) }));
        expect(() => deserializeWorld(buffer)).toThrow(/cityOwner 3 exceeds/);
    });

    it('rejects a pipe mask with bits above 0x0f', () => {
        const buffer = bufferOf(buildPayload({ cells: cellsWithFirstCell({ pipeMask: 0x10 }) }));
        expect(() => deserializeWorld(buffer)).toThrow(/pipeMask/);
    });

    it('rejects a reserves percentage above 9', () => {
        const buffer = bufferOf(buildPayload({ cells: cellsWithFirstCell({ reservesPct: 10 }) }));
        expect(() => deserializeWorld(buffer)).toThrow(/reservesPct 10 exceeds/);
    });
});

describe('deserializeWorld — truncation', () => {
    it('throws EngineFormatError at every truncation point', () => {
        const full = validBuffer();
        for (const cut of [0, 1, 2, 10, 33, 40, 59, 61, 70, full.length - 1]) {
            expect(() => deserializeWorld(truncated(cut))).toThrow(EngineFormatError);
        }
    });
});

// ---------------------------------------------------------------------------
// Encode strictness
// ---------------------------------------------------------------------------

describe('serializeWorld — encode strictness', () => {
    /** Build a world, then apply shallow overrides for negative encode tests. */
    function worldWith(overrides: Partial<World>): World {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        return { ...base, ...overrides };
    }

    it('rejects a non-ASCII display name', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const players: Player[] = base.players.map((p, i) => (i === 0 ? { ...p, displayName: 'P\u00e9' } : { ...p }));
        expect(() => serializeWorld(worldWith({ players }))).toThrow(EngineSerializationError);
    });

    it('rejects a config.playerIds entry that is not registered', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const config: MatchConfig = { ...base.config, playerIds: [PLAYER_1, UNKNOWN_PLAYER] };
        expect(() => serializeWorld(worldWith({ config }))).toThrow(EngineSerializationError);
    });

    it('rejects players that are not in canonical registry order', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const players: Player[] = [base.players[1], base.players[0]].filter((p): p is Player => p !== undefined);
        expect(() => serializeWorld(worldWith({ players }))).toThrow(/canonical registry order/);
    });

    it('rejects a state owner byte above the player count', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const troopOwners = new Uint8Array(base.state.troopOwners);
        troopOwners[0] = 3;
        expect(() => serializeWorld(worldWith({ state: { ...base.state, troopOwners } }))).toThrow(
            EngineSerializationError,
        );
    });

    it('rejects a city owner outside the placement-slot range', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const cities: CityPlacement[] = [{ cell: { x: 1, y: 1 }, owner: 3 }];
        expect(() => serializeWorld(worldWith({ board: { ...base.board, cities } }))).toThrow(EngineSerializationError);
    });

    it('rejects citiesOwned above the one-byte field range (N2)', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const players: Player[] = base.players.map((p, i) => (i === 0 ? { ...p, citiesOwned: 256 } : { ...p }));
        expect(() => serializeWorld(worldWith({ players }))).toThrow(/citiesOwned must be an integer in \[0, 255\]/);
    });

    it('rejects a negative citiesOwned (N2)', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const players: Player[] = base.players.map((p, i) => (i === 0 ? { ...p, citiesOwned: -1 } : { ...p }));
        expect(() => serializeWorld(worldWith({ players }))).toThrow(EngineSerializationError);
    });

    it('rejects troopsHeld beyond the uint32 range (N2)', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const players: Player[] = base.players.map((p, i) =>
            i === 0 ? { ...p, troopsHeld: 0x1_0000_0000 } : { ...p },
        );
        expect(() => serializeWorld(worldWith({ players }))).toThrow(/troopsHeld must be a uint32/);
    });

    it('rejects a fractional troopsHeld (N2)', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const players: Player[] = base.players.map((p, i) => (i === 0 ? { ...p, troopsHeld: 1.5 } : { ...p }));
        expect(() => serializeWorld(worldWith({ players }))).toThrow(EngineSerializationError);
    });

    it('rejects a config.seed that diverges from rngSeed (S4)', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        expect(() => serializeWorld(worldWith({ rngSeed: (base.config.seed + 1) >>> 0 }))).toThrow(/must agree/);
    });

    it('accepts config.seed and rngSeed that agree modulo uint32 (S4)', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        // createWorld derives rngSeed from `config.seed >>> 0`; a value
        // above 2^32 normalizes identically on both sides.
        const bigSeed = 0x1_0000_0001;
        const world = { ...base, config: { ...base.config, seed: bigSeed }, rngSeed: bigSeed >>> 0 };
        expect(() => serializeWorld(world)).not.toThrow();
    });

    it('rejects an internally inconsistent player registry (ids length !== count)', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const playerRegistry = { ...base.playerRegistry, ids: [PLAYER_1] };
        expect(() => serializeWorld(worldWith({ playerRegistry }))).toThrow(/internally inconsistent/);
    });

    it('rejects config.playerIds whose length differs from the registry count', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const config: MatchConfig = { ...base.config, playerIds: [PLAYER_1] };
        expect(() => serializeWorld(worldWith({ config }))).toThrow(/config.playerIds length/);
    });

    it('rejects a players array whose length differs from the registry count', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const players: Player[] = base.players.slice(0, 1);
        expect(() => serializeWorld(worldWith({ players }))).toThrow(/players length/);
    });

    it('rejects a sparse config.playerIds entry', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const config: MatchConfig = { ...base.config, playerIds: new Array<PlayerId>(2) };
        expect(() => serializeWorld(worldWith({ config }))).toThrow(/config.playerIds\[0\] is missing/);
    });

    it('rejects a config.playerIds that repeats a registered identity (non-permutation)', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const config: MatchConfig = { ...base.config, playerIds: [PLAYER_1, PLAYER_1] };
        expect(() => serializeWorld(worldWith({ config }))).toThrow(/not a permutation/);
    });

    it('rejects a sparse players entry', () => {
        const players = new Array<Player>(2);
        expect(() => serializeWorld(worldWith({ players }))).toThrow(/players\[0\] is missing/);
    });

    it('rejects a player whose id is not registered', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const first = base.players[0];
        if (first === undefined) {
            throw new Error('test setup: players[0] missing');
        }
        const players: Player[] = [{ ...first, id: UNKNOWN_PLAYER }, ...base.players.slice(1)];
        expect(() => serializeWorld(worldWith({ players }))).toThrow(/is not registered/);
    });

    it('rejects a registry whose ids are not in canonical UTF-16 order', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const playerRegistry = { ...base.playerRegistry, ids: [PLAYER_2, PLAYER_1] };
        expect(() => serializeWorld(worldWith({ playerRegistry }))).toThrow(/strict canonical UTF-16 order/);
    });

    it('rejects an out-of-range board width', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        expect(() => serializeWorld(worldWith({ board: { ...base.board, width: 4, height: 4 } }))).toThrow(
            /board.width/,
        );
    });

    it('rejects a negative tick', () => {
        expect(() => serializeWorld(worldWith({ tick: -1 }))).toThrow(/tick must be a non-negative integer/);
    });

    it('rejects a non-integer tickIntervalMs', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const config: MatchConfig = { ...base.config, tickIntervalMs: -1 };
        expect(() => serializeWorld(worldWith({ config }))).toThrow(/tickIntervalMs must be a uint32/);
    });

    it('rejects an out-of-range visibilityRadius', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const config: MatchConfig = { ...base.config, visibilityRadius: 256 };
        expect(() => serializeWorld(worldWith({ config }))).toThrow(/visibilityRadius/);
    });

    it('rejects a city count above the uint16 field', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const cities = { length: 65536 } as unknown as readonly CityPlacement[];
        expect(() => serializeWorld(worldWith({ board: { ...base.board, cities } }))).toThrow(
            /exceeds the 65535-entry/,
        );
    });

    it('rejects a mismatched state cell-array length', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const state = { ...base.state, troopCounts: new Uint32Array(1) };
        expect(() => serializeWorld(worldWith({ state }))).toThrow(/state arrays must hold exactly 64/);
    });

    it('rejects mismatched extended state-array lengths', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const state = { ...base.state, pipeMasks: new Uint8Array(1) };
        expect(() => serializeWorld(worldWith({ state }))).toThrow(/state arrays must hold exactly 64/);
    });

    it('rejects an over-length display name', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const first = base.players[0];
        if (first === undefined) {
            throw new Error('test setup: players[0] missing');
        }
        const players: Player[] = [{ ...first, displayName: 'x'.repeat(256) }, ...base.players.slice(1)];
        expect(() => serializeWorld(worldWith({ players }))).toThrow(/displayName exceeds 255 bytes/);
    });

    it('rejects a sparse city entry', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const cities = new Array<CityPlacement>(1);
        expect(() => serializeWorld(worldWith({ board: { ...base.board, cities } }))).toThrow(
            /board.cities\[0\] is missing/,
        );
    });

    it('rejects a city x coordinate out of bounds', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const cities: CityPlacement[] = [{ cell: { x: 99, y: 1 }, owner: 1 }];
        expect(() => serializeWorld(worldWith({ board: { ...base.board, cities } }))).toThrow(/x out of bounds/);
    });

    it('rejects a city y coordinate out of bounds', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const cities: CityPlacement[] = [{ cell: { x: 1, y: 99 }, owner: 1 }];
        expect(() => serializeWorld(worldWith({ board: { ...base.board, cities } }))).toThrow(/y out of bounds/);
    });

    it('rejects a city owner below the placement-slot range', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const cities: CityPlacement[] = [{ cell: { x: 1, y: 1 }, owner: 0 }];
        expect(() => serializeWorld(worldWith({ board: { ...base.board, cities } }))).toThrow(
            /owner must be a 1-based placement slot/,
        );
    });

    it('rejects an out-of-range cityOwners byte', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const cityOwners = new Uint8Array(base.state.cityOwners);
        cityOwners[0] = 3;
        expect(() => serializeWorld(worldWith({ state: { ...base.state, cityOwners } }))).toThrow(
            /cityOwners\[0\] = 3 exceeds/,
        );
    });

    it('rejects a pipe mask above 0x0f on encode', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const pipeMasks = new Uint8Array(base.state.pipeMasks);
        pipeMasks[0] = 0x10;
        expect(() => serializeWorld(worldWith({ state: { ...base.state, pipeMasks } }))).toThrow(
            /pipeMasks\[0\] has bits above 0x0f/,
        );
    });

    it('rejects a reserves percentage above 9 on encode', () => {
        const base = createWorld(cfg, TWO_CITY_BOARD);
        const reservesPct = new Uint8Array(base.state.reservesPct);
        reservesPct[0] = 10;
        expect(() => serializeWorld(worldWith({ state: { ...base.state, reservesPct } }))).toThrow(
            /reservesPct\[0\] = 10 exceeds 9/,
        );
    });
});

describe('serializeWorld — status encoding branches', () => {
    function buildWorldWithStatus(status: 'alive' | 'surrendered' | 'eliminated'): World {
        return {
            config: cfg,
            tick: 0,
            board: {
                width: 8,
                height: 8,
                cells: Array.from({ length: 64 }, (_, i) => ({
                    x: i % 8,
                    y: Math.floor(i / 8),
                    elevation: 0,
                    terrain: 'land' as const,
                })),
                cities: [
                    { cell: { x: 1, y: 1 }, owner: 1 },
                    { cell: { x: 6, y: 6 }, owner: 2 },
                ],
            },
            players: [
                { id: PLAYER_1, displayName: 'P1', status, citiesOwned: 0, troopsHeld: 0 },
                { id: PLAYER_2, displayName: 'P2', status: 'alive' as const, citiesOwned: 1, troopsHeld: 0 },
            ],
            state: {
                troopCounts: new Uint32Array(64),
                troopOwners: new Uint8Array(64),
                pipeMasks: new Uint8Array(64),
                reservesPct: new Uint8Array(64),
                cityOwners: new Uint8Array(64),
            },
            rngSeed: 1,
            rngState: new Uint32Array([1, 2, 3, 4]),
            playerRegistry: createPlayerRegistry(playerIds(2)),
        };
    }

    it('preserves a surrendered player status through round-trip', () => {
        const restored = deserializeWorld(serializeWorld(buildWorldWithStatus('surrendered')));
        expect(restored.players[0]?.status).toBe('surrendered');
    });

    it('preserves an eliminated player status through round-trip', () => {
        const restored = deserializeWorld(serializeWorld(buildWorldWithStatus('eliminated')));
        expect(restored.players[0]?.status).toBe('eliminated');
    });
});

// ---------------------------------------------------------------------------
// permutationProblem — every rejection branch (coverage + strictness)
// ---------------------------------------------------------------------------

describe('permutationProblem', () => {
    it('returns null for a valid permutation', () => {
        expect(permutationProblem([0, 1, 2], 3)).toBeNull();
        expect(permutationProblem([2, 0, 1], 3)).toBeNull();
        expect(permutationProblem([], 0)).toBeNull();
    });

    it('rejects a list whose length differs from the expected count', () => {
        expect(permutationProblem([0, 1], 3)).toMatch(/expected 3 entries, got 2/);
        expect(permutationProblem([0], 2)).toMatch(/expected 2 entries, got 1/);
    });

    it('rejects a non-integer entry', () => {
        expect(permutationProblem([0, 1.5], 2)).toMatch(/entry 1 is not a table index/);
    });

    it('rejects a negative or too-large entry', () => {
        expect(permutationProblem([-1, 0], 2)).toMatch(/entry 0 is not a table index/);
        expect(permutationProblem([0, 2], 2)).toMatch(/entry 1 is not a table index/);
    });

    it('rejects a duplicate entry', () => {
        expect(permutationProblem([1, 1], 2)).toMatch(/duplicate table index 1/);
    });
});
