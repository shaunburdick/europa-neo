/**
 * Integration Test Harness — Feature 004 US1 (T032/T033 support)
 *
 * Shared plumbing for the US1 acceptance + determinism suites: real
 * engine + fog dependencies, MockWebSocket clients injected through
 * the server's test seam (no TCP port), an accelerated tick rate so
 * 100-tick runs finish in ~1 s of wall clock, and a `wireShape`
 * helper mirroring the frame encoder's `Set` → sorted-array transform
 * for view comparisons.
 */

import type { PlayerId } from '@europa/engine';
import { computePlayerView } from '@europa/fog';

import { NETWORK_DEFAULT_CONFIG } from '../../src/contracts/network-api';
import { createMatchServer } from '../../src/server';
import type { ServerConfig, ServerDeps } from '../../src/types';
import { NULL_LOGGER } from '../../src/types';
import { MockWebSocket, ScriptedClient } from '../fixtures/conn';
import { attachPlayersForMatch, type ScriptedMatch, scriptedMatch } from '../fixtures/match';

/** Accelerated tick cadence for integration runs (10× faster than default). */
export const TEST_TICK_MS = 10;

/** Server config under test: accelerated ticks + ephemeral port (we
 * never accept real connections; clients ride the mock seam), so
 * parallel harness instances can't collide on 8080. The order rate
 * limit is raised far above the scripted submission pace: the bucket
 * refill is wall-clock-driven, so a tight limit would make accept/
 * reject decisions depend on scheduler jitter and break the SC-001
 * byte-identical-stream guarantee the determinism suite asserts. */
export function testServerConfig(): ServerConfig {
  return {
    ...NETWORK_DEFAULT_CONFIG,
    tickRateMs: TEST_TICK_MS,
    port: 0,
    ordersPerSecond: 1000,
  };
}

/**
 * Real engine/fog deps: fog adapted to the contract's object-arg seam.
 * The engine factory throws — sessions come pre-built from fixtures.
 */
export function realDeps(): ServerDeps {
  return {
    engine: {
      createMatchSession: () => {
        throw new Error('engine factory not used by fixtures (sessions are pre-built)');
      },
    },
    fog: {
      computePlayerView: ({ world, playerId, spectator }) =>
        computePlayerView(world, playerId, { spectator }),
    },
    matchmaker: {},
    logger: NULL_LOGGER,
  };
}

/**
 * Deterministic fog stub for the determinism suite. View content is a
 * pure function of `(world.tick, playerId)`, so every boundary emits a
 * changed view (no skip-send silence when the real economy reaches a
 * fixed point) while cross-run byte-identity still verifies the full
 * protocol path: envelope construction, seq stamping, FR-018 drain
 * order, and payload assembly over the REAL engine + REAL orders.
 * (Real-fog projection fidelity is covered by the acceptance suite.)
 *
 * The contract's `ServerDeps` explicitly blesses deterministic fog
 * mocks for exactly this kind of protocol testing.
 */
export function stubFogDeps(): ServerDeps {
  return {
    engine: {
      createMatchSession: () => {
        throw new Error('engine factory not used by fixtures (sessions are pre-built)');
      },
    },
    fog: {
      computePlayerView: ({ world, playerId }) => ({
        player: playerId,
        tick: world.tick,
        visibleCells: [
          {
            coord: { x: 0, y: 0 },
            cell: { x: 0, y: 0, elevation: 0, terrain: 'land' },
            troopCount: world.tick * 10 + playerId,
            troopOwner: playerId,
            pipes: new Set(),
            reservesPercent: 0,
            cityOwner: null,
          },
        ],
      }),
    },
    matchmaker: {},
    logger: NULL_LOGGER,
  };
}

/**
 * Structural bridge to the server's internal `__injectSocketForTest`
 * seam. Declared locally so the public `Server` surface stays the
 * only typed dependency of callers.
 *
 * @param server Server under test.
 * @param socket Mock socket to attach.
 */
export function injectSocket(server: Server, socket: MockWebSocket): void {
  const seam = (
    server as unknown as {
      __injectSocketForTest?: (s: MockWebSocket) => void;
    }
  ).__injectSocketForTest;
  if (!seam) {
    throw new Error('server does not expose __injectSocketForTest');
  }
  seam(socket);
}

/**
 * Attach a fresh {@link MockWebSocket} to the server's test seam and
 * return a {@link ScriptedClient} speaking through it.
 *
 * @param server Server under test.
 * @returns The client driver.
 */
export function connectMockClient(server: Server): ScriptedClient {
  const socket = new MockWebSocket();
  injectSocket(server, socket);
  return new ScriptedClient(socket);
}

/** A fully-joined two-player match ready to tick. */
export interface JoinedHarness {
  readonly server: ReturnType<typeof createMatchServer>;
  readonly match: ScriptedMatch;
  /** Session tokens by seat order (index = playerId − 1). */
  readonly tokens: ReadonlyArray<string>;
  /** Joined player clients, index 0 = seat 1. */
  readonly clients: [ScriptedClient, ScriptedClient];
}

/**
 * Boot a ticking server with one registered 2-player scripted match,
 * both seats attached, and both clients through hello → joinMatch.
 *
 * @param deps Server dependencies. Defaults to real engine + real fog
 *             (acceptance suite); pass {@link stubFogDeps} for the
 *             determinism suite.
 * @returns The harness (callers must `await h.server.close()`).
 */
export async function startJoinedMatch(deps: ServerDeps = realDeps()): Promise<JoinedHarness> {
  const server = createMatchServer(testServerConfig(), deps);
  // listen() starts the tick scheduler; port 0 binds an ephemeral
  // port we never use (clients ride the mock injection seam).
  await server.listen();

  const match = scriptedMatch({ boardSize: 8, tickRateMs: TEST_TICK_MS });
  server.registerMatch({
    matchId: match.matchId,
    engineSession: match.engineSession,
    matchConfig: match.matchConfig,
  });
  const tokens = attachPlayersForMatch(server, match);

  const client1 = connectMockClient(server);
  const client2 = connectMockClient(server);
  client1.hello();
  client2.hello();
  await client1.nextMessage('helloAck');
  await client2.nextMessage('helloAck');
  client1.joinMatch(match.matchId, 'player', { requestedSeat: 1 });
  client2.joinMatch(match.matchId, 'player', { requestedSeat: 2 });
  await client1.nextMessage('joinAck');
  await client2.nextMessage('joinAck');

  return {
    server,
    match,
    tokens,
    clients: [client1, client2],
  };
}

/**
 * Mirror the frame encoder's Set-aware serialization so decoded wire
 * payloads can be compared against freshly computed views (whose
 * `pipes` fields are `ReadonlySet`s).
 *
 * @param value Any JSON-ish structure possibly containing Sets.
 * @returns The plain-object wire shape.
 */
export function wireShape(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, v) => (v instanceof Set ? [...v].sort() : v)));
}

/**
 * Deterministic always-valid order for a seat, varying only by loop
 * index. Even iterations set a pipe from the seat's home city, odd
 * iterations clear it — two kinds per player exercise the FR-018
 * `(playerId, kind)` drain sort, and city ownership is permanent
 * (no combat in this script), so acceptance never depends on how
 * earlier orders reshaped the board.
 *
 * @param seat  Player id (1-based).
 * @param index Loop index selecting kind + direction cycle.
 * @returns An engine-valid pipe order anchored at that seat's city.
 */
export function scriptedPipeOrder(
  seat: 1 | 2,
  index: number,
): {
  kind: 'setPipe' | 'clearPipe';
  player: PlayerId;
  cell: { x: number; y: number };
  direction: 'N' | 'E' | 'S' | 'W';
} {
  const directions = ['N', 'E', 'S', 'W'] as const;
  const direction = directions[index % directions.length] as 'N' | 'E' | 'S' | 'W';
  const kind = index % 2 === 0 ? 'setPipe' : 'clearPipe';
  // Seat cities on the 8×8 board: P1 (1,1), P2 (6,6). City cells are
  // permanently owned sources; their neighbors are flat land.
  const cell = seat === 1 ? { x: 1, y: 1 } : { x: 6, y: 6 };
  return { kind, player: seat as PlayerId, cell, direction };
}
