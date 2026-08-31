# Feature Specification: 3–4 Player End-to-End Support

**Feature Branch**: `issue-6-3+4-player-matches`

**Created**: 2026-08-28

**Last Updated**: 2026-08-30 (v1.2 — feature 013 identity-visibility policy)

**Version**: 1.2

**Status**: Implemented (2026-08-29)

**GitHub Issue**: #6

**Dependencies**: Feature 001 (core engine FR-019: 2–4 players), Feature 003 (terrain Clarifications v1.2: 3p normalization + partner semantics), Feature 004 (networking — player-count-agnostic), Feature 002 (fog per-seat), Feature 006 (match lifecycle — `playerCount: 2|3|4` + auto-start), Feature 010 (public lobby — create/join UI + capacity chrome), Feature 005 (client console — waiting overlay), Feature 007 (player manual FR-012 sync), Feature 011 (single-port host)

**Input**: Issue #6 verbatim + approved delivery plan / product decisions 2026-08-28 (defaults per player count, lobby chrome + pluralization, host CLI flags, full-stack E2E for 3p+4p).

## Problem Statement

The engine contract (001 FR-019) supports 2–4 players, and terrain's 3-player auto-start GenerationError was fixed by #2 (003 Clarifications v1.2) — but the product only ships 2-player end-to-end (AGENTS.md binding decision 5). Issue #6 is the first major gameplay expansion past v1: make 3- and 4-player matches joinable, startable, playable, spectatable, and self-hostable through the SAME lobby → match → console path that v1 proved for 2 players, while preserving determinism, board fairness, fog isolation, and 2-player compatibility. Lobby, console, host tooling, and the player manual must all become N-player-aware in the same delivery (spec 007 FR-012: manual rides with behavior changes).

## User Scenarios & Testing

### User Story 1 — Create, Fill, and Auto-Start a 3-Player Public Match (Priority: P1)

As a host, I want to create a public 3-player match from the lobby, have two friends join it by clicking Join, and see the game begin automatically when the third seat fills — with a fair point-symmetric map and deterministic ticks — so that 3-player Europa is playable without special-case tooling.

**Why this priority**: 3-player is the smallest lift beyond shipped 2-player and the regression that broke in #2; proving it end-to-end unlocks the lobby/host/manual surfaces for any N>2.

**Independent Test**: Scripted or Playwright-driven: lobby creates a public 3p match (board default for 3p, see FR-001), three distinct guest identities claim the three seats via the lobby Join action, and the suite asserts that auto-start fires, each client receives its seat's first `TickPayload` (`tick ≥ 1`), boards are deterministic for the same seed, and `effectiveSettings` reports the normalized city count when applicable.

**Acceptance Scenarios**:

1. **Given** a lobby client with a valid handle, **When** it creates a public match with `playerCount=3` and the default 3p board size, **Then** the server returns a public match entry showing `playerCount: 3`, `seatsFilled: 1/3`, and the entry is listed as joinable (waiting).
2. **Given** a public 3p match with 1/3 and 2/3 seats filled, **When** the third player joins, **Then** within 2 seconds the server atomically generates terrain (003 FR-004/FR-005 with v1.2 normalization), initializes the engine (001 FR-019), and transitions the match to `running` — all three seats receive a non-zero tick broadcast.
3. **Given** a running 3p match, **When** each player issues an order (e.g., `setReserves`) on a later tick, **Then** every order is acknowledged once and takes effect on the authoritative tick (no cross-seat aliasing).
4. **Given** the same 3p seed/board-size/player-count/settings, **When** the game is regenerated, **Then** the board hashes (elevations + water + city positions/owners) are byte-identical (determinism).

---

### User Story 2 — Create, Fill, and Auto-Start a 4-Player Public Match (Priority: P1)

As a host, I want the same flow for 4 players — create, three joins, auto-start — so that a full Europa table (up to the engine's contractual maximum) is available from the lobby and from the host CLI.

**Why this priority**: 4-player is the engine maximum and the last value in `playerCount: 2|3|4`. Proving it together with 3p removes any remaining "2p-only" residue.

**Independent Test**: Same harness as US1 but with `playerCount=4`. Both suites can be parameterized over `N ∈ {3,4}`.

**Acceptance Scenarios**:

1. **Given** a lobby, **When** a client creates a public match with `playerCount=4` and the default 4p board size, **Then** the listing reads `1/4` and remains joinable for two more distinct joiners before becoming full.
2. **Given** a 4p filling match with 3/4 seats, **When** the fourth seat is claimed, **Then** auto-start occurs and four distinct seats receive fog-filtered views (each sees its own city, horizons differ, no full-board leak except to spectators).
3. **Given** a running 4p match, **When** orders are submitted from all four seats in one tick, **Then** each player's view updates consistently and the tick result is deterministic for replay.

---

### User Story 3 — Lobby Discovers and Creates 3–4p Games With Sensible Defaults (Priority: P2)

As a player browsing the lobby, I want the create form to default to a larger board when I pick 3 or 4 players (but let me override it), and the match list to show occupancy as "2/3" / "3/4" with explicit capacity chrome, so that I can choose games at a glance without guessing.

**Why this priority**: Discoverability — the v1 lobby already exposes 2/3/4 radios and 32/48/64 board sizes per 010, but defaults are still 2p→32 everywhere. Correct defaults and plural chrome turn an N-capable backend into an N-usable product.

**Independent Test**: Component + integration tests against the lobby UI: radio `3` pre-selects its default size; radio `4` pre-selects its default; manual override persists (see FR-002/FR-003); list rendering tests assert occupancy text and counts across waiting/running states.

**Acceptance Scenarios**:

1. **Given** the lobby create form, **When** a user selects `3 players`, **Then** the board-size control pre-selects the default for 3p (`48`) without erasing a prior explicit override until the player changes it again.
2. **Given** the lobby create form, **When** a user selects `4 players`, **Then** the board-size control pre-selects the default for 4p (`48`) — overrideable to `32`, `48`, or `64`.
3. **Given** three public matches (2p 1/2, 3p 2/3, 4p 3/4), **When** the lobby list is rendered, **Then** each row shows occupancy and capacity (e.g., "Players 2 / 3"), seats-filled count, and map-size label, with Join/Spectate availability correct per FR-007 of 010.
4. **Given** a private 3p or 4p match exists (shareable link only), **When** the lobby is listed, **Then** the match does not appear in any public entry and its ID is not leaked (006 FR-006 boundary preserved; lobby = public only per 010 FR-015).

---

### User Story 4 — Waiting Overlay Is Accurate for N-Player Filling (Priority: P2)

As a player who joins early, I want the waiting overlay to tell me how many players are still needed ("Waiting for 2 more players…" for 1/3, "1 more player…" for 2/3 or 3/4) instead of the v1 singular "opponent" copy, so that I know how long to wait.

**Why this priority**: Small copy change, high user-visible impact. The console still derives `isAwaitingMatchStart` the same way (005 Implementation Notes item 11), only the rendered text becomes N-aware.

**Independent Test**: Unit + component tests: derived-state tests pin pluralization over `(playerCount, seatsFilled)`; mounted App test proves the overlay is visible while filling and hides on first non-zero tick for each N.

**Acceptance Scenarios**:

1. **Given** a console seated in a 3p match with 1/3 seats filled and `latestView` null/tick 0, **When** the overlay renders, **Then** it reads with the N-aware string (e.g., "Waiting for 2 more players… (1/3)") and is announced once via the polite live region.
2. **Given** the same match with 2/3 filled, **When** rendered, **Then** it reads "Waiting for 1 more player… (2/3)" (singular form).
3. **Given** a 4p match 3/4 filled, **When** rendered, **Then** it reads "Waiting for 1 more player… (3/4)"; at 4/4 it self-hides on the first real tick (overlay cleared, never stacks with reconnect/game-over chrome).
4. **Given** a running match (tick ≥ 1), **When** the overlay condition is re-evaluated, **Then** no waiting overlay is shown regardless of capacity (spec 011 topology and normal gameplay unchanged).

---

### User Story 5 — Victory, Forfeit, and Rematch With >2 Players (Priority: P3)

As a player in a 3- or 4-player game, I want elimination/last-player-standing, surrender, disconnect-forfeit, and rematch to behave consistently when more than two seats exist, so that the full match lifecycle (006 US4/US5 + 010) works without "2p-only" branches.

**Why this priority**: Lifecycle rules are authoritative and tested — extending them is a correctness exercise, not a new backend.

**Independent Test**: Headless matchmaking + networking tests: script a 3p/4p match to eliminate all but one player; script voluntary `leaveMatch` (surrender) with N>2; script one seat beyond the reconnect grace window and assert forfeit winner; verify rematch re-creates with identical `playerCount` + visibility + a new seed.

**Acceptance Scenarios**:

1. **Given** a running 3p match where two players are eliminated (holds zero troops AND zero cities, 001 FR-015), **When** the tick resolves that leaves one survivor, **Then** the engine emits terminal state, the server delivers results to all connected participants/spectators (006 FR-008), and the match moves to `finished` → collectible.
2. **Given** a running 4p match, **When** one player voluntarily leaves (surrenders), **Then** that seat is marked forfeit immediately (006 Implementation Notes: voluntary leave = immediate forfeit, no grace window), but the match continues for the remaining three players — it does not end until fewer than two players remain.
3. **Given** a running 3p match where one player disconnects beyond the grace window, **When** the window expires, **Then** only that seat is marked forfeit (telemetry `totalForfeits` semantics preserved); the match continues if ≥2 players remain, otherwise the sole survivor wins, and if none remain the match is destroyed (006 FR-010 + 004 FR-009).
4. **Given** a finished 3p/4p match, **When** all original seats accept a rematch within the bounded window (006 FR-009), **Then** a new match is created with the same `playerCount`, `boardSize`, `visibility`, and freshly generated seed/ID/link (pre-minted `initialSeed` visible on the record); partial accept or expiry degrades as already specified.

---

### User Story 6 — Single-Command N-Player Smoke via `pnpm host` (Priority: P3)

As an operator testing locally, I want `pnpm host --players 3 --board-size 48` (and `4`/`64`) to boot the single-port stack, create+fill a public N-player match, and print N join URLs (each per-seat token-bearing), so that 3–4 player smoke needs no lobby clicks.

**Why this priority**: Reuses the proven `pnpm host --create` recipe (005 Integration wave + 011 single-port) with a flag. Validates the path that CI and operator playtests actually run.

**Independent Test**: `host-config` unit tests for flag/env parsing; integration smoke that boots the real stack at `HOST_PORT: 0`, spawns the N URLs, drives N Node wire clients through hello→join→ticks→ack as the E2E harness does (011 FR-009 fixture), and exits via SIGINT idempotently.

**Acceptance Scenarios**:

1. **Given** a built console (`dist/` present), **When** the operator runs `pnpm host --players 3 --board-size 48`, **Then** the process listens on a single `http.Server` (`HOST_PORT` default 8080, single `EXPOSE`), creates a public 3p match on 48×48 that auto-starts when the third seat is claimed, prints "Waiting for N more players…" progress to stdout, and prints 3 token-bearing join URLs; `GET /version` and same-origin WS over the same port both work (011 single-port contract preserved).
2. **Given** `pnpm host --players 4 --board-size 64` (override exercises every value in `32|48|64`), **When** the flow completes, **Then** 4 URLs are printed and the match runs at 4 ticks/s (250 ms cadence) with fog-filtered per-seat views.
3. **Given** an invalid flag (e.g., `--players 5`, `--board-size 16`, `--static-port`, or alias mismatch), **When** parsing runs, **Then** the process fails fast with an actionable message naming the offending flag and naming the allowed set (no silent fallback, no second listener).
4. **Given** `--players 3` with no explicit `--board-size`, **When** the host creates the match, **Then** the board size is the product-approved default (2p→32, 3p→48, 4p→48) — never silently 32 for every count.

---

### User Story 7 — Manual Stays Truthful for N-Player Play (Priority: P3)

As a player reading `docs/manual/`, I want the board-size defaults, lobby participant counts, waiting-overlay wording, host CLI example, victory/spectating notes for N>2, and the numbers appendix to be updated for 3–4 player play, so that every number and screen I see matches what actually ships.

**Why this priority**: FR-012 discipline: any change set that alters documented behavior must update the manual in the same change set; violation is a review failure.

**Independent Test**: Manual review diff + automated doc guards: `docs/manual/*.md` touched in the same change sets that touch lobby/console/host defaults; the docs check rejects credential values/URLs while allowing non-secret ID correlation examples.

**Acceptance Scenarios**:

1. **Given** the manual after this feature, **When** a player reads `the-board.md` and `numbers.md`, **Then** the default board sizes are listed per player count (2p→32, 3p→48, 4p→48; 32/48/64 all supported via override) and every per-player color / counts entry still matches shipped constants.
 2. **Given** `quick-start.md` / `reading-the-screen.md` / `controls.md`, **When** instructions mention the waiting overlay or joining via link, **Then** the pluralized wording and "N of M" occupancy are described without printing session/reconnect token values; non-secret player IDs may be used for correlation examples.
3. **Given** `quick-start.md` or an operator/self-hosting section that mentions `pnpm host`, **When** read after this change set, **Then** the single-port URL (`http://localhost:8080/` per 011) and the new `--players`/`--board-size` flags are shown correctly (and `HOST_STATIC_PORT` is never presented as an option).
4. **Given** the numbers appendix or `index.md` footer, **When** checked by the version-drift guard (009), **Then** the lockstep footer/version line remains byte-consistent with `APP_VERSION`.
5. **Given** the same change set, **When** `pnpm version:check` and the docs-privacy check run, **Then** both pass (no stale two-port references per 011 FR-015/FR-016).

---

### Edge Cases

- **3-player self-symmetry rule (terrain)**: 003 Clarifications v1.2 governs: `citiesPerPlayer` for `playerCount===3` normalizes UP to even (1→2, 3→4; 2/4 unchanged), applied before placement; the generated board is the `effectiveSettings`-derived board. INV-9's "opposite player" is `partnerPlayer(owner, playerCount)` — the 3p middle band is its own symmetry partner, so same-owner mirrors are conforming, not violations. Repeating a 3p generation after the fix may yield a different deterministic map than an unnormalized pre-fix seed (placement now accepts only cells whose *both* water metrics are non-pool — Chebyshev ≥ min AND Manhattan > min) — still valid and byte-identical across machines for the same seed.
- **Odd `citiesPerPlayer` with 3p and 4p**: normalization applies only to 3p; 2p/4p are unaffected. The matchmaker never overrides a caller-supplied even 3p count; the UI never blocks any even count.
- **Board-size defaults vs override**: Every `playerCount` allows any of `32|48|64` via explicit selection/flag; defaults are a pre-selection, not a restriction. The server still clamps extreme `boardSize` to `[8,128]` per 006's contract when a direct API caller bypasses the UI, and the lobby form still rejects non-finite inputs with field-specific `detail` (006 Implementation Notes).
- **Partial fill / leave before start**: `leaveMatch` on a `filling` match releases the seat inline (seat removed + session unbound; `lastActivityAtMs` refreshed). Releasing the final seat collects the match immediately and deletes the leaver's session (006). The lobby entry disappears or refreshes within one tick (006 SC-003 / 010 FR-013). Retrying Join against a seat just taken returns `match_full` without state corruption.
- **Forfeit / disconnect with N>2**: Voluntary `leaveMatch` while `running` is immediate forfeit for that seat only; the match continues while ≥2 players remain (US5 AC-2). Grace-window forfeit (004 FR-009 / 006 FR-010) stamps the absent seat after the same timeout that v1 used; teardown only when none remain (006 FR-010). `totalForfeits` bumps only for timeout forfeits, not voluntary leaves (006 Impl notes).
- **Reconnect grace with N>2**: Within the grace window (004 FR-007 + 006 FR-010, feature 004's `wsIdleTimeoutMs` / `sessionToken` path), a disconnecting player may reconnect with their `sessionToken` and reclaim their original `PlayerId` and fog view; another player's credential cannot steal the seat (005/010 server-authoritative association). After expiry the seat is forfeit as above.
- **Private 3–4p shareable links**: Private matches of any `playerCount` are joinable exclusively via their ID/link, never appear in lobby listings/snapshots, and an unknown ID returns generic `match_not_found` with no existence leak (006 FR-006). Link sharing beyond the intended group is the only admission path (no auth in v1) — same as v1 2p.
- **Fog isolation with N>2**: Fog (002) computes a per-player `VisibleSet` unioned over that player's stacks at Chebyshev radius 4, stateless (no memory), deterministic, and spectators remain full-visibility read-only. Per-tick broadcasts for N>2 remain individually fog-filtered (004 FR-005). Zero structural leakage is pinned by a 500-tick audit (002 SC-001 / 004 SC-004) parameterized over `3` and `4`.
- **Host script resilience**: `pnpm host --players N` without a built `dist/` fails with "run pnpm build" (existing guard); `EADDRINUSE` on `HOST_PORT` surfaces an actionable message (011); `--static-port`/`HOST_STATIC_PORT` are rejected as unsupported (011 FR-004) with a clear error — no second listener. SIGINT exits idempotently (host integration proven). Binary E2E topology uses a single `http.Server` with `port: 0` (`__boundPortForTest`) as 011 FR-009 mandates — no two-port test seam reintroduced.
- **Compatibility**: Existing 2-player flows, `NETWORK_API_VERSION`/`MATCHMAKING_API_VERSION` semantics, `PrivateMatch`/`PublicLobbyEntry` discovery, reconnect/session/retry, and console geometry (region targeting, subcell para/gun, reserves 0–90% steps) are unchanged. No frame, envelope, wire-kind, or `ProtocolEnvelope` version bump.

- **Identity visibility**: Guest identity IDs and gameplay `PlayerId` values are
  non-secret correlation metadata. Handles remain preferred in UI; bearer
  session/reconnect tokens, private-match existence, authorization, and fog
  boundaries remain protected (feature 013).

## Requirements

### Functional Requirements

#### Defaults & Match Creation (lobby + matchmaking)

- **FR-001 — Default board size per player count**: The product-approved defaults are:
  - 2 players → **32** (the long-shipped default; `DEFAULT_MATCH_SETTINGS.boardSize` stays `32` for backward API compatibility),
  - 3 players → **48**,
  - 4 players → **48**.
  The defaults live as a single source map in `@europa/matchmaking` (used by lobby create form and host CLI) and are documented in `docs/manual/` (FR-015). Any explicit caller-supplied `boardSize ∈ {32,48,64}` overrides the default without rejection (the UI and host allow all three; the server's broader `[8,128]` clamp remains on the direct `createMatch` API). For reporting purposes the effective board size (whatever successfully created the match) is authoritative — there is no extra "default that won" field beyond what the board itself carries.
  - **Clarifications v1.1 — 64×64 temporarily disabled**: As of 2026-08-29 the `64` board size is temporarily disabled in the lobby UI and host CLI because 64×64 terrain generation is unreliable (follow-up issue #26). The allowed override set is `32|48` until the terrain fix lands. `BOARD_SIZE_DEFAULTS` is unchanged (`{2:32, 3:48, 4:48}`).

- **FR-002 — Lobby create form pre-selection + override**: The lobby match-create form (010 FR-008) MUST pre-select the board-size default from FR-001 when the user picks a `playerCount` radio value (2|3|4). The user MAY then override the size to any of `32|48|64`. Pre-selection MUST NOT silently overwrite an already-explicit override within the same form interaction (specifically: switching player count re-applies the target count's default only if the current size is either unset or is still the previous count's default; a user who manually picked a non-default size keeps it when switching counts unless they re-pick the size). Invalid submissions (e.g., non-finite size) are rejected with field-specific `detail`, as already specified in 006 Implementation Notes — not clamped silently through this path.

- **FR-003 — Lobby list chrome for 3–4p**: Every public lobby entry MUST show occupancy/capacity as user-visible text (e.g., "Players 2 / 3" or "2/3"), the `playerCount` capacity, `seatsFilled`, the board-size label, and lifecycle status with correct action affordance per 010 FR-006/FR-007. For `playerCount>2` the capacity portion ("/ N") is the deliberate delta over v1's 2p-only rows. State transitions (created → filling → running → finished → collected) remain observable within one tick (006 FR-012 / 010 FR-013). Private matches are never listed (010 FR-015).

- **FR-004 — Matchmaking validation reused unchanged**: `playerCount` validation remains `2|3|4` rejected with `invalid_request` + `detail { field: 'settings.playerCount', reason }` (006), valid `playerCount` × `boardSize` × `terrainSettings` combinations auto-start within 2 s when seats fill (006 FR-007), and lifecycle transitions (including GC sweeps) are lazy/read-path-collected against the injected clock (006 Implementation Notes). This feature adds no new matchmaking state shape.

#### Console (waiting overlay)

- **FR-005 — Waiting-overlay pluralization**: The console (005 US5 / Implementation Notes 11) MUST derive `isAwaitingMatchStart` unchanged (`live && (latestView === null || latestView.tick === 0)`) — no new prop or tick-zero redefinition. While awaiting, the `WaitingOverlay` MUST render N-aware copy derived from the authoritative match capacity and seats-filled count available to the console (from the lobby join context or the first lobby/status broadcast consumed by the App):
  - `1 / N` → "Waiting for N-1 more players… (1/N)" (plural when N-1 > 1),
  - `N-1 / N` → "Waiting for 1 more player… (N-1/N)" (singular),
  - general `k / N` (1 ≤ k < N) → "Waiting for N-k more players… (k/N)" using correct singular/plural form.
  The overlay MUST remain `pointer-events: none`, once-announced via the polite live region, honor `prefers-reduced-motion`, and self-hide on first non-zero tick or any status change (never stacks with reconnecting/game-over chrome). The singular v1 string "Waiting for opponent to join…" is retired for `N>2`; the 2-player phrasing retains the same N-aware structure reading as "1/2" (equivalent meaning, updated copy).

- **FR-006 — Console geometry unchanged**: Pipe region targeting (N/E/S/W), exclusive-pipe gestures, `i/j/k/l` + `space`, subcell `p/h`/`g/o` at Chebyshev ≤2, and reserves `0–9` (0–90%) behave identically for `N>2` (005 FR-001..FR-007). No canvas, minimap, or input-contract change.

#### Fog / Engine / Networking (conformance, no new mechanics)

- **FR-007 — Engine N-player conformance**: The engine's `FR-019` (001) support for `2–4` players is exercised end-to-end by this feature. No numeric rule, order set, victory condition (001 FR-015/FR-016), or constants file changes — only test coverage extends to 3p/4p scripted wins. Elimination remains "zero troops AND zero cities"; last-player-standing ends the match; surrender is immediate elimination; deterministic integer math invariant holds.

- **FR-008 — Terrain N-player conformance**: Terrain generation (003) MUST remain point-symmetric (180°), deterministic (same seed → byte-identical), and connectivity-valid for `3` and `4` players on the default sizes (`48`; parameterized over `32|48|64`). Clarifications v1.2 normalization and `partnerPlayer` semantics are exercised — they are not redefined. Validation + bounded retries (003 FR-007) and `effectiveSettings` reporting remain unchanged.

- **FR-009 — Fog-of-war N-player conformance**: Visibility is per-player `VisibleSet` at Chebyshev radius 4, stateless (no memory), deterministic, server-enforced per payload (002 FR-001..FR-005 / 004 FR-005). Spectators remain full-visibility read-only (002 FR-006). No leak: every payload for `N∈{3,4}` carries only its recipient's visible cells, pinned by the 500-tick leakage audit extended from 2p.

- **FR-010 — Networking N-player transparency**: Networking (004) remains player-count-agnostic: `TickDelta`/`Snapshot`/`hello`/`order`/`heartbeat`/`reconnect`/`spectate`/`rate-limit` semantics are identical for `N>2` (004 FR-001..FR-011). No envelope, frame-codec, or `NETWORK_API_VERSION` bump. Per-tick cadence stays 250 ms (≈4 ticks/s); fog-filtered broadcast + delta + heartbeat still work for `N∈{3,4}` at the same per-tick <15 ms budget (004 SC-005's measurement protocol, applied per-player).

#### Host CLI (single-port host — spec 011)

- **FR-011 — `pnpm host --players` + `--board-size` flags**: `packages/console/scripts/host.ts` MUST accept additive CLI flags:
  - `--players N` (`2|3|4`; alias `--player-count`; env fallback `HOST_PLAYER_COUNT` when neither flag present) — defaults to `2` when absent (backward compatibility with v1 and every existing doc link).
  - `--board-size S` (`32|48|64`; alias `--boardSize`; env fallback `HOST_BOARD_SIZE` when neither flag present) — when absent, implied size is the FR-001 default for the requested `playerCount` (2→32, 3→48, 4→48; NOT always 32).
  - Both flags pass through `resolveConfig`/`HostConfig` the same way `HOST_PORT`/`HOST_BIND_HOST`/`HOST_PUBLIC_HOST` do. The resolved `playerCount` × `boardSize` pair drives the single public match created+filled in `--create` mode (011 FR-003). Printing: the number of URLs equals `playerCount`; join URLs embed per-seat `?token=` exactly as today. `GET /version` + same-origin WS over the single `http.Server` on `HOST_PORT` remain unchanged (011 FR-001..FR-003). Flags are parsed before binding; invalid values fail fast with actionable messages listing allowed values (011 NFR-004 style).
  - **Clarifications v1.1 — 64×64 temporarily disabled**: The `--board-size 64` override is temporarily rejected by the host CLI with the message `host: --board-size 64 is temporarily disabled — 64×64 generation is unreliable (terrain issue #26 pending fix)`. The allowed override set is `32|48` until terrain issue #26 is fixed; `BOARD_SIZE_DEFAULTS` is unchanged.

- **FR-012 — Removed second-port surface stays removed**: `HOST_STATIC_PORT` / `--static-port` remain unsupported failures per 011 FR-004. Passing `HOST_STATIC_PORT` or attempting to bind a second HTTP listener via any code path added by this change set is a conformance failure.

#### Manual sync (spec 007 FR-012 discipline)

- **FR-013 — Manual updated in same change sets**: Every change set that alters behavior documented by the manual MUST update `docs/manual/` in the SAME commit(s) — including the board-size defaults per player count, lobby capacity/occupancy display, waiting-overlay wording, host CLI flags/syntax, victory/spectate notes for `N>2`, and the `numbers.md` tunable table. Stale manual text or numbers are review failures. Allowed to land across multiple stacked change sets (each individually FR-012-consistent) rather than a single monolithic commit — but no merge to `main` may carry a stale manual. Version footer (`docs/manual/index.md`) lockstep (`APP_VERSION`) per 007 FR-017 / 009 FR-009 stays green.

- **FR-014 — Docs credential boundary**: Manual updates MUST NOT print `SessionToken`/`reconnectToken` values or credential-bearing URLs. Player IDs are non-secret and may appear when useful, while examples prefer handles (`P1`..), satisfying feature 013 and the retained private-match/fog boundaries. The checker is amended by feature 013 during implementation.

### Key Entities

- **MultiplayerMatch (extends Match / MatchRecord / PublicLobbyEntry)**: `playerCount: 2|3|4` + `boardSize: 32|48|64` (the authoritative settings of the match), `seats: SeatIndex→GuestPlayerIdentity+handle`, `state ∈ { filling, running, finished, collected }`, `visibility ∈ { public, private }`. For `playerCount=3` the `effectiveSettings` (003) may report even-normalized `citiesPerPlayer` (e.g., `1→2`); the stored `MatchRecord.initialSeed` for rematches is set at creation.

- **BoardSizeDefault**: Mapping `playerCount→boardSize` (2→32, 3→48, 4→48), one source in `@europa/matchmaking`. Used as pre-selection by the lobby form and as implied size by `pnpm host` when `--board-size` is absent.

- **LobbyCapacityChrome**: User-visible composite of `seatsFilled / playerCount` plus human-readable board-size/capacity label rendered per lobby row. Not a new protocol field — derived from authoritative `PublicLobbyEntry`/`PublicMatch` (`playerCount`, `seatsFilled`, `boardSize`, lifecycle status). Public listings only (010).

- **WaitingStatus (console derived state)**: `isAwaitingMatchStart ⇔ (status === 'live' && (latestView === null || latestView.tick === 0))` (005 item 11) extended with N-aware copy "Waiting for N-k more players… (k/N)" using capacity/seats metadata available to the App.

- **NPlayerHostConfig (extends HostConfig)**: `playerCount: 2|3|4` + `boardSize: 32|48|64` resolved from `--players`/`--board-size` (or `HOST_PLAYER_COUNT`/`HOST_BOARD_SIZE` env) + FR-001 implied default. Host then creates a single `http.Server` on `HOST_PORT` serving static + `/version` + WS upgrades (011).

- **GuestPlayerIdentity + Handle**: Unchanged (010 FR-002..FR-005 / 009). Identity → seat → order authority remains server-resolution; handles are the only UI-visible names.

## Success Criteria

### Measurable Outcomes

- **SC-001 — 3-player full-stack E2E green**: Parameterized E2E (lobby→match→ticks→orders→victory, per-seat fog) with `playerCount=3` (board `48`, 250 ms cadence) is green: three seats are claimed atomically (at most one gets the last seat; losers get `match_full`), auto-start produces `tick≥1` within 2 s of the final join, each seat receives a fog-filtered view (own city visible, horizons differ, no full-board leak), each seat can issue an order with single `ok:true` ack and deterministic world effect, victory/`showResults` is reachable by mutual elimination / surrender in scripted play, and private 3p links are not listed in any lobby sample (10/10 trials).

- **SC-002 — 4-player full-stack E2E green**: The same parameterized suite with `playerCount=4` (`board 48`, also `64` covered by plan selection) is green across all clauses of SC-001. Both suites share one harness (e.g., `tests/e2e/full-stack-n-players.spec.ts` parameterized over `N ∈ {3,4}` alongside the existing 2p suite).

- **SC-003 — Deterministic 3p/4p maps + terrain balance**: For `10` sampled seeds (covering odd + even `citiesPerPlayer` for 3p), `3` player count, and `3` board sizes (32/48/64): same-seed regeneration is byte-identical (003 SC-001, engine-agnostic determinism check); 100% of emitted maps pass the 003 validation invariants (point symmetry via `partnerPlayer`, connectivity over land, water-bounds 5–15% default) and the 200-map balance suite extended to `N∈{3,4}` (003 SC-002/SC-004). Failure of any map terminates the suite loudly.

- **SC-004 — Fog isolation for N>2**: The 500-tick zero-leakage audit (002 SC-001 / 004 SC-004) is run parameterized over `3` and `4` players against scripted marches/battles: every payload's cell set is subset of the recipient's `VisibleSet` (Chebyshev 4, stateless union), and spectator mode on a 3p/4p match still yields full-visibility read-only views with zero accepted orders (004 SC-002..SC-005 budgets intact).

- **SC-005 — Coverage on touched logic ≥80% on every metric**: Each package whose non-test source was touched for this feature retains ≥80% on statements / branches / functions / lines *over the touched files and overall* (constitution III — same bar as 001 SC-003, 002 SC-004, etc.). No suppression comments added to meet gating; coverage is measured via merged node+browser sessions where applicable (005).

- **SC-006 — No regression on 2-player**: The existing 2p E2E (`tests/e2e/full-stack.spec.ts` + `tests/e2e/*.spec.ts` for lobby/console), lobby `tests/integration/lobby-transport.test.ts`, determinism fixtures (engine/terrain/console golden hashes), and `host.ts` single-port smoke in default `--players 2` mode all remain green. No `NETWORK_API_VERSION`/`MATCHMAKING_API_VERSION` bump.

- **SC-007 — Lobby UX + waiting-overlay correctness**: For each `N ∈ {3,4}` a component + integration pass proves: radio `N` pre-selects the FR-001 size; manual override persists across radios; listing chrome reads `k/N` with correct Join/Spectate (010 FR-006/FR-007); waiting overlay on `k/N` filling shows the FR-005 singular/plural string (e.g., "1 more player… (2/3)" vs "2 more players… (1/3)") and hides on `tick≥1` (005 item 11 parity). Keyboard/a11y announcements remain (WCAG 2.2 AA — constitution VI) and handle/identity privacy scans remain clean (010 NFR-003 / `check-documentation-privacy.mjs`).

- **SC-008 — Host CLI smoke for N>2**: `host-config` unit tests + one real-`http.Server` integration smoke per `N ∈ {3,4}` (with `port: 0` + `__boundPortForTest()` per 011 FR-009) are green: `--players 3|4 --board-size 32|48|64` resolve correctly, invalid values fail with actionable messages naming the flag and allowed set, bare `--players 3` implies `48` (FR-011), and the booted stack at `--players N` prints `N` URLs, serves `GET /version === APP_VERSION` and same-origin WS over the same port (011 SC-002/SC-005 checks extended to N>2 smoke).

- **SC-009 — Manual version stays truthful without publishing secrets**: The implementation change set(s) include `docs/manual/` updates per FR-013; `pnpm version:check` is green (`APP_VERSION` lockstep) and the docs check is green (zero credential leaks, stale two-port references gone; non-secret IDs may be documented); `reading-the-screen` status values, the `numbers.md` tunable table, the lobby/waiting/host instructions, and the footer version line(`docs/manual/index.md`) are all byte-consistent with shipped behavior.

## Assumptions

- `playerCount` stays `2|3|4` — no 5+ in scope. The lobby radios and matchmaking validation already cover these three values.
- Board sizes in the lobby/host UI are `32|48` (the `64` option is temporarily disabled — terrain generation is unreliable, follow-up issue #26 — until the terrain fix lands). The engine and matchmaking server accept any `boardSize ∈ [8,128]` from direct API callers; the UI's discrete set is a presentation constraint, not a simulation capacity.
- Tick cadence stays `250 ms` (4 ticks/s). No separate cadence per player count in v1; pressure-testing larger boards at the same cadence stays within 004 SC-005 budgets.
- City placement physics and terrain generation characteristics (GeoMorph fractal, water in lowest basins, point symmetry) are unchanged; 003 Clarifications v1.2 (even-normalization + both-water-metrics placement) is normative and already tested.
- Guest identities remain in-memory ephemeral (010 FR-015) with the existing reconnect grace window — no new persistence scope.
- Single-port topology (011 FR-001..FR-005) is the only deployment topology. No second listener, no `HOST_STATIC_PORT`, no Docker multi-port variant.
- Manual is English-only plain Markdown under `docs/manual/` rendered by the existing Pages workflow (007 FR-001/FR-014) — no site-generator change.

## Out of Scope

- Engine/sim/networking/terrain mechanic changes (attrition, pipes, paratroop/gun math, city production/decay/capacity, fog radius/memory rule, tick physics, victory rule).
- 5+ player games, board sizes beyond `64` in the UI, new terrain algorithms, persistence, replays/history, chat, ratings ladder, invitations, cross-device accounts/transfers, moderation, TLS/secrets/orchestrator work (Docker/K8s/manifests), TLS-rate-limit hardening, analytics/search/personalization, mobile/touch adaptation — all explicitly deferred.
- Changes to `NETWORK_API_VERSION`/`MATCHMAKING_API_VERSION`/`ENGINE_API_VERSION` (no bump).
- Second HTTP listener / split-port deployment (011 FR-004 explicitly removed).
- Accounts, DB/file persistence, invitations (binding decision 2 / 010 FR-015).

## Clarifications

### Session 2026-08-28 — Binding product decisions encoding issue #6 (v1.0 — zero ambiguities)

No interactive clarification loop was required: issue #6 noted the feature is blocked on #2 (now fixed/merged) and the product owner supplied a decided plan that eliminates the usual four open questions. This section encodes each as a ruling, not an open prompt.

- **Q1 Board size per player count — decision**: Lobby create forms and `pnpm host` pre-select a *larger* board for 3–4 players while keeping independent choice. Concrete defaults: **2p→32**, **3p→48**, **4p→48**, overrideable to any of `32|48|64` without rejection (the server's broader `[8,128]` clamp remains on the direct API). The default lives in one source map in `@europa/matchmaking` so lobby UI, host CLI, and manual numbers consume the same table. Rationale: preserves per-player land density (2p 32 and 4p 48 give ~512 vs ~576 cells/player) without forcing `64` on every 4p host, while `64` remains available for spacious play.
  - Alternatives considered and rejected: (a) fixed `32` for every count — rejected: 3–4p cramped; contradicts the original's larger-board availability for larger player counts; (b) `3p→48, 4p→64` as default — rejected: `64` doubles per-player area over 2p 32 and raises terrain generation cost at the 1 s budget, while leaving `48` as the common tokenless-default for both 3p and 4p simplifies docs; `FF-?` The lobby could pin `64` for 4p as "more spacious" later without a spec change — it's already allowed.
  - Recorded as **FR-001** (source defaults map) and **FR-002** (UI pre-select/override preservation) and **FR-011** (host implied-size rule).

- **Q2 Lobby extra chrome + waiting overlay — decision**: YES to visible seats-occupied / capacity chrome in the lobby list, and YES to pluralized waiting-overlay copy. The lobby list shows `seatsFilled / playerCount` per row (e.g., "Players 2 / 3") plus board-size and lifecycle/Joy/Spectate affordance (existing fields + enhanced capacity display) — no new protocol field. The waiting overlay ("Waiting for opponent to join…" in singular 2p v1) becomes N-aware: for `k/N` filling it reads "Waiting for N-k more players… (k/N)" with correct singular/plural form, remaining polite-live-region announced, reduced-motion honored, pointer-transparent, and self-hiding on the first real tick (005 Implementation Notes item 11 parity).
  - "Without extra chrome" alternative was rejected at intake — it would leave the multi-player capacity implicit from the occupancy integer.
  - Recorded as **FR-003** (lister chrome) and **FR-005** (overlay pluralization) and the corresponding SC-007 acceptance pass.

- **Q3 Host script — decision**: `packages/console/scripts/host.ts` gains additive CLI flags `--players 2|3|4` (aliases `--player-count`, env `HOST_PLAYER_COUNT`) and `--board-size 32|48|64` (aliases `--boardSize`, env `HOST_BOARD_SIZE`), each validated at parse time with actionable reject ("--players must be 2, 3, or 4", etc.), no second listener, single `http.Server` on `HOST_PORT` unchanged. `--players N` alone implies the board size from FR-001 (so `--players 3` with no `--board-size` yields `48`, not silently `32`). Bare `pnpm host` remains `2p→32` for 2p compatibility. The launcher prints `N` token-bearing join URLs in `--create` mode and the stack is booted with `port: 0` + `__boundPortForTest()` in E2E fixtures per 011 FR-009 — no two-port seam reintroduced.
  - Recorded as **FR-011** (host flags/env/defaults/validation) and SC-008.

- **Q4 Testing bar — decision**: Full-stack E2E for BOTH `3` and `4` players is required — lobby→match→ticks→orders→victory with per-seat fog isolation, plus deterministic terrain seeds and fog/terrain balance checks parameterized over `3` and `4`. The harness mirrors the existing 2p E2E `tests/e2e/full-stack.spec.ts` `buildStack()` recipe but parameterized over `N ∈ {3,4}` (three/four distinct guest identities claiming seats atomically, single-server `HOST_PORT: 0` topology per 011). At least one seed exercises an odd `citiesPerPlayer` for `3p` to exercise even-normalization determinism. Coverage on touched logic remains ≥80% on every metric (constitution III); no `any`/suppressions; `2`p remains green.
  - Recorded as **SC-001..SC-004** (3p suite, 4p suite, deterministic seeds / balance suites, zero-leak audit) plus **SC-005..SC-006** (coverage + no-2p-regression) and plan tasks TBD.

- **Disambiguated earlier phrase "blocked by #2"**: Blocked is resolved — spec is written against working terrain (003 Clarifications v1.2) and the evidence is the landed terrain 242 + matchmaking 171 test lines on branch `issue-2-3-player-match` now on `main`.

- **Consequence for 010 `Out of Scope` line**: Feature 010's explicit "End-to-end expansion of 3–4 player browser flows; the existing v1 contract remains 2-player end-to-end while engine/matchmaking support is retained" is now superseded in scope by *this* feature. For clarity: 010 is truthful about what 010 shipped; this feature (012) lifts that limitation. No retroactive edit to 010's historical spec prose is required.

### Clarifications v1.1 — 2026-08-29 (disable 64×64 board size, terrain issue #26)

- **Q5 64×64 temporarily disabled — decision**: 64×64 terrain generation is unreliable in the terrain package (pre-existing, tracked as follow-up issue #26). Until that is fixed, the `64` board size is disabled in the two user-facing surfaces that offer it — the lobby create form (`CREATE_BOARD_SIZES`) and the `pnpm host` CLI (`--board-size` / `--boardSize` / `HOST_BOARD_SIZE`). The selectable set is `32|48`; the host CLI rejects `64` with an explicit "temporarily disabled" message naming issue #26 rather than a generic allowed-set error. `BOARD_SIZE_DEFAULTS` (`{2:32, 3:48, 4:48}`) is unchanged, and the engine/matchmaking server still accept any `boardSize ∈ [8,128]` from direct API callers (the UI's discrete set is a presentation constraint, not a simulation capacity). This is a product/UX limitation, not a spec semantics change: FR-001 and FR-011 carry the operative note; the `UiBoardSize` contract mirror keeps `64` in its type as the theoretical set so a direct API caller can still supply a 64 board.
  - Recorded as **FR-001** (Clarifications v1.1 note) and **FR-011** (Clarifications v1.1 note) and the manual edits in the same change set (FR-013).

## Dependencies & Cross-Spec Impact

| Spec | Relation | Impact of this feature |
| --- | --- | --- |
| 001 core engine FR-019 | Consumed (no engine edit) | Adds 3p/4p scripted + E2E coverage at 250 ms ticks; no constants/order/victory change. |
| 003 terrain (Clarifications v1.2) | Consumed (no terrain edit) | Exercises even-normalization + `partnerPlayer` + both-water-metrics on defaults `48`; SC-003 samples include odd `citiesPerPlayer` for 3p. |
| 002 fog + 004 networking | Consumed (no protocol edit) | Parameterized isolation/cadence/rate-limit/reconnect audits over N=3,4 remain envelope/version-stable. |
| 006 matchmaking | Consumed (no matchmaking edit) | Exercises `playerCount` `2|3|4`, private-link hiding, auto-start, GC lazies, `initialSeed`, lifecycle observables for N>2; validation `detail` contract reused. |
| 010 public lobby | Extended (UI layer) | Create form pre-selects FR-001 defaults with override; list renders capacity chrome (FR-003); status/projection privacy unchanged. |
| 005 console | Extended (overlay copy) | Waiting overlay pluralizes over capacity/seats (FR-005); geometry/input contracts untouched. |
| 011 single-port host | Extended (host flags) | `resolveConfig ↔ HostConfig` gains `--players`/`--board-size` (FR-011); `port: 0` fixtures parameterized over N; second-port prohibition preserved. |
| 007 player manual FR-012 | Triggered | `docs/manual/*.md` + `numbers.md` + version footer updated in the same change sets (FR-013/FR-014); drift + privacy checks stay green. |
| 009 shared versioning | Preserved | No new versioned surface; `APP_VERSION` lockstep unchanged; `pnpm version:check` green. |
| 008 CI | Extended | New workflow `.github/workflows/lobby-n-players-ci.yml` (or equivalent) path-gated on `packages/matchmaking/**`, `packages/terrain/**`, `packages/console/**`, `specs/012-*/**`, `docs/manual/**`, `packages/console/scripts/host.ts`; existing per-package CIs gain N=3,4 parameterized coverage without version-bumps. |

Constitution alignment: **II** (server-authoritative deterministic ticks/fog, no wall-clock in simulation) + **III** (≥80% on new logic, SC-005) constrain N-parameterization to harnessing existing authoritative paths; **IV** (specs+manual stay truthful — FR-013) forces `docs/manual/` updates; **V** (simplicity — one source map for defaults, one harness parameterized over N, no protocol bump) rejects speculative generality; **VI** (WCAG AA) carries into lobby chrome + overlay announcements; **VII** (single-port self-host, one `http.Server` + `HOST_PORT` only) binds host changes to additive flags (011).
