# `@europa/matchmaking`

Europa Neo match lifecycle & matchmaking — the ephemeral-session layer
that turns "who is playing whom" into a running simulation. It owns
player sessions, public/private match creation with atomic seat
assignment, the synchronous lobby projection, shareable join links,
the engine auto-start path (board generation → engine session →
networking registration), the rematch handshake for finished matches,
and the disconnect-forfeit policy. It consumes `@europa/engine`,
`@europa/terrain`, and `@europa/networking` type-only at its call
sites — zero runtime deps beyond the workspace packages it drives.

> **Determinism is non-negotiable** (constitution Principle II). The
> matchmaker never lets wall-clock or randomness reach game state:
> `now`, `randomId`, and `rngFactory` are injected dependencies;
> session tokens use the platform CSPRNG but are identity artifacts
> only. Every tunable number lives in `MATCHMAKING_CONSTANTS`.

---

## Install

From the monorepo root:

```bash
pnpm install
```

Matchmaking depends on `@europa/engine` + `@europa/terrain`
(runtime: board generation and session construction) and
`@europa/networking` (types only: the `Server` arrives injected).

## Build

```bash
pnpm --filter @europa/matchmaking build
```

Produces `dist/index.js` (ESM) and `dist/index.d.ts` (types) via `tsup`.

## Test

```bash
pnpm --filter @europa/matchmaking test              # full suite
pnpm --filter @europa/matchmaking test:unit         # unit only
pnpm --filter @europa/matchmaking test:quickstart   # Q-M01..Q-M08 scenarios
pnpm --filter @europa/matchmaking test:conformance  # upstream-shape drift catch
pnpm --filter @europa/matchmaking test:soak         # SC-005 (50 cycles)
pnpm --filter @europa/matchmaking test:coverage     # ≥80% every metric (merge gate)
```

## Lint / Format / Typecheck

```bash
pnpm --filter @europa/matchmaking lint          # biome check
pnpm --filter @europa/matchmaking format:check  # biome format --no-write
pnpm --filter @europa/matchmaking typecheck     # tsc --noEmit
```

---

## Quick usage

The canonical wiring example, verbatim from
`contracts/matchmaking-api.ts` (`createMatchmaker`'s `@example`):

```ts
import { createMatchmaker, MATCHMAKING_CONSTANTS } from '@europa/matchmaking';
import { createMatchServer, NETWORK_DEFAULT_CONFIG } from '@europa/networking';
import { createMatchSession } from '@europa/engine';
import { computePlayerView } from '@europa/fog';
import { generateBoard } from '@europa/terrain';
import { randomUUID } from 'node:crypto';

const server = createMatchServer(
  { ...NETWORK_DEFAULT_CONFIG, port: 8080 },
  {
    engine: { createMatchSession: (req) => createMatchSession(req) },
    fog:    { computePlayerView: ({ world, playerId, spectator }) =>
               computePlayerView(world, playerId, { spectator }) },
    matchmaker: matchmakerBridge, // wired below
    logger: console,
  },
);

const matchmaker = createMatchmaker(
  { publicBaseUrl: 'https://europa.example.com', ...MATCHMAKING_CONSTANTS },
  {
    server,
    logger: console,
    randomId: randomUUID,
    rngFactory: (seed) => createEngineRng(seed),
    now: () => Date.now(),
  },
);

await server.listen();
```

**Reality notes** (the contract example predates the shipped engine
surface — see `src/engineSession.ts` for the documented deviation):

- `@europa/engine` exports no `createMatchSession`; its public surface
  is the primitive lifecycle (`createWorld` / `applyCommand` / `tick` /
  `isTerminal`). The matchmaker wraps those primitives itself at
  auto-start — hosts do not need an engine factory here.
- `createEngineRng` is the engine's `createRng` export.
- Omitting `logger` gives you the no-op logger; omitting `randomId` /
  `rngFactory` / `now` gives you `crypto.randomUUID`, the engine's
  sfc32, and `Date.now`.

---

## Public API surface

Everything below is re-exported from `src/index.ts` (see
`dist/index.d.ts` after build); the source-of-truth contracts live at
`contracts/match-types.ts` and `contracts/matchmaking-api.ts`.

### Factory & lifecycle

| Symbol | Purpose |
|--------|---------|
| `createMatchmaker(config, deps)` | Construct the `Matchmaker`. No timers start — GC sweeps are lazy on read paths. |
| `matchmaker.createMatch(req)` | Create a public/private match; creator seated at index 0 (FR-002/FR-004). |
| `matchmaker.joinMatch(req)` | New join or reconnect; last fill atomically auto-starts the match (FR-007). |
| `matchmaker.leaveMatch(req)` | Uniform `match_not_found` gate today; full release semantics land with the host wave. |
| `matchmaker.listPublicMatches()` | Synchronous lobby projection — public + filling only (FR-005). |
| `matchmaker.requestRematch(req)` / `acceptRematch(req)` / `declineRematch(req)` | US4 rematch window anchored at finish time (FR-009). |
| `matchmaker.stats()` | Cheap `MatchmakerStats` snapshot for `/health`, metrics, soak tests. |
| `matchmaker.close()` | Graceful shutdown; clears all in-memory state; instance unusable after. |

### Runtime building blocks

| Symbol | Purpose |
|--------|---------|
| `MATCHMAKING_CONSTANTS` | The frozen default tunables (table below). |
| `MATCHMAKING_DEFAULT_CONFIG` | The same values as a ready-to-spread `MatchmakerConfig`. |
| `createStore()` | The in-memory match/session store (swappable in tests). |
| `makeError(code, message?)` | Construct a `MatchmakerError` payload. |
| `newMatchId` / `isValidMatchId` / `newMatchSeed` / `newPlayerSessionId` | Identity generation/validation helpers. |
| `newSessionToken` / `isValidSessionToken` | Bearer-token minting/validation (CSPRNG boundary). |

### Constants (`MATCHMAKING_CONSTANTS`)

| Field | Default | Description |
|-------|---------|-------------|
| `maxConcurrentMatches` | `64` | Max live (non-collected) matches on this server. |
| `emptyMatchTtlMs` | `300_000` (5 min) | Idle TTL before an unstarted (`filling`) match is garbage-collected (FR-011). |
| `resultsTtlMs` | `60_000` | Grace period for `finished` matches holding results before teardown. |
| `rematchWindowMs` | `60_000` | Rematch acceptance window on finished matches (FR-009). |
| `maxDisplayNameLength` | `32` | Display-name cap (FR-001). |
| `minDisplayNameLength` | `1` | Display-name floor. |
| `sweepIntervalMs` | `30_000` | Host scheduling hint for sweeps; the matchmaker itself runs them lazily on read paths. |

Every field is overridable per deployment via `MatchmakerConfig`.

### Error codes (`MatchmakerErrorCode`)

Expected failures return `{ ok: false, error: { code, message } }` —
they are results, never throws. Throws are reserved for invariant
violations (which crash the process by design).

| Code | Meaning |
|------|---------|
| `invalid_request` | Bad request shape (unknown visibility, empty displayName, bad settings). |
| `match_not_found` | Unknown id OR private-without-token OR collected — single code path, never leaks existence (FR-006). |
| `match_full` | All seats taken (including race losers for the last seat). |
| `match_not_joinable` | Match already running and this is not a reconnect. |
| `seat_taken` | Reconnect race: another connection claimed the seat first. |
| `session_invalid` | Token matches no seat in the match (or voter ineligible). |
| `session_expired` | Reconnect grace window expired. |
| `player_not_in_match` | Action references a player not seated in this match. |
| `rematch_window_closed` | Rematch request/vote after the window lapsed. |
| `rematch_not_offered` | No rematch pending for this match. |
| `rematch_already_voted` | Double-vote (already accepted or declined). |
| `rate_limited` | Server at maximum concurrent matches (per-player limits are future work). |
| `internal_error` | Catch-all; logged server-side, surfaced to clients as this code. |

---

## Testing your integration

Inject fakes through `MatchmakerDeps` — no sockets, no real engine:

```ts
import { createMatchmaker, MATCHMAKING_CONSTANTS } from '@europa/matchmaking';
import { FakeServer } from './tests/fixtures/fakeServer';

const clock = { value: 0 };
const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, {
  server: new FakeServer(),            // records registerMatch/attach/detach calls
  now: () => clock.value,              // deterministic clock
  randomId: () => `id-${n++}`,         // deterministic ids
  rngFactory: (seed) => myRng(seed),   // deterministic board generation
});
```

- **`FakeServer`** (`tests/fixtures/fakeServer.ts`) records every
  matchmaking→networking call and exposes `fireOn*` methods to invoke
  bridge callbacks (`onSeatExpired`, `onMatchTerminal`, …) on cue.
- **Sweeps are lazy**: advance the injected clock, then call
  `stats()` or `listPublicMatches()` to observe GC transitions —
  `vi.useFakeTimers()` works too (it mocks `Date.now`).
- **Determinism**: override `randomId` + `rngFactory` + `now` and the
  whole lifecycle replays byte-for-byte; see `tests/soak.test.ts`.

---

## Determinism

1. **No wall-clock in logic**: every timestamp enters via the injected
   `now`; sweeps compare against caller-time, never `Date.now()`.
2. **Randomness quarantined**: `randomId` mints identity artifacts
   (match ids, offer ids) only; the seeded `rngFactory` drives all
   board generation.
3. **Single constants location**: every tunable lives in
   `MATCHMAKING_CONSTANTS` / `MATCHMAKING_DEFAULT_CONFIG`.
4. **Pure core**: lifecycle transitions mutate records in place with
   caller-supplied timestamps; nothing reads a clock or CSPRNG.

Verified end-to-end by the SC-005 soak (50 cycles → zero leaks), the
conformance suite (upstream shapes pinned), and the Q-M01..Q-M08
quickstart scenarios.

---

## License

Open source; license TBD by the project owner.
