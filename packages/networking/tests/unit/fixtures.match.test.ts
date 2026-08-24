/**
 * Scripted Match Fixture Smoke Tests — Feature 004 (Phase 2)
 *
 * Verifies deterministic construction (board, cities, troops,
 * config), the EngineSession adapter over the real engine
 * primitives, and `attachPlayersForMatch` seat binding.
 */

import type { MatchResult, PlayerId } from '@europa/engine';
import { describe, expect, it } from 'vitest';
import type {
  AttachPlayerRequest,
  DetachRequest,
  RegisterMatchRequest,
  Server,
  SessionToken,
} from '../../src/types';
import { attachPlayersForMatch, scriptedMatch } from '../fixtures/match';

/** Minimal fake Server: records attachPlayer calls, everything else throws. */
function fakeServer(): { server: Server; attached: AttachPlayerRequest[] } {
  const attached: AttachPlayerRequest[] = [];
  const server: Server = {
    async listen(): Promise<void> {
      throw new Error('fakeServer: listen not expected');
    },
    registerMatch(_req: RegisterMatchRequest): void {
      throw new Error('fakeServer: registerMatch not expected');
    },
    unregisterMatch(): void {
      throw new Error('fakeServer: unregisterMatch not expected');
    },
    attachPlayer(req: AttachPlayerRequest): void {
      attached.push(req);
    },
    detachPlayer(_req: DetachRequest): void {
      throw new Error('fakeServer: detachPlayer not expected');
    },
    enableSpectators(): void {
      throw new Error('fakeServer: enableSpectators not expected');
    },
    disableSpectators(): void {
      throw new Error('fakeServer: disableSpectators not expected');
    },
    async close(): Promise<void> {
      throw new Error('fakeServer: close not expected');
    },
    stats() {
      throw new Error('fakeServer: stats not expected');
    },
  };
  return { server, attached };
}

describe('scriptedMatch', () => {
  it('builds the four-tuple with defaults', () => {
    const match = scriptedMatch();
    expect(match.matchId).toMatch(/^match-scripted-/);
    expect(match.matchConfig.playerCount).toBe(2);
    expect(match.matchConfig.boardSize).toBe(16);
    expect(match.matchConfig.tickIntervalMs).toBe(250);
    expect(match.matchConfig.seed).toBe(42);
    expect(match.displayNames).toEqual(['Alpha', 'Bravo']);
  });

  it('honors explicit options', () => {
    const match = scriptedMatch({
      playerCount: 3,
      boardSize: 12,
      tickRateMs: 100,
      seed: 7,
      displayNames: ['X', 'Y', 'Z'],
    });
    expect(match.matchConfig.playerCount).toBe(3);
    expect(match.matchConfig.boardSize).toBe(12);
    expect(match.matchConfig.tickIntervalMs).toBe(100);
    expect(match.matchConfig.seed).toBe(7);
    expect(match.displayNames).toEqual(['X', 'Y', 'Z']);
  });

  it('produces a world with one home city per player at fixed corners', () => {
    const match = scriptedMatch({ playerCount: 2, boardSize: 10 });
    const world = match.engineSession.world();
    expect(world.board.cities).toHaveLength(2);
    expect(world.players).toHaveLength(2);
    // Opening stacks sit adjacent to each home city.
    let stackCells = 0;
    for (let i = 0; i < world.state.troopCounts.length; i++) {
      if ((world.state.troopCounts[i] ?? 0) > 0) {
        stackCells += 1;
      }
    }
    expect(stackCells).toBe(2);
  });

  it('rejects invalid options', () => {
    expect(() => scriptedMatch({ boardSize: 7 })).toThrow(/boardSize/);
    expect(() => scriptedMatch({ playerCount: 5 as 2 | 3 | 4 })).toThrow(/playerCount/);
    expect(() => scriptedMatch({ playerCount: 2, displayNames: ['only-one'] })).toThrow(
      /displayNames/,
    );
  });

  it('wraps the engine lifecycle: submit → advance → status', () => {
    const match = scriptedMatch();
    const before = match.engineSession.world();

    // A surrender order applies immediately per engine FR-016; use a
    // setReserves order on player 1's opening stack instead so we can
    // observe staging then ticking. Stack sits adjacent to the home
    // city at (1,1) → cell (2,1).
    const submitResult = match.engineSession.submit({
      kind: 'setReserves',
      player: 1 as PlayerId,
      cell: { x: 2, y: 1 },
      percent: 3,
    });
    expect(submitResult.ok).toBe(true);

    const advanced = match.engineSession.advance();
    expect(advanced.world).toBeDefined();
    expect(advanced.events).toBeDefined();

    const status: MatchResult | undefined = match.engineSession.status();
    // Nobody surrendered/eliminated yet — match continues.
    expect(status).toBeUndefined();

    // The world reference moved forward (tick produced a new object).
    expect(match.engineSession.world()).not.toBe(before);
  });

  it('is deterministic across two identical constructions', () => {
    const a = scriptedMatch({ seed: 99, boardSize: 8 });
    const b = scriptedMatch({ seed: 99, boardSize: 8 });
    const wa = a.engineSession.world();
    const wb = b.engineSession.world();
    expect(Array.from(wa.state.troopCounts)).toEqual(Array.from(wb.state.troopCounts));
    expect(Array.from(wa.state.cityOwners)).toEqual(Array.from(wb.state.cityOwners));
  });
});

describe('attachPlayersForMatch', () => {
  it('binds every seat and returns the tokens used', () => {
    const { server, attached } = fakeServer();
    const match = scriptedMatch({ playerCount: 2 });

    const tokens = attachPlayersForMatch(server, match);

    expect(attached).toHaveLength(2);
    expect(tokens).toHaveLength(2);
    expect(attached[0]?.matchId).toBe(match.matchId);
    expect(attached[0]?.playerId).toBe(1);
    expect(attached[1]?.playerId).toBe(2);
    expect(attached[0]?.sessionToken).toBe(tokens[0]);
    expect(attached[1]?.sessionToken).toBe(tokens[1]);
  });

  it('uses provided tokens when supplied', () => {
    const { server, attached } = fakeServer();
    const match = scriptedMatch({ playerCount: 2 });
    const provided: SessionToken[] = ['tok-a', 'tok-b'] as SessionToken[];

    const used = attachPlayersForMatch(server, match, provided);

    expect(used).toEqual(provided);
    expect(attached.map((req) => req.sessionToken)).toEqual(provided);
  });
});
