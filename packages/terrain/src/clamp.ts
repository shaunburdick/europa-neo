/**
 * Generation Settings Clamping — Feature 003 (US3, T044–T046)
 *
 * Pure range-clamping helpers for every `GenerationSettings` field.
 * Out-of-range inputs are CLAMPED (per FR-008), never rejected — the
 * generator must always produce a valid Board for any caller-supplied
 * settings, even when the caller pushes values outside the documented
 * safe ranges. The clamped values are surfaced via
 * `ValidationReport.stats.effectiveSettings` so callers can see what
 * was actually used (see T046, PM handoff item #2).
 *
 * **Safe ranges** (per `data-model.md` §2, FR-008):
 *
 *   | field                | type    | safe range    |
 *   |----------------------|---------|---------------|
 *   | `waterRatio`         | float   | `[0.02, 0.25]`|
 *   | `roughness`          | float   | `[0.1,  0.9]` |
 *   | `octaves`            | integer | `[1,    6]`   |
 *   | `citiesPerPlayer`    | integer | `[1,    4]`   |
 *   | `minCityWaterDistance` | integer | `[1,    6]` |
 *   | `minCityCityDistance` | integer | `[2,   10]`   |
 *   | `maxRegenAttempts`   | integer | `[1,   10]`   |
 *
 * The float clamps use `Math.max(min, Math.min(max, value))`. The
 * integer clamps floor the result via `Math.floor` after clamping so
 * a fractional input like `2.7` becomes `2` (not `3`). The `clamp*`
 * exports accept any number and return a number; callers that pass
 * already-integer values get the same number back (idempotent for
 * in-range integer inputs).
 *
 * **Determinism discipline** (constitution Principle II): the helpers
 * are pure and integer-only at their core. `Math.max` / `Math.min` /
 * `Math.floor` operate on IEEE-754 doubles but produce deterministic
 * integer outputs for integer inputs; the floats they return are
 * deterministic for the same inputs.
 *
 * **Note on `Math.floor` vs `Math.trunc`**: for non-negative numbers
 * (every field here is bounded to a non-negative range) `Math.floor`
 * and `Math.trunc` are identical. We use `Math.floor` for clarity.
 *
 * @see data-model.md §2 for the canonical safe ranges.
 * @see tasks.md T044 (unit tests), T045 (this file), T046 (integration).
 */

import type { GenerationSettings } from './contracts/terrain-types';

// ----------------------------------------------------------------------------
// Safe-range constants (single source of truth, mirror data-model.md §2)
// ----------------------------------------------------------------------------

/** `waterRatio` safe range. Floats in `[0.02, 0.25]`. */
export const WATER_RATIO_MIN = 0.02;
export const WATER_RATIO_MAX = 0.25;

/** `roughness` safe range. Floats in `[0.1, 0.9]`. */
export const ROUGHNESS_MIN = 0.1;
export const ROUGHNESS_MAX = 0.9;

/** `octaves` safe range. Integers in `[1, 6]`. */
export const OCTAVES_MIN = 1;
export const OCTAVES_MAX = 6;

/** `citiesPerPlayer` safe range. Integers in `[1, 4]`. */
export const CITIES_PER_PLAYER_MIN = 1;
export const CITIES_PER_PLAYER_MAX = 4;

/** `minCityWaterDistance` safe range. Integers in `[1, 6]`. */
export const MIN_CITY_WATER_DISTANCE_MIN = 1;
export const MIN_CITY_WATER_DISTANCE_MAX = 6;

/** `minCityCityDistance` safe range. Integers in `[2, 10]`. */
export const MIN_CITY_CITY_DISTANCE_MIN = 2;
export const MIN_CITY_CITY_DISTANCE_MAX = 10;

/** `maxRegenAttempts` safe range. Integers in `[1, 10]`. */
export const MAX_REGEN_ATTEMPTS_MIN = 1;
export const MAX_REGEN_ATTEMPTS_MAX = 10;

// ----------------------------------------------------------------------------
// Clamp a single value into an inclusive `[min, max]` integer range
// ----------------------------------------------------------------------------

/**
 * Clamp a number into the inclusive integer range `[min, max]`.
 * Non-integer inputs are floored after clamping, so a value like `2.7`
 * becomes `2`. The output is always an integer.
 *
 * **Not exported** — internal helper. Exported per-field helpers below
 * are the public surface; this one is a building block.
 */
function clampInt(value: number, min: number, max: number): number {
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return Math.floor(value);
}

// ----------------------------------------------------------------------------
// Per-field clamp helpers (one per `GenerationSettings` field)
// ----------------------------------------------------------------------------

/**
 * Clamp `waterRatio` to `[0.02, 0.25]`. Returns a float.
 *
 * @param v The input value (any number).
 * @returns The clamped value, guaranteed to be in `[WATER_RATIO_MIN, WATER_RATIO_MAX]`.
 */
export function clampWaterRatio(v: number): number {
    if (v < WATER_RATIO_MIN) {
        return WATER_RATIO_MIN;
    }
    if (v > WATER_RATIO_MAX) {
        return WATER_RATIO_MAX;
    }
    return v;
}

/**
 * Clamp `roughness` to `[0.1, 0.9]`. Returns a float.
 *
 * @param v The input value (any number).
 * @returns The clamped value, guaranteed to be in `[ROUGHNESS_MIN, ROUGHNESS_MAX]`.
 */
export function clampRoughness(v: number): number {
    if (v < ROUGHNESS_MIN) {
        return ROUGHNESS_MIN;
    }
    if (v > ROUGHNESS_MAX) {
        return ROUGHNESS_MAX;
    }
    return v;
}

/**
 * Clamp `octaves` to the integer range `[1, 6]`. Non-integer inputs
 * are floored after clamping.
 *
 * @param v The input value (any number).
 * @returns An integer in `[OCTAVES_MIN, OCTAVES_MAX]`.
 */
export function clampOctaves(v: number): number {
    return clampInt(v, OCTAVES_MIN, OCTAVES_MAX);
}

/**
 * Clamp `citiesPerPlayer` to the integer range `[1, 4]`. Non-integer
 * inputs are floored after clamping.
 *
 * @param v The input value (any number).
 * @returns An integer in `[CITIES_PER_PLAYER_MIN, CITIES_PER_PLAYER_MAX]`.
 */
export function clampCitiesPerPlayer(v: number): number {
    return clampInt(v, CITIES_PER_PLAYER_MIN, CITIES_PER_PLAYER_MAX);
}

/**
 * Clamp `minCityWaterDistance` to the integer range `[1, 6]`.
 * Non-integer inputs are floored after clamping.
 *
 * @param v The input value (any number).
 * @returns An integer in `[MIN_CITY_WATER_DISTANCE_MIN, MIN_CITY_WATER_DISTANCE_MAX]`.
 */
export function clampMinCityWaterDistance(v: number): number {
    return clampInt(v, MIN_CITY_WATER_DISTANCE_MIN, MIN_CITY_WATER_DISTANCE_MAX);
}

/**
 * Clamp `minCityCityDistance` to the integer range `[2, 10]`.
 * Non-integer inputs are floored after clamping.
 *
 * @param v The input value (any number).
 * @returns An integer in `[MIN_CITY_CITY_DISTANCE_MIN, MIN_CITY_CITY_DISTANCE_MAX]`.
 */
export function clampMinCityCityDistance(v: number): number {
    return clampInt(v, MIN_CITY_CITY_DISTANCE_MIN, MIN_CITY_CITY_DISTANCE_MAX);
}

/**
 * Clamp `maxRegenAttempts` to the integer range `[1, 10]`. Non-integer
 * inputs are floored after clamping.
 *
 * **Per `data-model.md` §2**: the safe range is `[1, 10]`, NOT
 * `[1, 16]` (the prompt's draft said `[1, 16]`; PM-mediated correction
 * committed in `m0099`–`m0100`).
 *
 * @param v The input value (any number).
 * @returns An integer in `[MAX_REGEN_ATTEMPTS_MIN, MAX_REGEN_ATTEMPTS_MAX]`.
 */
export function clampMaxRegenAttempts(v: number): number {
    return clampInt(v, MAX_REGEN_ATTEMPTS_MIN, MAX_REGEN_ATTEMPTS_MAX);
}

// ----------------------------------------------------------------------------
// Whole-settings clamp (T045's primary export)
// ----------------------------------------------------------------------------

/**
 * Clamp every numeric field of a `GenerationSettings` value into its
 * safe range and return a new settings object. `symmetryStrategy` is
 * passed through unchanged (it's a string literal union, not a numeric
 * knob).
 *
 * This is the function `generateBoard` calls at the top of its
 * pipeline (T046): caller-supplied out-of-range values are silently
 * clamped (never rejected), and the clamped values are exposed via
 * `ValidationReport.stats.effectiveSettings` so callers can compare.
 *
 * The returned object is **structurally equal** to the input when
 * every field is already in range (idempotent for in-range inputs),
 * and otherwise differs only in the out-of-range fields.
 *
 * @param s The input settings. May be any `GenerationSettings` shape;
 *          no validation is performed here (caller's responsibility —
 *          `validateSettings` is the shape validator).
 * @returns A new `GenerationSettings` with every numeric field clamped.
 */
export function clampSettings(s: Readonly<GenerationSettings>): GenerationSettings {
    return {
        waterRatio: clampWaterRatio(s.waterRatio),
        roughness: clampRoughness(s.roughness),
        octaves: clampOctaves(s.octaves),
        citiesPerPlayer: clampCitiesPerPlayer(s.citiesPerPlayer),
        symmetryStrategy: s.symmetryStrategy,
        minCityWaterDistance: clampMinCityWaterDistance(s.minCityWaterDistance),
        minCityCityDistance: clampMinCityCityDistance(s.minCityCityDistance),
        maxRegenAttempts: clampMaxRegenAttempts(s.maxRegenAttempts),
    };
}
