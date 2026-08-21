/**
 * Terrain Error Types — Feature 003
 *
 * Re-exports the `GenerationError` class from the local contract copy
 * (which itself mirrors the spec contract verbatim). The class is
 * thrown by `generateBoard` when:
 *
 *   - The request is invalid (e.g., unknown `symmetryStrategy`,
 *     `boardSize < 8`, `playerCount` outside `[2, 4]`).
 *   - Regeneration retries are exhausted without producing a valid
 *     map (spec FR-007 "bounded retries"; default `maxRegenAttempts = 5`).
 *
 * Throwing rather than returning a `Result` is a deliberate choice
 * (see `data-model.md` §6): the loudest possible signal that something
 * is wrong, and the only caller (feature 006 matchmaking) can catch
 * and surface a meaningful error to the matchmaker.
 *
 * The class shape (fields, constructor signature, `name = 'GenerationError'`)
 * is locked by the contract in `contracts/terrain-types.ts` lines
 * 350–368. Adding fields is a breaking contract change and requires
 * bumping `TERRAIN_API_VERSION`.
 */

export { GenerationError } from './contracts/terrain-types';
