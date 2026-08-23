# Feature Specification: Client Console (Satellite View & Orders)

**Feature Branch**: `005-client-console`

**Created**: 2026-08-21

**Status**: Planned

**Input**: User description: "Browser client rendering the satellite-view grid within the player's visibility horizon, issuing all original order types (region-based pipe toggling, exclusive pipes, keyboard equivalents, paratroopers/guns via subcell targeting, reserves 0–9), modernized UX with quality-of-life improvements. Rendering technology is the architect's choice within TypeScript."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Satellite Grid Within the Visibility Horizon (Priority: P1)

As a player, I want a clear real-time view of the moon surface — terrain elevation, my troops, my pipes, and any enemies within sensor range — so that I can make informed decisions at game speed.

**Why this priority**: The console's first duty is showing the current state legibly; without it no order can be aimed.

**Independent Test**: Can be tested by connecting the client to a scripted server feed and asserting the rendered state matches each tick payload (cells, counts, pipes, colors).

**Acceptance Scenarios**:

1. **Given** a tick payload arrives, **When** the console renders, **Then** every visible cell shows terrain shading by elevation, troop count for occupying stacks, owner color, and pipe direction indicators.
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

- **FR-001**: The console MUST render the player's fog-filtered game state each tick: elevation-shaded terrain, water, city markers, troop counts, owner colors, and pipe indicators.
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
