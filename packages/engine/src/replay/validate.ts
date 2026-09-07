/**
 * Fixture Validator — Feature 022 (Developer Debugging Tools)
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
 * Implementation note on TypeScript vs Biome:
 * The project enforces both `noPropertyAccessFromIndexSignature`
 * (TypeScript) and `useLiteralKeys` (Biome). These rules conflict
 * when accessing properties on `Record<string, unknown>`. The package
 * biome config disables `useLiteralKeys` for this file so bracket
 * notation can be used consistently (required by TypeScript).
 */

import type { Fixture, GenerationSettings, OrderRecord } from './types';

// ---------------------------------------------------------------------------
// Internal validation helpers
// ---------------------------------------------------------------------------

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
 * Validate that the `orders` array contains well-formed OrderRecord entries.
 *
 * @param orders The orders array to validate.
 * @param label A prefix for the error message.
 * @throws {Error} if any order is malformed.
 */
function validateOrders(orders: unknown[], label: string): void {
    for (let i = 0; i < orders.length; i++) {
        const entry = orders[i];
        if (entry === undefined || entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new Error(`Invalid ${label}: order at index ${i}: expected object, got ${typeof entry}`);
        }
        if (!('tick' in entry) || typeof entry.tick !== 'number') {
            throw new Error(`Invalid ${label}: order at index ${i}: 'tick' must be a number`);
        }
        if (!('playerId' in entry) || typeof entry.playerId !== 'number') {
            throw new Error(`Invalid ${label}: order at index ${i}: 'playerId' must be a number`);
        }
        if (
            !('order' in entry) ||
            entry.order === undefined ||
            entry.order === null ||
            typeof entry.order !== 'object' ||
            Array.isArray(entry.order)
        ) {
            throw new Error(`Invalid ${label}: order at index ${i}: 'order' must be an object`);
        }
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate an unknown value as a match fixture. Type-narrowing guard
 * that checks all required fields with correct types.
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
    if (data === null || data === undefined || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Invalid fixture: expected an object');
    }

    // Cast to Record after the initial shape check for bracket-access property extraction.
    const obj = data as Record<string, unknown>;

    // Top-level required fields.
    assertField(obj, 'version', 'number', 'fixture');
    assertField(obj, 'seed', 'number', 'fixture');
    assertField(obj, 'playerCount', 'number', 'fixture');
    assertField(obj, 'terminalTick', 'number', 'fixture');
    assertField(obj, 'finalStateHash', 'string', 'fixture');
    assertField(obj, 'engineVersion', 'string', 'fixture');

    // Settings sub-object — must be a non-null, non-array object.
    if (obj['settings'] === undefined || obj['settings'] === null) {
        throw new Error("Invalid fixture: missing 'settings'");
    }
    if (typeof obj['settings'] !== 'object' || Array.isArray(obj['settings'])) {
        throw new Error("Invalid fixture: 'settings' must be object");
    }
    const settings = obj['settings'] as Record<string, unknown>;
    assertField(settings, 'boardSize', 'number', 'fixture.settings');
    assertField(settings, 'playerCount', 'number', 'fixture.settings');
    assertField(settings, 'tickIntervalMs', 'number', 'fixture.settings');
    assertField(settings, 'seed', 'number', 'fixture.settings');
    assertField(settings, 'visibilityRadius', 'number', 'fixture.settings');

    // TerrainSettings sub-object.
    if (obj['terrainSettings'] === undefined || obj['terrainSettings'] === null) {
        throw new Error("Invalid fixture: missing 'terrainSettings'");
    }
    if (typeof obj['terrainSettings'] !== 'object' || Array.isArray(obj['terrainSettings'])) {
        throw new Error("Invalid fixture: 'terrainSettings' must be object");
    }
    const terrainSettings = obj['terrainSettings'] as Record<string, unknown>;
    assertField(terrainSettings, 'waterRatio', 'number', 'fixture.terrainSettings');
    assertField(terrainSettings, 'roughness', 'number', 'fixture.terrainSettings');
    assertField(terrainSettings, 'octaves', 'number', 'fixture.terrainSettings');
    assertField(terrainSettings, 'citiesPerPlayer', 'number', 'fixture.terrainSettings');
    assertField(terrainSettings, 'symmetryStrategy', 'string', 'fixture.terrainSettings');
    assertField(terrainSettings, 'minCityWaterDistance', 'number', 'fixture.terrainSettings');
    assertField(terrainSettings, 'minCityCityDistance', 'number', 'fixture.terrainSettings');
    assertField(terrainSettings, 'maxRegenAttempts', 'number', 'fixture.terrainSettings');
    assertField(terrainSettings, 'terrainSmoothing', 'number', 'fixture.terrainSettings');

    // Orders array.
    assertField(obj, 'orders', 'array', 'fixture');
    const orders = obj['orders'] as unknown[];
    validateOrders(orders, 'fixture');

    // Validate terminalTick is a non-negative integer.
    const terminalTick = obj['terminalTick'] as number;
    if (!Number.isInteger(terminalTick) || terminalTick < 0) {
        throw new Error("Invalid fixture: 'terminalTick' must be a non-negative integer");
    }

    // Validate finalStateHash is an 8-char hex string.
    const finalStateHash = obj['finalStateHash'] as string;
    if (!/^[0-9a-f]{8}$/u.test(finalStateHash)) {
        throw new Error("Invalid fixture: 'finalStateHash' must be an 8-character hex string");
    }

    // Validate version is 1 (or a future version we recognize).
    const version = obj['version'] as number;
    if (version !== 1) {
        throw new Error(`Invalid fixture: unsupported version ${String(version)} (expected 1)`);
    }

    return {
        version,
        seed: obj['seed'] as number,
        settings: settings as unknown as Fixture['settings'],
        terrainSettings: terrainSettings as unknown as GenerationSettings,
        playerCount: obj['playerCount'] as number,
        orders: orders as unknown as OrderRecord[],
        terminalTick,
        terminalResult: obj['terminalResult'],
        finalStateHash,
        engineVersion: obj['engineVersion'] as string,
    };
}
