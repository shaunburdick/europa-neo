# Feature Specification: Client Console (Satellite View & Orders)

**Feature Branch**: `005-client-console`

**Created**: 2026-08-21

**Status**: Implemented (2026-08-30)

**Input**: User description: "Browser client rendering the satellite-view grid within the player's visibility horizon, issuing all original order types (region-based pipe toggling, exclusive pipes, keyboard equivalents, paratroopers/guns via subcell targeting, reserves 0–9), modernized UX with quality-of-life improvements. Rendering technology is the architect's choice within TypeScript."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Satellite Grid Within the Visibility Horizon (Priority: P1)

As a player, I want a clear real-time view of the moon surface — terrain elevation, my troops, my pipes, and any enemies within sensor range — so that I can make informed decisions at game speed.

**Why this priority**: The console's first duty is showing the current state legibly; without it no order can be aimed.

**Independent Test**: Can be tested by connecting the client to a scripted server feed and asserting the rendered state matches each tick payload (cells, counts, pipes, colors).

**Acceptance Scenarios**:

1. **Given** a tick payload arrives, **When** the console renders, **Then** every visible cell shows terrain shading by elevation, troop count for occupying stacks, owner color, and slope color-coded pipe direction indicators.
2. **Given** cells outside the player's horizon, **When** rendered, **Then** they appear as undifferentiated unknown space (black/void).
3. **Given** a battle or capture event in view, **When** it renders, **Then** the change is visually distinguishable (event feedback) without obscuring the board.

---

### User Story 2 - Pipe Commands With Region Targeting (Priority: P1)

As a player, I want to toggle per-direction pipes by pointing at a region of a cell (N/E/S/W), set an exclusive pipe that replaces all others, and use keyboard equivalents — exactly the original scheme — so that pipe management is fast enough for real-time play.

**Why this priority**: Pipes are the primary interaction; their ergonomics define the game's feel.

**Independent Test**: Can be tested with input simulation: hover/click positions map to correct region orders; keyboard equivalents produce identical orders.

**Acceptance Scenarios**:

1. **Given** the cursor over the eastern region of a friendly cell, **When** primary-click fires, **Then** an east-pipe toggle order is issued (create if absent, remove if present).
2. **Given** the cursor over any region of a cell with existing pipes, **When** exclusive-mode click fires (secondary button or Alt+primary), **Then** an exclusive-pipe order replaces all pipes in that cell.
3. **Given** the cursor over an occupied friendly cell, **When** i/j/k/l is pressed, **Then** north/west/south/east pipe orders are issued respectively; Alt+key issues exclusive variants.
4. **Given** the cursor over a cell, **When** space is pressed, **Then** all pipes in that cell are cleared.

---

### User Story 3 - Paratroop and Gun Targeting (Priority: P2)

As a player, I want to aim paratroopers and guns by positioning the cursor inside the source cell as a localized range-2 map (the original subcell scheme), so that targeting is precise and fast.

**Why this priority**: Signature offensive controls; depend on the render + order pipeline being solid.

**Independent Test**: Can be tested by simulating cursor positions within a cell and asserting the resulting target-cell coordinates match the original mapping (cursor quadrant/ring → offset ≤ 2).

**Acceptance Scenarios**:

1. **Given** the cursor in the source cell positioned toward a neighbor 2 cells NE, **When** p/h fires, **Then** a paratroop order targets exactly that cell.
2. **Given** the same aiming posture, **When** g/o fires, **Then** a gun order targets the same computed destination.
3. **Given** a target beyond range 2 implied by cursor position, **When** the command fires, **Then** the client clamps/rejects locally before sending (no invalid orders sent).

---

### User Story 4 - Reserves Control (Priority: P2)

As a player, I want to set reserves per cell with keys 0–9 (10%×key held in place) and see brief on-screen confirmation of the value, matching the original.

**Why this priority**: Defensive staple; small but essential control surface.

**Independent Test**: Can be tested by pressing each digit over a cell and asserting the reserve order payload plus visible confirmation.

**Acceptance Scenarios**:

1. **Given** the cursor over a friendly cell, **When** "7" is pressed, **Then** a set-reserves-70% order is issued and "70%" flashes briefly on that cell.
2. **Given** the cursor over a cell, **When** "0" is pressed, **Then** reserves are cleared (0%).

---

### User Story 5 - Modern Quality-of-Life Layer (Priority: P3)

As a player, I want modern conveniences — zoom/pan, readable counters, connection status, surrender/spectate controls, and optional sound — so that the game feels current without changing its mechanics.

**Why this priority**: Differentiator for the modernization goal; the game is complete without them.

**Independent Test**: Can be tested manually/via UI automation: each QoL control performs its function without affecting authoritative state.

**Acceptance Scenarios**:

1. **Given** a match in progress, **When** the player uses zoom/pan, **Then** the board scales/translates smoothly while input targeting remains accurate at all zoom levels.
2. **Given** a losing position, **When** the player clicks Surrender and confirms, **Then** a surrender order is sent and the console switches to full-visibility spectator mode.
3. **Given** network trouble, **When** the connection drops, **Then** the console shows explicit reconnecting status and auto-reconnects per feature 004.

---

### Edge Cases

- What happens when input targets an enemy-owned cell for pipe orders? → Client may send; server rejects; console surfaces the rejection non-intrusively.
- What happens when orders are issued during disconnect? → Console queues nothing silently: inputs are disabled with visible status when offline.
- What happens at extreme zoom on large boards? → Rendering degrades gracefully (level-of-detail simplification) rather than dropping frames.
- What happens when two rapid contradictory orders race (toggle then exclusive)? → Both are sent in order; server applies sequentially; console reflects authoritative result after next tick.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The console MUST render the player's fog-filtered game state each tick: elevation-shaded terrain, water, city markers, troop counts, owner colors, and slope color-coded pipe indicators (FR-013).
- **FR-002**: The console MUST support region-of-cell pointer targeting for pipe toggling (N/E/S/W) mirroring the original mouse-button semantics.
- **FR-003**: The console MUST provide exclusive-pipe input (secondary button and Alt+primary/Alt+key equivalents).
- **FR-004**: The console MUST implement keyboard equivalents: i/j/k/l (N/W/S/E pipes), space (clear cell pipes), p/h (paratroop), g/o (gun), 0–9 (reserves).
- **FR-005**: Paratroop/gun targeting MUST use the subcell local-map scheme: cursor position within the source cell selects destination within Chebyshev range 2, identical to the original mapping.
- **FR-006**: The console MUST validate orders locally where possible (range, water, ownership) and prevent sending orders the server would deterministically reject, while treating the server as final authority.
- **FR-007**: The console MUST display transient confirmation of reserve values and surface order rejections as unobtrusive feedback.
- **FR-008**: The console MUST show connection/match status (connecting, live, reconnecting, surrendered/spectating, game over) at all times.
- **FR-009**: The console MUST provide surrender (with confirm) transitioning to read-only full-visibility spectation.
- **FR-010**: The console MUST be usable at common desktop resolutions with zoom/pan; all interactive elements reachable by mouse and keyboard alone (accessibility-minded per constitution).
- **FR-011**: Rendering technology is free within TypeScript/browser standards; the console MUST consume only protocol messages from feature 004 (no direct engine access).
- **FR-012**: The console MUST render the application version in the HUD status-display area (FR-008's neighborhood) as real DOM text (not canvas): the bundled build constant, `v`-prefixed, visible in all connection states, meeting WCAG 2.2 AA contrast (constitution VI), never intercepting pointer or keyboard interaction, and never displaying a server-supplied value (feature 009-shared-app-versioning).
- **FR-013**: The console MUST color-code pipe indicators by slope, derived from the fog-filtered view's elevation data (feature 001 FR-007): downhill pipes green, flat pipes amber, uphill pipes red — a fixed three-color scheme with no intensity scaling — and MUST render a stalled uphill pipe (one whose flow rate is 0 under feature 001 FR-007's formula) with a visually distinct treatment: a hollow (outline-only) triangle in the stalled color, distinct from the filled triangles of flowing pipes. Slope classification MUST mirror feature 001's constants (`flowBase`, `flowSlopeStep`, `flowSlopeDeltaCap`) via a console-side mirror pinned by a drift test against `ENGINE_CONSTANTS`; a pipe whose destination cell is outside the visibility horizon (elevation unknown) MUST render in the flat color without claiming a slope.

### Key Entities *(include if feature involves data)*

- **ConsoleState**: latest applied PlayerView + connection status + pending-order feedback.
- **InputMapping**: pointer/keyboard gesture → typed OrderMessage translation table (mirrors original controls).
- **RenderLayer**: terrain / units / pipes / effects separation for efficient delta redraws.
- **QoLSettings**: sound on/off, zoom level, persisted per browser (local only in v1).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every order type in feature 001 FR-018 is issuable through the console, verified by automated input-simulation tests asserting correct wire messages.
- **SC-002**: Rendered output matches the authoritative PlayerView for 1,000 consecutive ticks in a scripted match (zero divergence).
- **SC-003**: From user action to order message sent takes under 50 ms (input pipeline overhead), keeping perceived latency dominated by network+tick time.
- **SC-004**: A new player familiar with the original can execute the original control repertoire without relearning (parity checklist passes).
- **SC-005**: Keyboard-only users can issue every order type (accessibility check).

## Assumptions

- Desktop browsers are the v1 target; touch/mobile adaptation is out of scope but layout must not preclude it later.
- Sound assets are optional polish; the toggle exists from v1 but silence is acceptable default.
- Visual style is free to diverge from the original (modernization mandate); mechanical parity of controls is the requirement, not pixel fidelity.
- Client-side prediction is deliberately minimal (tick-paced game); correctness beats latency masking in v1.

## Clarifications

### v1.1 (2026-08-23) — Perf-gate hardening after CI-runner jitter

- 2026-08-23: Perf gate hardened after a shared-CI-runner throttle incident (coverage job flaked at paint min-round-median 9.2 ms vs the 8 ms budget while local p50 is ~1.8 ms; runner p99 225 ms showed environmental throttling across every round). The pass criterion is the MIN of round medians across ≥5 rounds (warmup + batch calibration unchanged) — the most jitter-robust estimator of "can this machine hit the budget when not thrashed". A documented CI slack knob, `EUROPA_PERF_BUDGET_FACTOR` (default 1.0), multiplies ONLY the paint budget and is set to 2 in client-ci.yml where perf tests run; local defaults keep the budgets strict.

### v1.2 (2026-08-30) — Slope color-coding for pipes (issue #30)

- **FR-001 amended / FR-013 added**: pipes render color-coded by slope (downhill green / flat amber / uphill red) with a distinct hollow-triangle treatment for stalled uphill pipes. Resolves issue #30 open question 2: **no intensity scaling** — a fixed three-color scheme. Rationale: simplicity (constitution V); feature 001 Clarifications v1.1 shows the terrain's elevation deltas saturate quickly, so intensity would carry little information; and a fixed scheme keeps the design-token table small and the WCAG story auditable.
- **Design tokens (companion change required)**: the four pipe colors MUST be new `@europa/design` color tokens (`pipeDownhill`, `pipeFlat`, `pipeUphill`, `pipeStalled`) added to `packages/design/src/tokens.ts` and `DESIGN.md` §1.1/§3 with measured pairings — additive (minor) per DESIGN.md §6. `palette.ts` re-exports them per FR-009. The implementation change set MUST also update `DESIGN.md` (FR-018 sync rule) and carry a companion note in spec 012; the console no-literals guard (G-04) fails until the tokens exist.
- **Slope mirror drift**: the console's slope classification thresholds mirror `ENGINE_CONSTANTS` (feature 001 FR-007); a drift test importing `@europa/engine` constants pins the mirror (the console already imports engine types for `MapView` construction), so a future retune fails loudly in the console suite.
- **Fog edge case**: a pipe whose destination is outside the visibility horizon renders in the flat color (no slope claim). Practically unreachable for a player's own pipes — a pipe's destination is always within the owner's sensor horizon — but specified defensively.

## Implementation Notes (2026-08-23, Phase 8 Polish)

Notable rulings and deviations made during implementation. Where a
task's prose conflicted with the shipped architecture, the shipped
architecture won and the deviation is recorded here (specs stay
truthful).

1. **No rAF paint loop (T086 prose)**: the contract-era design had a
   requestAnimationFrame loop deriving `MapView` per frame. The
   shipped React 19 render model derives `MapView` synchronously from
   each committed state (`useSyncExternalStore` in `App`) and paints
   on commit — a rAF poller would double-paint. Rendering remains
   exactly-on-state-change; SC-002/SC-003 are unaffected.
2. **`scheduleReconnect` effect is informational**: reconnection is
   transparent inside the feature 004 `MatchClient` adapter (per
   console-to-networking guarantee #1). The runtime logs the hint and
   does not own timers.
3. **`showErrorModal` / `playSound` / `requestSurrenderConfirm`
   effects**: never emitted by the v1 reducer. The runtime handles
   them defensively (log / sound seam / modal epoch) so future
   emitters work without runtime changes.
4. **Bundle budget scope (Q-P03)**: "initial bundle < 150 KB gzipped"
   is enforced by `scripts/test-selfhost.sh` over the
   browser-delivered payload (`dist/assets/**`, currently ~76.5 KB).
   The tsc library tree also emitted into `dist/` is consumed by
   bundling hosts, never fetched by browsers, and is out of scope.
   The browser-mode perf suite cannot read the filesystem, hence the
   enforcement point.
5. **Coverage gate scope (T094/T097)**: DOM-bound modules
   (`src/render/`, `src/ui/`, `src/qol/minimap.tsx`) are covered by
   the component/a11y/E2E suites in real Chromium; node-only coverage
   of them is impossible. `vitest.config.coverage.ts` merges node +
   browser projects into ONE thresholded session — ≥80% on every
   metric over all of `src/` except `main.tsx` + `src/internal/`.
   Result: 88.7 stmts / 81.3 branches / 88.7 funcs / 88.7 lines.
6. **Conformance typecheck program**: tests are excluded from every
   package's tsconfig repo-wide, which would have made T089's
   compile-time checks dead code. The console ships
   `tsconfig.conformance.json` + `pnpm typecheck:conformance` (strict
   program over `src/` + the conformance test), wired into CI.
7. **`Console.sendOrder` ActionIds**: host-initiated wire orders share
   the reducer's ActionId counter via exported `allocateActionId()`,
   guaranteeing no seq-correlation collisions with gesture-issued
   ids. They are not registered as pending orders; their acks produce
   feedback only.
8. **Built-in surrender modal trigger**: `requestSurrender()` without
   a host callback bumps an epoch counter passed to `App` as
   `surrenderRequestEpoch`; the confirm gate itself stays in
   `SurrenderModal` (FR-009).
9. **Input layer default**: v1's pointer/keyboard controllers ship
   inside `App` (US2–US5 architecture), so `deps.inputFactory`
   defaults to a documented no-op; hosts may still inject.
10. **`loadReplay` omitted**: declared optional in the contract for
    forward compatibility; v1 does not implement it (per contract
    JSDoc).
11. **Waiting-for-opponent overlay (post-playtest fix, 2026-08-23)**:
    product-owner playtesting found that a console joining a match
    that is still filling reaches status `live` but receives no tick
    broadcast until matchmaking's auto-start fires with the final
    seat — rendering as a silent black grid indistinguishable from a
    broken client. The console now derives "awaiting match start"
    purely from existing state (`isAwaitingMatchStart` in
    `src/state/awaiting-start.ts`: status `live` AND
    (`latestView === null` OR `latestView.tick === 0`) — worlds are
    created at tick 0 and every server broadcast happens after
    `advance()`, so tick 0 is exactly the unstarted join-snapshot
    fingerprint). While awaiting, `App` renders a pointer-transparent
    `WaitingOverlay` over the board area ("Waiting for opponent to
    join…" + decorative spinner, `prefers-reduced-motion` honored via
    both an App-subscription modifier class and a stylesheet media
    query), announced once through the polite live region. The
    overlay hides itself on the first real tick or any status change,
    so it never stacks with the reconnecting banner or game-over
    surfaces; HUD/status-chip behavior is unchanged. No acceptance
    criteria changed; no contract surface touched.
12. **Wire-view rehydration at the browser decode boundary
    (2026-08-24, live-wire defect fix)**: feature 004's frame codec
    serializes Set-typed view fields (`CellView.pipes`) as sorted
    arrays on the wire (`frame.ts` §wireReplacer), while this spec's
    contracts — and every console consumer — promise
    `ReadonlySet<Direction>`. The Node-side fixtures rehydrated, but
    the shipped browser client (`ws-match-client.ts`) passed decoded
    payloads through unrepaired: live matches crashed on every board
    click (`pipes.has is not a function` in region-select) and froze
    the UI after pipes-bearing ticks (the `buildMapView` render diff
    threw inside `useMemo`, unmounting React while the socket stayed
    open — "ticks stop until refresh"). The demo runtime never saw it
    because `FakeMatchClient` supplies in-memory Sets. Fix: one shared
    helper (`src/net/rehydrate-wire-views.ts`) runs in the client's
    onmessage handler before any consumer sees an envelope, covering
    live ticks, join snapshots, AND the reconnect snapshot + replay
    window by construction. This is conformance repair against the
    existing contract (which already declared ReadonlySet), not a
    semantic change — no contract text amended. Full sweep confirmed
    `CellView.pipes` is the only Set/Map-typed field in any
    server→client payload. The idle-sweep suspicion voiced during
    triage was disproven: the client's heartbeat is app-level `ping`
    (schema-valid), and the server counts every inbound frame as
    activity; both halves keep a quiet seat alive past 2× heartbeat
    (now pinned end-to-end by `test:keepalive`).
13. **Fog/void + land-floor palette contrast (post-playtest fix,
    2026-08-24)**: product-owner playtesting found the board reading
    as broken "bands" — low-elevation land (`hsl(120 12% 18%)` ≈
    `#293329`) was nearly indistinguishable from the near-black void
    (`#05070d`), which was itself nearly identical to the page
    background (`#0b0f19`). Paint-only constants adjusted:
    `VOID_COLOR` → `#1a2233` (dark slate, visibly "board space",
    darker than any land tile, never equal to the page background —
    now exported as `PAGE_BACKGROUND_COLOR` so the invariant is
    testable) and `LAND_MIN_LIGHTNESS_PCT` 18 → 26 (darkest land
    clearly lighter than void; hue/sat/max unchanged so "renderer
    shades terrain by elevation" still holds). Canvas letterbox,
    minimap backdrop, and the translucent modal/waiting veils were
    synced to the same value. Fog cells remain structurally absent
    from views (FR-002/FR-005 no-leak untouched — existing suites
    still pin this); no acceptance criteria changed; no contract
    surface touched.
14. **Local/LAN host hardening (2026-08-24)**: the `pnpm host` launcher
     remains loopback-safe by default, while `HOST_BIND_HOST` /
     `HOST_PUBLIC_HOST` (or the equivalent CLI flags) explicitly opt into
     LAN binding and reachable printed URLs. Its development static server
     uses canonical path containment (including symlink resolution) and
     baseline security headers. Direct internet exposure remains out of
     scope: TLS, rate limiting, origin controls, and admission/token redesign
     are explicitly deferred to Option 2.
15. **HUD version footer (2026-08-25, feature 009-shared-app-versioning)**:
    FR-012 lands via feature 009's change set. `App` renders a plain,
    non-interactive `<span>` (classes `europa-hud__item
    europa-hud__version`) inside the `#hud` status bar carrying
    `v{APP_VERSION}` — the BUNDLED `@europa/version` constant, never
    the hello ack's `appVersion` (a stale tab must not display a
    version it is not running), so the footer renders identically in
    every connection state and on the serverless `/` demo. No
    handlers, tabindex, or role; `#9ca3af` on the HUD's `#111827`
    background ≈ 6.99:1 contrast (AA). Old-server tolerance is pinned
    (`hello-app-version-tolerance.test.ts`: a helloAck without
    `appVersion` derives a clean NetEvent and the field is never
    propagated into state); component tests assert the real DOM text
    via the imported constant across idle/live/reconnecting states
    (`hud-version.test.tsx`).

### Quickstart validation mapping (Q-* → proving suites)

| Quickstart items | Proving suite | Result |
| --- | --- | --- |
| Q-C01..Q-C03 (dev-mode boots) | Manual smoke; `?e2e` harness covered by Playwright specs | Manual |
| Q-U01..Q-U10 (unit) | `test:unit` — 192 tests incl. reducer arms/invariants, net layer, preflight, zoom math, controllers | PASS |
| Q-B01..Q-B08 (component) | `test:component` — 25 tests | PASS |
| Q-E01..Q-E15 (E2E) | `test:e2e` — 7 Playwright specs covering US1–US5 wire-level acceptance + selfhost smoke | PASS |
| Q-A01..Q-A08 (a11y E2E) | `test:a11y` — 19 axe-core acceptance tests | PASS |
| Q-P01/P02/P04 (perf budgets) | `test:perf` — paint 1.8 ms (<8), reduce ~0.2 µs (<1 ms), preflight ~0.3 µs (<0.1 ms) | PASS |
| Q-P03 (bundle < 150 KB gz) | `test:selfhost` — 76,528 bytes over `dist/assets` | PASS |
| SC-002 determinism | `test:determinism` — 1000-tick golden fixture, zero divergence | PASS |
| SC-004 parity | `test:parity` + original-subcell fixture | PASS |
| Constitution VII self-host | remote-URL scan in `test:selfhost` | PASS |

Historical validation counts are configuration-specific and intentionally
not a current total; run the package commands above for the authoritative
suite result. Coverage remains gated at ≥80% on every metric.
