# Feature Specification: Console Semantic URL Routing

**Feature Branch**: `issue-35-semantic-url-scheme`
**Dependencies**: Feature 004 (multiplayer networking), Feature 005 (client console), Feature 006 (match lifecycle and matchmaking), Feature 009 (shared app versioning), Feature 010 (public lobby and match browser), Feature 011 (single-port self-host deployment)
**Created**: 2026-08-30
**Last Updated**: 2026-08-30 (v1.0)
**Version**: 1.0
**Status**: Draft — specification complete, clarification gate passed
**GitHub Issue**: #35

## Problem Statement

The console currently exposes a test-oriented query string as its live-match URL (`?live&ws=...&match=...&name=...`), while the production application is now a public lobby. Query URLs are difficult to read, share, bookmark, and evolve, and they make `/` unavailable as a future sign-in/sign-up entry point. The console needs stable semantic paths that distinguish the lobby, a match resource, and explicit join or spectate actions.

The change must preserve existing matchmaking, networking, fog-of-war, reconnect, and accessible console behavior. Native and Docker single-port hosts must serve the SPA entry for direct deep links rather than returning a static 404. The test-only `?e2e` harness remains unchanged; the old live query route and its compatibility contract do not.

## User Stories

### US1 — Reach the canonical lobby (P1)
As a visitor, I want `/` to redirect to `/lobby` so that the root can later be used for authentication while `/lobby` remains the stable public-game entry point.

**Independent test**: Request `/`, then load `/lobby` directly and after reload; verify the public lobby works without creating a match.

### US2 — Open a shareable match URL (P1)
As a player or observer, I want a readable `/match/<matchId>` URL so that I can bookmark or share a match without putting identity or transport details in the URL.

**Independent test**: Open waiting and in-progress match paths in clean browser profiles and verify the appropriate existing player or spectator flow.

### US3 — Use explicit entry shortcuts (P1)
As a player or observer, I want `/match/<matchId>/join` and `/match/<matchId>/spectate` shortcuts so that a link can request exactly the intended action.

**Independent test**: Open each shortcut for an eligible match and verify the server-authoritative player or read-only spectator flow, including actionable invalid-action errors.

### US4 — Recover from bad paths (P1)
As a visitor, I want unknown, malformed, or unavailable routes to recover to the lobby rather than show a blank page or server 404.

**Independent test**: Load unknown paths, malformed IDs, collected matches, and invalid suffixes directly and verify the final canonical path is `/lobby`.

### US5 — Keep delivery workflows reliable (P2)
As a developer or self-hosting operator, I want host output, E2E fixtures, documentation, native hosting, and Docker hosting to use the semantic scheme so that tests and instructions exercise the same production surface.

**Independent test**: Run `?e2e` unchanged, run real full-stack semantic-path flows, and load every canonical path through the single-port host and Docker SPA fallback.

## Route Contract

The browser-visible path is the routing authority. Production URLs do not carry match identity, player name, reconnect token, or WebSocket endpoint in query parameters; existing browser storage and server-side session/reconnect mechanisms remain authoritative.

| Input path | Required behavior |
|---|---|
| `/` | Redirect to `/lobby` without creating a match or connecting to a match. |
| `/lobby` | Mount the existing public lobby runtime. |
| `/match/<matchId>` | Resolve authoritative state: waiting with an open player seat uses player entry; in-progress uses read-only spectation. Full/unavailable state recovers without silently changing action. |
| `/match/<matchId>/join` | Request player entry for exactly this match. On failure, show an actionable error and provide lobby recovery. |
| `/match/<matchId>/spectate` | Request read-only spectator entry for exactly this match. On failure, show an actionable error and provide lobby recovery. |
| Any other path | Serve the SPA where appropriate, then recover to `/lobby` with an accessible unknown-route notice; never attempt a match connection. |

`<matchId>` is one complete path segment. It is URL-decoded only for match lookup and is rejected if empty, malformed, traversal-like, or containing a decoded slash. Routes never expose guest IDs, session tokens, handles, or WebSocket URLs.

## Functional Requirements

- **FR-001**: The console MUST recognize `/`, `/lobby`, `/match/<matchId>`, `/match/<matchId>/join`, and `/match/<matchId>/spectate` as supported production route shapes.
- **FR-002**: `/` MUST redirect to canonical `/lobby`; the redirect MUST not create a match or initiate a match WebSocket leg.
- **FR-003**: `/lobby` MUST mount Feature 010's public-lobby runtime and preserve its guest identity, handle, listing, create, join, spectate, leave, and error behavior.
- **FR-004**: `/match/<matchId>` MUST use authoritative match/lobby state: waiting plus an open seat uses player entry, in-progress uses existing read-only spectation, and full/unavailable state does not silently downgrade to another action.
- **FR-005**: `/match/<matchId>/join` MUST request player entry for exactly the path's match ID; full, running, collected, invalid, or already-committed requests use existing recoverable error behavior.
- **FR-006**: `/match/<matchId>/spectate` MUST request read-only spectator entry for exactly the path's match ID, without allocating a seat or enabling orders.
- **FR-007**: Successful entry MUST hand off to existing waiting/live, networking, reconnect, terminal, fog-of-war, and accessibility contracts without changing gameplay or visibility rules.
- **FR-008**: The semantic match path MUST remain visible through waiting, live play, spectation, reconnect, and terminal display; leaving a match MUST navigate to `/lobby` accessibly.
- **FR-009**: The legacy `?live&ws=<url>&match=<id>&name=[&token=]` route MUST be retired. It MUST not mount a live runtime, and `resolveInitialViewMode` MUST be removed from the public compatibility contract and exports.
- **FR-010**: Production routing MUST NOT require or use `?ws`, `match`, `name`, or `token` as replacements for path routing or to override the path's match identity.
- **FR-011**: `?e2e` MUST remain unchanged as a deterministic, test-only interactive demo harness and MUST not be treated as a production route.
- **FR-012**: Unknown, malformed, unsupported, or unavailable paths MUST recover to `/lobby` without opening a match connection, leaking credentials, or showing a blank screen; user-visible recovery SHOULD announce “Page not found. Returning to lobby.”
- **FR-013**: Direct navigation and reload MUST work for every canonical path. User-visible transitions MUST be bookmarkable, Back/Forward MUST restore corresponding route state, and `/` MUST not create a redirect history loop.
- **FR-014**: Native and Docker single-port hosts MUST serve the SPA entry for `/lobby`, match paths, and shortcuts before client routing, while `/version`, known assets, WebSocket upgrades, traversal guards, and security headers retain their existing handling.
- **FR-015**: Host output, generated links, E2E/integration fixtures, README/package README, player manual, and applicable operational/developer documentation MUST use semantic URLs and contain no stale production `?live` examples. Explicitly test-only `?e2e` examples remain allowed.
- **FR-016**: Generated or documented links MUST contain only origin plus semantic match path; they MUST never contain a guest ID, handle, reconnect token, WebSocket URL, or other credential.
- **FR-017**: Route entry MUST use existing Feature 010 browser-storage/session identity behavior; a URL MUST not claim another identity or seat.
- **FR-018**: Shortcut failures, stale state, transport failures, and expired reconnect state MUST provide accessible retry and/or return-to-lobby actions without exposing opaque identifiers or credentials.
- **FR-019**: Route notices, transitions, and controls MUST retain keyboard operation, semantic names/statuses, visible focus, contrast, and live announcements consistent with WCAG 2.2 AA goals and existing console/lobby behavior.

## Non-Functional Requirements

- **NFR-001 (Reliability)**: In 10/10 direct-load trials for each supported path, the intended state is reached without a server 404 or blank page.
- **NFR-002 (Performance)**: Pure route classification and redirect processing MUST add no more than 50 ms before the selected runtime mounts, excluding network and browser navigation.
- **NFR-003 (Security)**: Untrusted path IDs MUST be decoded and validated safely; route handling MUST prevent traversal, credential leakage, cross-match selection, and unauthorized identity/seat claims.
- **NFR-004 (Compatibility)**: Wire envelopes, protocol version, engine, lifecycle, reconnect, fog, and order contracts MUST remain unchanged.
- **NFR-005 (Self-hosting)**: Native and Docker launches MUST expose one origin/port for HTTP, semantic deep links, `/version`, and WebSocket upgrades.
- **NFR-006 (Accessibility)**: Existing console/lobby accessibility suites MUST remain green and new recovery/transition states MUST have keyboard and automated accessibility coverage.
- **NFR-007 (Determinism)**: Route parsing/classification MUST be pure for identical input, and `?e2e` MUST remain isolated from production networking.

## Edge Cases

- `/match/`, extra path segments, and invalid suffixes recover to `/lobby` without a match connection.
- Encoded slash, backslash, dot-segment, control-character, or traversal-like IDs are rejected after decoding and never passed to static-file resolution.
- Unknown, private/inaccessible, collected, or state-changed matches show a non-fatal unavailable message and lobby recovery.
- A full waiting match is not joinable via adaptive routing and is not silently spectated.
- `/match/<id>/join` against a running match is rejected, not downgraded to spectation; `/spectate` is explicit.
- `/match/<id>/spectate` before spectator attachment is available gives retry/lobby recovery, not a player seat.
- An existing active identity opening another match cannot claim a second seat; existing matchmaking error behavior applies.
- `?e2e` remains the only query-selected harness. A bare or stale `?live` URL does not connect from query values and recovers to `/lobby`.
- Refresh with a valid reconnect credential uses existing storage/session behavior without adding credentials to the URL; cleared storage follows fresh-guest behavior.
- Direct deep links serve the SPA shell; missing assets and genuine server failures use existing error handling, not a fabricated match page.
- HTTPS retains secure same-origin WebSocket behavior and adds no insecure fallback.

## Examples

```text
GET /                         → redirect to /lobby
GET /lobby                    → public lobby
GET /match/m-123              → adaptive Join (waiting/open) or Spectate (running)
GET /match/m-123/join         → explicit player entry
GET /match/m-123/spectate     → explicit read-only spectator entry
GET /settings                 → SPA recovery to /lobby with “Page not found”
```

```text
Share:   https://example.test/match/m-123
Join:    https://example.test/match/m-123/join
Spectate:https://example.test/match/m-123/spectate
```

These links contain no `?live`, `?ws`, `name`, `token`, guest ID, or opaque session value.

## Acceptance Criteria

- [ ] **AC-001**: Route tests classify all supported path shapes, reject malformed/unknown shapes, and confirm no retired query route mounts live runtime.
- [ ] **AC-002**: `/` ends at `/lobby`; direct/reloaded `/lobby` mounts the public lobby without a match connection.
- [ ] **AC-003**: Waiting/open adaptive paths enter player waiting; in-progress adaptive paths enter read-only spectation; semantic path is retained.
- [ ] **AC-004**: Explicit join accepts only eligible waiting targets; explicit spectate is seatless/read-only; invalid states give actionable recovery.
- [ ] **AC-005**: Existing `?e2e` Playwright harness passes with its query shape and deterministic capture unchanged.
- [ ] **AC-006**: Real WebSocket full-stack tests complete semantic create/join and spectate flows, including a tick and a player order.
- [ ] **AC-007**: Native and Docker single-port smoke tests directly load/reload every canonical path without 404; assets, `/version`, and WS upgrades remain correct.
- [ ] **AC-008**: Host links, fixtures, README/manual guidance, and route comments contain no stale production `?live` examples; only test-only `?e2e` remains.
- [ ] **AC-009**: Security tests prove IDs cannot cause traversal, slash injection, cross-match selection, credential leakage, or unauthorized claims.
- [ ] **AC-010**: Keyboard-only and automated WCAG checks cover recovery, shortcut failure, announcements, focus, and spectator read-only controls.
- [ ] **AC-011**: Back/Forward and refresh restore expected semantic route/state without a redirect loop.

## Out of Scope

- Shareable-link UX itself (issue #34), including copy/share controls, invitation design, access policy, private-link policy, and expiration.
- Accounts, sign-in/sign-up implementation, authentication, durable profiles, and cross-device identity.
- Engine, terrain, combat, fog, tick, victory, order, wire-version, reconnect, or matchmaking semantic changes.
- New lobby features, match history, ratings, chat, or private-match behavior.
- Touch/mobile-specific navigation design beyond preserving accessible responsive layout.
- Retaining `?live` as a production compatibility mode; historical migration notes may mention its removal.

## Assumptions

- Feature 010 lobby projections and transport are authoritative for adaptive entry and guest identity.
- Existing two-player end-to-end behavior is the browser acceptance target.
- Matchmaking's existing match-ID domain is reused; this feature adds path validation only.
- The host serves an SPA shell for application routes while reserving `/version`, assets, and WebSocket upgrades.
- History API versus full navigation is a plan-phase choice; observable route, accessibility, and reload behavior is not.

## Clarifications Applied

### Session 2026-08-30 — Product-owner decisions and Phase 3 rulings (v1.0)

No unresolved clarification remains:

| # | Ambiguity | Resolution | Requirement(s) |
|---|---|---|---|
| 1 | Root versus lobby landing | `/` redirects to canonical `/lobby`; no auto-created match. | FR-002, FR-003 |
| 2 | E2E compatibility | `?e2e` remains unchanged and test-only. | FR-011 |
| 3 | Adaptive `/match/<id>` behavior | Waiting/open uses player entry; in-progress uses read-only spectation; full/unavailable recovers without silent downgrade. | FR-004 |
| 4 | Explicit shortcut failures | Join never silently spectates; spectate never claims a seat; existing actionable recovery applies. | FR-005, FR-006, FR-018 |
| 5 | Query-carried identity/transport values | Production links carry no name/token/WS values; existing storage/session and same-origin transport supply them. | FR-010, FR-016, FR-017 |
| 6 | Deep-link hosting | Native and Docker single-port handlers serve SPA shell for canonical paths and unknown paths while preserving API/assets/WS handling. | FR-012, FR-014 |
| 7 | Shareable-link UX | Stable routing is in scope; invitation/share controls and access policy belong to issue #34. | Out of Scope |

## Dependencies & Cross-Spec Impact

| Spec | Relation | Truthfulness update |
|---|---|---|
| 005 client console | Consumed/amended | Query live-entry documentation is replaced by semantic route boot; `?e2e` remains test-only. |
| 010 public lobby | Consumed/amended | Direct `?live` compatibility is removed; `/lobby` and semantic match actions are authoritative. |
| 011 Docker single-port | Consumed/amended | SPA fallback covers semantic deep links; same-origin WS and `/version` ordering remain. |
| 007 player manual | Documentation impact | Launch/join guidance moves from query links to semantic paths; gameplay text is unchanged. |
| 009 versioning | Preserved | `/version` remains outside SPA route fallback. |
| 012 design system | Preserved | Existing lobby/console focus, contrast, and notice styling applies. |

## Implementation Notes

- Prefer one pure route parser and one explicit route-to-runtime adapter over scattered pathname checks; library/API choice is plan-phase work.
- Keep match identity in the route adapter and pass it to existing lobby commands. Never reintroduce query-derived names or reconnect tokens.
- Generate host links from origin plus semantic paths only; do not print credentials.
- Apply SPA fallback only after `/version`, known assets, WebSocket upgrade handling, and traversal checks.
- Add a guard for retired production `?live` references while allowing historical clarification text and unchanged `?e2e` references.
- Any implementation change affecting launch/join guidance updates applicable README/manual content in the same change set.
