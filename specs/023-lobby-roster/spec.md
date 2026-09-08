# Feature Specification: Lobby Roster

**Feature Branch**: `issue-28-lobby-roster`
**Dependencies**: Feature 004 (multiplayer networking), Feature 005 (client console), Feature 006 (match lifecycle and matchmaking), Feature 010 (public lobby and match browser)

**Created**: 2026-09-08
**Last Updated**: 2026-09-08
**Version**: 1.1

**Status**: Implemented (2026-09-08; anonymous exclusion v1.1 2026-09-08)

**Input**: GitHub issue #28 — add a presence roster to the lobby showing every active player's handle and current status.

## Problem Statement

The lobby delivered by feature 010 lists **matches**, not **players**. A visitor to the lobby has no way to see who else is online, who is in a game, or who is spectating. This makes the lobby feel empty and gives no social context — you cannot tell whether anyone is playing, waiting, or just lurking.

This feature adds a **presence roster**: a server-maintained list of every active player with their handle and current status — **in lobby**, **in game**, or **spectating** — pushed to lobby subscribers in real time and rendered in the console.

This is intentionally a **simple list + update events** feature. The server maintains the roster and broadcasts changes; the console renders them. Each roster entry is exactly `{handle, status}` — the server simply never includes anything else, so there is nothing sensitive to leak. **No privacy-validation layer, no opaque ids, no enforcement machinery.**

## User Stories

### User Story 1 - See Who Is Online (Priority: P1)

As a player in the lobby, I want to see a list of all active players with their handles and current status, so that I know who is available to play with and who is already in a game.

**Why this priority**: Core value proposition — the roster's primary purpose is social visibility.

**Independent Test**: Connect two clients to the lobby with different handles; assert both see each other in the roster with status `in_lobby`.

**Acceptance Scenarios**:

1. **Given** a player in the lobby with a set handle, **When** the roster loads, **Then** their own entry appears with status `in_lobby` and a "(you)" indicator.
2. **Given** two players in the lobby, **When** either player views the roster, **Then** both entries appear with handles and `in_lobby` status.
3. **Given** a player in the lobby, **When** a second player joins the lobby, **Then** the roster updates to include the new player within 1 second.

---

### User Story 2 - Status Updates in Real Time (Priority: P1)

As a player, I want the roster to update automatically as players move between lobby, game, and spectator, so that I always see accurate presence information without refreshing.

**Why this priority**: Stale roster data is worse than no data — it misleads social decisions.

**Independent Test**: Have a player create and join a match; assert the roster updates their status from `in_lobby` to `in_game`. Have them leave; assert it returns to `in_lobby`.

**Acceptance Scenarios**:

1. **Given** a player listed as `in_lobby`, **When** they join a match, **Then** their roster status changes to `in_game` within 1 second.
2. **Given** a player listed as `in_game`, **When** their match ends or they leave, **Then** their roster status changes to `in_lobby` (or they are removed if they disconnect).
3. **Given** a player listed as `in_lobby`, **When** they spectate a match, **Then** their roster status changes to `spectating`.
4. **Given** a spectator, **When** they leave the match and return to the lobby, **Then** their roster status changes back to `in_lobby`.

---

### User Story 3 - Private-Match Participants Show Status Only (Priority: P2)

As a player, I want players in private matches to appear in the roster with their status but without revealing which match they are in, so that I know they are occupied without learning private-match details.

**Why this priority**: Private matches must not leak identity through the roster; status-only is the accepted tradeoff (issue #28 decision 2).

**Independent Test**: Create a private match with one player; assert the roster shows that player as `in_game` without any match ID or match name.

**Acceptance Scenarios**:

1. **Given** a player in a private match, **When** another player views the roster, **Then** the private-match player appears with status `in_game` and no match identity.
2. **Given** a spectator in a private match, **When** another player views the roster, **Then** the spectator appears with status `spectating` and no match identity.

---

### User Story 4 - Players Online Count (Priority: P2)

As a player, I want to see a count of all active players ("Players online (N)") at the top of the roster, so that I can gauge at a glance how busy the server is.

**Why this priority**: Quick social signal; builds on the roster data.

**Independent Test**: Connect three clients; assert the heading reads "Players online (3)".

**Acceptance Scenarios**:

1. **Given** N active players in the lobby, **When** the roster renders, **Then** the heading displays "Players online (N)".
2. **Given** zero active players, **When** the roster renders, **Then** the heading displays "Players online (0)" and the list is empty.

---

### User Story 5 - Presence Unavailable Degraded State (Priority: P3)

As a player, if the roster connection fails or the server does not support rosters, I want to see a clear "Presence unavailable" message instead of a broken or empty list, so that I know the feature is not working rather than thinking nobody is online.

**Why this priority**: Graceful degradation prevents misinterpretation of an empty roster.

**Independent Test**: Connect to a server that does not emit roster events; assert the console shows "Presence unavailable".

**Acceptance Scenarios**:

1. **Given** a lobby connection that has not received a roster snapshot within a reasonable timeout, **When** the roster area renders, **Then** it displays "Presence unavailable" with a note that presence data is not connected.
2. **Given** a roster connection that was working, **When** the connection drops and no roster updates arrive, **Then** the degraded state appears after the timeout.

## Functional Requirements

### Wire Protocol (additive to existing lobby events)

- **FR-001**: The lobby wire protocol MUST gain two additive `LobbyEvent` variants — `roster` (full snapshot) and `rosterDelta` (incremental update) — delivered over the existing `lobbyEvent` frame. No new message kind is introduced; `NETWORK_API_VERSION` is NOT bumped.
- **FR-002**: The `roster` event MUST carry a `RosterSnapshot`: `{ revision: RosterRevision, players: ReadonlyArray<RosterEntry> }` where each `RosterEntry` is `{ handle: string, status: RosterStatus }` and `RosterStatus` is `'in_lobby' | 'in_game' | 'spectating'`.
- **FR-003**: The `rosterDelta` event MUST carry a `RosterDelta`: `{ revision: RosterRevision, changes: ReadonlyArray<RosterChange> }` where each `RosterChange` is `{ handle: string, status: RosterStatus }` — a player whose status changed or who was added. A delta does NOT carry explicit removals; removed players are confirmed only by a subsequent full `roster` snapshot that omits them. Clients merge deltas into their local roster by applying each change (add or update) and MUST NOT remove players absent from a delta. This keeps deltas small; stale entries persist until the next full snapshot (sent on subscribe and periodically — see FR-005).
- **FR-004**: A separate monotonic `rosterRevision` counter MUST track roster state independently from the lobby snapshot revision. The counter starts at 1 and increments by 1 for every roster mutation (player added, removed, or status changed); it MUST NEVER reset (not on server restart, not on any lifecycle event). Every roster snapshot and every roster delta set carries the current revision. Clients MUST discard snapshots or deltas with a revision less than or equal to the last-seen revision (stale-revision protection, matching the existing `LobbySnapshot` pattern). On reconnect, the server sends a fresh full snapshot with the current (high) revision, which the client accepts because its last-seen revision was reset to 0 by the reconnect.
- **FR-005**: On lobby subscribe (existing `lobbySubscribe`), the server MUST send a complete `roster` snapshot as the first roster event for that connection. Subsequent changes MAY be delivered as `rosterDelta` events; the server MUST send a full `roster` snapshot periodically (at minimum every 60 seconds) or when the accumulated unsent delta set would exceed a reasonable size threshold (e.g., 20 changes).
- **FR-006**: Roster entries MUST be ordered deterministically by handle (lexicographic, case-insensitive — matching the existing handle comparison convention in feature 010 FR-005). This ordering is stable across snapshots for the same set of active players.
- **FR-007**: The server MUST deliver roster events ONLY to connections that have subscribed to the lobby (existing `lobbySubscribe` gate). Gameplay-only clients never observe roster traffic.

### Server-Side Roster Derivation

- **FR-008**: The server MUST maintain an authoritative in-memory roster of all onboarded players (players who have completed lobby onboarding — currently: set a handle). A player is added to the roster when they complete onboarding and removed when their onboarding state is cleared, their session ends (disconnect beyond grace window, explicit leave), or the server restarts. Players who have not completed onboarding are excluded from the roster entirely.
- **FR-009**: Player status MUST be derived from the player's current seat/spectator association: `in_game` (seated in a running or filling match) > `spectating` (attached as a spectator) > `in_lobby` (not in any match). The highest-priority applicable status wins.
- **FR-010**: Private-match participants MUST appear in the roster with their derived status (`in_game` or `spectating`) but WITHOUT any match ID, match name, or other match-identifying information. The roster payload `{handle, status}` is the entire data surface — the server never emits match identity through the roster.
- **FR-011**: A grace anti-flap window MUST be applied to status transitions to prevent rapid toggling (e.g., a player leaving a match and immediately rejoining). If a status change occurs within the grace window of a prior change for the same player, the server MUST NOT broadcast the intermediate state — only the final stable state is broadcast after the window elapses. The grace window duration MUST be tunable (default: 500ms).
- **FR-012**: The server MUST broadcast a `rosterDelta` event to all lobby subscribers whenever a player's status changes or a player joins/leaves the roster, subject to the anti-flap grace period (FR-011).

### Console UI

- **FR-013**: The console MUST render a roster card on the lobby landing page (the `/lobby` route from feature 013) showing all active players with their handle and a text status badge (`In lobby`, `In game`, `Spectating`).
- **FR-014**: The local player's own entry in the roster MUST be marked with a "(you)" indicator after their handle, distinguishing them from other players.
- **FR-015**: The roster card heading MUST display "Players online (N)" where N is the total count of active players in the roster.
- **FR-016**: When roster data is unavailable (connection lost, server does not support rosters, or timeout before first snapshot), the roster card MUST display "Presence unavailable" with a brief explanatory note.
- **FR-017**: The roster MUST update in near-real-time as roster events arrive from the server. The UI MUST reflect additions, removals, and status changes within 1 second of the event arriving.
- **FR-018**: The roster MUST be accessible: keyboard-navigable (players listed as focusable items or in a navigable region), status announced via live-region for screen readers (with coalescing to avoid announcement spam during rapid updates), and sufficient contrast for all text and status badges per WCAG 2.2 AA.
- **FR-019**: The roster MUST honor `prefers-reduced-motion`: status-change animations (if any) MUST be disabled; the roster updates instantly without transition effects.
- **FR-020**: Roster entries MUST be removed from the display when the player disconnects (session ends) and added when a new player connects, with no stale entries remaining.

### Documentation

- **FR-021**: The same implementation change set MUST add a `docs/manual/roster.md` page describing the roster feature: what it shows, how status is derived, and the meaning of each status value. The page MUST be linked from the manual's index.
- **FR-022**: The same implementation change set MUST update the README to mention the roster feature in the lobby section.

## Non-Functional Requirements

- **NFR-001 (Performance)**: The roster broadcast MUST NOT add measurable latency to the existing lobby tick cadence. Under normal self-hosted conditions (≤50 concurrent players), roster delta broadcasts MUST complete within 5ms of the triggering event.
- **NFR-002 (Scalability)**: The roster MUST remain functional with up to 100 concurrent lobby subscribers and 500 total active roster entries without degradation. This is a self-hosted v1 target, not a production SaaS target.
- **NFR-003 (Compatibility)**: Existing lobby, identity, match, reconnect, and gameplay contracts MUST remain behaviorally unchanged. The additive roster events MUST be tolerated by older clients (ignored per feature 010's additive-event tolerance rule).
- **NFR-004 (Operations)**: The roster MUST be in-memory only; no persistent storage, no external service, no cloud dependency. A server restart resets the roster (players re-establish presence on reconnect).
- **NFR-005 (Accessibility)**: The roster MUST meet WCAG 2.2 AA: keyboard navigation, screen-reader semantics (list role, live-region announcements), sufficient contrast (≥4.5:1 for normal text, ≥3:1 for large text), and visible focus states.

## Acceptance Criteria

- [ ] **AC-001**: A player in the lobby sees their own entry in the roster with handle, status "In lobby", and a "(you)" indicator.
- [ ] **AC-002**: Two players in the lobby each see both entries in the roster with correct handles and "In lobby" status.
- [ ] **AC-003**: When a player joins a match, their roster status changes from "In lobby" to "In game" within 1 second for all lobby subscribers.
- [ ] **AC-004**: When a player spectates a match, their roster status changes from "In lobby" to "Spectating" within 1 second.
- [ ] **AC-005**: A player in a private match appears in the roster as "In game" with no match ID, match name, or other match-identifying information in any roster payload.
- [ ] **AC-006**: The roster heading displays "Players online (N)" with the correct count of onboarded players.
- [ ] **AC-007**: A player who disconnects beyond the grace window is removed from the roster within 2 seconds for all remaining subscribers.
- [ ] **AC-008**: Roster entries are ordered lexicographically by handle (case-insensitive).
- [ ] **AC-009**: On lobby subscribe, the player receives a complete roster snapshot as the first roster event.
- [ ] **AC-010**: The roster is keyboard-navigable and announced by screen readers (list semantics, live-region for updates).
- [ ] **AC-011**: All roster text meets WCAG 2.2 AA contrast requirements (≥4.5:1).
- [ ] **AC-012**: When roster data is unavailable, "Presence unavailable" is displayed instead of an empty or broken list.
- [ ] **AC-013**: Roster payloads contain exactly `{handle, status}` per entry — no opaque IDs, match IDs, seats, tokens, or any other fields.
- [ ] **AC-014**: Existing lobby, match, and gameplay behavior is unchanged (no regressions in feature 010/006/004/005 test suites).
- [ ] **AC-015**: The `rosterRevision` counter is strictly monotonically increasing (never resets); clients never apply a snapshot or delta with a revision ≤ their last-seen revision.
- [ ] **AC-016**: Anti-flap grace period prevents rapid status-change broadcast spam (a player leaving and rejoining within 500ms produces at most one status change broadcast).
- [ ] **AC-017**: `docs/manual/roster.md` exists, is linked from the manual index, and accurately describes the roster feature.
- [ ] **AC-018**: README mentions the roster in the lobby section.

## Out of Scope

The following are explicitly **not** part of this feature:

- **Privacy enforcement machinery** — compile-time witnesses, forbidden-key byte-scans, doc privacy checks, conformance privacy pins. The `{handle, status}` payload shape is the guarantee by construction; the server simply never emits other fields.
- **Chat, messaging, friend lists, accounts, or invitations.**
- **Reveal of private-match identity or membership** — by construction: the payload carries no match ID.
- **The match browser itself** (feature 010 — the roster complements it but does not modify it).
- **Persistent roster history or logging** — the roster is a live snapshot, not a record.
- **Player count limits or moderation** — the roster lists all active players without filtering.
- **Roster sorting options** — deterministic handle ordering only (simplicity, constitution Principle V).

## Edge Cases

- **Handle change while in roster**: When a player changes their handle (feature 010 FR-004), the roster MUST update the entry with the new handle. The old entry is removed and the new one added (or the entry is updated in-place in a delta). Status is preserved through handle changes.
- **Simultaneous join and status change**: When a player joins the lobby and immediately joins a match in the same event batch, the server applies the anti-flap grace period (FR-011) and broadcasts only the final stable state (`in_game`), not the intermediate `in_lobby`.
- **Server restart**: All roster state is lost. Players reconnecting re-establish their roster presence through the normal lobby subscribe flow. The roster starts empty and populates as players connect.
- **Player not yet onboarded**: Players who have not completed lobby onboarding are excluded from the roster entirely. They are not visible to other lobby participants. Once a player completes onboarding, they appear in the roster immediately. If a player's onboarding state is later cleared (e.g., identity reset), they are removed from the roster.
- **Roster delta after full snapshot**: After a full `roster` snapshot, the server MAY reset its pending-delta queue and subsequent deltas reflect only changes since that snapshot. Clients MUST handle receiving a full snapshot at any time (not just on subscribe) — a full snapshot replaces the client's entire local roster unconditionally.
- **Multiple simultaneous status changes**: When multiple players change status simultaneously (e.g., a match starts and both players transition from `in_lobby` to `in_game`), the server MAY batch these into a single `rosterDelta` event with multiple changes.
- **Empty roster**: When no players are active, the roster snapshot contains an empty `players` array and the count is 0. The UI displays "Players online (0)".
- **Connection loss during roster subscription**: If the lobby connection drops, the roster is unavailable. On reconnect, the player receives a fresh full snapshot (FR-005). The degraded "Presence unavailable" state is shown during the gap.
- **Roster events arriving before identity is set**: A freshly connected client may receive roster events before its own identity is established. The roster renders all known players; the "(you)" indicator is applied only when the client's own handle is known.

## Examples

### Roster Snapshot (server → client)

The `roster` LobbyEvent variant carries a `RosterSnapshot` (analogous to the existing `snapshot` kind carrying `LobbySnapshot`):

```json
{
  "kind": "lobbyEvent",
  "event": {
    "kind": "roster",
    "roster": {
      "revision": 5,
      "players": [
        { "handle": "Alice", "status": "in_lobby" },
        { "handle": "Bob", "status": "in_game" },
        { "handle": "Charlie", "status": "spectating" }
      ]
    }
  }
}
```

### Roster Delta (server → client)

The `rosterDelta` LobbyEvent variant carries a `RosterDelta` (additions and status changes since the last broadcast):

```json
{
  "kind": "lobbyEvent",
  "event": {
    "kind": "rosterDelta",
    "delta": {
      "revision": 6,
      "changes": [
        { "handle": "Alice", "status": "in_game" }
      ]
    }
  }
}
```

### Console Roster Card

```
Players online (3)
┌─────────────────────────────────────┐
│ Alice (you)         ● In lobby      │
│ Bob                 ● In game       │
│ Charlie             ● Spectating    │
└─────────────────────────────────────┘
```

### Degraded State

```
Players online (?)
┌─────────────────────────────────────┐
│ Presence unavailable                │
│ Presence data is not connected.     │
└─────────────────────────────────────┘
```

## Clarifications Applied

> Populated during Phase 3. Each entry documents a question asked and the requirement it produced.

| # | Question | Answer | Requirement Added |
|---|----------|--------|-------------------|
| — | — | — | — |

## Open Questions

None. All design decisions were resolved during the issue discussion and are recorded in the issue body (decisions 1–4) and scope section above.
