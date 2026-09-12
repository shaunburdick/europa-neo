/**
 * World Serialization — Feature 001, Polish-phase (T051)
 *
 * Pure functions for encoding/decoding a `World` to/from a stable
 * binary form, and producing a stable hash. Used by:
 *   - Feature 004 (networking) — wire-format snapshots
 *   - Replay support — load/save match state
 *   - SC-001 determinism tests — byte-identical assertion
 *
 * **Versioned binary format**:
 *
 *   bytes 0..N        : version header (2 magic bytes + 1 length byte +
 *                       N ASCII chars), e.g. `\x00\x00\x05 0.2.0`.
 *   bytes N+1..       : payload (little-endian integers, see below)
 *
 *   Payload layout (issue #74: identities are an explicit canonical table):
 *     - 1 byte  : board width (boardSize)
 *     - 1 byte  : playerCount
 *     - 4 bytes : tick number (uint32 LE)
 *     - 4 bytes : seed (uint32 LE)
 *     - 1 byte  : visibility radius
 *     - 4 bytes : rng state[0] (uint32 LE)
 *     - 4 bytes : rng state[1] (uint32 LE)
 *     - 4 bytes : rng state[2] (uint32 LE)
 *     - 4 bytes : rng state[3] (uint32 LE)
 *     - 1 byte  : player count (sanity)
 *     - 4 bytes : reserved (currently 0; future-proofing)
 *     - 1 byte  : ID table count (must equal playerCount)
 *     - per-ID  : 1 byte length + UTF-8/ASCII ID bytes (canonical order)
 *     - per-player record (table index, status, citiesOwned, troopsHeld,
 *       displayName length + ASCII bytes)
 *     - 2 bytes : city count
 *     - per-city record (x, y, owner placement slot)
 *     - n*n cells: 4 bytes troopCounts + 1 byte troopOwners +
 *                   1 byte pipeMasks + 1 byte reservesPct +
 *                   1 byte cityOwners
 *
 * Owner bytes are private 1-based registry dense indexes; the ID table
 * is the only identity carrier and is canonicalized with the explicit
 * UTF-16 comparator by `createPlayerRegistry`.
 *
 * **Determinism** (FR-017): integer-only ops; no float encoding; fixed
 * field order; little-endian everywhere. Same `World` → byte-identical
 * output every run.
 *
 * **Hash** (`hashWorld`): FNV-1a 32-bit over the serialized bytes,
 * formatted as an 8-character lowercase hex string. Collision-resistant
 * enough for SC-001's "same input → same output" assertion; NOT a
 * cryptographic hash (don't use for security-sensitive checksums).
 */

import { parsePlayerId } from '@europa/core';
import type { PlayerRegistry } from './playerRegistry';
import { createPlayerRegistry } from './playerRegistry';
import type { Board, CityPlacement, Player, PlayerId, PlayerStatus, World } from './types';
import { ENGINE_API_VERSION } from './types';

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const HEADER_PREFIX = 0x00; // First byte marker; reserved for future format extensions.

/** Typed error thrown when `deserializeWorld` sees a version mismatch. */
export class EngineVersionMismatchError extends Error {
    readonly expected: string;
    readonly actual: string;
    constructor(expected: string, actual: string) {
        super(`deserializeWorld: version mismatch — expected '${expected}', got '${actual}'`);
        this.name = 'EngineVersionMismatchError';
        this.expected = expected;
        this.actual = actual;
    }
}

/** Typed error thrown when `deserializeWorld` sees malformed input. */
export class EngineFormatError extends Error {
    constructor(message: string) {
        super(`deserializeWorld: ${message}`);
        this.name = 'EngineFormatError';
    }
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Serialize a `World` to a versioned binary buffer. Pure.
 *
 * @param world The world to encode.
 * @returns Freshly allocated `Uint8Array` containing the version header
 *          followed by the payload.
 */
export function serializeWorld(world: Readonly<World>): Uint8Array {
    const { versionBytes, versionLen } = encodeVersionHeader();
    const payload = encodePayload(world);
    const out = new Uint8Array(versionLen + payload.length);
    out.set(versionBytes, 0);
    out.set(payload, versionLen);
    return out;
}

/**
 * Deserialize a buffer produced by `serializeWorld` back into a `World`.
 * Pure. Validates the version header; throws on mismatch.
 *
 * @throws {EngineVersionMismatchError} if the version header doesn't
 *         match `ENGINE_API_VERSION`.
 * @throws {EngineFormatError} if the buffer is truncated or malformed.
 */
export function deserializeWorld(bytes: Uint8Array): World {
    const { version, versionLen } = decodeVersionHeader(bytes);
    const expected = readEngineApiVersion();
    if (version !== expected) {
        throw new EngineVersionMismatchError(expected, version);
    }
    return decodePayload(bytes, versionLen);
}

/**
 * Stable hash of a `World`. Computes FNV-1a 32-bit over the serialized
 * bytes and returns it as a lowercase hex string (8 chars).
 *
 * Two worlds that serialize to byte-identical buffers → identical hash.
 * Used by SC-001 (byte-identical re-runs) and tests.
 *
 * @param world The world to hash.
 * @returns 8-character lowercase hex string (e.g., `"deadbeef"`).
 */
export function hashWorld(world: Readonly<World>): string {
    const bytes = serializeWorld(world);
    return fnv1a32Hex(bytes);
}

// ----------------------------------------------------------------------------
// Version header
// ----------------------------------------------------------------------------

/** Read the engine API version from the single authoritative constant. */
function readEngineApiVersion(): string {
    // `ENGINE_API_VERSION` is the one source of truth (declared in
    // `@europa/core`, re-exported by the engine contract). Never hard-code
    // a version literal here — drift is caught by `tests/contracts-drift.test.ts`
    // and the identity-migration guard.
    return ENGINE_API_VERSION;
}

function encodeVersionHeader(): { versionBytes: Uint8Array; versionLen: number } {
    const version = readEngineApiVersion();
    const ascii = encodeAscii(version);
    // 1-byte length prefix + ASCII bytes. Length is capped at 255
    // (one byte); current version `"0.2.0"` is 5 bytes.
    if (ascii.length > 255) {
        throw new Error(`serializeWorld: ENGINE_API_VERSION too long (${String(ascii.length)} bytes)`);
    }
    const out = new Uint8Array(3 + ascii.length);
    out[0] = HEADER_PREFIX;
    out[1] = HEADER_PREFIX;
    out[2] = ascii.length;
    out.set(ascii, 3);
    return { versionBytes: out, versionLen: out.length };
}

function decodeVersionHeader(bytes: Uint8Array): { version: string; versionLen: number } {
    if (bytes.length < 3) {
        throw new EngineFormatError(`buffer too short for header (${String(bytes.length)} bytes)`);
    }
    if ((bytes[0] ?? 0) !== HEADER_PREFIX || (bytes[1] ?? 0) !== HEADER_PREFIX) {
        throw new EngineFormatError('missing magic prefix');
    }
    const versionLen = bytes[2] ?? 0;
    if (versionLen === 0 || versionLen > 255) {
        throw new EngineFormatError(`invalid version length ${String(versionLen)}`);
    }
    const start = 3;
    const end = start + versionLen;
    if (bytes.length < end) {
        throw new EngineFormatError('buffer truncated mid-version');
    }
    const version = decodeAscii(bytes.subarray(start, end));
    return { version, versionLen: end };
}

// ----------------------------------------------------------------------------
// Payload
// ----------------------------------------------------------------------------

function encodePayload(world: Readonly<World>): Uint8Array {
    const { board } = world;
    const { playerRegistry } = world;
    const w = board.width;
    const n = w * w;

    // Compute payload size.
    const headerLen =
        1 + // boardSize
        1 + // playerCount
        4 + // tick
        4 + // seed
        1 + // visibilityRadius
        4 * 4 + // rngState[4]
        1 + // player count (sanity)
        4 + // reserved slot
        0;

    // Canonical ID table (issue #74): count byte + per-ID length + bytes.
    // The registry owns the canonical UTF-16 order; serialize that order.
    const tableIds = playerRegistry.ids;
    const idBytes: Uint8Array[] = [];
    let idTableLen = 1; // table count byte
    for (const id of tableIds) {
        const bytes = encodeAscii(id);
        idBytes.push(bytes);
        idTableLen += 1 + bytes.length;
    }

    // Players block: table index, status, citiesOwned, troopsHeld(4), name.
    let playersLen = 0;
    for (const p of world.players) {
        const nameBytes = encodeAscii(p.displayName);
        playersLen += 1 + 1 + 1 + 4 + 1 + nameBytes.length;
    }

    // Cities block.
    const citiesBlockLen = 2 + board.cities.length * (2 + 1);

    // Cells block: n * (4 + 1 + 1 + 1 + 1) = n * 8 bytes.
    const cellsBlockLen = n * 8;

    const total = headerLen + idTableLen + playersLen + citiesBlockLen + cellsBlockLen;
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    let p = 0;

    // Header.
    out[p++] = w & 0xff;
    out[p++] = playerRegistry.count & 0xff;
    dv.setUint32(p, world.tick >>> 0, true);
    p += 4;
    dv.setUint32(p, world.rngSeed >>> 0, true);
    p += 4;
    out[p++] = world.config.visibilityRadius & 0xff;
    for (let i = 0; i < 4; i++) {
        dv.setUint32(p, world.rngState[i] ?? 0, true);
        p += 4;
    }
    out[p++] = world.players.length & 0xff;
    // Reserved 4-byte slot for future payload-length prefix (currently unused;
    // serialized as 0 so older readers that ignore it stay compatible).
    dv.setUint32(p, 0, true);
    p += 4;

    // Canonical ID table.
    out[p++] = tableIds.length & 0xff;
    for (const bytes of idBytes) {
        out[p++] = bytes.length & 0xff;
        out.set(bytes, p);
        p += bytes.length;
    }

    // Players. The identity field is a 0-based index into the ID table.
    for (const player of world.players) {
        const tableIndex = playerRegistry.indexOfId(player.id);
        if (tableIndex === null) {
            throw new Error(`encodePayload: player "${player.id}" is not registered`);
        }
        out[p++] = tableIndex & 0xff;
        out[p++] = encodePlayerStatus(player.status);
        out[p++] = player.citiesOwned & 0xff;
        dv.setUint32(p, player.troopsHeld >>> 0, true);
        p += 4;
        const nameBytes = encodeAscii(player.displayName);
        out[p++] = nameBytes.length & 0xff;
        out.set(nameBytes, p);
        p += nameBytes.length;
    }

    // Cities. `owner` is a 1-based terrain placement slot (numeric).
    dv.setUint16(p, board.cities.length, true);
    p += 2;
    for (const city of board.cities) {
        out[p++] = city.cell.x & 0xff;
        out[p++] = city.cell.y & 0xff;
        out[p++] = city.owner & 0xff;
    }

    // Cells.
    for (let i = 0; i < n; i++) {
        dv.setUint32(p, world.state.troopCounts[i] ?? 0, true);
        p += 4;
        out[p++] = world.state.troopOwners[i] ?? 0;
        out[p++] = world.state.pipeMasks[i] ?? 0;
        out[p++] = world.state.reservesPct[i] ?? 0;
        out[p++] = world.state.cityOwners[i] ?? 0;
    }

    return out;
}

function decodePayload(bytes: Uint8Array, versionLen: number): World {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let p = versionLen;

    if (bytes.length < p + 1 + 1 + 4 + 4 + 1 + 16 + 1 + 4) {
        throw new EngineFormatError('header truncated');
    }

    const boardSize = bytes[p++] ?? 0;
    const playerCount = bytes[p++] ?? 0;
    const tick = dv.getUint32(p, true);
    p += 4;
    const seed = dv.getUint32(p, true);
    p += 4;
    const visibilityRadius = bytes[p++] ?? 0;
    const rngState = new Uint32Array(4);
    for (let i = 0; i < 4; i++) {
        rngState[i] = dv.getUint32(p, true);
        p += 4;
    }
    const playersLen = bytes[p++] ?? 0;
    p += 4; // reserved slot

    if (playersLen !== playerCount) {
        throw new EngineFormatError(
            `playerCount mismatch (header=${String(playerCount)}, players=${String(playersLen)})`,
        );
    }

    // Canonical ID table (issue #74). Each entry is validated with
    // `parsePlayerId` and the table itself is validated by
    // `createPlayerRegistry` (canonical form, 2–4 entries, uniqueness).
    if (bytes.length < p + 1) {
        throw new EngineFormatError('player id table count truncated');
    }
    const tableCount = bytes[p++] ?? 0;
    if (tableCount !== playersLen) {
        throw new EngineFormatError(
            `player id table count mismatch (table=${String(tableCount)}, players=${String(playersLen)})`,
        );
    }
    const tableIds: PlayerId[] = [];
    for (let i = 0; i < tableCount; i++) {
        if (bytes.length < p + 1) {
            throw new EngineFormatError(`player id table entry ${String(i)} length truncated`);
        }
        const idLen = bytes[p++] ?? 0;
        if (bytes.length < p + idLen) {
            throw new EngineFormatError(`player id table entry ${String(i)} truncated`);
        }
        const raw = decodeAscii(bytes.subarray(p, p + idLen));
        p += idLen;
        try {
            tableIds.push(parsePlayerId(raw));
        } catch (cause) {
            throw new EngineFormatError(
                `player id table entry ${String(i)} is not a canonical player id: ${String(cause)}`,
            );
        }
    }
    let playerRegistry: PlayerRegistry;
    try {
        playerRegistry = createPlayerRegistry(tableIds);
    } catch (cause) {
        throw new EngineFormatError(`player id table is invalid: ${String(cause)}`);
    }

    // Players. The identity field is a 0-based index into the ID table.
    const players: Player[] = [];
    for (let i = 0; i < playersLen; i++) {
        const tableIndex = bytes[p++] ?? 0;
        const id = playerRegistry.idAt(tableIndex);
        if (id === null) {
            throw new EngineFormatError(
                `player ${String(i)} table index ${String(tableIndex)} out of range (table size ${String(tableCount)})`,
            );
        }
        const statusByte = bytes[p++] ?? 0;
        const status = decodePlayerStatus(statusByte);
        const citiesOwned = bytes[p++] ?? 0;
        const troopsHeld = dv.getUint32(p, true);
        p += 4;
        const nameLen = bytes[p++] ?? 0;
        if (bytes.length < p + nameLen) {
            throw new EngineFormatError(`player ${String(i)} name truncated`);
        }
        const displayName = decodeAscii(bytes.subarray(p, p + nameLen));
        p += nameLen;
        players.push({
            id,
            displayName,
            status,
            citiesOwned,
            troopsHeld,
        });
    }

    // Cities. `owner` is a 1-based terrain placement slot (numeric).
    if (bytes.length < p + 2) {
        throw new EngineFormatError('city count truncated');
    }
    const cityCount = dv.getUint16(p, true);
    p += 2;
    const cities: CityPlacement[] = [];
    for (let i = 0; i < cityCount; i++) {
        if (bytes.length < p + 3) {
            throw new EngineFormatError(`city ${String(i)} truncated`);
        }
        cities.push({
            cell: { x: bytes[p++] ?? 0, y: bytes[p++] ?? 0 },
            owner: bytes[p++] ?? 0,
        });
    }

    // Cells.
    const n = boardSize * boardSize;
    if (bytes.length < p + n * 8) {
        throw new EngineFormatError(`cells truncated (need ${String(n * 8)} bytes)`);
    }
    const troopCounts = new Uint32Array(n);
    const troopOwners = new Uint8Array(n);
    const pipeMasks = new Uint8Array(n);
    const reservesPct = new Uint8Array(n);
    const cityOwners = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        troopCounts[i] = dv.getUint32(p, true);
        p += 4;
        troopOwners[i] = bytes[p++] ?? 0;
        pipeMasks[i] = bytes[p++] ?? 0;
        reservesPct[i] = bytes[p++] ?? 0;
        cityOwners[i] = bytes[p++] ?? 0;
    }

    // Board cells: we don't have a Cell[] in the serialized form (only
    // cell counts); reconstruct a minimal placeholder Board with all-
    // land, elevation 0. This is a known limitation: `deserializeWorld`
    // returns a "skeletal" world that preserves runtime state but loses
    // board terrain. For test purposes this is fine — the tests that
    // round-trip a world don't read board.cells. For networking use,
    // the board should be re-fetched from feature 003.
    const board: Board = {
        width: boardSize,
        height: boardSize,
        cells: Array.from({ length: n }, (_, i) => ({
            x: i % boardSize,
            y: Math.floor(i / boardSize),
            elevation: 0,
            terrain: 'land' as const,
        })),
        cities,
    };

    return {
        config: {
            boardSize,
            playerIds: tableIds,
            tickIntervalMs: 250, // not serialized; default
            seed,
            visibilityRadius,
        },
        tick,
        board,
        players,
        state: {
            troopCounts,
            troopOwners,
            pipeMasks,
            reservesPct,
            cityOwners,
        },
        rngSeed: seed,
        rngState,
        playerRegistry,
    };
}

// ----------------------------------------------------------------------------
// Status encoding
// ----------------------------------------------------------------------------

const STATUS_ALIVE = 0x01;
const STATUS_SURRENDERED = 0x02;
const STATUS_ELIMINATED = 0x03;

function encodePlayerStatus(status: PlayerStatus): number {
    switch (status) {
        case 'alive':
            return STATUS_ALIVE;
        case 'surrendered':
            return STATUS_SURRENDERED;
        case 'eliminated':
            return STATUS_ELIMINATED;
    }
}

function decodePlayerStatus(byte: number): PlayerStatus {
    switch (byte) {
        case STATUS_ALIVE:
            return 'alive';
        case STATUS_SURRENDERED:
            return 'surrendered';
        case STATUS_ELIMINATED:
            return 'eliminated';
        default:
            throw new EngineFormatError(`unknown player status byte ${String(byte)}`);
    }
}

// ----------------------------------------------------------------------------
// Hash
// ----------------------------------------------------------------------------
//
// FNV-1a 32-bit. Public-domain reference:
//   http://www.isthe.com/chongo/tech/comp/fnv/
// Integer-only ops; same hash for same bytes on every platform.

const FNV_OFFSET_32 = 0x811c9dc5;
const FNV_PRIME_32 = 0x01000193;

/**
 * FNV-1a 32-bit hash, returned as an 8-character lowercase hex string.
 * Pure.
 *
 * @param bytes The bytes to hash.
 * @returns 8-character hex string (e.g., `"deadbeef"`).
 */
function fnv1a32Hex(bytes: Uint8Array): string {
    let hash = FNV_OFFSET_32 >>> 0;
    for (let i = 0; i < bytes.length; i++) {
        hash = (hash ^ ((bytes[i] ?? 0) & 0xff)) >>> 0;
        hash = Math.imul(hash, FNV_PRIME_32) >>> 0;
    }
    // 8-character lowercase hex.
    return hash.toString(16).padStart(8, '0');
}

// ----------------------------------------------------------------------------
// ASCII helpers
// ----------------------------------------------------------------------------
//
// We encode strings as ASCII (not UTF-8). This matches the engine's
// contract: player displayNames are ASCII-only by convention (set by
// feature 006's matchmaking layer, which validates input). Avoiding
// UTF-8 keeps the encoder/decoder dependency-free (no TextEncoder /
// TextDecoder needed) and deterministic across all JS engines.
//
// Non-ASCII characters in `displayName` will be replaced with `?` on
// encode; the round-trip is exact for ASCII strings. Version strings
// (`ENGINE_API_VERSION`) are ASCII by construction.

function encodeAscii(s: string): Uint8Array {
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i);
        out[i] = code < 128 ? code : 0x3f; // '?'
    }
    return out;
}

function decodeAscii(bytes: Uint8Array): string {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        out += String.fromCharCode(bytes[i] ?? 0);
    }
    return out;
}
