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
