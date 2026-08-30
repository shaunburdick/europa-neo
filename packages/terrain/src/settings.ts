/**
 * Generation Settings Helpers — Feature 003
 *
 * Two pure functions that operate on the typed `GenerationSettings`
 * contract:
 *
 *   - `resolveSettings(partial)` — merge a partial user-supplied
 *     settings object with `DEFAULT_GENERATION_SETTINGS` so callers
 *     can supply only the fields they care about.
 *   - `validateSettings(s)` — type-shape validation (NOT range
 *     clamping). Throws `GenerationError({ kind: 'invalid_request' })`
 *     on violations like non-integer `octaves`. Range-clamping
 *     math lives in `clamp.ts` (US3, T044–T046) and runs at the top
 *     of `generateBoard`.
 *
 * **Boundary rule**: settings are merged + validated BEFORE any RNG
 * consumption so an invalid request fails fast (and the engine PRNG
 * is not perturbed by a failed call).
 */

import { THREE_PLAYER_COUNT } from './constants';
import { DEFAULT_GENERATION_SETTINGS, GenerationError, type GenerationSettings } from './contracts/terrain-types';

/**
 * Resolve a partial settings object into a complete `GenerationSettings`
 * by filling missing fields with `DEFAULT_GENERATION_SETTINGS`.
 *
 * The merge is a shallow per-field fallback: each field of the result
 * is taken from `partial` if present, otherwise from the defaults.
 * This is intentional — nested shapes are not used, and an explicit
 * `undefined` for a field is treated as "use the default".
 *
 * @param partial User-supplied overrides. Any omitted (or `undefined`)
 *                field falls back to `DEFAULT_GENERATION_SETTINGS`.
 * @returns A complete `GenerationSettings`. NEVER returns `partial`
 *          unchanged — even a fully-populated partial is reconstructed
 *          field-by-field so the return type's literal structure is
 *          stable.
 */
export function resolveSettings(partial: Partial<GenerationSettings>): GenerationSettings {
    return {
        waterRatio: partial.waterRatio ?? DEFAULT_GENERATION_SETTINGS.waterRatio,
        roughness: partial.roughness ?? DEFAULT_GENERATION_SETTINGS.roughness,
        octaves: partial.octaves ?? DEFAULT_GENERATION_SETTINGS.octaves,
        citiesPerPlayer: partial.citiesPerPlayer ?? DEFAULT_GENERATION_SETTINGS.citiesPerPlayer,
        symmetryStrategy: partial.symmetryStrategy ?? DEFAULT_GENERATION_SETTINGS.symmetryStrategy,
        minCityWaterDistance: partial.minCityWaterDistance ?? DEFAULT_GENERATION_SETTINGS.minCityWaterDistance,
        minCityCityDistance: partial.minCityCityDistance ?? DEFAULT_GENERATION_SETTINGS.minCityCityDistance,
        maxRegenAttempts: partial.maxRegenAttempts ?? DEFAULT_GENERATION_SETTINGS.maxRegenAttempts,
        terrainSmoothing: partial.terrainSmoothing ?? DEFAULT_GENERATION_SETTINGS.terrainSmoothing,
    };
}

/**
 * Effective `citiesPerPlayer` after applying the 3-player parity rule.
 *
 * **3-player parity rule** (issue #2): with point symmetry the
 * 3-player middle band belongs to itself (P2 ↔ P2 under 180°
 * rotation), so each player's city count must be EVEN for the
 * mirrored total to equal `playerCount × citiesPerPlayer` exactly
 * (INV-7 / FR-005). Odd values are therefore rounded UP to the next
 * even number for `playerCount === 3`; all other player counts pass
 * the value through unchanged.
 *
 * This scalar helper is the single source of truth for the rule —
 * `normalizeSettingsForPlayerCount` (whole-settings view) and
 * `resolveCityCount` (total-count view) both delegate here.
 *
 * @param citiesPerPlayer Range-clamped `citiesPerPlayer` value.
 * @param playerCount     The match's player count (2, 3, or 4).
 * @returns The even (for 3p) effective value.
 */
export function normalizedCitiesPerPlayer(citiesPerPlayer: number, playerCount: 2 | 3 | 4): number {
    if (playerCount === THREE_PLAYER_COUNT && Math.trunc(citiesPerPlayer) % 2 !== 0) {
        return citiesPerPlayer + 1;
    }
    return citiesPerPlayer;
}

/**
 * Normalize generation settings for a specific player count.
 *
 * Applies the 3-player parity rule (see `normalizedCitiesPerPlayer`)
 * to `citiesPerPlayer`, uniformly for ALL players so per-player
 * equality (FR-005) is preserved. The normalized value is surfaced
 * to callers via `TerrainGenerationResult.effectiveSettings` /
 * `MapStats.effectiveSettings`.
 *
 * 2p and 4p layouts have no self-symmetric band; their settings are
 * returned unchanged (copied field-for-field).
 *
 * @param settings    Settings to normalize. Expected to already be
 *                    range-clamped (`clampSettings`) so the rounded
 *                    value stays within the declared [1, 4] range.
 * @param playerCount The match's player count (2, 3, or 4).
 * @returns Settings whose `citiesPerPlayer` satisfies the parity
 *          rule for the given player count.
 */
export function normalizeSettingsForPlayerCount(
    settings: Readonly<GenerationSettings>,
    playerCount: 2 | 3 | 4,
): GenerationSettings {
    return {
        ...settings,
        citiesPerPlayer: normalizedCitiesPerPlayer(settings.citiesPerPlayer, playerCount),
    };
}

/**
 * Validate the *shape* of a `GenerationSettings` value. Range
 * clamping is a separate concern (see `clamp.ts`, US3).
 *
 * Checks performed (each throws `GenerationError({ kind: 'invalid_request' })`):
 *
 *   - Every numeric field is a finite number (no `NaN`, no `Infinity`).
 *   - Every integer field is an integer (`Number.isInteger`):
 *     `octaves`, `citiesPerPlayer`, `minCityWaterDistance`,
 *     `minCityCityDistance`, `maxRegenAttempts`, `terrainSmoothing`.
 *   - `symmetryStrategy` is one of the closed union members — v1 only
 *     accepts `'point'` (spec FR-004).
 *
 * Note: float fields (`waterRatio`, `roughness`) are checked for
 * finiteness only. Whether they fall in their safe range is a clamp
 * concern, not a shape concern.
 *
 * @param s The settings to validate. Caller-supplied (post-merge) shape.
 * @throws `GenerationError` on any shape violation.
 */
export function validateSettings(s: GenerationSettings): void {
    const integerFields: ReadonlyArray<keyof GenerationSettings> = [
        'octaves',
        'citiesPerPlayer',
        'minCityWaterDistance',
        'minCityCityDistance',
        'maxRegenAttempts',
        'terrainSmoothing',
    ];

    for (const field of integerFields) {
        const v = s[field];
        if (typeof v !== 'number' || !Number.isFinite(v)) {
            throw new GenerationError(`validateSettings: '${field}' must be a finite number (got ${String(v)})`, {
                kind: 'invalid_request',
                attempts: 0,
                lastReport: null,
            });
        }
        if (!Number.isInteger(v)) {
            throw new GenerationError(`validateSettings: '${field}' must be an integer (got ${String(v)})`, {
                kind: 'invalid_request',
                attempts: 0,
                lastReport: null,
            });
        }
    }

    // Float fields: finiteness only.
    for (const field of ['waterRatio', 'roughness'] as const) {
        const v = s[field];
        if (typeof v !== 'number' || !Number.isFinite(v)) {
            throw new GenerationError(`validateSettings: '${field}' must be a finite number (got ${String(v)})`, {
                kind: 'invalid_request',
                attempts: 0,
                lastReport: null,
            });
        }
    }

    // Closed-union check for symmetryStrategy.
    if (s.symmetryStrategy !== 'point') {
        throw new GenerationError(
            `validateSettings: symmetryStrategy must be 'point' in v1 (got '${String(s.symmetryStrategy)}')`,
            { kind: 'invalid_request', attempts: 0, lastReport: null },
        );
    }
}
