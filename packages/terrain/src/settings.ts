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
 *     `minCityCityDistance`, `maxRegenAttempts`.
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
