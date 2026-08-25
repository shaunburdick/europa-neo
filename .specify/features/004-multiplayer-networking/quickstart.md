# Quickstart: Multiplayer Networking & Transport (Feature 004)

**Branch**: `001-europa-core` | **Date**: 2026-08-21 | **Spec**: `.specify/features/004-multiplayer-networking/spec.md`

> Runnable validation scenarios for feature 004. Each scenario is a
> Vitest test file under `packages/networking/tests/quickstart/` that
> can be executed in isolation or as part of the full suite. Every
> scenario is self-contained: it boots an in-memory `createMatchServer`
> (no live port, no external services), drives scripted WebSocket
> clients against it, and asserts behavior against the spec's
> acceptance criteria.
>
> **Run all networking quickstart tests**: `pnpm -F @europa/networking test quickstart/`
>
> **Run a single scenario**: `pnpm -F @europa/networking test quickstart/Q-N01-two-player-match.test.ts`

---

## Conventions for these scenarios

- **No real network I/O.** Each scenario uses a scripted in-memory
  `ws` client (`tests/fixtures/clients.ts`) that connects directly to
  the `createMatchServer` instance's underlying `WebSocketServer`. No
  TCP port is opened.
- **Determinism.** All scenarios use a fixed `seed` for engine setup,
  fixed display names, and scripted order sequences. Two runs of the
  same scenario produce byte-identical assertions.
- **Mock engine + fog.** For quickstart isolation, `ServerDeps.engine`
  and `ServerDeps.fog` may be the real `@europa/engine` + `@europa/fog`
  packages (no mocks). For scenarios that need injection (e.g., a
  scripted engine that returns a known terminal at tick 50), the
  fixture supports dependency swap.
- **Matchmaker bridge spy.** The matchmaker callbacks are recorded by
  a spy fixture (`tests/fixtures/matchmakerSpy.ts`) so scenarios can
  assert which events fired and when.

---

## Q-N01 — Two-player match on localhost (US1 / FR-001, FR-003, FR-005)

**Acceptance scenarios covered**:
1. Two clients connect, send valid orders, receive per-tick state filtered to their fog-of-war view.
2. Tick payloads are deltas (or skipped entirely for unchanged ticks).

```ts
// packages/networking/tests/quickstart/Q-N01-two-player-match.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMatchServer, NETWORK_DEFAULT_CONFIG } from '../../src';
import { createMatchSession } from '@europa/engine';
import { computePlayerView } from '@europa/fog';
import { ScriptedClient } from '../fixtures/clients';
import { MatchmakerSpy } from '../fixtures/matchmakerSpy';

describe('Q-N01 — two-player match on localhost', () => {
  let server: ReturnType<typeof createMatchServer>;
  let matchmaker: MatchmakerSpy;
  let client1: ScriptedClient;
  let client2: ScriptedClient;
  const MATCH_ID = 'match-001' as MatchId;

  beforeEach(async () => {
    matchmaker = new MatchmakerSpy();
    server = createMatchServer(
      { ...NETWORK_DEFAULT_CONFIG, tickRateMs: 50 },
      {
        engine: { createMatchSession: (req) => createMatchSession(req) },
        fog:   { computePlayerView: ({ world, playerId, spectator }) =>
                   computePlayerView(world, playerId, { spectator }) },
        matchmaker,
        logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      },
    );
    await server.listen();
  });

  afterEach(async () => { await server.close(); });

  it('connects two players, ticks, broadcasts fog-filtered views, acks orders', async () => {
    // Setup: register a 2-player match
    const engineSession = createMatchSession({
      matchId: MATCH_ID,
      config: { boardSize: 16, playerCount: 2, tickIntervalMs: 50, seed: 12345, visibilityRadius: 3 },
      board: scriptedBoard16x16(),
      displayNames: ['Alice', 'Bob'],
    });
    server.registerMatch({ matchId: MATCH_ID, engineSession, matchConfig: engineSession.world().config });
    server.attachPlayer({ matchId: MATCH_ID, playerId: 1, sessionToken: 'tok-1' as SessionToken, displayName: 'Alice' });
    server.attachPlayer({ matchId: MATCH_ID, playerId: 2, sessionToken: 'tok-2' as SessionToken, displayName: 'Bob' });

    // Connect both players
    client1 = new ScriptedClient(server);
    client2 = new ScriptedClient(server);
    await client1.connect();
    await client2.connect();
    await client1.joinMatch({ matchId: MATCH_ID, role: 'player', reconnectToken: 'tok-1' as SessionToken, displayName: 'Alice' });
    await client2.joinMatch({ matchId: MATCH_ID, role: 'player', reconnectToken: 'tok-2' as SessionToken, displayName: 'Bob' });

    // Verify joinAck received
    const joinAck1 = await client1.nextMessage('joinAck');
    expect(joinAck1.payload.playerId).toBe(1);
    expect(joinAck1.payload.view.tick).toBe(0);
    expect(joinAck1.payload.view.player).toBe(1);
    const joinAck2 = await client2.nextMessage('joinAck');
    expect(joinAck2.payload.playerId).toBe(2);

    // Send an order from player 1
    await client1.sendOrder({ kind: 'setPipe', player: 1, cell: { x: 5, y: 5 }, direction: 'N' });

    // Verify orderAck within one tick
    const ack = await client1.nextMessage('orderAck', { timeoutMs: 200 });
    expect(ack.payload.seq).toBeGreaterThan(0);
    expect(ack.payload.result.ok).toBe(true);

    // Wait for the next tick
    const tick = await client1.nextMessage('tick', { timeoutMs: 200 });
    expect(tick.payload.tick).toBeGreaterThan(0);
    expect(tick.payload.view.player).toBe(1);
    expect(tick.payload.view.visibleCells.length).toBeGreaterThan(0);

    // Fog enforcement: client1's view.player === 1; events filtered to player 1's horizon
    expect(tick.payload.view.player).toBe(1);

    // Client2 also received a tick with player 2's view
    const tick2 = await client2.nextMessage('tick', { timeoutMs: 200 });
    expect(tick2.payload.view.player).toBe(2);
  });

  it('skips the broadcast when nothing changed for the recipient', async () => {
    // ... boot same match ...
    // Wait for 5 ticks of inactivity
    await client1.collectMessages({ for: 250, kind: 'tick' });  // drain initial ticks
    const before = Date.now();
    const ticksReceived = await client1.collectMessages({ for: 250, kind: 'tick' });
    // With a scripted board and no orders, fog views are identical tick-to-tick
    // The server may still send ticks (it's a snapshot), but if the delta
    // detection passes it will skip the send entirely. Assert: <= number
    // of intervals elapsed (i.e., never more than one tick per interval).
    const intervals = Math.floor((Date.now() - before) / 50);
    expect(ticksReceived.length).toBeLessThanOrEqual(intervals);
  });
});
```

**Pass criteria**:
- Both players receive `joinAck` with the correct `PlayerId` and full
  `PlayerView`.
- Order sent by player 1 receives `orderAck` with `ok: true`.
- Subsequent `tick` broadcast carries the correct fog-filtered
  `PlayerView`.
- `bridge.onSeatClaimed` fires exactly twice (once per player).
- No `error` payloads received.

---

## Q-N02 — Disconnect mid-match (US1 / FR-009)

**Acceptance scenario covered**: When a player drops mid-match, the
server marks them disconnected; surviving players continue to receive
broadcasts.

```ts
// packages/networking/tests/quickstart/Q-N02-disconnect.test.ts
describe('Q-N02 — disconnect mid-match', () => {
  it('marks the seat disconnected and continues ticking for survivors', async () => {
    // ... boot match, connect both players (same setup as Q-N01) ...

    // Wait for at least 3 ticks to confirm the match is running
    await client1.collectMessages({ for: 150, kind: 'tick' });
    await client2.collectMessages({ for: 150, kind: 'tick' });

    // Player 1 disconnects abruptly (no clean close)
    client1.abruptClose();

    // Wait long enough for the server's heartbeat monitor to notice
    await delay(150);  // > 2× heartbeat interval at default 50 ms tick

    // Verify onSeatDisconnected fired
    expect(matchmaker.events.some((e) => e.kind === 'onSeatDisconnected'
      && e.payload.sessionToken === 'tok-1')).toBe(true);

    // Verify player 2 still receives ticks
    const tickAfterDisconnect = await client2.nextMessage('tick', { timeoutMs: 200 });
    expect(tickAfterDisconnect.payload.view.player).toBe(2);

    // Player 2 can still submit orders
    await client2.sendOrder({ kind: 'setPipe', player: 2, cell: { x: 7, y: 7 }, direction: 'E' });
    const ack = await client2.nextMessage('orderAck', { timeoutMs: 200 });
    expect(ack.payload.result.ok).toBe(true);
  });
});
```

**Pass criteria**:
- `bridge.onSeatDisconnected` fires for the dropped client.
- `reconnectGraceMs` timer is running (verified via matchmaker spy
  internal state).
- The surviving player continues to receive ticks and can submit
  orders without disruption.

---

## Q-N03 — Reconnection within timeout window (US2 / FR-007)

**Acceptance scenario covered**: A reconnecting player within the
grace window receives a fresh snapshot and continues per-tick updates.

```ts
// packages/networking/tests/quickstart/Q-N03-reconnect.test.ts
describe('Q-N03 — reconnect within grace window', () => {
  it('restores the seat and resends a snapshot on reconnect', async () => {
    // ... boot match, connect both, run a few ticks, disconnect player 1 ...

    // Wait less than reconnectGraceMs (default 60s; use 200ms in this test)
    await delay(50);

    // Player 1 reconnects with the same token
    client1 = new ScriptedClient(server);
    await client1.connect();
    await client1.joinMatch({ matchId: MATCH_ID, role: 'player', reconnectToken: 'tok-1' as SessionToken, displayName: 'Alice' });

    // Verify onSeatReconnected fired
    expect(matchmaker.events.some((e) => e.kind === 'onSeatReconnected')).toBe(true);

    // Verify a fresh snapshot was delivered
    const snapshot = await client1.nextMessage('snapshot', { timeoutMs: 200 });
    expect(snapshot.payload.world.tick).toBeGreaterThan(0);

    // Verify subsequent ticks resume
    const tick = await client1.nextMessage('tick', { timeoutMs: 200 });
    expect(tick.payload.tick).toBeGreaterThan(snapshot.payload.world.tick);
  });

  it('forfeits the seat after grace expiry', async () => {
    // ... boot match with reconnectGraceMs: 100, disconnect player 1 ...
    await delay(150);  // wait past grace
    expect(matchmaker.events.some((e) => e.kind === 'onSeatExpired'
      && e.payload.sessionToken === 'tok-1')).toBe(true);
  });
});
```

**Pass criteria**:
- Reconnect within window → `onSeatReconnected` fires, fresh
  `snapshot` delivered, per-tick broadcasts resume.
- Reconnect past window → `onSeatExpired` fires, matchmaker can
  apply forfeit policy.

---

## Q-N04 — Terminal match (US1 AC-3 / FR-003)

**Acceptance scenario covered**: A match ending sends `TerminalPayload`
to all connected players; connections transition to `terminal` state
and are closed cleanly.

```ts
// packages/networking/tests/quickstart/Q-N04-terminal.test.ts
describe('Q-N04 — terminal match', () => {
  it('sends terminal payload and closes cleanly when engine reports terminal', async () => {
    // Setup: use a mock engine that reports terminal at tick 3
    const mockEngine: EngineSession = makeScriptedEngine({
      terminalAtTick: 3,
      terminalResult: { kind: 'win', winner: 1, tick: 3, reason: 'last_standing' },
    });
    server.registerMatch({ matchId: MATCH_ID, engineSession: mockEngine, matchConfig: mockEngine.world().config });
    // ... attach players, connect, join ...

    // Wait for terminal payload
    const terminal = await client1.nextMessage('terminal', { timeoutMs: 500 });
    expect(terminal.payload.result).toEqual({
      kind: 'win', winner: 1, tick: 3, reason: 'last_standing',
    });

    // Verify onMatchTerminal fired
    expect(matchmaker.events.some((e) => e.kind === 'onMatchTerminal'
      && e.payload.result.kind === 'win')).toBe(true);

    // Verify socket closed cleanly (code 1000 or 1001)
    const closeCode = await client1.nextClose();
    expect([1000, 1001]).toContain(closeCode);
  });
});
```

**Pass criteria**:
- `terminal` payload delivered with engine's `MatchResult` body.
- `bridge.onMatchTerminal` fires exactly once.
- Connections transition to `closed` cleanly.

---

## Q-N05 — Determinism (SC-001: same order sequence → same tick outcomes)

**Acceptance scenario covered**: A scripted 5,000-tick match with
identical order sequences on two parallel runs produces
byte-identical tick payloads.

```ts
// packages/networking/tests/quickstart/Q-N05-determinism.test.ts
describe('Q-N05 — determinism (SC-001)', () => {
  it('5,000 ticks with identical inputs produce identical tick frame bytes', async () => {
    const seed = 0xDEADBEEF;
    const config = { boardSize: 32, playerCount: 2, tickIntervalMs: 1, seed, visibilityRadius: 4 };
    const orderScript = generateScriptedOrders(5000);  // deterministic LCG over seed

    // Run 1
    const run1Hashes = await runScriptedMatch({ config, orderScript, ticks: 5000 });

    // Run 2 (fresh server, same config, same script)
    const run2Hashes = await runScriptedMatch({ config, orderScript, ticks: 5000 });

    expect(run1Hashes).toEqual(run2Hashes);
    expect(run1Hashes.length).toBe(5000);
  });
});
```

**Helper**: `runScriptedMatch({ config, orderScript, ticks })` boots a
`createMatchServer` with `tickIntervalMs: 1`, registers the match,
connects two scripted clients, runs the order script, hashes every
tick payload via the engine's `hashWorld` (re-applied to fog's
`PlayerView`), and returns the array of hashes.

**Pass criteria**:
- Both runs produce identical hashes for all 5,000 ticks.
- Hash count equals 5,000 (no ticks dropped).
- The `SC-001` acceptance criterion (≥5,000 ticks with zero protocol
  errors) is satisfied by the run completing without any `error`
  frames.

---

## Q-N06 — Invalid order rejected (US1 AC-3)

**Acceptance scenario covered**: An order that violates engine
validation (e.g., pipe into water) is rejected with `orderAck.ok:
false`; game state is unaffected.

```ts
// packages/networking/tests/quickstart/Q-N06-invalid-order.test.ts
describe('Q-N06 — invalid order rejected', () => {
  it('rejects a pipe-into-water order and surfaces the ValidationError', async () => {
    // ... boot match on a board where (3, 3) is water ...
    await client1.joinMatch({ matchId: MATCH_ID, role: 'player', reconnectToken: 'tok-1' as SessionToken, displayName: 'Alice' });

    const worldBefore = client1.lastView();

    await client1.sendOrder({ kind: 'setPipe', player: 1, cell: { x: 3, y: 3 }, direction: 'N' });
    const ack = await client1.nextMessage('orderAck');
    expect(ack.payload.result.ok).toBe(false);
    expect(ack.payload.result.reason.kind).toBe('water_target');
    expect(ack.payload.result.reason.coord).toEqual({ x: 3, y: 3 });

    // Game state unchanged
    const worldAfter = client1.lastView();
    expect(hashWorld(worldAfter)).toBe(hashWorld(worldBefore));
  });
});
```

**Pass criteria**:
- `orderAck` carries `{ ok: false, reason: { kind: 'water_target', ... } }`.
- Subsequent ticks show no state change at the rejected cell.
- No `error` frame is sent (validation failures are not protocol errors).

---

## Q-N07 — Rate limit triggered (FR-010)

**Acceptance scenario covered**: A client exceeding the configured
order rate receives `error` frames with code `rate_limited`; excess
orders are not staged.

```ts
// packages/networking/tests/quickstart/Q-N07-rate-limit.test.ts
describe('Q-N07 — rate limit', () => {
  it('drops orders beyond the bucket capacity with rate_limited error', async () => {
    // Use ordersPerSecond: 5, burstFactor: 2 → bucket = 10
    const server = createMatchServer(
      { ...NETWORK_DEFAULT_CONFIG, tickRateMs: 50, ordersPerSecond: 5, rateLimitBurstFactor: 2 },
      deps,
    );
    // ... boot match, connect player 1 ...

    // Fire 15 orders in rapid succession (within 100ms)
    const acks = await Promise.all(
      Array.from({ length: 15 }, () => client1.sendOrder(makeRandomOrder()))
    );

    // First ~10 should succeed (bucket capacity); the rest should rate-limit
    const rateLimitErrors = client1.errors.filter((e) => e.code === 'rate_limited');
    expect(rateLimitErrors.length).toBeGreaterThan(0);
    expect(rateLimitErrors.length).toBeLessThanOrEqual(5);

    // Successful orders (≤10) produced orderAck.ok=true; rate-limited ones produced error frames
    // Verify the engine's pending queue received only the successful ones
    const engine = server.getEngineForTesting(MATCH_ID);
    expect(engine.pendingOrderCount).toBeLessThanOrEqual(10);
  });
});
```

**Pass criteria**:
- Orders beyond `bucket capacity` receive `error` frames with code
  `rate_limited`.
- The engine's pending order queue contains only the accepted orders.
- After 1 second of idle, the bucket refills and orders are accepted
  again.

---

## Q-N08 — Spectator join + read-only enforcement (US3 / FR rejection)

**Acceptance scenario covered**: A spectator connects mid-match,
receives full-board per-tick updates, and is rejected when submitting
orders.

```ts
// packages/networking/tests/quickstart/Q-N08-spectator.test.ts
describe('Q-N08 — spectator join + read-only', () => {
  it('connects a spectator with full-board views and rejects orders', async () => {
    // ... boot match with two players, enableSpectators(matchId) ...

    const spectator = new ScriptedClient(server);
    await spectator.connect();
    await spectator.joinMatch({ matchId: MATCH_ID, role: 'spectator', displayName: 'Watcher' });

    const joinAck = await spectator.nextMessage('joinAck');
    expect(joinAck.payload.playerId).toBeNull();
    // Full board: every cell is visible
    const totalCells = joinAck.payload.view.config.boardSize ** 2;
    expect(joinAck.payload.view.visibleCells.length).toBe(totalCells);

    // Spectator receives per-tick full-board updates
    const tick = await spectator.nextMessage('tick');
    expect(tick.payload.view.visibleCells.length).toBe(totalCells);

    // Spectator-submitted order is rejected
    await spectator.sendOrder({ kind: 'setPipe', player: 1, cell: { x: 5, y: 5 }, direction: 'N' });
    const error = await spectator.nextMessage('error');
    expect(error.payload.code).toBe('spectator_readonly');
  });

  it('rejects a spectator join when spectators are disabled', async () => {
    // ... boot match WITHOUT enableSpectators ...
    const spectator = new ScriptedClient(server);
    await spectator.connect();
    await spectator.joinMatch({ matchId: MATCH_ID, role: 'spectator', displayName: 'Watcher' });
    const error = await spectator.nextMessage('error');
    expect(error.payload.code).toBe('match_not_joinable');  // or 'spectator_readonly'
  });
});
```

**Pass criteria**:
- Spectator receives `joinAck` with `playerId: null` and a full-board
  `PlayerView`.
- Per-tick broadcasts include every cell.
- Spectator-submitted orders get `error` with `code: 'spectator_readonly'`.
- Join attempt before `enableSpectators` is rejected.

---

## Q-N09 — Many concurrent matches (SC-005: ≥10 matches without degradation)

**Acceptance scenario covered**: A single server hosts ≥10 concurrent
matches, each running 100 ticks; per-tick duration stays within 10%
of single-match baseline.

```ts
// packages/networking/tests/quickstart/Q-N09-concurrency.test.ts
describe('Q-N09 — concurrent matches (SC-005)', () => {
  it('hosts 12 concurrent matches with per-tick degradation < 10%', async () => {
    const server = createMatchServer(
      { ...NETWORK_DEFAULT_CONFIG, tickRateMs: 250 },
      deps,
    );
    await server.listen();

    // Baseline: 1 match, measure average tick duration over 100 ticks
    const baseline = await runMatchAndMeasureTicks({ server, matchCount: 1, ticks: 100 });
    await server.close();

    // Real run: 12 matches
    const server2 = createMatchServer(
      { ...NETWORK_DEFAULT_CONFIG, tickRateMs: 250 },
      deps,
    );
    await server2.listen();
    const concurrent = await runMatchAndMeasureTicks({ server: server2, matchCount: 12, ticks: 100 });
    await server2.close();

    // Per-match average tick duration should be within 10% of baseline
    const ratio = concurrent.avgTickMs / baseline.avgTickMs;
    expect(ratio).toBeLessThan(1.10);
  });
});
```

**Pass criteria**:
- All 12 matches complete 100 ticks each without dropped frames.
- Per-match average tick duration is within 10% of single-match
  baseline.
- `server.stats().activeMatches === 12` during the run.

---

## Q-N10 — Schema versioning enforcement (FR-004)

**Acceptance scenario covered**: A client presenting a mismatched
protocol version is rejected with `version_mismatch` and a clean
close.

```ts
// packages/networking/tests/quickstart/Q-N10-version-mismatch.test.ts
describe('Q-N10 — schema versioning', () => {
  it('rejects a client whose hello.protocolVersion major differs from NETWORK_API_VERSION', async () => {
    const client = new ScriptedClient(server);
    await client.connect();
    await client.sendRaw({
      type: 'hello',
      version: '99.0.0',  // different major
      seq: 1,
      payload: { protocolVersion: '99.0.0' },
    });

    const error = await client.nextMessage('error');
    expect(error.payload.code).toBe('version_mismatch');

    const closeCode = await client.nextClose();
    expect(closeCode).toBe(1008);  // policy violation
  });

  it('accepts a client whose hello.protocolVersion minor differs (forward-compat)', async () => {
    // ... send hello with '0.2.0' (different minor, same major) ...
    // Server should accept and respond with helloAck
    const ack = await client.nextMessage('helloAck');
    expect(ack.payload.protocolVersion).toBe(NETWORK_API_VERSION);
  });
});
```

**Pass criteria**:
- Major-version mismatch → `error.code = 'version_mismatch'`, ws close 1008.
- Pre-1.0 minor drift (e.g., `0.1.0` client ↔ `0.2.0` server) → also
  rejected: pre-1.0 minors are the breaking boundary (Clarifications
  v1.1 ruling, implemented in Wave 6B-1).
- Patch drift within a minor (`0.1.x` ↔ `0.1.y`) → accepted; server
  responds with its current `NETWORK_API_VERSION` in `helloAck`.

---

## Summary table

| Scenario | Spec FR | SC | What it asserts |
|----------|---------|----|-----------------|
| Q-N01 | FR-001, FR-003, FR-005 | — | Two players connect, send orders, receive tick broadcasts |
| Q-N02 | FR-009 | — | Disconnect mid-match; survivors continue |
| Q-N03 | FR-007 | SC-003 | Reconnect within window; resync snapshot |
| Q-N04 | FR-003 | — | Terminal match; payload + clean close |
| Q-N05 | FR-008 | SC-001 | 5,000-tick determinism |
| Q-N06 | — | — | Invalid order rejected with `ValidationError` |
| Q-N07 | FR-010 | — | Rate limit drops excess with `rate_limited` |
| Q-N08 | (US3) | — | Spectator join + read-only enforcement |
| Q-N09 | — | SC-005 | ≥10 concurrent matches, <10% degradation |
| Q-N10 | FR-004 | — | Schema version mismatch rejected |

All scenarios run under `pnpm -F @europa/networking test quickstart/`.
The full suite (unit + fixtures + quickstart + determinism +
conformance + perf) must pass with coverage ≥80% before phase 6
completes.

---

## Validation results (Phase 6 polish, 2026-08-22)

The scenario files referenced above (`tests/quickstart/Q-N*.test.ts`)
were written as **illustrative pseudo-code** during planning; the
shipped suite covers every scenario by meaning, organized by test
layer instead of one-file-per-scenario (see deviations below). Final
mapping of each Q-N item to its covering suites:

| Scenario | Covered by |
|----------|------------|
| Q-N01 two-player match | `tests/integration/us1-acceptance.test.ts` — real server, both players hello/join/order, tick broadcasts with per-player fog views |
| Q-N02 disconnect mid-match | `tests/unit/server.test.ts` ("transport close releases the seat and fires onSeatDisconnected") + `tests/integration/us2-acceptance.test.ts` (match continues; survivor keeps ticking) |
| Q-N03 reconnect within grace | `tests/integration/us2-acceptance.test.ts` — token reclaim inside the grace window, resync snapshot + replay, expiry path |
| Q-N04 terminal match | `tests/unit/server.test.ts` ("terminal results fan out once per connection and fire onMatchTerminal exactly once") |
| Q-N05 determinism (SC-001) | `tests/integration/tick-determinism.test.ts` — scripted match replayed byte-for-byte |
| Q-N06 invalid order rejected | `tests/unit/orders.test.ts` (validation + spectator_readonly) + `tests/unit/server.test.ts` (protocol sequence errors) |
| Q-N07 rate limit | `tests/integration/rate-limit.test.ts` (wire-level burst: capacity, rejects, canonical drain) + `tests/unit/orders.test.ts` (bucket refill semantics) |
| Q-N08 spectator join + read-only | `tests/integration/us3-acceptance.test.ts` (+ `tests/unit/spectator.test.ts`, gate tests in `unit/server.test.ts`) |
| Q-N09 concurrent matches (SC-005) | `tests/unit/server.test.ts` (registry caps) + `tests/integration/perf.test.ts` sustained-cadence soak — measurement protocol per spec Clarifications v1.1 |
| Q-N10 version policy | `tests/integration/version-mismatch.test.ts` (+ unit coverage in `unit/validate.test.ts`, `unit/server.test.ts`) |

Plus cross-cutting enforcement not in the original table:
`tests/contracts-conformance.test.ts` (byte-identity of contract
mirrors, engine/fog type conformance, union exhaustiveness).

**Deviations from this document as planned**:

1. The per-scenario quickstart files were never created; coverage is
   by meaning across unit/integration layers (rationale in spec
   Clarifications v1.1). The fixture APIs shown in the snippets above
   (`tests/fixtures/clients.ts`, `matchmakerSpy.ts`) are illustrative;
   the real equivalents are `tests/fixtures/conn.ts`,
   `tests/fixtures/match.ts`, and `tests/integration/harness.ts`.
2. Q-N10's original pass criteria accepted minor drift; the shipped
   policy (PM ruling, Wave 6B-1) treats pre-1.0 minors as breaking.
   Corrected in place above.
3. Q-N09's timed "≥10 concurrent matches without >10% degradation"
   soak was replaced by the SC-005 sustained-cadence protocol (flaky
   on shared CI runners); concurrency safety stays with registry unit
   tests. See spec Clarifications v1.1.
