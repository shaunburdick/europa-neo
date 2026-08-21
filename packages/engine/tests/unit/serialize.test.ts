/**
 * serializeWorld / deserializeWorld / hashWorld tests — Feature 001, T051
 *
 * Covers:
 *   - Round-trip: `deserializeWorld(serializeWorld(w))` deep-equals `w`
 *     (modulo the documented limitation that the board's cell terrain
 *     data is not preserved — see `serialize.ts` for the rationale).
 *   - Version mismatch: a buffer with a wrong version header throws
 *     `EngineVersionMismatchError`.
 *   - `hashWorld` determinism: same world → same hash; different tick
 *     → different hash.
 *   - Buffer equality: same world serialized twice → byte-identical
 *     buffers (the determinism property SC-001 depends on).
 */

import { describe, expect, it } from 'vitest';
import { ENGINE_CONSTANTS } from '../../src/constants';
import { createWorld } from '../../src/create';
import {
  deserializeWorld,
  EngineFormatError,
  EngineVersionMismatchError,
  hashWorld,
  serializeWorld,
} from '../../src/serialize';
import type { MatchConfig } from '../../src/types';
import { buildSmallBoard } from '../fixtures/board';
import { runScenario } from '../fixtures/scenarios';

const cfg: MatchConfig = {
  boardSize: 8,
  playerCount: 2,
  tickIntervalMs: 250,
  seed: 1,
  visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault,
};

describe('serializeWorld / deserializeWorld', () => {
  it('round-trip preserves the mutable parts of a tick-0 world', () => {
    const board = buildSmallBoard(8, [
      [1, 1, 1],
      [6, 6, 2],
    ]);
    const w = createWorld(cfg, board);
    const bytes = serializeWorld(w);
    const restored = deserializeWorld(bytes);

    // The board's cell data is reconstructed (terrain-only); the
    // cities + dimensions are preserved verbatim.
    expect(restored.board.width).toBe(w.board.width);
    expect(restored.board.height).toBe(w.board.height);
    expect(restored.board.cities.length).toBe(w.board.cities.length);
    expect(restored.board.cities[0]?.cell).toEqual(w.board.cities[0]?.cell);
    expect(restored.board.cities[0]?.owner).toBe(w.board.cities[0]?.owner);

    // Players: IDs, status, citiesOwned all preserved.
    expect(restored.players.length).toBe(w.players.length);
    for (let i = 0; i < w.players.length; i++) {
      expect(restored.players[i]?.id).toBe(w.players[i]?.id);
      expect(restored.players[i]?.status).toBe(w.players[i]?.status);
      expect(restored.players[i]?.citiesOwned).toBe(w.players[i]?.citiesOwned);
      expect(restored.players[i]?.displayName).toBe(w.players[i]?.displayName);
    }

    // Runtime state.
    expect(restored.tick).toBe(w.tick);
    expect(restored.rngSeed).toBe(w.rngSeed);
    expect(Array.from(restored.rngState)).toEqual(Array.from(w.rngState));
    expect(Array.from(restored.state.troopCounts)).toEqual(Array.from(w.state.troopCounts));
    expect(Array.from(restored.state.troopOwners)).toEqual(Array.from(w.state.troopOwners));
    expect(Array.from(restored.state.pipeMasks)).toEqual(Array.from(w.state.pipeMasks));
    expect(Array.from(restored.state.cityOwners)).toEqual(Array.from(w.state.cityOwners));

    // Config (visibilityRadius + seed round-trip; tickIntervalMs resets
    // to default — see serialize.ts note).
    expect(restored.config.boardSize).toBe(w.config.boardSize);
    expect(restored.config.playerCount).toBe(w.config.playerCount);
    expect(restored.config.seed).toBe(w.config.seed);
    expect(restored.config.visibilityRadius).toBe(w.config.visibilityRadius);
  });

  it('round-trip preserves a world with non-trivial state (post-tick)', () => {
    const board = buildSmallBoard(8, [
      [1, 1, 1],
      [6, 6, 2],
    ]);
    const { finalWorld } = runScenario(cfg, board, [], 30);
    expect(finalWorld.state.troopCounts.some((c) => c > 0)).toBe(true);

    const restored = deserializeWorld(serializeWorld(finalWorld));
    expect(restored.tick).toBe(finalWorld.tick);
    expect(restored.state.troopCounts.length).toBe(finalWorld.state.troopCounts.length);
    for (let i = 0; i < finalWorld.state.troopCounts.length; i++) {
      expect(restored.state.troopCounts[i]).toBe(finalWorld.state.troopCounts[i]);
      expect(restored.state.troopOwners[i]).toBe(finalWorld.state.troopOwners[i]);
    }
  });

  it('serializeWorld returns the same bytes for the same world (determinism)', () => {
    const board = buildSmallBoard(8, [[1, 1, 1]]);
    const w = createWorld(cfg, board);
    const a = serializeWorld(w);
    const b = serializeWorld(w);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('serializeWorld returns different bytes for different ticks', () => {
    const board = buildSmallBoard(8, [[1, 1, 1]]);
    const { finalWorld: w0 } = runScenario(cfg, board, [], 0);
    const { finalWorld: w1 } = runScenario(cfg, board, [], 5);
    expect(Array.from(serializeWorld(w0))).not.toEqual(Array.from(serializeWorld(w1)));
  });
});

describe('hashWorld', () => {
  it('produces an 8-character lowercase hex string', () => {
    const board = buildSmallBoard(8, [[1, 1, 1]]);
    const w = createWorld(cfg, board);
    const hash = hashWorld(w);
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is deterministic: same world → same hash', () => {
    const board = buildSmallBoard(8, [[1, 1, 1]]);
    const w = createWorld(cfg, board);
    expect(hashWorld(w)).toBe(hashWorld(w));
  });

  it('is different for worlds at different ticks', () => {
    const board = buildSmallBoard(8, [[1, 1, 1]]);
    const { finalWorld: w0 } = runScenario(cfg, board, [], 0);
    const { finalWorld: w1 } = runScenario(cfg, board, [], 5);
    expect(hashWorld(w0)).not.toBe(hashWorld(w1));
  });
});

describe('deserializeWorld error handling', () => {
  it('throws EngineVersionMismatchError on wrong version', () => {
    // Hand-craft a buffer with version "9.9.9" in the header.
    const version = new TextEncoder().encode('9.9.9');
    const buffer = new Uint8Array(3 + version.length + 8);
    buffer[0] = 0x00;
    buffer[1] = 0x00;
    buffer[2] = version.length;
    buffer.set(version, 3);
    expect(() => deserializeWorld(buffer)).toThrow(EngineVersionMismatchError);
  });

  it('throws EngineFormatError on truncated buffer', () => {
    expect(() => deserializeWorld(new Uint8Array(0))).toThrow(EngineFormatError);
    expect(() => deserializeWorld(new Uint8Array([0x00]))).toThrow(EngineFormatError);
  });

  it('throws EngineFormatError on missing magic prefix', () => {
    // Two non-zero bytes in the magic slot.
    expect(() => deserializeWorld(new Uint8Array([0x01, 0x01, 0x00]))).toThrow(EngineFormatError);
  });
});
