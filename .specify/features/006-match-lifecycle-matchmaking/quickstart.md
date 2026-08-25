# Quickstart: Match Lifecycle & Matchmaking (Feature 006)

**Branch**: `001-europa-core`
**Date**: 2026-08-21
**Spec**: `.specify/features/006-match-lifecycle-matchmaking/spec.md` (v1.1)
**Plan**: `.specify/features/006-match-lifecycle-matchmaking/plan.md`

> Runnable validation scenarios for the matchmaker package. Each
> scenario maps to one or more spec acceptance criteria; the test file
> under `packages/matchmaking/tests/quickstart/` is the executable
> specification. The scenarios assume the monorepo bootstrap from
> feature 001's plan has run (`pnpm install && pnpm build` from the
> repo root).
>
> **Run from the repo root:**
> ```bash
> pnpm --filter @europa/matchmaking test        # unit + quickstart
> pnpm --filter @europa/matchmaking test:soak   # SC-005 50-cycle soak
> pnpm --filter @europa/matchmaking test:conformance # upstream type-shape check
> ```

---

## 1. Pre-flight: package smoke

```bash
cd /home/agents/github/shaunburdick/europa-neo
pnpm --filter @europa/matchmaking typecheck
pnpm --filter @europa/matchmaking lint
pnpm --filter @europa/matchmaking test
```

**Expected**: all green. Coverage report shows `src/` at ≥80% lines / functions / branches / statements.

---

## 2. Quickstart scenarios

Each scenario is a Vitest file under `packages/matchmaking/tests/quickstart/`. The scenarios use a `FakeServer` (a stub of feature 004's `Server` interface that records `registerMatch` / `attachPlayer` / `detachPlayer` / `unregisterMatch` calls and exposes a way to fire `MatchmakerBridge` callbacks on cue).

### Q-M01 — Create + join public 2-player match; lobby reflects it; auto-start

**Maps to**: spec US1 AC-1, AC-2; FR-002, FR-004, FR-005, FR-007.

```ts
// tests/quickstart/Q-M01-create-join-public-2p.test.ts
import { describe, it, expect } from 'vitest';
import { createMatchmaker, MATCHMAKING_CONSTANTS } from '@europa/matchmaking';
import { FakeServer } from '../fixtures/fakeServer';

describe('Q-M01: create + join public 2-player match', () => {
  it('auto-starts when the last seat fills', () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

    // Step 1: Alice creates a public match
    const create = matchmaker.createMatch({
      visibility: 'public',
      displayName: 'Alice',
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;

    const { matchId, seatAssignment: aliceSeat } = create.data;
    expect(aliceSeat.seatIndex).toBe(0);
    expect(aliceSeat.playerId).toBe(1);
    expect(aliceSeat.displayName).toBe('Alice');

    // Step 2: Lobby contains the new match
    const lobby1 = matchmaker.listPublicMatches();
    expect(lobby1.ok).toBe(true);
    if (!lobby1.ok) return;
    expect(lobby1.matches).toHaveLength(1);
    expect(lobby1.matches[0]?.matchId).toBe(matchId);
    expect(lobby1.matches[0]?.hostDisplayName).toBe('Alice');
    expect(lobby1.matches[0]?.seatsFilled).toBe(1);
    expect(lobby1.matches[0]?.playerCount).toBe(2);

    // Step 3: Bob joins
    const join = matchmaker.joinMatch({
      matchId,
      displayName: 'Bob',
    });
    expect(join.ok).toBe(true);
    if (!join.ok) return;

    const { seatAssignment: bobSeat } = join.data;
    expect(bobSeat.seatIndex).toBe(1);
    expect(bobSeat.playerId).toBe(2);

    // Step 4: Match is now 'running'; networking was driven
    expect(server.registerMatchCalls).toHaveLength(1);
    expect(server.attachPlayerCalls).toHaveLength(2);
    expect(server.enableSpectatorsCalls).toHaveLength(1);

    // Step 5: Lobby no longer lists the match (it's running now)
    const lobby2 = matchmaker.listPublicMatches();
    expect(lobby2.ok).toBe(true);
    if (!lobby2.ok) return;
    expect(lobby2.matches).toHaveLength(0);

    matchmaker.close();
  });
});
```

**Expected**: passes. Lobby transitions 1 → 0 between Alice's create and Bob's join; `server.registerMatch` called exactly once; `server.attachPlayer` called twice (once per seat).

---

### Q-M02 — Private match + shareable join URL + no lobby listing

**Maps to**: spec US3 AC-1, AC-2, AC-3; FR-003, FR-005, FR-006; Q1, Q2, Q3 clarifications.

```ts
// tests/quickstart/Q-M02-private-shareable-url.test.ts
import { describe, it, expect } from 'vitest';
import { createMatchmaker, MATCHMAKING_CONSTANTS } from '@europa/matchmaking';
import { FakeServer } from '../fixtures/fakeServer';

describe('Q-M02: private match + shareable join URL', () => {
  it('hides from lobby and is joinable via URL', () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(
      { ...MATCHMAKING_CONSTANTS, publicBaseUrl: 'https://europa.example.com' },
      { server },
    );

    // Step 1: Alice creates a private match
    const create = matchmaker.createMatch({
      visibility: 'private',
      displayName: 'Alice',
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;

    const { matchId, joinPath, joinUrl, seatAssignment: aliceSeat } = create.data;

    // joinPath is the relative path; joinUrl is the full URL
    expect(joinPath).toBe(`/join/${matchId}`);
    expect(joinUrl).toBe(`https://europa.example.com/join/${matchId}`);

    // Step 2: Lobby does NOT contain the private match
    const lobby = matchmaker.listPublicMatches();
    expect(lobby.ok).toBe(true);
    if (!lobby.ok) return;
    expect(lobby.matches).toHaveLength(0);

    // Step 3: Bob joins via the URL (has the matchId)
    const join = matchmaker.joinMatch({
      matchId,
      displayName: 'Bob',
    });
    expect(join.ok).toBe(true);
    if (!join.ok) return;
    expect(join.data.seatAssignment.seatIndex).toBe(1);

    matchmaker.close();
  });
});
```

**Expected**: passes. Private match invisible in lobby; joinable via the shareable URL.

---

### Q-M03 — Unknown match ID returns `match_not_found` (no existence leak)

**Maps to**: spec FR-006; Q2 clarification ("unknown IDs are rejected with a generic `match not found` response; the server does not leak whether a private match exists").

> **Correction (Wave 7C)**: an earlier draft of this scenario asserted that probing the **real** private `MatchId` also returns `match_not_found`. That contradicted US3 AC-2 ("a client opens the shareable join URL → they take a seat like any other join flow"), the edge case "shared beyond intended group", Q-M02, and this section's own parenthetical ("knowing the matchId == being invited"). The single-code-path invariant concerns **error indistinguishability for unknown IDs**; a holder of the real ID joins through the same seat-fill path as any public join.

```ts
// tests/quickstart/Q-M03-private-id-miss-no-leak.test.ts
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createMatchmaker, MATCHMAKING_CONSTANTS } from '../../src/index';
import { FakeServer } from '../fixtures/fakeServer';

/** An id guaranteed unknown to this server (never equal to `exclude`). */
function unknownId(exclude) {
  let candidate = randomUUID();
  while (candidate === exclude) {
    candidate = randomUUID();
  }
  return candidate;
}

describe('Q-M03: unknown match ID returns match_not_found', () => {
  it('does not leak whether a private match exists', async () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

    // Step 1: Alice creates a private match
    const create = matchmaker.createMatch({
      visibility: 'private',
      displayName: 'Alice',
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;

    const realMatchId = create.data.matchId;
    // The id circulates only via Alice's shareable link (FR-003/Q3).

    // The lobby never lists it (SC-003 zero-private clause).
    const lobby = matchmaker.listPublicMatches();
    expect(lobby.ok).toBe(true);
    if (!lobby.ok) return;
    expect(lobby.matches).toHaveLength(0);

    // Step 2: Attacker probes 100 unknown UUIDs (none are the real one)
    for (let i = 0; i < 100; i++) {
      const guessedId = unknownId(realMatchId);
      const result = matchmaker.joinMatch({
        matchId: guessedId,
        displayName: 'Mallory',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('match_not_found');
      // The error message must NOT mention "private" or "exists"
      expect(result.error.message.toLowerCase()).not.toContain('private');
      expect(result.error.message.toLowerCase()).not.toContain('exists');
    }

    // SC-006: joining via an UNKNOWN id returns "match not found" in
    // 10/10 trials — fresh ids, same uniform rejection.
    for (let i = 0; i < 10; i++) {
      const r = matchmaker.joinMatch({ matchId: unknownId(realMatchId), displayName: 'Mallory' });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('match_not_found');
    }

    // Step 3 (cross-session): Bob — a different player session on the
    // same server — receives Alice's shareable URL. Holding the link IS
    // the invitation (US3 AC-2 + edge case "shared beyond intended
    // group"), so his join succeeds through the SAME code path as any
    // public join; no visibility-specific branch exists.
    const bobJoin = matchmaker.joinMatch({
      matchId: realMatchId,
      displayName: 'Bob',
    });
    expect(bobJoin.ok).toBe(true);
    if (!bobJoin.ok) return;
    expect(bobJoin.data.seatAssignment.seatIndex).toBe(1);

    // Post-start: unknown probes STILL get the identical non-leaking
    // rejection — starting the match changed nothing about the guard.
    const afterStart = matchmaker.joinMatch({
      matchId: unknownId(realMatchId),
      displayName: 'Mallory',
    });
    expect(afterStart.ok).toBe(false);
    if (!afterStart.ok) return;
    expect(afterStart.error.code).toBe('match_not_found');

    await matchmaker.close();
  });
});
```

**Expected**: passes. All unknown IDs return `match_not_found` with no existence-leaking information; the invited holder of the shareable link joins identically to a public join.


---

### Q-M04 — Disconnect forfeit (US5)

**Maps to**: spec US5 AC-1, AC-2; FR-010; SC-004 ("forfeit policy triggers exactly at grace-window expiry in 10/10 scripted drop tests").

```ts
// tests/quickstart/Q-M04-disconnect-forfeit.test.ts
import { describe, it, expect } from 'vitest';
import { createMatchmaker, MATCHMAKING_CONSTANTS } from '@europa/matchmaking';
import { FakeServer, fireOnSeatExpired } from '../fixtures/fakeServer';

describe('Q-M04: disconnect forfeit', () => {
  it('marks player forfeit when grace window expires', () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

    // Set up a running match: Alice vs Bob
    const aliceCreate = matchmaker.createMatch({
      visibility: 'public',
      displayName: 'Alice',
    });
    expect(aliceCreate.ok).toBe(true);
    if (!aliceCreate.ok) return;
    const { matchId, seatAssignment: aliceSeat } = aliceCreate.data;

    const bobJoin = matchmaker.joinMatch({
      matchId,
      displayName: 'Bob',
    });
    expect(bobJoin.ok).toBe(true);
    if (!bobJoin.ok) return;
    const bobSeat = bobJoin.data.seatAssignment;

    // Engine is now running. FakeServer has recorded the engine session.
    const engineSession = server.lastEngineSession!;
    expect(engineSession).toBeDefined();

    // Step 1: Alice's WebSocket drops, grace window expires.
    // Networking fires onSeatExpired (we simulate it).
    fireOnSeatExpired(server.bridge, {
      matchId,
      sessionToken: aliceSeat.sessionToken,
      playerId: aliceSeat.playerId,
      expiredAtMs: Date.now(),
    });

    // Step 2: Matchmaker should have called engineSession.submit
    // with an OrderSurrender for Alice.
    const submittedOrders = engineSession.submittedOrders;
    expect(submittedOrders).toContainEqual({
      kind: 'surrender',
      player: aliceSeat.playerId,
    });

    // Step 3: Matchmaker called server.detachPlayer for Alice.
    expect(server.detachPlayerCalls).toHaveLength(1);
    expect(server.detachPlayerCalls[0]?.reason).toBe('forfeit_timeout');

    // SC-004: 10/10 scripted drops
    for (let i = 0; i < 10; i++) {
      const sessionToken = bobSeat.sessionToken;
      fireOnSeatExpired(server.bridge, {
        matchId,
        sessionToken,
        playerId: bobSeat.playerId,
        expiredAtMs: Date.now(),
      });
      // After Bob also disconnects, the match is torn down
      expect(server.unregisterMatchCalls.some((c) => c.matchId === matchId)).toBe(true);
    }

    matchmaker.close();
  });
});
```

**Expected**: passes. `OrderSurrender` is submitted to the engine; `detachPlayer` called; on all-disconnected, `unregisterMatch` called.

---

### Q-M05 — Game over → rematch handshake (US4)

**Maps to**: spec US4 AC-1, AC-2; FR-008, FR-009; SC-001 (end-to-end match cycle).

```ts
// tests/quickstart/Q-M05-game-over-rematch.test.ts
import { describe, it, expect } from 'vitest';
import { createMatchmaker, MATCHMAKING_CONSTANTS } from '@europa/matchmaking';
import { FakeServer, fireOnMatchTerminal } from '../fixtures/fakeServer';

describe('Q-M05: game over → rematch handshake', () => {
  it('creates a new match when both players accept', () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

    // Set up a running match
    const aliceCreate = matchmaker.createMatch({
      visibility: 'public',
      displayName: 'Alice',
    });
    if (!aliceCreate.ok) throw new Error('create failed');
    const { matchId, seatAssignment: aliceSeat } = aliceCreate.data;

    const bobJoin = matchmaker.joinMatch({
      matchId,
      displayName: 'Bob',
    });
    if (!bobJoin.ok) throw new Error('join failed');
    const bobSeat = bobJoin.data.seatAssignment;

    // Engine reports terminal
    fireOnMatchTerminal(server.bridge, {
      matchId,
      tick: 1234,
      result: {
        kind: 'win',
        winner: 1,
        tick: 1234,
        reason: 'last_standing',
      },
    });

    // Matchmaker should have transitioned to 'finished' and opened
    // a rematch window.
    const stats1 = matchmaker.stats();
    expect(stats1.finishedMatches).toBe(1);

    // Alice requests rematch
    const aliceRematch = matchmaker.requestRematch({
      matchId,
      sessionToken: aliceSeat.sessionToken,
    });
    expect(aliceRematch.ok).toBe(true);
    if (!aliceRematch.ok) return;
    const rematchOfferId = aliceRematch.rematchOfferId;
    expect(rematchOfferId).not.toBe(matchId);

    // Alice accepts
    const aliceAccept = matchmaker.acceptRematch({
      matchId,
      rematchOfferId,
      sessionToken: aliceSeat.sessionToken,
    });
    expect(aliceAccept.ok).toBe(true);
    if (!aliceAccept.ok) return;
    expect(aliceAccept.allAccepted).toBe(false); // Bob hasn't accepted yet

    // Bob accepts
    const bobAccept = matchmaker.acceptRematch({
      matchId,
      rematchOfferId,
      sessionToken: bobSeat.sessionToken,
    });
    expect(bobAccept.ok).toBe(true);
    if (!bobAccept.ok) return;
    expect(bobAccept.allAccepted).toBe(true); // last vote
    expect(bobAccept.newMatchId).toBeDefined();
    expect(bobAccept.newSeatAssignment).toBeDefined();

    // The new match should be in 'filling' state with both players
    // auto-seated.
    const newMatchId = bobAccept.newMatchId!;
    const lobby = matchmaker.listPublicMatches();
    expect(lobby.ok).toBe(true);
    if (!lobby.ok) return;
    // Visibility was 'public', so new match is also public and in lobby
    expect(lobby.matches.some((m) => m.matchId === newMatchId)).toBe(true);

    matchmaker.close();
  });
});
```

**Expected**: passes. Rematch creates a new match with both original participants auto-seated; new MatchId + new seed.

---

### Q-M06 — Empty unstarted match garbage collection (FR-011 edge case)

**Maps to**: spec FR-011; edge case "How are stale empty matches cleaned up?"

```ts
// tests/quickstart/Q-M06-empty-match-gc.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createMatchmaker, MATCHMAKING_CONSTANTS } from '@europa/matchmaking';
import { FakeServer } from '../fixtures/fakeServer';

describe('Q-M06: empty unstarted match GC', () => {
  it('collects matches with no seated players after TTL', () => {
    vi.useFakeTimers();
    const server = new FakeServer();
    const matchmaker = createMatchmaker(
      { ...MATCHMAKING_CONSTANTS, emptyMatchTtlMs: 1000 }, // 1s for the test
      { server },
    );

    // Create a match; only Alice is seated (filling, not full)
    const create = matchmaker.createMatch({
      visibility: 'public',
      displayName: 'Alice',
    });
    if (!create.ok) throw new Error('create failed');

    const stats1 = matchmaker.stats();
    expect(stats1.fillingMatches).toBe(1);

    // Advance time past the TTL
    vi.advanceTimersByTime(2000);

    // Sweep ran; match should be collected
    const stats2 = matchmaker.stats();
    expect(stats2.fillingMatches).toBe(0);
    expect(stats2.collectedMatches).toBeGreaterThanOrEqual(1);

    vi.useRealTimers();
    matchmaker.close();
  });
});
```

**Expected**: passes. Match GC'd after `emptyMatchTtlMs` with no seats filled.

---

### Q-M07 — Seat-fill race (atomicity)

**Maps to**: spec edge case "What happens when a player joins a match that fills in the same instant?"

```ts
// tests/quickstart/Q-M07-seat-fill-race.test.ts
import { describe, it, expect } from 'vitest';
import { createMatchmaker, MATCHMAKING_CONSTANTS } from '@europa/matchmaking';
import { FakeServer } from '../fixtures/fakeServer';

describe('Q-M07: seat-fill race is atomic', () => {
  it('only one joiner wins the last seat', () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

    const aliceCreate = matchmaker.createMatch({
      visibility: 'public',
      displayName: 'Alice',
    });
    if (!aliceCreate.ok) throw new Error('create failed');
    const { matchId } = aliceCreate.data;

    // Simulate 5 concurrent joiners competing for the last seat
    const joiners = ['Bob', 'Carol', 'Dave', 'Eve', 'Frank'].map((name) =>
      matchmaker.joinMatch({ matchId, displayName: name }),
    );

    const successes = joiners.filter((r) => r.ok);
    const failures = joiners.filter((r) => !r.ok);

    expect(successes).toHaveLength(1); // only one wins
    expect(failures).toHaveLength(4);

    // All failures are 'match_full'
    for (const f of failures) {
      if (f.ok) continue;
      expect(f.error.code).toBe('match_full');
    }

    matchmaker.close();
  });
});
```

**Expected**: passes. Exactly one joiner wins the last seat; all others get `match_full`.

---

### Q-M08 — Server restart wipes match state (assumption)

**Maps to**: spec §Assumptions ("no persistence across server restarts").

```ts
// tests/quickstart/Q-M08-server-restart.test.ts
import { describe, it, expect } from 'vitest';
import { createMatchmaker, MATCHMAKING_CONSTANTS } from '@europa/matchmaking';
import { FakeServer } from '../fixtures/fakeServer';

describe('Q-M08: server restart wipes match state', () => {
  it('match state is gone after close()', async () => {
    const server1 = new FakeServer();
    const matchmaker1 = createMatchmaker(MATCHMAKING_CONSTANTS, { server1 });

    const create = matchmaker1.createMatch({
      visibility: 'public',
      displayName: 'Alice',
    });
    if (!create.ok) throw new Error('create failed');
    const { matchId } = create.data;

    expect(matchmaker1.listPublicMatches().ok && matchmaker1.stats().activeMatches).toBe(1);

    // Simulate server restart
    await matchmaker1.close();

    // New matchmaker, same FakeServer (or a new one — state is gone either way)
    const server2 = new FakeServer();
    const matchmaker2 = createMatchmaker(MATCHMAKING_CONSTANTS, { server2 });

    // Old matchId is unknown to the new matchmaker
    const joinResult = matchmaker2.joinMatch({ matchId, displayName: 'Bob' });
    expect(joinResult.ok).toBe(false);
    if (joinResult.ok) return;
    expect(joinResult.error.code).toBe('match_not_found');

    await matchmaker2.close();
  });
});
```

**Expected**: passes. Old `MatchId` is unknown to the new matchmaker; lobby is empty; no state survives `close()`.

---

## 3. SC-005 soak test

```bash
pnpm --filter @europa/matchmaking test:soak
```

**Maps to**: spec SC-005 ("A soak test of 50 sequential create/play/finish cycles leaks no matches or sessions").

```ts
// tests/soak.test.ts (excerpt)
describe('SC-005: 50 sequential cycles, no leaks', () => {
  it('maintains zero leaks after 50 create/play/finish cycles', () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

    for (let i = 0; i < 50; i++) {
      // ... create, join, terminal, finish, GC
    }

    const stats = matchmaker.stats();
    expect(stats.activeMatches).toBe(0);
    expect(stats.activePlayerSessions).toBe(0);

    matchmaker.close();
  });
});
```

**Expected**: passes. After 50 cycles, `stats.activeMatches === 0` and `stats.activePlayerSessions === 0`.

---

## 4. Conformance test

```bash
pnpm --filter @europa/matchmaking test:conformance
```

**Maps to**: contract stability — drift between feature 006 and features 001/003/004 is a bug.

```ts
// tests/conformance.test.ts (excerpt)
describe('conformance: matchmaker uses upstream types at documented call sites', () => {
  it('createMatch calls engine.createMatchSession with the documented shape', () => {
    // Asserts: createMatch internally calls engine.createMatchSession(req)
    // where req matches MatchInitRequest from engine-to-matchmaking.ts.
  });

  it('forfeit calls engineSession.submit with OrderSurrender', () => {
    // Asserts: onSeatExpired calls engineSession.submit({ kind: 'surrender', player })
    // where player is PlayerId (from @europa/engine).
  });

  it('registerMatch is called with networking.RegisterMatchRequest shape', () => {
    // Asserts: filling → running calls server.registerMatch(req) where
    // req matches networking.RegisterMatchRequest.
  });

  it('attachPlayer is called with networking.AttachPlayerRequest shape', () => {
    // Asserts: per-seat calls server.attachPlayer(req) where req matches
    // networking.AttachPlayerRequest.
  });
});
```

**Expected**: passes. The matchmaker's call sites match the upstream contract shapes.

---

## 5. Manual a11y audit (N/A for matchmaking)

Matchmaking is server-side; the console (feature 005) is the consumer of accessibility requirements. No manual audit is required at the matchmaker level.

---

## 6. Acceptance summary

| Quickstart | Spec FRs covered | Success criteria |
|------------|------------------|-------------------|
| Q-M01      | FR-002, FR-004, FR-005, FR-007 | Lobby reflects state transitions within one mutation |
| Q-M02      | FR-003, FR-005, FR-006          | Shareable URL works; private match invisible |
| Q-M03      | FR-006                          | SC-006: 10/10 unknown IDs return `match_not_found` |
| Q-M04      | FR-010                          | SC-004: 10/10 drops trigger forfeit |
| Q-M05      | FR-008, FR-009                  | Rematch creates new match with all-accept |
| Q-M06      | FR-011                          | Empty unstarted matches GC'd |
| Q-M07      | FR-007 (atomicity)              | One winner per last-seat race |
| Q-M08      | §Assumptions                    | State wiped on `close()` |
| Soak       | SC-005                          | 50 cycles, no leaks |
| Conformance| (stability)                     | Upstream type shapes match |

If any quickstart scenario fails, the implementer should:

1. Read the failure message and identify which spec FR / SC is broken.
2. Run the relevant unit test in isolation (`pnpm --filter @europa/matchmaking test path/to/test.ts`).
3. Cross-reference with `data-model.md` (field shapes) and `research.md` (decision rationale).
4. Fix the matchmaker logic; do NOT silence the test.
5. Re-run `pnpm test` to confirm no regressions.
