# Quickstart and Acceptance Checklist: Issue #74

This document is a Phase 6 validation recipe. It intentionally contains no
implementation result claims until delivery is complete.

## Focused checks by wave

```bash
pnpm --filter @europa/core test:unit
pnpm --filter @europa/engine test:unit
pnpm --filter @europa/engine test:replay
pnpm --filter @europa/terrain test
pnpm --filter @europa/fog test
pnpm --filter @europa/matchmaking test
pnpm --filter @europa/networking test
pnpm --filter @europa/console test:unit
pnpm --filter @europa/console test:component
pnpm --filter @europa/console test:e2e
```

Use the package scripts in `package.json` if a focused script name differs; do
not invent a second test harness. Tests excluded from package tsconfig must be
covered by the repository's existing strict conformance programs.

## Required acceptance scenarios

1. Generate a large sample of IDs; every value matches the exact regex/alphabet,
   no duplicates occur in the active registry, and a forced collision retries or
   fails closed.
2. Feed malformed, numeric, duplicate, missing, and extra IDs to core, engine,
   fog, and wire validators; each fails without partial state mutation.
3. Run an engine script with explicit IDs in two insertion orders and compare
   canonical serialization, tick hashes, replay results, event ordering, and
   terminal result bytes.
4. Run the same terrain seed/settings/player count under two different valid ID
   lists; compare complete generated-board bytes.
5. Attempt forged/unknown IDs through fog and networking; verify no hidden view,
   seat, order, or spectator authority is returned.
6. Complete create→join→start→tick→terminal→reconnect/rematch with two browser
   clients and verify one unchanged universal ID per active guest.
7. Send ID-only and numeric-client requests; verify bearer failure and old-major
   rejection before payload interpretation.
8. Exercise create/join/spectate/share-link flows and assert final canonical
   URL plus the mounted player/spectator view.
9. Run locale/order tests with explicit edge IDs and prove byte-identical output;
   source review must find no authoritative `localeCompare`.
10. Run repository quality gates:

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
pnpm verify
pnpm version:check
```

## Baseline (Wave 0 — T001, captured 2026-09-11)

**Branch**: `issue-74-numeric-playerid` (clean — only amended spec files + untracked
`issue-74-player-id-migration/` directory; no application source changes).

### API versions

| Constant | Value | Location |
| --- | --- | --- |
| `ENGINE_API_VERSION` | `0.1.0` | `packages/core/src/types.ts:35` |
| `NETWORK_API_VERSION` | `0.2.0` | `packages/networking/src/contracts/network-types.ts:46` |
| `CONSOLE_API_VERSION` | `0.3.0` | `packages/console/src/contracts/console-types.ts:97` |

### Current `PlayerId` definition

```typescript
// packages/core/src/types.ts:42
export type PlayerId = 1 | 2 | 3 | 4;
```

Numeric union, 1-based, max 4 players. Re-exported by `@europa/engine`,
`@europa/terrain`, `@europa/fog`, `@europa/networking`, and `@europa/console`.

### Package versions (all `0.2.0`)

| Package | Version |
| --- | --- |
| `@europa/core` | `0.2.0` |
| `@europa/engine` | `0.2.0` |
| `@europa/terrain` | `0.2.0` |
| `@europa/fog` | `0.2.0` |
| `@europa/networking` | `0.2.0` |
| `@europa/matchmaking` | `0.2.0` |
| `@europa/console` | `0.2.0` |
| `@europa/design` | `0.2.0` |
| `@europa/version` | `0.2.0` |

### Test suite counts (Wave 0 baseline)

| Package | Test files | Test cases (approx) |
| --- | --- | --- |
| `@europa/core` | 2 | 44 |
| `@europa/engine` | 29 | 376 |
| `@europa/terrain` | 28 | 220 |
| `@europa/fog` | 18 | 80 |
| `@europa/networking` | 35 | 251 |
| `@europa/matchmaking` | 45 | 369 |
| `@europa/console` | 111 | 1,118 |
| `@europa/design` | 36 | 345 |
| `@europa/version` | — | 38 |
| **Total** | **304** | **2,841** |

### Numeric `PlayerId` usage density

| Package | `as PlayerId` casts (src) | `as PlayerId` casts (tests) | `seatIndex + 1` derivation |
| --- | --- | --- | --- |
| engine | many (create, serialize, combat, terminal, read) | ~182 | 0 (uses `(i + 1)` in `create.ts:173`) |
| matchmaking | `toPlayerId(seatIndex + 1)` × 4 sites | ~23 | 4 source sites + 1 fallback in `results.ts` |
| networking | 0 | ~17 | 0 (uses seat-as-PlayerId in fixtures) |
| console | 0 | ~10 | 0 |
| terrain | 0 | 0 | 0 (identity-agnostic) |
| fog | 0 | 0 | 0 (resolves via engine registry) |

### Authoritative `localeCompare` in source

| File | Line | Context | Risk |
| --- | --- | --- | --- |
| `packages/networking/src/match-channel.ts` | 276 | `a.order.kind.localeCompare(b.order.kind)` — order drain sort tiebreak | **High** — order kind is not identity; safe now but must be replaced with explicit comparator for determinism |
| `packages/matchmaking/src/internal/lobbyService.ts` | 532 | `a.handle.toLowerCase().localeCompare(b.handle.toLowerCase())` — roster display sort | **Low** — handle display, not authoritative ordering; but plan calls for explicit comparator |

### `GuestPlayerId` type

```typescript
// packages/networking/src/contracts/network-types.ts:646
export type GuestPlayerId = string & { readonly __brand: 'GuestPlayerId' };
```

Also declared identically in `packages/matchmaking/src/contracts/lobby-types.ts:55`.
Both are branded strings, no format constraint yet. Used across networking, matchmaking,
and console for lobby identity lifecycle.

### `nanoid` dependency check

**Zero** direct `nanoid` imports or dependencies found across all packages. No `nanoid`
in any `package.json` dependencies or devDependencies. Clean baseline.

### Existing guards

| Guard type | Exists? | Details |
| --- | --- | --- |
| Biome lint ban on `nanoid` | **No** | No `noRestrictedImports` or ban rule in `biome.jsonc` |
| Test guard for numeric PlayerId | **No** | No conformance test rejects numeric IDs |
| `localeCompare` authoritativeness test | **No** | No grep/static check exists |
| Credential-bearing identity test | **Partial** | `security-hardening.test.ts` covers connection/origin/auth but not ID-as-credential |

## Evidence to append during implementation

Record command, package, test count, coverage percentages, protocol version,
browser/E2E result, security result, and any environment cleanup (ports or
servers). A passing focused suite does not replace the final `pnpm verify` gate.

## Wave 6 evidence — networking breaking wire migration (captured 2026-09-12)

**Commands run** (`packages/networking` unless noted):

```bash
pnpm --filter @europa/networking typecheck     # clean
pnpm --filter @europa/networking lint          # clean (biome check, 68 files)
pnpm --filter @europa/networking format:check  # clean (65 files)
pnpm --filter @europa/networking build         # ESM + DTS success (browser 9.8 KB, index 85.5 KB)
pnpm --filter @europa/networking test          # 319 passed (35 files)
pnpm --filter @europa/networking coverage      # 90.57 / 82.42 / 97.07 / 90.59
pnpm --filter @europa/core exec vitest run tests/identity-migration-guard.test.ts
```

**Protocol version**: `NETWORK_API_VERSION` bumped `0.2.0` → `0.3.0`. The
breaking boundary is the pre-1.0 minor, so `0.2.x` clients are rejected. Proof:
integration `version-mismatch.test.ts` — `hello('0.2.0')` → `version_mismatch`
error + close `1008`; `hello('0.3.5')` → `helloAck`. New security-hardening test
proves the gate precedes payload validation: a `0.2.0` frame carrying a numeric
`joinAck.playerId` is rejected as `version_mismatch` (not `malformed_payload`).

**Identity field changes**: `JoinMatchPayload.requestedSeat` removed (client
cannot select/claim a seat); order `player` and lobby `claim.guestPlayerId`
validated as canonical 12-char ids (numeric rejected at the wire boundary);
`joinAck.playerId` canonical-or-null; `SPECTATOR_VIEW_SEAT` (numeric cast)
replaced by `SPECTATOR_VIEW_PLAYER_ID` (parsed canonical sentinel);
`viewsEqual` compares the ordered `playerIds` config.

**Credential separation**: `acceptOrder` rejects an order whose `player` is not
the connection's bound identity (`order_player_mismatch`); a bare canonical id
offered as a `reconnectToken` → `token_invalid`; tokenless joins skip
grace-window seats. Capturing-logger test proves session/reconnect tokens never
reach the logger.

**Contract mirrors**: `src/contracts/{network-types,network-api,matchmaking-to-networking}.ts`
remain byte-identical to `specs/004-multiplayer-networking/contracts/` (pinned by
`contracts-conformance.test.ts`, which passes).

**Guard status**: the repository identity guard reports **zero
`packages/networking/` violations**. The only remaining failure is
`packages/console/src/net/lobby-storage.ts` (Wave 7) — the guard was neither
suppressed nor excluded.

## Wave 8 evidence — final verification (T043–T045, captured 2026-09-12)

Branch `issue-74-numeric-playerid` at the Wave 8 change set (T041/T042 committed
at `e4955a2`; T043–T045 this change set).

### T043 — per-package coverage + strict typechecks

**Strict typechecks**: `pnpm typecheck` (build + `tsc --noEmit` per package)
clean for all ten workspace packages, plus `@europa/matchmaking` and
`@europa/console` `typecheck:conformance` programs — all exit 0.

**Coverage** (statements / branches / functions / lines; Vitest v8). Every
metric is ≥80% (constitution III):

| Package | Stmts | Branch | Funcs | Lines | Tests |
| --- | --- | --- | --- | --- | --- |
| `@europa/core` | 100 | 100 | 100 | 100 | 119 |
| `@europa/engine` | 96.08 | 86.19 | 99.14 | 95.93 | 518 |
| `@europa/terrain` | 96.16 | 88.5 | 98.33 | 96.11 | 429 |
| `@europa/fog` | 97.18 | 89.69 | 95.23 | 96.96 | 101 |
| `@europa/matchmaking` | 95.77 | 87.8 | 96.13 | 96.06 | 389 |
| `@europa/networking` | 91.31 | 83.46 | 97.66 | 91.34 | 325 |
| `@europa/console` (merged node + browser) | 89.65 | 83.36 | 86.75 | 89.66 | 1,209 |
| `@europa/design` | 92.8 | 84.93 | 100 | 96.37 | 381 |
| `@europa/version` | 100 | 100 | 100 | 100 | 38 |
| `@europa/logging` | 96.55 | 92 | 88.88 | 100 | 40 |

Notes: `@europa/matchmaking` exposes its coverage script as `test:coverage`
(there is no `coverage` alias); the console's merged run merges the `node` and
`browser` Vitest projects. No new suppression, exclusion, `any`, or weakened
assertion was added to reach these numbers.

### T044 — real-wire + browser acceptance

**Browser acceptance** (mounted production path: real Chromium ⇄ TanStack Router
mount ⇄ real lobby/match WebSocket clients ⇄ real `createMatchServer` ⇄
matchmaker ⇄ engine/terrain/fog):

```bash
EUROPA_E2E_PORT=5199 pnpm --filter @europa/console test:e2e --workers=2
# 52 passed (1.7m) — includes identity-migration.spec (7),
# full-stack fog isolation, surrender-game-over terminal,
# lobby lifecycle, semantic routing, spectator read-only.
```

**Real-wire integration**:

```bash
pnpm --filter @europa/networking exec vitest run \
  tests/integration/version-mismatch.test.ts tests/unit/security-hardening.test.ts
# version-mismatch 2/2 (old-major/numeric rejected BEFORE payload parsing);
# security-hardening 12/12 (a bare canonical id is never a credential).
pnpm --filter @europa/matchmaking exec vitest run \
  tests/quickstart/Q-M05-game-over-rematch.test.ts \
  tests/unit/matchmaker.autostart-3p.test.ts tests/unit/rematch.accept.test.ts \
  tests/unit/rematch.newMatch.test.ts tests/unit/playerIdLifecycle.test.ts \
  tests/integration/victory-forfeit-rematch-n-players.test.ts
# 36/36 — terminal + rematch identity preservation, 3p auto-start.
```

**Live self-host smoke** (`pnpm host` on `:8080`, driven with `agent-browser`):

1. Named lobby → **Create match** → canonical bare `/match/<id>` with the
   waiting room ("Waiting for 1 more player… (1/2)").
2. Unnamed deep link `/match/<id>/join` → `/profile?returnTo=…` → name →
   back to the deep link → "Match found" interstitial → **Play** → mounted
   `/match/<id>/join`.
3. Second seat joining auto-starts the match; both seats render the live board.
4. **Fog isolation** — each seat's view is a 5×5 visible cluster (25
   `role="gridcell"` elements) against a full 32×32 = 1,024-cell board; the host
   cluster is top-left (own city `(0,0)`), the joiner's bottom-right (own city
   `(31,31)`). Neither sees the whole board.
5. **Handle-first, ID-keyed labels** — `Seat 1: Host (you)` / `Seat 2: Joiner`
   with `data-europa-player-id` = the server-issued canonical IDs
   (`H5axA7LZoYq-`, `E6urjLA0rj61`); seats assigned correctly (no swap).
6. Screenshots: `__screenshots__/t044-host-board.png`,
   `__screenshots__/t044-joiner-board.png`.

**Defects found and fixed (migration-exposed, no rule weakened):**

1. **Creator seat token dropped** — `packages/console/src/state/lobby-controller.ts`
   `runSeatCommand` only dispatched `lobbyEnteredMatch` when the match id was
   known eagerly. The **create** flow passes `null` (the snapshot supplies the
   id), so the server-issued seat bearer token was never recorded. The creator's
   match leg then joined tokenlessly; once identities are opaque, the server's
   tokenless scan selects the lowest open seat in canonical UTF-16 order, which
   can be another player's seat ⇒ `match_not_joinable` and/or a seat swap.
   Reproduced deterministically (`lobby.spec.ts` "create→join→first tick" failed
   4/6 and 5/8 under stress). Fixed by recording the token on every
   seat-granting command; stress re-run **8/8 green**. Regression test
   `tests/unit/state/lobby-controller.test.ts` (proven red before the fix,
   green after).
2. **Spectator participant order** — `packages/console/src/state/spectator-session.ts`
   built the participant list in engine registry (canonical UTF-16) order, so
   opaque IDs made the visible seat order random and inconsistent with the
   player reducer's placement-slot order. Fixed by sharing
   `orderParticipants`/`humanHandleOf` in a new
   `packages/console/src/state/participant-order.ts` used by both legs.
3. **Perf fixture not migrated** — `packages/console/tests/integration/perf.test.ts`
   still built a numeric `player`/`playerCount` view without
   `config.playerIds`, so `buildMapView` crashed on `playerIds.forEach`
   (`pnpm verify` Phase 8). Migrated to canonical `TEST_PLAYER_1/2`.

**Known accepted limitation (NOT fixed)**: a full-page reload of a LIVE match
does not rebind the seat — `lastCapturedSeatSessionToken` is in-memory
(pre-existing feature-019) and the #146 auth boundary governs the
lobby-identity race. The supported reconnect path (presenting the seat
`reconnectToken`) is proven by the T040 reconnect case and `full-stack.spec.ts`.

### T045 — full gates + diff review

**Gate results** (all exit 0):

```bash
pnpm typecheck        # clean (10 packages + 2 conformance programs)
pnpm lint             # clean (matchmaking reports 11 pre-existing warnings)
pnpm format:check     # clean
pnpm build            # clean
EUROPA_E2E_PORT=5199 pnpm verify   # "=== All verification checks passed ==="
pnpm version:check    # clean
git diff --check      # clean
```

**Diff review** (`git diff a4db782...HEAD`, 296 files + this change set):
repository identity guard 21/21; console cross-package contract-conformance
13/13 (byte-identical contract mirrors + coordinated API versions:
ENGINE 0.2.0 · TERRAIN 0.2.0 · FOG 0.1.0 · MATCHMAKING 0.2.0 · NETWORK 0.3.0 ·
CONSOLE 0.4.0); no new `TODO`/`FIXME`/`console.log` in source; the
documentation-URL credential scan is green. All issue-74 contract acceptance
criteria are covered (identity, engine, wire, router contracts + the data-model
lifecycle edge cases).

**Report-only finding (pre-existing, deferred by T042)**: a handful of
historical pre-#74 spec quickstarts still show numeric identity in illustrative
snippets — `specs/004-multiplayer-networking/quickstart.md`
(`playerId: 1`, `player: 1`) and `specs/001-core-game-engine/quickstart.md`
(`{ kind: 'surrender', player: 1 }`). They reference APIs (`config.playerCount`,
`requestedSeat`) that the 0.3.0 wire break removed, and the tests they describe
no longer exist (`packages/networking/tests/quickstart/`); they are historical
walkthroughs superseded by each feature's amended `spec.md`/`data-model.md`/
`contracts/`. Rewriting them would be a broad historical-docs sweep, not part
of this verification wave — flagged for the PM rather than guessed at.
