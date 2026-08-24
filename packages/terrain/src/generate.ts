/**
 * Board Generator — Feature 003
 *
 * The public orchestrator. `generateBoard(req)` produces a
 * deterministic, point-symmetric, validated `Board` for a match:
 *
 *   1. Validate the request (throws `GenerationError` on shape violations).
 *   2. Derive substreams from `req.rng` so the generation phases
 *      are isolated from each other and from the engine's later
 *      consumption of the same PRNG.
 *   3. For `attempt ∈ [0, maxRegenAttempts)`:
 *        a. Derive the attempt's seed via `mixSeed`.
 *        b. Run the elevation → water → cities → board pipeline.
 *        c. Validate the result.
 *        d. On first valid attempt, return the board + the effective seed.
 *   4. On exhaustion, throw `GenerationError({ kind: 'attempts_exhausted' })`.
 *
 * The orchestrator is the only function that consumes the engine's
 * PRNG directly. Every downstream phase receives either the
 * substream-derived seed or a sub-stream of its own.
 *
 * **Determinism invariants** (constitution Principle II):
 *   - No `Math.random`, no `Date.now`, no `Math.sin` / `Math.cos`.
 *   - All entropy comes from `req.rng` (the engine's live sfc32).
 *   - Same `(req, rng-state)` → identical output, byte-for-byte.
 */

import type { Board, CityPlacement, PlayerId } from '@europa/engine';

import { buildBoard } from './board';
import { getPlayerBand } from './city-band';
import { placeCitiesInBand } from './city-placement';
import { enforceCitySymmetry } from './city-symmetry';
import { clampSettings } from './clamp';
import {
  FOUR_PLAYER_COUNT,
  MAX_GENERATION_BOARD_SIZE,
  MIN_GENERATION_BOARD_SIZE,
  MIN_PLAYER_COUNT,
  THREE_PLAYER_COUNT,
} from './constants';
import type {
  GenerationSettings,
  MapSeed,
  TerrainGenerationRequest,
  TerrainGenerationResult,
  ValidationReport,
} from './contracts/terrain-types';
import { GenerationError } from './contracts/terrain-types';
import { generateElevationMap } from './elevation';
import { deriveSubstream, mixSeed } from './rng-adapter';
import { resolveSettings, validateSettings } from './settings';
import { validateBoard } from './validate';
import { extractWater } from './water';

export { hashBoard } from './hash';

/**
 * Validate the structural shape of a `TerrainGenerationRequest`.
 * Throws `GenerationError({ kind: 'invalid_request' })` on
 * violations. Range-clamping is a separate concern (US3, T044+).
 */
function validateRequest(req: Readonly<TerrainGenerationRequest>): void {
  const { boardSize, playerCount, seed, settings } = req;
  if (!Number.isInteger(boardSize) || boardSize < MIN_GENERATION_BOARD_SIZE) {
    throw new GenerationError(
      `generateBoard: boardSize must be an integer ≥ 8 (got ${String(boardSize)})`,
      { kind: 'invalid_request', attempts: 0, lastReport: null },
    );
  }
  if (boardSize > MAX_GENERATION_BOARD_SIZE) {
    throw new GenerationError(`generateBoard: boardSize must be ≤ 128 (got ${String(boardSize)})`, {
      kind: 'invalid_request',
      attempts: 0,
      lastReport: null,
    });
  }
  if (
    playerCount !== MIN_PLAYER_COUNT &&
    playerCount !== THREE_PLAYER_COUNT &&
    playerCount !== FOUR_PLAYER_COUNT
  ) {
    throw new GenerationError(
      `generateBoard: playerCount must be 2, 3, or 4 (got ${String(playerCount)})`,
      { kind: 'invalid_request', attempts: 0, lastReport: null },
    );
  }
  if (!Number.isInteger(seed) || seed < 0) {
    throw new GenerationError(
      `generateBoard: seed must be a non-negative integer (got ${String(seed)})`,
      { kind: 'invalid_request', attempts: 0, lastReport: null },
    );
  }
  if (typeof req.rng !== 'function') {
    throw new GenerationError(
      `generateBoard: req.rng must be a callable PRNG (got ${String(typeof req.rng)})`,
      { kind: 'invalid_request', attempts: 0, lastReport: null },
    );
  }
  // Settings shape: defer to validateSettings.
  validateSettings(settings);
}

/**
 * Public orchestrator. Generates a deterministic, point-symmetric,
 * validated `Board` for a match.
 *
 * @param req The generation request. `req.rng` MUST be the engine's
 *            live sfc32 instance; the engine will keep using it
 *            after this function returns. `req.settings` MUST be a
 *            complete `GenerationSettings` (use
 *            `DEFAULT_GENERATION_SETTINGS` from
 *            `contracts/terrain-types` if no overrides).
 * @returns The generated `Board` and supporting metadata.
 * @throws `GenerationError` when retries are exhausted or the
 *         request is invalid.
 */
export function generateBoard(req: Readonly<TerrainGenerationRequest>): TerrainGenerationResult {
  validateRequest(req);
  // Resolve settings: the shape is complete (per validateSettings),
  // but we may want to apply partial overrides. The current spec
  // requires `req.settings` to be complete, so resolveSettings is
  // a no-op for the spec's contract; it remains available for the
  // future "partial input" use case.
  const resolved: GenerationSettings = resolveSettings(req.settings);
  // US3 (T046): clamp every numeric field to its safe range
  // (data-model.md §2, FR-008). Out-of-range values are NEVER
  // rejected — the generator must always produce a Board. The
  // clamped values drive the rest of the pipeline and are surfaced
  // via `ValidationReport.stats.effectiveSettings` so callers can
  // see what was actually used.
  const settings: GenerationSettings = clampSettings(resolved);

  // Derive substreams so each phase (elevation, water, cities)
  // gets a deterministic, disjoint PRNG. The parent (engine sfc32)
  // is advanced by exactly one step per derivation.
  const elevationRng = deriveSubstream(req.rng);
  const waterRng = deriveSubstream(elevationRng);
  const citiesRng = deriveSubstream(waterRng);

  let lastReport: ValidationReport | null = null;

  for (let attempt = 0; attempt < settings.maxRegenAttempts; attempt++) {
    // Derive the attempt seed. Attempt 0 uses the request seed
    // directly (so when the first attempt succeeds, effectiveSeed
    // equals the request seed; no "spooky action at a distance" for
    // callers). Subsequent attempts use the mixed retry seed.
    const attemptSeed: MapSeed = attempt === 0 ? req.seed >>> 0 : mixSeed(req.seed, attempt);

    // Build elevation: derive a substream from the elevation rng
    // so each attempt uses a different (but deterministic) seed.
    const attemptElevRng = deriveSubstream(elevationRng);
    const elev = generateElevationMap(attemptElevRng, req.boardSize, req.boardSize, settings);

    // Build water: derive a substream from the water rng.
    const attemptWaterRng = deriveSubstream(waterRng);
    // We don't actually use the rng for the water extraction (it's
    // purely a function of elevation + waterRatio), but we still
    // advance the PRNG to keep the "advances by one step per phase"
    // discipline consistent.
    attemptWaterRng();

    const water = extractWater(elev, req.boardSize, req.boardSize, settings.waterRatio);

    // Place cities for the "primary" players only. The 180° partners
    // are added by `enforceCitySymmetry` and assigned to the
    // opposite player. This ensures the total city count is
    // `citiesPerPlayer × playerCount` and the symmetry invariant
    // (INV-9) is satisfied by construction.
    //
    // Primary players:
    //   - 2p: P1 (partner is P2)
    //   - 3p: P1 (partner is P3), P2 (self-symmetric)
    //   - 4p: P1 (partner is P4), P2 (partner is P3)
    const primaryPlayers: readonly PlayerId[] = (() => {
      if (req.playerCount === 2) {
        return [1 as PlayerId];
      }
      if (req.playerCount === THREE_PLAYER_COUNT) {
        return [1 as PlayerId, 2 as PlayerId];
      }
      return [1 as PlayerId, 2 as PlayerId]; // 4p
    })();
    const placedCities: Array<{ cell: { x: number; y: number }; owner: PlayerId }> = [];
    for (const pid of primaryPlayers) {
      const band = getPlayerBand(pid, req.playerCount, req.boardSize, req.boardSize);
      const attemptCitiesRng = deriveSubstream(citiesRng);
      const playerCities = placeCitiesInBand(
        elev,
        water,
        req.boardSize,
        req.boardSize,
        band,
        settings,
        attemptCitiesRng,
        pid,
      );
      for (const c of playerCities) {
        placedCities.push({ cell: c.cell, owner: c.owner });
      }
    }
    // Enforce 180° symmetry. This adds partner cities for the
    // "secondary" players (P2 for 2p, P3 for 3p, P3+P4 for 4p).
    const symmetricCities = enforceCitySymmetry(
      placedCities,
      req.boardSize,
      req.boardSize,
      req.playerCount,
    );
    // Convert to CityPlacement shape for the Board.
    const cityPlacements: CityPlacement[] = symmetricCities.map((c) => ({
      cell: c.cell,
      owner: c.owner,
    }));
    // Build the Board with cities.
    const boardWithCities: Board = {
      ...buildBoard(elev, water, req.boardSize, req.boardSize),
      cities: cityPlacements,
    };

    // Validate. If valid, return immediately.
    const report = validateBoard(boardWithCities, settings, req.playerCount);
    if (report.valid) {
      const startingCitiesByPlayer: Record<PlayerId, ReadonlyArray<{ x: number; y: number }>> = {
        1: [],
        2: [],
        3: [],
        4: [],
      };
      for (const c of cityPlacements) {
        const arr = startingCitiesByPlayer[c.owner];
        if (arr) {
          (arr as Array<{ x: number; y: number }>).push(c.cell);
        }
      }
      return {
        board: boardWithCities,
        effectiveSeed: attemptSeed,
        startingCitiesByPlayer,
        effectiveSettings: settings,
      };
    }
    lastReport = report;
  }

  // Exhaustion: throw.
  throw new GenerationError(
    `generateBoard: attempts exhausted (${String(settings.maxRegenAttempts)} attempts, lastReport.violations.length=${String(lastReport?.violations.length ?? 0)})`,
    {
      kind: 'attempts_exhausted',
      attempts: settings.maxRegenAttempts,
      lastReport,
    },
  );
}
