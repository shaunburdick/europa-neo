# Tasks: Issue #143 — Event Filtering Fix

**Input**: Design document from `specs/002-fog-of-war-visibility/plan-143.md`
**Prerequisites**: `plan-143.md`, `spec.md` v1.9 (FR-012), existing `eventsFilter.ts`, `broadcast.ts`, `server.ts`
**Branch**: `issue-143-filter-events`
**Spec**: [spec.md](./spec.md) — FR-012 (event filtering for all 5 TickEvents categories), SC-001 (protocol-level audit)

**Tests**: REQUIRED. Constitution Principle III mandates ≥80% coverage on game logic. SC-001 must cover all 5 event categories with real order types.

---

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)

---

## Phase 1: Fog Package — Extended Filter Logic

 - [x] T-101 Add `orderCoords(order: Order): Coord[]` helper to `packages/fog/src/eventsFilter.ts` — exhaustive switch on `order.kind` returning cell coords from `cell`, `source`, or `target` fields; `surrender` returns `[]`. Import `Order` type from `@europa/engine`. (depends on: nothing)
 - [x] T-102 Add `validationErrorCoords(reason: ValidationError): Coord[]` helper to `packages/fog/src/eventsFilter.ts` — exhaustive switch on `reason.kind` returning cell coords; non-cell variants (`already_surrendered`, `invalid_percent`, `unknown_player`, `unknown_order`, `invalid_direction`, `match_terminal`) return `[]`. Import `ValidationError` type from `@europa/engine`. (depends on: nothing)
 - [x] T-103 Add `allCoordsVisible(coords, visible, width): boolean` helper to `packages/fog/src/eventsFilter.ts` — returns `true` if every coord in the list is in the visible set (vacuous truth for empty lists). (depends on: nothing)
 - [x] T-104 [P] Write unit tests for new helpers in `packages/fog/tests/unit/eventsFilter.test.ts` — test `orderCoords` for all 8 order kinds, `validationErrorCoords` for all 11 ValidationError variants, `allCoordsVisible` for empty list, all-visible, some-missing, all-missing cases. (depends on: T-101, T-102, T-103)
 - [x] T-105 Extend `filterTickEvents` signature in `packages/fog/src/eventsFilter.ts` — add optional `player?: PlayerId` parameter. Update JSDoc to document the new parameter and the FR-012 v1.9 exclusion rules for `appliedOrders` and `errors`. (depends on: nothing)
 - [x] T-106 Implement `appliedOrders` filtering in `packages/fog/src/eventsFilter.ts` — filter to include records where `record.order.player === player` AND `allCoordsVisible(orderCoords(record.order), visible, width)`. Update the fast-path check to also test `appliedOrders.length === 0 && errors.length === 0`. Update the identity-preservation check to include `appliedOrders` and `errors`. (depends on: T-101, T-103, T-105)
 - [x] T-107 Implement `errors` filtering in `packages/fog/src/eventsFilter.ts` — filter to include records where `validationErrorCoords(reason).length === 0` (non-cell variant → always included) OR `allCoordsVisible(coords, visible, width)`. (depends on: T-102, T-103, T-105)
 - [x] T-108 [P] Write unit tests for appliedOrders/errors filtering in `packages/fog/tests/unit/eventsFilter.test.ts` — cover all cases from plan-143 §5/§8: player match/mismatch, all-cells-visible/some-missing, paratroop source+target, surrender (no coords), non-cell error variants. (depends on: T-106, T-107)
 - [x] T-109 Update `packages/fog/src/playerView.ts` line 182 — pass `player` to `filterTickEvents`: `filterTickEvents(world, visible.visibleCells, tickEvents, false, player)`. (depends on: T-105)

---

## Phase 2: Networking — Thread Events Through

 - [x] T-110 Add `lastTickEvents` field to `MatchChannel` in `packages/networking/src/match-channel.ts` — private `_lastTickEvents: TickEvents` initialized to `emptyTickEvents()`, with public getter and `setLastTickEvents(events)` setter. Import `TickEvents` and `emptyTickEvents` from `@europa/engine`. (depends on: nothing)
 - [x] T-111 Add optional `events?: TickEvents` to `FogFactory.computePlayerView` args in `packages/networking/src/contracts/network-api.ts` line ~347. Import `TickEvents` from `@europa/engine`. (depends on: nothing)
 - [x] T-112 Add optional `events?: TickEvents` parameter to `buildTickBroadcast` in `packages/networking/src/broadcast.ts` line ~245. Pass `events` through to `deps.fog.computePlayerView` at line ~257. Import `TickEvents` from `@europa/engine`. (depends on: T-111)
 - [x] T-113 Update `server.ts` line ~491 — capture `advance()` return value: `const advanceResult = channel.engineSession.advance()`. Store events: `channel.setLastTickEvents(advanceResult.events)`. Pass events to `buildTickBroadcast`: `buildTickBroadcast(channel, { fog: deps.fog }, nowMs, advanceResult.events)`. (depends on: T-110, T-112)
 - [x] T-114 Update `server.ts` line ~526 (resync fallback) — pass `events: channel.lastTickEvents` to `deps.fog.computePlayerView`. (depends on: T-110)
 - [x] T-115 Update `server.ts` line ~1288 (reconnect snapshot) — pass `events: channel.lastTickEvents` to `deps.fog.computePlayerView`. (depends on: T-110)
 - [x] T-116 [P] Run `pnpm --filter @europa/networking test` — verify existing broadcast/server tests still pass with the new optional `events` parameter. (depends on: T-111, T-112, T-113, T-114, T-115)

---

## Phase 3: SC-001 Audit Extension

 - [x] T-117 Extend `packages/fog/tests/redaction.test.ts` — add order staging between ticks using `applyCommand` from `@europa/engine`. Submit real orders (`setPipe`, `clearPipe`, `setPipesExclusive`, `clearAllPipes`, `setReserves`, `paratroop`, `gun`) for both players, some referencing cells inside P1's horizon and some outside. Submit intentionally invalid orders (e.g., `setPipe` on non-owned cell) to generate `errors`. (depends on: T-109)
 - [x] T-118 Extend the per-tick audit loop in `redaction.test.ts` — add assertions for `appliedOrders`: for each record where `record.order.player === P1`, verify all `orderCoords(record.order)` are in the expected visible set. For records where `record.order.player !== P1`, verify they are NOT in the view. Add assertions for `errors`: for each error where `validationErrorCoords(reason).length > 0`, verify all referenced cells are in the expected visible set. Add assertion for `eliminations`: verify all are present (no cell filtering). (depends on: T-117)

---

## Phase 4: Final Verification

 - [x] T-119 Run `pnpm --filter @europa/fog test` — all unit tests (T-104, T-108) and SC-001 audit (T-118) pass. (depends on: T-108, T-118)
 - [x] T-120 Run `pnpm verify` — full repo verification: lint, typecheck, tests, build across all packages. Fix any issues. (depends on: T-116, T-119)
 - [x] T-121 Commit all changes with conventional commit message: `fix(fog): wire TickEvents through transport and extend filter to all 5 categories (issue #143)`. (depends on: T-120)

---

## Dependencies & Execution Order

### Phase 1 (Fog Filter) — can start immediately
- T-101, T-102, T-103: independent [P] — all are new helper functions
- T-104: depends on T-101, T-102, T-103 (tests for helpers)
- T-105: independent — signature change
- T-106: depends on T-101, T-103, T-105
- T-107: depends on T-102, T-103, T-105
- T-108: depends on T-106, T-107
- T-109: depends on T-105

### Phase 2 (Networking) — can start in parallel with Phase 1
- T-110, T-111: independent [P]
- T-112: depends on T-111
- T-113: depends on T-110, T-112
- T-114, T-115: depend on T-110
- T-116: depends on T-111–T-115

### Phase 3 (SC-001 Audit) — depends on Phase 1
- T-117: depends on T-109 (filter must accept player param)
- T-118: depends on T-117

### Phase 4 (Verification) — depends on all phases
- T-119: depends on T-108, T-118
- T-120: depends on T-116, T-119
- T-121: depends on T-120

### Parallel Opportunities

**Wave 1** (independent tasks, all [P]):
- T-101, T-102, T-103, T-105, T-110, T-111

**Wave 2** (after Wave 1):
- T-104 (tests for helpers), T-106, T-107, T-112

**Wave 3** (after Wave 2):
- T-108 (filter tests), T-109 (playerView update), T-113, T-114, T-115

**Wave 4** (after Wave 3):
- T-116 (networking tests), T-117 (SC-001 order staging)

**Wave 5** (after Wave 4):
- T-118 (SC-001 audit assertions)

**Wave 6** (final):
- T-119, T-120, T-121
