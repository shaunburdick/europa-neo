/**
 * Replay Module — Feature 022 (Developer Debugging Tools)
 *
 * Pure functions and types for deterministic match capture/replay.
 * The replay harness lets developers reproduce, diagnose, and
 * regression-test engine behavior from captured match fixtures.
 *
 * Public surface:
 *   - `Fixture`, `OrderRecord`, `GenerationSettings`, `PlayerCount`,
 *     `ReplayResult` — types
 *   - `validateFixture(data)` — type-narrowing fixture validator
 *   - `replayMatch(fixture, board)` — pure replay engine
 *   - `checkVersionMismatch(fixtureVersion)` — version mismatch detector
 */

export { checkVersionMismatch, replayMatch } from './replay';
export type { Fixture, GenerationSettings, OrderRecord, PlayerCount, ReplayResult } from './types';
export { validateFixture } from './validate';
