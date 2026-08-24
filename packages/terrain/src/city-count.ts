/**
 * City Count — Feature 003
 *
 * Adapter that computes the total number of cities to place.
 * `clamp(settings.citiesPerPlayer, 1, 4) × playerCount`.
 *
 * The actual range-clamping math lives in `clamp.ts` (US3, T044+).
 * This module is the small adapter exposed for the US2 city
 * placement pipeline.
 */

import { CITIES_PER_PLAYER_MAX, CITIES_PER_PLAYER_MIN } from './clamp';

/**
 * Resolve the total number of cities to place on the board.
 *
 * @param settings    Generation settings (citiesPerPlayer).
 * @param playerCount Player count (2..4).
 * @returns The clamped `citiesPerPlayer` (in `[1, 4]`) times
 *          `playerCount`.
 */
export function resolveCityCount(
  settings: { readonly citiesPerPlayer: number },
  playerCount: 2 | 3 | 4,
): number {
  // Inline clamp (the US3 clamp module is not yet implemented; we
  // duplicate the math here for now and centralize in clamp.ts in
  // a later wave). Range [1, 4] per data-model.md §2.
  const cpp = settings.citiesPerPlayer;
  const clamped =
    cpp < CITIES_PER_PLAYER_MIN
      ? CITIES_PER_PLAYER_MIN
      : cpp > CITIES_PER_PLAYER_MAX
        ? CITIES_PER_PLAYER_MAX
        : cpp;
  return clamped * playerCount;
}
