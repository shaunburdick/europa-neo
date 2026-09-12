/**
 * Fixture Validator — Feature 022 (Developer Debugging Tools) + issue #74
 *
 * Type-narrowing validator for match fixtures. Checks all required
 * fields exist with correct types, providing descriptive error messages
 * for each violation. Returns a typed `Fixture` on success or throws
 * with a clear error message on failure.
 *
 * The validator is intentionally lenient on extra fields (FR-013:
 * "valid JSON that can be parsed by JSON.parse without a schema
 * validator") — it only checks the required fields, not the absence
 * of unexpected ones.
 *
 * **Identity strictness (issue #74, FR-020..FR-022)**: `settings.playerIds`
 * must be 2–4 canonical, unique 12-character IDs; `playerCount` must
 * equal their length; every recorded order's `playerId` (and its inner
 * `order.player`) must be a registered fixture identity. A numeric,
 * malformed, duplicate, missing, extra, or unknown-player value fails
 * closed. The validator never synthesizes or rewrites an ID.
 *
 * Implementation note on TypeScript vs Biome:
 * The project enforces both `noPropertyAccessFromIndexSignature`
 * (TypeScript) and `useLiteralKeys` (Biome). These rules conflict
 * when accessing properties on `Record<string, unknown>`. The package
 * biome config disables `useLiteralKeys` for this file so bracket
 * notation can be used consistently (required by TypeScript).
 */

import { isPlayerId } from '@europa/core';
import { MAX_PLAYERS_PER_MATCH, MIN_PLAYERS_PER_MATCH } from '../playerRegistry';
import type { MatchResult, Order, PlayerId } from '../types';
import type { Fixture, GenerationSettings, OrderRecord, PlayerCount } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Every engine order kind (issue #74: unknown kinds fail closed). */
const ORDER_KINDS: ReadonlySet<string> = new Set([
    'setPipe',
    'clearPipe',
    'setPipesExclusive',
    'clearAllPipes',
    'setReserves',
    'paratroop',
    'gun',
    'surrender',
]);

/** Every legal pipe direction. */
const DIRECTIONS: ReadonlySet<string> = new Set(['N', 'E', 'S', 'W']);

/** Maximum uint32 seed value. */
const UINT32_MAX = 0xffffffff;

// ---------------------------------------------------------------------------
// Internal validation helpers
// ---------------------------------------------------------------------------

/**
 * True when `value` is a non-null, non-array object — a safe
 * `Record<string, unknown>` to read fields from.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Assert that a field on a record exists and has the expected type.
 * Uses bracket notation for the dynamic key (required by TypeScript's
 * noPropertyAccessFromIndexSignature on Record<string, unknown>).
 *
 * @param record The object to check.
 * @param key The field name (dynamic — bracket notation required).
 * @param expectedType The expected `typeof` result, or 'array' for Array.isArray.
 * @param label A prefix for the error message.
 */
function assertField(record: Record<string, unknown>, key: string, expectedType: string, label: string): void {
    const value = record[key];
    if (value === undefined || value === null) {
        throw new Error(`Invalid ${label}: missing '${key}'`);
    }
    if (expectedType === 'array') {
        if (!Array.isArray(value)) {
            throw new Error(`Invalid ${label}: '${key}' must be an array, got ${typeof value}`);
        }
    } else if (expectedType === 'object') {
        if (typeof value !== 'object' || Array.isArray(value)) {
            const got = Array.isArray(value) ? 'array' : typeof value;
            throw new Error(`Invalid ${label}: '${key}' must be ${expectedType}, got ${got}`);
        }
    } else if (typeof value !== expectedType) {
        throw new Error(`Invalid ${label}: '${key}' must be ${expectedType}, got ${typeof value}`);
    }
}

/**
 * Assert that a field is an integer within `[min, max]`.
 *
 * @param record The object to check.
 * @param key The field name (bracket notation).
 * @param label A prefix for the error message.
 * @param min Inclusive lower bound.
 * @param max Inclusive upper bound.
 */
function assertIntegerField(
    record: Record<string, unknown>,
    key: string,
    label: string,
    min: number,
    max: number,
): void {
    const value = record[key];
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new Error(`Invalid ${label}: '${key}' must be an integer`);
    }
    if (value < min || value > max) {
        throw new Error(`Invalid ${label}: '${key}' must be in [${String(min)}, ${String(max)}], got ${String(value)}`);
    }
}

/**
 * Validate the explicit `settings.playerIds` list: 2–4 canonical,
 * unique identities. Returns a frozen typed list.
 *
 * @param settings The settings record to check.
 * @returns The validated IDs in their original (placement-slot) order.
 * @throws {Error} When the list is missing, wrong length, non-canonical,
 *         numeric, or duplicated.
 */
function validatePlayerIds(settings: Record<string, unknown>): readonly PlayerId[] {
    assertField(settings, 'playerIds', 'array', 'fixture.settings');
    const raw = settings['playerIds'];
    if (!Array.isArray(raw)) {
        // Unreachable after assertField; keeps TypeScript narrowing honest.
        throw new Error("Invalid fixture.settings: 'playerIds' must be an array");
    }
    if (raw.length < MIN_PLAYERS_PER_MATCH || raw.length > MAX_PLAYERS_PER_MATCH) {
        throw new Error(
            `Invalid fixture.settings: 'playerIds' must contain ${String(MIN_PLAYERS_PER_MATCH)}–${String(MAX_PLAYERS_PER_MATCH)} ids, got ${String(raw.length)}`,
        );
    }
    const ids: PlayerId[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < raw.length; i++) {
        const candidate = raw[i];
        if (!isPlayerId(candidate)) {
            throw new Error(
                `Invalid fixture.settings: 'playerIds[${String(i)}]' must be a canonical 12-character player id (numbers and malformed values are rejected)`,
            );
        }
        if (seen.has(candidate)) {
            throw new Error(`Invalid fixture.settings: 'playerIds[${String(i)}]' duplicates "${candidate}"`);
        }
        seen.add(candidate);
        ids.push(candidate);
    }
    return Object.freeze(ids);
}

/**
 * Validate a coordinate object (`{ x, y }` with integer components).
 *
 * @param value The candidate value.
 * @param label A prefix for the error message.
 */
function validateCoord(value: unknown, label: string): void {
    if (!isPlainObject(value)) {
        throw new Error(`Invalid ${label}: expected an object with integer 'x' and 'y'`);
    }
    const x = value['x'];
    const y = value['y'];
    if (typeof x !== 'number' || !Number.isInteger(x)) {
        throw new Error(`Invalid ${label}: 'x' must be an integer`);
    }
    if (typeof y !== 'number' || !Number.isInteger(y)) {
        throw new Error(`Invalid ${label}: 'y' must be an integer`);
    }
}

/**
 * Structurally validate one engine order and confirm its player is a
 * registered fixture identity.
 *
 * @param value The candidate order object.
 * @param registered The set of registered fixture player IDs.
 * @param index The order's index (for diagnostics).
 * @returns The order, narrowed to `Order` after structural checks (the
 *          engine re-validates it authoritatively on apply).
 * @throws {Error} On any malformed, unknown-kind, or unknown-player order.
 */
function validateOrder(value: unknown, registered: ReadonlySet<string>, index: number): Order {
    const label = `fixture.orders[${String(index)}].order`;
    if (!isPlainObject(value)) {
        throw new Error(`Invalid ${label}: 'order' must be an object`);
    }
    const kind = value['kind'];
    if (typeof kind !== 'string' || !ORDER_KINDS.has(kind)) {
        throw new Error(`Invalid ${label}: 'kind' must be a known order kind`);
    }
    const player = value['player'];
    if (!isPlayerId(player)) {
        throw new Error(`Invalid ${label}: 'player' must be a canonical player id`);
    }
    if (!registered.has(player)) {
        throw new Error(`Invalid ${label}: 'player' references an unknown player id`);
    }

    switch (kind) {
        case 'setPipe':
        case 'clearPipe':
        case 'setPipesExclusive': {
            validateCoord(value['cell'], `${label}.cell`);
            const direction = value['direction'];
            if (typeof direction !== 'string' || !DIRECTIONS.has(direction)) {
                throw new Error(`Invalid ${label}: 'direction' must be one of N, E, S, W`);
            }
            break;
        }
        case 'clearAllPipes': {
            validateCoord(value['cell'], `${label}.cell`);
            break;
        }
        case 'setReserves': {
            validateCoord(value['cell'], `${label}.cell`);
            const percent = value['percent'];
            if (typeof percent !== 'number' || !Number.isInteger(percent) || percent < 0 || percent > 9) {
                throw new Error(`Invalid ${label}: 'percent' must be an integer in [0, 9]`);
            }
            break;
        }
        case 'paratroop':
        case 'gun': {
            validateCoord(value['source'], `${label}.source`);
            validateCoord(value['target'], `${label}.target`);
            break;
        }
        case 'surrender':
            break;
        default:
            break;
    }

    return value as unknown as Order;
}

/**
 * Validate the `orders` array: each entry has an integer tick, a
 * canonical registered `playerId` matching the inner order's player, and
 * a structurally valid order.
 *
 * @param orders The orders array to validate.
 * @param registered The set of registered fixture player IDs.
 * @returns The validated, typed order records.
 * @throws {Error} if any order is malformed.
 */
function validateOrders(orders: unknown[], registered: ReadonlySet<string>): OrderRecord[] {
    const result: OrderRecord[] = [];
    for (let i = 0; i < orders.length; i++) {
        const entry = orders[i];
        if (!isPlainObject(entry)) {
            throw new Error(`Invalid fixture: order at index ${String(i)}: expected object, got ${typeof entry}`);
        }
        const tick = entry['tick'];
        if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
            throw new Error(`Invalid fixture: order at index ${String(i)}: 'tick' must be a non-negative integer`);
        }
        const playerId = entry['playerId'];
        if (!isPlayerId(playerId)) {
            throw new Error(
                `Invalid fixture: order at index ${String(i)}: 'playerId' must be a canonical 12-character player id (numbers are rejected)`,
            );
        }
        if (!registered.has(playerId)) {
            throw new Error(`Invalid fixture: order at index ${String(i)}: 'playerId' references an unknown player id`);
        }
        const order = validateOrder(entry['order'], registered, i);
        if (order.player !== playerId) {
            throw new Error(
                `Invalid fixture: order at index ${String(i)}: 'playerId' does not match the order's 'player'`,
            );
        }
        result.push({ tick, playerId, order });
    }
    return result;
}

/**
 * Validate the optional `terminalResult`: `null`, a win with a
 * registered winner, or a draw.
 *
 * @param value The candidate terminal result.
 * @param registered The set of registered fixture player IDs.
 * @returns The validated `MatchResult`, or `null`.
 * @throws {Error} On a malformed or unknown-player result.
 */
function validateTerminalResult(value: unknown, registered: ReadonlySet<string>): MatchResult | null {
    if (value === null || value === undefined) {
        return null;
    }
    if (!isPlainObject(value)) {
        throw new Error("Invalid fixture: 'terminalResult' must be an object or null");
    }
    const kind = value['kind'];
    const tick = value['tick'];
    if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
        throw new Error("Invalid fixture: 'terminalResult.tick' must be a non-negative integer");
    }
    if (kind === 'win') {
        const winner = value['winner'];
        if (!isPlayerId(winner) || !registered.has(winner)) {
            throw new Error("Invalid fixture: 'terminalResult.winner' must be a registered player id");
        }
        const reason = value['reason'];
        if (reason !== 'last_standing' && reason !== 'all_surrendered') {
            throw new Error("Invalid fixture: 'terminalResult.reason' must be 'last_standing' or 'all_surrendered'");
        }
        return { kind: 'win', winner, tick, reason };
    }
    if (kind === 'draw') {
        if (value['reason'] !== 'mutual_elimination') {
            throw new Error("Invalid fixture: 'terminalResult.reason' must be 'mutual_elimination' for a draw");
        }
        return { kind: 'draw', tick, reason: 'mutual_elimination' };
    }
    throw new Error("Invalid fixture: 'terminalResult.kind' must be 'win' or 'draw'");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate an unknown value as a match fixture. Type-narrowing guard
 * that checks all required fields with correct types and enforces
 * explicit canonical identities.
 *
 * @param data The unknown value to validate (typically from JSON.parse).
 * @returns A typed `Fixture` if validation succeeds.
 * @throws {Error} with a descriptive message listing all violations.
 *
 * @example
 * ```ts
 * const raw = JSON.parse(fixtureJson);
 * const fixture = validateFixture(raw);
 * // fixture is now typed as Fixture
 * ```
 */
export function validateFixture(data: unknown): Fixture {
    if (!isPlainObject(data)) {
        throw new Error('Invalid fixture: expected an object');
    }

    const obj = data;

    // Top-level scalar fields.
    assertField(obj, 'version', 'number', 'fixture');
    assertField(obj, 'seed', 'number', 'fixture');
    assertField(obj, 'engineVersion', 'string', 'fixture');
    assertField(obj, 'finalStateHash', 'string', 'fixture');
    assertField(obj, 'terminalTick', 'number', 'fixture');
    assertIntegerField(obj, 'seed', 'fixture', 0, UINT32_MAX);
    const rawTerminalTick = obj['terminalTick'];
    if (typeof rawTerminalTick !== 'number' || !Number.isInteger(rawTerminalTick) || rawTerminalTick < 0) {
        throw new Error("Invalid fixture: 'terminalTick' must be a non-negative integer");
    }

    // Settings sub-object — must be a non-null, non-array object.
    if (obj['settings'] === undefined || obj['settings'] === null) {
        throw new Error("Invalid fixture: missing 'settings'");
    }
    if (!isPlainObject(obj['settings'])) {
        throw new Error("Invalid fixture: 'settings' must be object");
    }
    const settings = obj['settings'];
    const playerIds = validatePlayerIds(settings);
    const registered = new Set<string>(playerIds);
    assertField(settings, 'boardSize', 'number', 'fixture.settings');
    assertIntegerField(settings, 'boardSize', 'fixture.settings', 8, 0xff);
    assertIntegerField(settings, 'tickIntervalMs', 'fixture.settings', 0, UINT32_MAX);
    assertIntegerField(settings, 'seed', 'fixture.settings', 0, UINT32_MAX);
    assertIntegerField(settings, 'visibilityRadius', 'fixture.settings', 0, 0xff);

    // Player count must be present, within bounds, and agree with the
    // explicit ID list (issue #74 — no redundant divergent count).
    assertField(obj, 'playerCount', 'number', 'fixture');
    const rawPlayerCount = obj['playerCount'];
    if (typeof rawPlayerCount !== 'number' || !Number.isInteger(rawPlayerCount)) {
        throw new Error("Invalid fixture: 'playerCount' must be an integer");
    }
    if (rawPlayerCount !== playerIds.length) {
        throw new Error(
            `Invalid fixture: 'playerCount' (${String(rawPlayerCount)}) must equal settings.playerIds.length (${String(playerIds.length)})`,
        );
    }
    const playerCount = rawPlayerCount as PlayerCount;

    // TerrainSettings sub-object.
    if (obj['terrainSettings'] === undefined || obj['terrainSettings'] === null) {
        throw new Error("Invalid fixture: missing 'terrainSettings'");
    }
    if (!isPlainObject(obj['terrainSettings'])) {
        throw new Error("Invalid fixture: 'terrainSettings' must be object");
    }
    const terrainSettings = obj['terrainSettings'];
    assertField(terrainSettings, 'waterRatio', 'number', 'fixture.terrainSettings');
    assertField(terrainSettings, 'roughness', 'number', 'fixture.terrainSettings');
    assertField(terrainSettings, 'octaves', 'number', 'fixture.terrainSettings');
    assertField(terrainSettings, 'citiesPerPlayer', 'number', 'fixture.terrainSettings');
    assertField(terrainSettings, 'symmetryStrategy', 'string', 'fixture.terrainSettings');
    if (terrainSettings['symmetryStrategy'] !== 'point') {
        throw new Error("Invalid fixture.terrainSettings: 'symmetryStrategy' must be 'point'");
    }
    assertField(terrainSettings, 'minCityWaterDistance', 'number', 'fixture.terrainSettings');
    assertField(terrainSettings, 'minCityCityDistance', 'number', 'fixture.terrainSettings');
    assertField(terrainSettings, 'maxRegenAttempts', 'number', 'fixture.terrainSettings');
    assertField(terrainSettings, 'terrainSmoothing', 'number', 'fixture.terrainSettings');

    // Orders array.
    assertField(obj, 'orders', 'array', 'fixture');
    const rawOrders = obj['orders'];
    if (!Array.isArray(rawOrders)) {
        throw new Error("Invalid fixture: 'orders' must be an array");
    }
    const orders = validateOrders(rawOrders, registered);

    // Terminal result (optional field; absent/null means "did not terminate").
    const terminalResult = validateTerminalResult(obj['terminalResult'], registered);

    // finalStateHash is an 8-char lowercase hex string.
    const finalStateHash = obj['finalStateHash'];
    if (typeof finalStateHash !== 'string' || !/^[0-9a-f]{8}$/u.test(finalStateHash)) {
        throw new Error("Invalid fixture: 'finalStateHash' must be an 8-character hex string");
    }

    // Version is 1 (or a future version we recognize).
    const version = obj['version'];
    if (version !== 1) {
        throw new Error(`Invalid fixture: unsupported version ${String(version)} (expected 1)`);
    }

    return {
        version,
        seed: obj['seed'] as number,
        settings: settings as unknown as Fixture['settings'],
        terrainSettings: terrainSettings as unknown as GenerationSettings,
        playerCount,
        orders,
        terminalTick: rawTerminalTick,
        terminalResult,
        finalStateHash,
        engineVersion: obj['engineVersion'] as string,
    };
}
