/**
 * World Serialization — Feature 001, Polish-phase (T051) + issue #74 (Wave 3)
 *
 * Pure functions for encoding/decoding a `World` to/from a stable
 * binary form, and producing a stable hash. Used by:
 *   - Feature 004 (networking) — wire-format snapshots
 *   - Replay support — load/save match state
 *   - SC-001 determinism tests — byte-identical assertion
 *
 * ## Versioning boundary
 *
 * Two independent versions guard the byte stream:
 *
 *   1. `ENGINE_API_VERSION` — the public type-surface version, carried in
 *      the fixed-length ASCII version header (the first bytes). A mismatch
 *      throws {@link EngineVersionMismatchError}.
 *   2. {@link SERIALIZE_FORMAT_VERSION} — the *payload layout* version,
 *      carried in the first payload byte. It changes whenever the payload
 *      field order/sizes change, independently of the public API version.
 *      A mismatch throws {@link EngineFormatVersionMismatchError}.
 *
 * The second field exists because `ENGINE_API_VERSION` can stay constant
 * while the binary layout still changes (and vice versa); conflating them
 * would make an unknown layout silently parseable.
 *
 * ## Header
 *
 *   bytes 0..N        : version header (2 magic bytes + 1 length byte +
 *                       N ASCII chars), e.g. `\x00\x00\x05 0.2.0`.
 *
 * ## Payload layout (issue #74: identities are an explicit canonical table)
 *
 *     - 1 byte  : payload format version (must equal SERIALIZE_FORMAT_VERSION)
 *     - 1 byte  : board size (>= MIN_BOARD_SIZE, <= 255)
 *     - 1 byte  : player count (2..4)
 *     - 4 bytes : tick number (uint32 LE)
 *     - 4 bytes : seed (uint32 LE)
 *     - 4 bytes : tick interval ms (uint32 LE)
 *     - 1 byte  : visibility radius
 *     - 4 bytes : rng state[0] (uint32 LE)
 *     - 4 bytes : rng state[1] (uint32 LE)
 *     - 4 bytes : rng state[2] (uint32 LE)
 *     - 4 bytes : rng state[3] (uint32 LE)
 *     - 1 byte  : ID table count (must equal player count)
 *     - per-ID  : 1 byte length + ASCII ID bytes, in **canonical UTF-16
 *                 code-unit order** (strictly ascending; no duplicates)
 *     - per-slot: 1 byte table index for each construction/placement slot,
 *                 i.e. `slotOrder[k]` is the table index of
 *                 `config.playerIds[k]`. Must be a permutation of `0..N-1`.
 *                 This preserves the terrain placement-slot → ID mapping
 *                 (`board.cities[].owner` is a 1-based slot, never an ID).
 *     - per-player record: table index (must equal the record ordinal),
 *       status, citiesOwned, troopsHeld (uint32 LE), displayName length +
 *       ASCII bytes. Records are emitted in canonical registry order.
 *     - 2 bytes : city count (uint16 LE)
 *     - per-city record (x, y, owner placement slot)
 *     - n*n cells: 4 bytes troopCounts + 1 byte troopOwners +
 *                   1 byte pipeMasks + 1 byte reservesPct +
 *                   1 byte cityOwners
 *     - (end; trailing bytes are rejected)
 *
 * Owner bytes in the cell block are private 1-based registry dense
 * indexes; the ID table is the only identity carrier. `board.cities[].owner`
 * stays a 1-based terrain placement slot, and `slotOrder` is what maps
 * those slots back to IDs.
 *
 * ## Strictness (issue #74, FR-020..FR-022)
 *
 * Encode fails loudly ({@link EngineSerializationError}) rather than
 * substituting anything: unknown/unregistered IDs, non-canonical player
 * arrays, non-ASCII display names, out-of-range owner bytes,
 * out-of-range board/cell fields, out-of-range player
 * `citiesOwned`/`troopsHeld` values, and a `config.seed`/`rngSeed`
 * divergence are all rejected.
 *
 * Decode rejects, with {@link EngineFormatError} (or
 * {@link EngineFormatVersionMismatchError}), every malformed, duplicate,
 * missing, extra, numeric, permuted, or inconsistent-reference table
 * entry. It never invents an ID and never falls back to a numeric slot.
 *
 * ## Determinism (FR-017)
 *
 * Integer-only ops; no float encoding; fixed field order; little-endian
 * everywhere. Same `World` → byte-identical output every run.
 *
 * ## Hash (`hashWorld`)
 *
 * FNV-1a 32-bit over the serialized bytes, formatted as an 8-character
 * lowercase hex string. Collision-resistant enough for SC-001's "same
 * input → same output" assertion; NOT a cryptographic hash (don't use for
 * security-sensitive checksums).
 */

import { PLAYER_ID_LENGTH, parsePlayerId } from '@europa/core';
import { MIN_BOARD_SIZE } from './create';
import type { PlayerRegistry } from './playerRegistry';
import { compareUtf16, createPlayerRegistry, MAX_PLAYERS_PER_MATCH, MIN_PLAYERS_PER_MATCH } from './playerRegistry';
import type { Board, CityPlacement, Player, PlayerId, PlayerStatus, World } from './types';
import { ENGINE_API_VERSION } from './types';

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

/** First byte marker; reserved for future format extensions. */
const HEADER_PREFIX = 0x00;

/**
 * Payload-layout version, independent of `ENGINE_API_VERSION`.
 *
 * Bump this whenever the serialized payload field order, sizes, or
 * semantics change — even if the public TypeScript surface is unchanged.
 * A reader that sees a different value throws
 * {@link EngineFormatVersionMismatchError} instead of misparsing.
 *
 * History:
 *   - 1: issue #74 canonical ID table + placement-slot order + explicit
 *        format version.
 */
export const SERIALIZE_FORMAT_VERSION = 1;

/** Maximum value a single byte can hold. */
const MAX_U8 = 0xff;

/** Maximum value the two-byte city count can hold. */
const MAX_U16 = 0xffff;

/** Maximum value a little-endian uint32 field can hold. */
const MAX_U32 = 0xffffffff;

/** Maximum reserves percentage value stored ×10 (FR-012: 0–90%). */
const MAX_RESERVES_PCT = 9;

/** All four pipe-direction bits (N=0x01, E=0x02, S=0x04, W=0x08). */
const MAX_PIPE_MASK = 0x0f;

// ----------------------------------------------------------------------------
// Errors
// ----------------------------------------------------------------------------

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

/**
 * Typed error thrown when the payload-layout version does not match
 * {@link SERIALIZE_FORMAT_VERSION}. Distinct from the public-API
 * {@link EngineVersionMismatchError} so callers can tell "wrong engine
 * version" from "unknown binary layout".
 */
export class EngineFormatVersionMismatchError extends EngineFormatError {
    readonly expected: number;
    readonly actual: number;
    constructor(expected: number, actual: number) {
        super(`unsupported payload format version ${String(actual)} (expected ${String(expected)})`);
        this.name = 'EngineFormatVersionMismatchError';
        this.expected = expected;
        this.actual = actual;
    }
}

/**
 * Typed error thrown by `serializeWorld` when a `World` cannot be encoded
 * without losing information (unregistered ID, non-canonical player
 * order, non-ASCII display name, or an out-of-range numeric field).
 * Encoding never invents, coerces, or substitutes a value.
 */
export class EngineSerializationError extends Error {
    constructor(message: string) {
        super(`serializeWorld: ${message}`);
        this.name = 'EngineSerializationError';
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
 * @throws {EngineSerializationError} When the world cannot be encoded
 *         losslessly (unregistered identity, non-canonical player order,
 *         non-ASCII name, or an out-of-range numeric field).
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
 * Pure. Validates both the API-version header and the payload format
 * version; throws on any malformed, missing, extra, duplicate, numeric,
 * or inconsistently-referenced field.
 *
 * @throws {EngineVersionMismatchError} if the version header doesn't
 *         match `ENGINE_API_VERSION`.
 * @throws {EngineFormatVersionMismatchError} if the payload layout
 *         version doesn't match `SERIALIZE_FORMAT_VERSION`.
 * @throws {EngineFormatError} if the buffer is truncated, malformed, or
 *         carries an inconsistent ID table.
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
    const ascii = encodeAscii(version, 'ENGINE_API_VERSION');
    // 1-byte length prefix + ASCII bytes. Length is capped at 255
    // (one byte); current version `"0.2.0"` is 5 bytes.
    if (ascii.length > MAX_U8) {
        throw new EngineSerializationError(`ENGINE_API_VERSION too long (${String(ascii.length)} bytes)`);
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
    if (versionLen === 0) {
        throw new EngineFormatError('invalid version length 0');
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
// Encode
// ----------------------------------------------------------------------------

/**
 * Validate that `world.playerRegistry`, `world.config.playerIds`, and
 * `world.players` describe the same identity set consistently, and return
 * the placement-slot → table-index map plus the canonical table.
 *
 * @param world The world being encoded.
 * @returns `{ tableIds, slotOrder }`.
 * @throws {EngineSerializationError} On any inconsistency.
 */
function resolveIdentityLayout(world: Readonly<World>): { tableIds: readonly PlayerId[]; slotOrder: number[] } {
    const registry: PlayerRegistry = world.playerRegistry;
    const tableIds = registry.ids;
    const count = registry.count;

    if (tableIds.length !== count) {
        throw new EngineSerializationError(
            `player registry is internally inconsistent (ids=${String(tableIds.length)}, count=${String(count)})`,
        );
    }
    if (world.config.playerIds.length !== count) {
        throw new EngineSerializationError(
            `config.playerIds length (${String(world.config.playerIds.length)}) must equal player count (${String(count)})`,
        );
    }
    if (world.players.length !== count) {
        throw new EngineSerializationError(
            `players length (${String(world.players.length)}) must equal player count (${String(count)})`,
        );
    }

    // `config.playerIds` is in placement-slot order and must reference the
    // registry's canonical set. Its table-index mapping must be a
    // permutation (every identity appears exactly once).
    const slotOrder: number[] = [];
    for (let k = 0; k < world.config.playerIds.length; k++) {
        const id = world.config.playerIds[k];
        if (id === undefined) {
            throw new EngineSerializationError(`config.playerIds[${String(k)}] is missing`);
        }
        const index = registry.indexOfId(id);
        if (index === null) {
            throw new EngineSerializationError(
                `config.playerIds[${String(k)}] "${id}" is not registered (unknown or non-canonical identity)`,
            );
        }
        slotOrder.push(index);
    }
    const slotProblem = permutationProblem(slotOrder, count);
    if (slotProblem !== null) {
        throw new EngineSerializationError(`config.playerIds is not a permutation of the registry: ${slotProblem}`);
    }

    // `players` is public canonical order: player `i` owns table index `i`.
    for (let i = 0; i < world.players.length; i++) {
        const player = world.players[i];
        if (player === undefined) {
            throw new EngineSerializationError(`players[${String(i)}] is missing`);
        }
        const index = registry.indexOfId(player.id);
        if (index === null) {
            throw new EngineSerializationError(`players[${String(i)}].id "${player.id}" is not registered`);
        }
        if (index !== i) {
            throw new EngineSerializationError(
                `players[${String(i)}] is "${player.id}" at dense index ${String(index)}; players must be in canonical registry order`,
            );
        }
    }

    return { tableIds, slotOrder };
}

function encodePayload(world: Readonly<World>): Uint8Array {
    const { board } = world;
    const w = board.width;
    const n = w * w;

    if (!Number.isInteger(w) || w < MIN_BOARD_SIZE || w > MAX_U8) {
        throw new EngineSerializationError(
            `board.width must be an integer in [${String(MIN_BOARD_SIZE)}, ${String(MAX_U8)}] (got ${String(w)})`,
        );
    }
    if (!Number.isInteger(world.tick) || world.tick < 0) {
        throw new EngineSerializationError(`tick must be a non-negative integer (got ${String(world.tick)})`);
    }
    const tickIntervalMs = world.config.tickIntervalMs;
    if (!Number.isInteger(tickIntervalMs) || tickIntervalMs < 0 || tickIntervalMs > MAX_U32) {
        throw new EngineSerializationError(`config.tickIntervalMs must be a uint32 (got ${String(tickIntervalMs)})`);
    }
    // The format stores a single 32-bit seed field. `createWorld` derives
    // `rngSeed` from `config.seed`, and decode restores BOTH from that one
    // field, so an encode-time divergence would silently rewrite one of
    // them. Reject it loudly instead (S4).
    const normalizedSeed = world.config.seed >>> 0;
    const normalizedRngSeed = world.rngSeed >>> 0;
    if (normalizedSeed !== normalizedRngSeed) {
        throw new EngineSerializationError(
            `config.seed (${String(world.config.seed)}) and rngSeed (${String(world.rngSeed)}) must agree: the payload stores one seed and decode restores both from it`,
        );
    }
    const visibilityRadius = world.config.visibilityRadius;
    if (!Number.isInteger(visibilityRadius) || visibilityRadius < 0 || visibilityRadius > MAX_U8) {
        throw new EngineSerializationError(
            `config.visibilityRadius must be an integer in [0, ${String(MAX_U8)}] (got ${String(visibilityRadius)})`,
        );
    }
    if (board.cities.length > MAX_U16) {
        throw new EngineSerializationError(
            `board.cities length ${String(board.cities.length)} exceeds the ${String(MAX_U16)}-entry city count field`,
        );
    }
    if (world.state.troopCounts.length !== n || world.state.troopOwners.length !== n) {
        throw new EngineSerializationError(`state arrays must hold exactly ${String(n)} entries`);
    }

    const { tableIds, slotOrder } = resolveIdentityLayout(world);
    const playerCount = tableIds.length;

    // Canonical ID table is the registry's order; verify it is strict
    // ascending so encode can never emit a non-canonical table.
    for (let i = 1; i < tableIds.length; i++) {
        const prev = tableIds[i - 1];
        const cur = tableIds[i];
        if (prev === undefined || cur === undefined || compareUtf16(prev, cur) >= 0) {
            throw new EngineSerializationError('player registry ids are not in strict canonical UTF-16 order');
        }
    }

    const idBytes: Uint8Array[] = [];
    let idTableLen = 0;
    for (const id of tableIds) {
        const bytes = encodeAscii(id, `player id ${id}`);
        if (bytes.length !== PLAYER_ID_LENGTH) {
            throw new EngineSerializationError(`player id "${id}" must be ${String(PLAYER_ID_LENGTH)} bytes`);
        }
        idBytes.push(bytes);
        idTableLen += 1 + bytes.length;
    }

    // Players: table index, status, citiesOwned, troopsHeld(4), name.
    const nameBytesList: Uint8Array[] = [];
    let playersLen = 0;
    for (let i = 0; i < world.players.length; i++) {
        const player = world.players[i];
        if (player === undefined) {
            throw new EngineSerializationError(`players[${String(i)}] is missing`);
        }
        // N2: the one-byte `citiesOwned` and uint32 `troopsHeld` fields
        // are narrowed on write; validate the range explicitly so encode
        // fails loudly instead of silently truncating a value that decode
        // could never restore (losslessness guarantee).
        if (!Number.isInteger(player.citiesOwned) || player.citiesOwned < 0 || player.citiesOwned > MAX_U8) {
            throw new EngineSerializationError(
                `players[${String(i)}].citiesOwned must be an integer in [0, ${String(MAX_U8)}] (got ${String(player.citiesOwned)})`,
            );
        }
        if (!Number.isInteger(player.troopsHeld) || player.troopsHeld < 0 || player.troopsHeld > MAX_U32) {
            throw new EngineSerializationError(
                `players[${String(i)}].troopsHeld must be a uint32 (got ${String(player.troopsHeld)})`,
            );
        }
        const nameBytes = encodeAscii(player.displayName, `players[${String(i)}].displayName`);
        if (nameBytes.length > MAX_U8) {
            throw new EngineSerializationError(`players[${String(i)}].displayName exceeds ${String(MAX_U8)} bytes`);
        }
        nameBytesList.push(nameBytes);
        playersLen += 1 + 1 + 1 + 4 + 1 + nameBytes.length;
    }

    // Cities: owner is a 1-based terrain placement slot, never an ID.
    for (let i = 0; i < board.cities.length; i++) {
        const city = board.cities[i];
        if (city === undefined) {
            throw new EngineSerializationError(`board.cities[${String(i)}] is missing`);
        }
        if (!Number.isInteger(city.cell.x) || city.cell.x < 0 || city.cell.x >= w) {
            throw new EngineSerializationError(`board.cities[${String(i)}].x out of bounds`);
        }
        if (!Number.isInteger(city.cell.y) || city.cell.y < 0 || city.cell.y >= w) {
            throw new EngineSerializationError(`board.cities[${String(i)}].y out of bounds`);
        }
        if (!Number.isInteger(city.owner) || city.owner < 1 || city.owner > playerCount) {
            throw new EngineSerializationError(
                `board.cities[${String(i)}].owner must be a 1-based placement slot in 1..${String(playerCount)}`,
            );
        }
    }

    // Cell owner bytes are 1-based dense indexes; reserve/pipe fields have
    // fixed legal ranges (FR-012, pipe bits).
    validateCellFields(world, n, playerCount);

    const fixedLen = 1 + 1 + 1 + 4 + 4 + 4 + 1 + 16 + 1;
    const citiesBlockLen = 2 + board.cities.length * (2 + 1);
    const cellsBlockLen = n * 8;
    const total = fixedLen + idTableLen + slotOrder.length + playersLen + citiesBlockLen + cellsBlockLen;

    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    let p = 0;

    // Fixed header.
    out[p++] = SERIALIZE_FORMAT_VERSION;
    out[p++] = w & 0xff;
    out[p++] = playerCount & 0xff;
    dv.setUint32(p, world.tick >>> 0, true);
    p += 4;
    dv.setUint32(p, normalizedRngSeed, true);
    p += 4;
    dv.setUint32(p, tickIntervalMs >>> 0, true);
    p += 4;
    out[p++] = visibilityRadius & 0xff;
    for (let i = 0; i < 4; i++) {
        dv.setUint32(p, world.rngState[i] ?? 0, true);
        p += 4;
    }

    // Canonical ID table.
    out[p++] = playerCount & 0xff;
    for (const bytes of idBytes) {
        out[p++] = bytes.length & 0xff;
        out.set(bytes, p);
        p += bytes.length;
    }

    // Placement-slot → table-index map.
    for (const index of slotOrder) {
        out[p++] = index & 0xff;
    }

    // Players (canonical registry order; record `i` owns table index `i`).
    for (let i = 0; i < world.players.length; i++) {
        const player = world.players[i];
        if (player === undefined) {
            throw new EngineSerializationError(`players[${String(i)}] is missing`);
        }
        out[p++] = i & 0xff;
        out[p++] = encodePlayerStatus(player.status);
        out[p++] = player.citiesOwned & 0xff;
        dv.setUint32(p, player.troopsHeld >>> 0, true);
        p += 4;
        const nameBytes = nameBytesList[i];
        if (nameBytes === undefined) {
            throw new EngineSerializationError(`players[${String(i)}].displayName was not prepared`);
        }
        out[p++] = nameBytes.length & 0xff;
        out.set(nameBytes, p);
        p += nameBytes.length;
    }

    // Cities.
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

    if (p !== total) {
        throw new EngineSerializationError(`internal size mismatch (wrote ${String(p)} of ${String(total)} bytes)`);
    }
    return out;
}

/**
 * Reject out-of-range cell owner/reserve/pipe values at encode time so a
 * lossless round-trip is impossible to violate silently.
 *
 * @param world The world being encoded.
 * @param n Cell count (`boardSize²`).
 * @param playerCount Number of registered players.
 * @throws {EngineSerializationError} On any out-of-range cell field.
 */
function validateCellFields(world: Readonly<World>, n: number, playerCount: number): void {
    const { troopOwners, pipeMasks, reservesPct, cityOwners } = world.state;
    if (cityOwners.length !== n || pipeMasks.length !== n || reservesPct.length !== n) {
        throw new EngineSerializationError(`state arrays must hold exactly ${String(n)} entries`);
    }
    for (let i = 0; i < n; i++) {
        const troopOwner = troopOwners[i] ?? 0;
        if (troopOwner > playerCount) {
            throw new EngineSerializationError(
                `state.troopOwners[${String(i)}] = ${String(troopOwner)} exceeds player count ${String(playerCount)}`,
            );
        }
        const cityOwner = cityOwners[i] ?? 0;
        if (cityOwner > playerCount) {
            throw new EngineSerializationError(
                `state.cityOwners[${String(i)}] = ${String(cityOwner)} exceeds player count ${String(playerCount)}`,
            );
        }
        if ((pipeMasks[i] ?? 0) > MAX_PIPE_MASK) {
            throw new EngineSerializationError(`state.pipeMasks[${String(i)}] has bits above 0x0f`);
        }
        if ((reservesPct[i] ?? 0) > MAX_RESERVES_PCT) {
            throw new EngineSerializationError(
                `state.reservesPct[${String(i)}] = ${String(reservesPct[i] ?? 0)} exceeds 9`,
            );
        }
    }
}

// ----------------------------------------------------------------------------
// Decode
// ----------------------------------------------------------------------------

/**
 * Bounds-checked little-endian reader over the serialized payload. Every
 * access throws {@link EngineFormatError} rather than substituting a
 * default, so a truncated buffer can never decode into a partial world.
 */
class PayloadReader {
    private offset: number;
    private readonly bytes: Uint8Array;

    constructor(bytes: Uint8Array, start: number) {
        this.bytes = bytes;
        this.offset = start;
    }

    /** Current absolute read position. */
    get position(): number {
        return this.offset;
    }

    /** Bytes remaining between the cursor and the end of the buffer. */
    get remaining(): number {
        return this.bytes.length - this.offset;
    }

    /** Read one unsigned byte. */
    u8(label: string): number {
        this.require(1, label);
        const value = this.bytes[this.offset];
        this.offset += 1;
        if (value === undefined) {
            throw new EngineFormatError(`${label} truncated`);
        }
        return value;
    }

    /** Read a little-endian uint16. */
    u16(label: string): number {
        this.require(2, label);
        const lo = this.bytes[this.offset] ?? 0;
        const hi = this.bytes[this.offset + 1] ?? 0;
        this.offset += 2;
        return lo | (hi << 8);
    }

    /** Read a little-endian uint32. */
    u32(label: string): number {
        this.require(4, label);
        let value = 0;
        for (let i = 3; i >= 0; i--) {
            value = (value << 8) | (this.bytes[this.offset + i] ?? 0);
        }
        this.offset += 4;
        return value >>> 0;
    }

    /** Read `length` raw bytes as a view (zero-copy). */
    view(length: number, label: string): Uint8Array {
        this.require(length, label);
        const slice = this.bytes.subarray(this.offset, this.offset + length);
        this.offset += length;
        return slice;
    }

    private require(length: number, label: string): void {
        if (this.offset + length > this.bytes.length) {
            throw new EngineFormatError(
                `${label} truncated (need ${String(length)} byte(s), have ${String(this.bytes.length - this.offset)})`,
            );
        }
    }
}

function decodePayload(bytes: Uint8Array, versionLen: number): World {
    const reader = new PayloadReader(bytes, versionLen);

    const formatVersion = reader.u8('payload format version');
    if (formatVersion !== SERIALIZE_FORMAT_VERSION) {
        throw new EngineFormatVersionMismatchError(SERIALIZE_FORMAT_VERSION, formatVersion);
    }

    const boardSize = reader.u8('board size');
    if (boardSize < MIN_BOARD_SIZE) {
        throw new EngineFormatError(`board size ${String(boardSize)} is below the minimum ${String(MIN_BOARD_SIZE)}`);
    }
    const playerCount = reader.u8('player count');
    if (playerCount < MIN_PLAYERS_PER_MATCH || playerCount > MAX_PLAYERS_PER_MATCH) {
        throw new EngineFormatError(
            `player count ${String(playerCount)} is outside [${String(MIN_PLAYERS_PER_MATCH)}, ${String(MAX_PLAYERS_PER_MATCH)}]`,
        );
    }
    const tick = reader.u32('tick');
    const seed = reader.u32('seed');
    const tickIntervalMs = reader.u32('tickIntervalMs');
    const visibilityRadius = reader.u8('visibilityRadius');
    const rngState = new Uint32Array(4);
    for (let i = 0; i < 4; i++) {
        rngState[i] = reader.u32(`rngState[${String(i)}]`);
    }

    // Canonical ID table. The count is redundant with the header player
    // count; a mismatch means the buffer is inconsistent.
    const tableCount = reader.u8('player id table count');
    if (tableCount !== playerCount) {
        throw new EngineFormatError(
            `player id table count ${String(tableCount)} does not match player count ${String(playerCount)}`,
        );
    }
    const tableIds: PlayerId[] = [];
    for (let i = 0; i < tableCount; i++) {
        const idLen = reader.u8(`player id table entry ${String(i)} length`);
        if (idLen !== PLAYER_ID_LENGTH) {
            throw new EngineFormatError(
                `player id table entry ${String(i)} length ${String(idLen)} must be ${String(PLAYER_ID_LENGTH)}`,
            );
        }
        const raw = reader.view(idLen, `player id table entry ${String(i)}`);
        const decoded = decodeAscii(raw);
        let id: PlayerId;
        try {
            id = parsePlayerId(decoded);
        } catch (cause) {
            throw new EngineFormatError(
                `player id table entry ${String(i)} is not a canonical player id: ${String(cause)}`,
            );
        }
        // Strict canonical order: rejects duplicates and permutations in
        // one check. Encoders always emit `PlayerRegistry.ids` order.
        const prev = tableIds[i - 1];
        if (prev !== undefined && compareUtf16(prev, id) >= 0) {
            throw new EngineFormatError(
                `player id table is not in strict canonical order at entry ${String(i)} (duplicate or permuted entry)`,
            );
        }
        tableIds.push(id);
    }

    let playerRegistry: PlayerRegistry;
    try {
        playerRegistry = createPlayerRegistry(tableIds);
    } catch (cause) {
        throw new EngineFormatError(`player id table is invalid: ${String(cause)}`);
    }
    if (playerRegistry.count !== playerCount) {
        throw new EngineFormatError('player id table does not match the declared player count');
    }

    // Placement-slot → table-index map. Must be a permutation so that the
    // reconstructed `config.playerIds` is exactly the original explicit
    // list (in slot order) and every table entry is referenced.
    const slotOrder: number[] = [];
    for (let k = 0; k < playerCount; k++) {
        slotOrder.push(reader.u8(`slot order[${String(k)}]`));
    }
    // Resolve each slot to its table entry first. This range guard is
    // what rejects an out-of-range slot index; duplicates and any other
    // non-permutation are then rejected by `permutationProblem` below.
    const playerIds: PlayerId[] = [];
    for (const index of slotOrder) {
        const id = tableIds[index];
        if (id === undefined) {
            throw new EngineFormatError(`slot order references missing table index ${String(index)}`);
        }
        playerIds.push(id);
    }
    const slotProblem = permutationProblem(slotOrder, playerCount);
    if (slotProblem !== null) {
        throw new EngineFormatError(`slot order is not a permutation: ${slotProblem}`);
    }

    // Player records. Record `i` must reference table index `i` (players
    // are in canonical registry order), which also proves every table
    // entry is referenced exactly once.
    const players: Player[] = [];
    for (let i = 0; i < playerCount; i++) {
        const tableIndex = reader.u8(`player ${String(i)} table index`);
        // Resolve first: an out-of-range table index is rejected by the
        // registry lookup, then a valid-but-misordered index is rejected
        // by the canonical-order check.
        const id = playerRegistry.idAt(tableIndex);
        if (id === null) {
            throw new EngineFormatError(`player ${String(i)} table index ${String(tableIndex)} is out of range`);
        }
        if (tableIndex !== i) {
            throw new EngineFormatError(
                `player ${String(i)} references table index ${String(tableIndex)}; records must be in canonical registry order`,
            );
        }
        const status = decodePlayerStatus(reader.u8(`player ${String(i)} status`));
        const citiesOwned = reader.u8(`player ${String(i)} citiesOwned`);
        const troopsHeld = reader.u32(`player ${String(i)} troopsHeld`);
        const nameLen = reader.u8(`player ${String(i)} displayName length`);
        const displayName = decodeAsciiStrict(
            reader.view(nameLen, `player ${String(i)} displayName`),
            `player ${String(i)} displayName`,
        );
        players.push({ id, displayName, status, citiesOwned, troopsHeld });
    }

    // Cities. `owner` is a 1-based terrain placement slot, not an ID.
    const cityCount = reader.u16('city count');
    const cities: CityPlacement[] = [];
    const seenCityCells = new Set<number>();
    for (let i = 0; i < cityCount; i++) {
        const x = reader.u8(`city ${String(i)} x`);
        const y = reader.u8(`city ${String(i)} y`);
        const owner = reader.u8(`city ${String(i)} owner`);
        if (x >= boardSize || y >= boardSize) {
            throw new EngineFormatError(
                `city ${String(i)} at [${String(x)}, ${String(y)}] is out of bounds for board size ${String(boardSize)}`,
            );
        }
        if (owner < 1 || owner > playerCount) {
            throw new EngineFormatError(
                `city ${String(i)} owner ${String(owner)} is outside the 1-based placement-slot range [1, ${String(playerCount)}]`,
            );
        }
        const key = y * boardSize + x;
        if (seenCityCells.has(key)) {
            throw new EngineFormatError(`duplicate city at [${String(x)}, ${String(y)}] (cell index ${String(key)})`);
        }
        seenCityCells.add(key);
        cities.push({ cell: { x, y }, owner });
    }

    // Cells.
    const n = boardSize * boardSize;
    const troopCounts = new Uint32Array(n);
    const troopOwners = new Uint8Array(n);
    const pipeMasks = new Uint8Array(n);
    const reservesPct = new Uint8Array(n);
    const cityOwners = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        troopCounts[i] = reader.u32(`cell ${String(i)} troopCount`);
        const troopOwner = reader.u8(`cell ${String(i)} troopOwner`);
        if (troopOwner > playerCount) {
            throw new EngineFormatError(
                `cell ${String(i)} troopOwner ${String(troopOwner)} exceeds player count ${String(playerCount)}`,
            );
        }
        troopOwners[i] = troopOwner;
        const pipeMask = reader.u8(`cell ${String(i)} pipeMask`);
        if (pipeMask > MAX_PIPE_MASK) {
            throw new EngineFormatError(`cell ${String(i)} pipeMask ${String(pipeMask)} has bits above 0x0f`);
        }
        pipeMasks[i] = pipeMask;
        const reserves = reader.u8(`cell ${String(i)} reservesPct`);
        if (reserves > MAX_RESERVES_PCT) {
            throw new EngineFormatError(`cell ${String(i)} reservesPct ${String(reserves)} exceeds 9`);
        }
        reservesPct[i] = reserves;
        const cityOwner = reader.u8(`cell ${String(i)} cityOwner`);
        if (cityOwner > playerCount) {
            throw new EngineFormatError(
                `cell ${String(i)} cityOwner ${String(cityOwner)} exceeds player count ${String(playerCount)}`,
            );
        }
        cityOwners[i] = cityOwner;
    }

    if (reader.remaining !== 0) {
        throw new EngineFormatError(`trailing bytes after payload (${String(reader.remaining)} extra)`);
    }

    // Board cells: the serialized form carries only city placements, not
    // the full terrain. Reconstruct a minimal all-land placeholder; a
    // rehydrated world preserves runtime state but not terrain. Board
    // re-fetch for networking is feature 003's responsibility.
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
            playerIds,
            tickIntervalMs,
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

/**
 * Return a human-readable reason when `values` is not a permutation of
 * `0..count-1`, or `null` when it is. Shared by encode and decode so both
 * sides agree on exactly what a valid table/slot map is.
 *
 * Exported only so the unit suite can exercise every rejection branch
 * (wrong length, non-integer, out-of-range, duplicate) directly; it is
 * **not** part of the engine's public surface and is deliberately absent
 * from `src/index.ts`.
 *
 * @internal
 * @param values Candidate index list.
 * @param count Expected length and exclusive upper bound.
 * @returns A failure description, or `null`.
 */
export function permutationProblem(values: readonly number[], count: number): string | null {
    if (values.length !== count) {
        return `expected ${String(count)} entries, got ${String(values.length)}`;
    }
    const seen = new Uint8Array(count);
    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (value === undefined || !Number.isInteger(value) || value < 0 || value >= count) {
            return `entry ${String(i)} is not a table index in [0, ${String(count)})`;
        }
        if (seen[value] === 1) {
            return `duplicate table index ${String(value)}`;
        }
        seen[value] = 1;
    }
    return null;
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
// Encoder and strict decoder REJECT non-ASCII rather than substituting
// `?` — a lossy round-trip would be a silent identity/config corruption.

/**
 * Encode a string as ASCII bytes.
 *
 * @param value The string to encode.
 * @param label Field name for the error message.
 * @returns ASCII bytes.
 * @throws {EngineSerializationError} When `value` contains a non-ASCII
 *         character (code unit > 0x7f).
 */
function encodeAscii(value: string, label: string): Uint8Array {
    const out = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if (code > 0x7f) {
            throw new EngineSerializationError(`${label} contains a non-ASCII character at index ${String(i)}`);
        }
        out[i] = code;
    }
    return out;
}

/**
 * Decode ASCII bytes to a string without validating the high bit. Used
 * only for the version header, where a non-ASCII value simply fails the
 * version comparison.
 *
 * @param bytes The bytes to decode.
 * @returns The decoded string.
 */
function decodeAscii(bytes: Uint8Array): string {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        out += String.fromCharCode(bytes[i] ?? 0);
    }
    return out;
}

/**
 * Decode ASCII bytes to a string, rejecting any high-bit byte.
 *
 * @param bytes The bytes to decode.
 * @param label Field name for the error message.
 * @returns The decoded string.
 * @throws {EngineFormatError} When any byte is > 0x7f.
 */
function decodeAsciiStrict(bytes: Uint8Array, label: string): string {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        const code = bytes[i] ?? 0;
        if (code > 0x7f) {
            throw new EngineFormatError(`${label} contains a non-ASCII byte at index ${String(i)}`);
        }
        out += String.fromCharCode(code);
    }
    return out;
}
