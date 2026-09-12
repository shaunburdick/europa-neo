# Feature Specification: Public Lobby & Match Browser

**Feature Branch**: `010-public-lobby-match-browser`
**Dependencies**: Feature 004 (multiplayer networking), Feature 005 (client console), Feature 006 (match lifecycle and matchmaking)
**Created**: 2026-08-25
**Last Updated**: 2026-09-12 (v1.12; issue #139 spec consolidation)
**Version**: 1.12
**Status**: Implemented (2026-08-31; C-010 review complete; issue #34 shareable links amendment 2026-09-06; universal PlayerId amendment implemented 2026-09-12 — issue #74); URL routing superseded by Feature 013
**Input**: Approved product request to replace the one-match startup flow with a public landing page for guest player identity, handle selection, match creation, browsing, joining, and spectating.

## Problem Statement

Europa Neo currently starts one automatically created public match, so a player cannot choose a game or host multiple games from one server. Players need a single accessible entry point that establishes an ephemeral guest player identity, lets them choose a unique handle, and exposes the currently available public matches. The feature generalizes the existing matchmaking and live-browser flow without changing gameplay mechanics, while retaining an intentionally in-memory implementation suitable for future persistence and self-hosting.

## User Scenarios & Testing

### User Story 1 - Establish a Guest Player Identity (Priority: P1)

As a new visitor, I want to receive a guest player identity and choose a handle so that I can identify myself in the lobby and in a match without creating an account.

**Why this priority**: Every lobby action needs a stable session identity, but v1 must remain account-free.

**Independent Test**: Open the landing page in a new browser profile, choose a valid handle, reload, and verify that the same guest player identity and handle are restored while a second profile receives a different identity.

**Acceptance Scenarios**:

1. **Given** a browser without an existing lobby identity, **When** the landing page loads, **Then** the service assigns a GuestPlayerIdentity with an opaque guest player ID, stores the ID in browser storage, and keeps the identity available to the active application session.
2. **Given** a guest visitor, **When** they submit a valid handle, **Then** the handle is associated with that active GuestPlayerIdentity and is shown in the lobby.
3. **Given** a returning browser within the existing reconnect grace period, **When** it reconnects, **Then** it retains the same identity and handle rather than creating a duplicate active user.
4. **Given** an active user changes their handle, **When** the new handle passes validation and is not already in use, **Then** the new handle replaces the old one for that identity in the lobby and any subsequently joined match.
5. **Given** a player has selected a handle, **When** they create or join a match, **Then** the match waiting/live view identifies that player by the accepted handle and preserves the association with their GuestPlayerIdentity.

---

### User Story 2 - Browse Public Games from One Landing Page (Priority: P1)

As a player, I want one landing page showing public games and their current status so that I can decide whether to join, spectate, or create a game.

**Why this priority**: Browsing is the direct replacement for the current single-game startup and is the main discovery path.

**Independent Test**: Create public matches in waiting and running states with multiple clients, then verify a fresh client sees accurate entries and action availability without seeing private or finished matches.

**Acceptance Scenarios**:

1. **Given** the visitor has a valid handle, **When** the landing page is displayed, **Then** it shows the visitor identity, a create-game action, and a public match list.
2. **Given** public matches exist, **When** the list is loaded or refreshed, **Then** each eligible entry shows a stable match identifier, player occupancy/capacity, and a human-readable status; waiting matches offer Join and in-progress matches offer Spectate.
3. **Given** a public match starts or is collected, **When** the next lobby update is received, **Then** its entry changes or disappears so that Join is never offered for a running match and finished matches do not remain in history.
4. **Given** no eligible public matches exist, **When** the landing page is displayed, **Then** it shows an explicit empty state and a prominent create-game action.

---

### User Story 3 - Create and Start a Public Game (Priority: P1)

As a player, I want to create a public game with supported settings and enter it when another player joins so that I can host a battle from the landing page.

**Why this priority**: Creating and starting a match is the core path to gameplay.

**Independent Test**: Use two browser clients: create a public two-player game in one, join it from the other, and verify that both enter the existing console with authoritative ticks.

**Acceptance Scenarios**:

1. **Given** a player with a valid handle on the landing page, **When** they submit a valid public-game configuration, **Then** the server creates a uniquely identified waiting match, reserves the creator's seat, and returns the player to a match waiting view.
2. **Given** a waiting public match with an open seat, **When** another player selects Join, **Then** the server assigns the seat atomically and both players enter the existing live console when the match starts.
3. **Given** the creator cancels or leaves before the match starts, **When** no players remain, **Then** the waiting match is eligible for the existing empty-match cleanup and disappears from the public list.
4. **Given** invalid or unsupported settings, **When** the player submits the create form, **Then** creation is rejected with field-specific feedback and no match is created.

---

### User Story 4 - Join or Spectate a Public Game (Priority: P2)

As a player or observer, I want to join an open game or spectate a running public game so that I can participate when possible and watch when it is already underway.

**Why this priority**: It makes the public browser useful beyond the creator's own match and reuses the existing spectator capability.

**Independent Test**: Join an open match from a listing, then attempt to join a running match and verify the UI offers read-only spectation instead.

**Acceptance Scenarios**:

1. **Given** a listed waiting public match with an open seat, **When** the player activates Join, **Then** they are assigned one seat at most and enter the existing pre-start/live flow.
2. **Given** a listed running public match, **When** the player activates Spectate, **Then** they receive the existing full-visibility spectator view and no player seat or order permissions.
3. **Given** a player attempts to join a match after its last open seat was claimed, **When** the server processes the request, **Then** it rejects the request cleanly and the lobby refreshes the entry.
4. **Given** a player is already seated in or spectating a match, **When** they return to the landing page, **Then** they can see their active-match status and cannot accidentally claim a second seat with the same active identity.
5. **Given** a match contains players, **When** a participant views the match waiting/live UI, **Then** each occupied player seat is labeled with that player's accepted handle when available, including the viewer's own seat; when unavailable, a generic fallback or player ID MAY be shown.

---

### User Story 5 - Share a Match Link and Enter via Deep Link (Priority: P1)

As a player, I want to copy a shareable link for my match and send it to a friend, and as a visitor I want to open that link and be onboarded into the match, so that I can play with friends without requiring them to find the match in the lobby.

**Why this priority**: Private matches are joinable only by link (binding decision 4); without in-UI copy-link and deep-link onboarding, the private-match feature is unusable from the browser. Public matches benefit too — a host can hand out a link instead of telling friends to hunt the lobby.

**Independent Test**: Create a private match, copy the link from the match UI, open it in a fresh browser profile, complete handle setup, choose Play or Spectate, and verify seating/spectation. Repeat for a public match. Also verify that an existing participant opening the same link goes straight in.

**Acceptance Scenarios**:

1. **Given** a player who created or joined a match (public or private), **When** they activate the "Copy link" action, **Then** the canonical `/match/<matchId>` URL is written to the clipboard and a visible confirmation is shown; the action is keyboard-accessible.
2. **Given** a private match, **When** the player views the match waiting/live UI, **Then** the "Copy link" affordance is prominent and unmissable (e.g., a dedicated share row) because the link is the only way for others to enter.
3. **Given** a public match, **When** the player views the match waiting/live UI, **Then** the "Copy link" affordance is present but may be quieter (e.g., a subtle icon button) since the lobby listing is also an entry path.
4. **Given** a visitor opening `/match/<matchId>` in a fresh browser with no stored handle, **When** the adaptive entry resolves, **Then** the existing identity card prompts for a handle (never pre-filled from the URL), and after onboarding an interstitial offers Play (when seats are open) or Spectate.
5. **Given** a visitor opening `/match/<matchId>` where the match is full or already running, **When** the interstitial is presented, **Then** only Spectate is offered — Play is not shown.
6. **Given** a participant (seated player) or spectator opening `/match/<matchId>`, **When** the adaptive entry resolves their existing association, **Then** they go straight into the match view without an interstitial.
7. **Given** a visitor choosing Spectate via the deep-link interstitial, **When** the choice is confirmed, **Then** they are attached as a spectator with the existing full-visibility read-only view — including for private matches reached via link.
8. **Given** a visitor or participant opening `/match/<matchId>` for an unknown, expired, or collected match, **When** the resolution fails, **Then** the existing recoverable "match not found" state is shown with a return-to-lobby action — never a blank screen.
9. **Given** a player who created or joined a match, **When** they reload the page, **Then** `/match/<matchId>` remains the canonical URL and their existing reconnect behavior is preserved.

### Edge Cases

- Handle comparison is trimmed and case-insensitive; `" Nova "`, `"nova"`, and `"NOVA"` conflict while the displayed handle preserves the user's accepted casing.
- An empty, whitespace-only, overlong, control-character-containing, or otherwise invalid handle is rejected with an actionable validation message; a valid handle is 1–24 Unicode characters after trimming and contains at least one non-whitespace character.
- A requested handle that conflicts with another active session is rejected without displacing that user; the requester may choose another handle.
- A handle becomes available only after the owning active session is released by normal disconnect cleanup or the existing reconnect grace period expires.
- Simultaneous create/join requests are resolved by the server's authoritative ordering; at most one request receives the final seat.
- A match can disappear between list display and action. The client shows a non-fatal "match no longer available" message and refreshes the list.
- A spectator disconnects and reconnects using existing networking behavior; spectator status is read-only and does not become a player seat.
- A server restart loses GuestPlayerIdentities, handles, lobby entries, and matches because this feature has no persistent storage; the landing page starts a fresh session.
- Finished matches are collected and are never shown as browseable history.
- A player's accepted handle and GuestPlayerIdentity remain associated when the player transitions from lobby to match, including the waiting session, player seat, reconnect state, order attribution, and server-generated player/spectator view.
- Reconnecting with the existing reconnect credential restores the same player association and displayed handle; presenting another player's credential or an unknown credential cannot attach orders or views to that player.
- The server is the sole authority for GuestPlayerIdentity-to-seat association and handle changes. Client-provided seat numbers, handles, or opaque guest player IDs are advisory input only and cannot override the server record.
- Guest player IDs are non-secret correlation identifiers, not user-selected handles. They MAY appear in projections, URLs, views, logs, diagnostics, or documentation when useful; UI MUST prefer the accepted handle and MAY use an ID or generic fallback when no handle exists.
- The implementation change that adds this feature MUST update applicable user-facing documentation, including the player manual, to explain guest player identity, handle selection, and how participant names appear in matches.
- The same implementation change MUST update applicable developer/operator/API documentation, including README and self-hosting/launch guidance, to document identity and handle propagation, the relevant wire/session behavior, and the in-memory privacy/lifecycle boundary.
- Clipboard write failure (e.g., permissions prompt denied, insecure context) MUST show a fallback — the URL MAY be displayed as selectable text so the user can copy it manually. The copy-link action MUST NOT silently fail without feedback.
- A visitor who opens a deep-link and then navigates away before completing onboarding MUST NOT leave a partial seat reservation; the server's atomic seat assignment (FR-010) prevents orphaned state.
- The play-or-spectate interstitial MUST NOT appear for a match that collected between link generation and link use; the adaptive entry resolves to "match not found" (FR-033) instead.
- A match whose last seat fills between the interstitial rendering and the Play action MUST be rejected cleanly by the server's atomic seat assignment (FR-010); the visitor sees an actionable error and may choose Spectate or return to the lobby.
- The shareable link for a private match contains only the match ID in the path; it does not contain a handle, session token, reconnect token, or any bearer credential. Knowledge of the match ID alone grants an admission attempt only — the server still authenticates with the applicable bearer credential and authoritatively assigns seats, orders, and fog-filtered views (spec 006 FR-006, v1.2 clarification).

## Requirements

### Functional Requirements

- **FR-001**: The service MUST provide one landing/lobby interface as the default entry point instead of automatically creating or selecting one match at startup.
- **FR-002**: The server MUST assign each new visitor a `GuestPlayerIdentity` containing an opaque unique guest player ID and MUST keep the active guest player identity available to the application for lobby and match actions. A GuestPlayerIdentity is not an authenticated account: it is ephemeral, backed by browser and server memory, and lost when browser storage is cleared or the server restarts.
- **FR-003**: The browser MUST store the guest player ID and selected handle locally so a reload can restore the active GuestPlayerIdentity; this storage MUST NOT be treated as an account or durable server record. The guest player ID MAY be exposed as non-secret identity/reference data, but the accepted handle remains the preferred UI label.
- **FR-004**: Users MUST be able to set and rename a handle without authentication; a valid handle MUST contain 1–24 Unicode characters after trimming, contain at least one non-whitespace character, and contain no control characters. Uniqueness MUST be enforced among active users/sessions.
- **FR-005**: Handle uniqueness MUST compare trimmed, case-insensitive values; the displayed value MAY preserve accepted casing, and the existing reconnect grace period MUST preserve the original user's handle.
- **FR-006**: The lobby MUST list public matches only and MUST expose each listing's match identifier, occupancy/capacity, supported settings summary, and lifecycle status.
- **FR-007**: The lobby MUST distinguish at least waiting-for-players and in-progress public matches, offering Join only for open waiting matches and Spectate only for in-progress matches.
- **FR-008**: Users MUST be able to create public matches through the landing interface using the existing matchmaking-supported player-count and map-setting constraints; private matches are not part of this feature.
- **FR-009**: Creating a match MUST reserve the creator's seat and make the match visible as a public waiting entry until it starts or is collected.
- **FR-010**: Joining MUST be an atomic server-authoritative operation that assigns no more than one seat to a request and returns a clear error when the match is full, unavailable, or the identity is already committed elsewhere.
- **FR-011**: A public match MUST start automatically when its required seats fill; v1 MUST NOT require a separate manual start action. At start, the feature MUST hand off to the existing matchmaking, networking, terrain, fog-of-war, engine, and console contracts without changing gameplay mechanics or visibility rules.
- **FR-012**: The feature MUST allow a user to spectate an in-progress match through the existing spectator mode, with no seat assignment and no ability to issue player orders. Public matches may be spectated from the lobby listing; private matches may be spectated by anyone holding the shareable link (spectate-by-link). The existing spectator join accepts a private `MatchId` unchanged; no new wire path is required.
- **FR-013**: The lobby MUST update when public matches are created, filled, started, or collected; stale entries MUST be removed or marked unavailable before offering an invalid action.
- **FR-014**: Finished matches MUST be cleaned up using the existing match lifecycle policy and MUST NOT be displayed in a history list.
- **FR-015**: The feature MUST retain all lobby, identity, and match state in memory only; no accounts, authentication, database/persistent storage, chat, ratings, or match history may be introduced. Private matches are supported via shareable links but are not lobby-listed (binding decision 4); link rotation, revocation, and expiry are deferred to the future accounts feature.
- **FR-016**: The interface MUST provide accessible keyboard navigation, semantic names and statuses for controls and match rows, visible focus, sufficient contrast, and announcements for identity errors, empty/loading states, and action failures in line with WCAG 2.2 AA goals.
- **FR-017**: The default self-hosted launch MUST serve the landing interface without a pre-created match, while preserving an explicit path for a user to create one; gameplay remains server-authoritative and fixed-tick deterministic.
- **FR-018**: The feature MUST surface recoverable failures (identity setup, duplicate handle, unavailable match, full match, lost connection, and server restart) without trapping the user on a blank or silent screen, and MUST provide a retry, correction, or return-to-lobby action where applicable.
- **FR-019**: When a player creates or joins a match, the server MUST propagate the active `GuestPlayerIdentity` reference and its accepted handle into the authoritative match/session and seat records. The association MUST remain available through waiting, start, gameplay, terminal, and existing reconnect-grace states; a handle rename MUST update future match projections for that identity without changing the identity reference.
- **FR-020**: The match waiting/live interface MUST identify every occupied player seat with the server-authoritative accepted handle when available, including the local player's own seat and other participants visible to that player. If no handle is available, it MUST provide a distinct accessible generic or player-ID label.
- **FR-021**: The server MUST attribute every accepted order to the server-resolved player seat and GuestPlayerIdentity associated with the connection/session, regardless of any client-supplied handle, opaque guest player ID, or seat claim. An order claiming a different player MUST be rejected without changing world state, and the rejection MUST be observable to the requesting client.
- **FR-022**: Existing reconnect handling MUST restore the same identity, handle, seat, and participant label when a reconnect credential is valid and within the existing grace period. Invalid, expired, mismatched, or already-consumed reconnect credentials MUST NOT attach the connection to another player's seat, orders, or view and MUST follow the existing recoverable reconnect failure behavior.
- **FR-023**: Player and spectator views MUST be generated from server-authoritative seat/identity associations. Player views MAY expose the handles needed to identify visible participants, while spectator views MAY expose all match participant handles; neither view may allow a client to rewrite identity, seat ownership, or order authority.
- **FR-024**: Guest player IDs MUST be unique among active GuestPlayerIdentities and suitable for non-secret correlation. They MAY appear in public entries, participant labels, player/spectator views, URLs, transport/session records, logs, diagnostics, and documentation. They MUST NOT grant authority or disclose hidden match/game state. Bearer credentials remain governed by the credential boundary in this clarification.
- **FR-025**: The feature's identity propagation behavior MUST have acceptance coverage proving that two players' handles follow them from lobby into match/session records and UI, that orders are attributed to the correct server-side seat, that reconnect restores the same association, and that player/spectator views do not disclose bearer credentials, hidden match/game state, or unauthorized authority through identity references.
- **FR-026**: The same implementation change set MUST update applicable user-facing documentation and the player manual with the guest player identity lifecycle, handle validation/rename behavior, and match participant identification. Documentation acceptance MUST verify that the manual describes what players see and how they are identified, prefers accepted handles, and does not expose bearer credentials or hidden match/game state. Non-secret opaque guest/player IDs MAY be documented when useful for correlation; they MUST NOT be presented as credentials or authority.
- **FR-027**: The same implementation change set MUST update applicable developer/operator/API documentation, including the README and self-hosting/launch documentation, with the GuestPlayerIdentity/handle propagation contract, server-authoritative association rules, reconnect/order/view implications, and the fact that guest player identities, handles, sessions, and matches are in-memory and lost on browser storage clearing or server restart. These documents MUST not present guest player IDs as stable authenticated accounts; they MAY present them as non-secret correlation identifiers.
- **FR-028**: The match waiting/live interface MUST provide a "Copy link" action for the match the user is in (as creator, player, or spectator), producing the canonical `/match/<matchId>` URL. The action MUST write the URL to the clipboard, show visible confirmation (e.g., a brief "Copied!" toast or state change on the button), and be keyboard-accessible (focusable and activatable via Enter/Space). The affordance MUST be available for all matches (public and private) but rendered more prominently for private matches — for a private match the link is the only way in, so it MUST be unmissable (e.g., a dedicated share row on the waiting view or a prominent button). Public matches MAY use a quieter affordance (e.g., a subtle icon button).
- **FR-029**: Opening `/match/<matchId>` (the canonical match URL) when the visitor is not in the match MUST trigger an adaptive deep-link entry flow: the console resolves the match's authoritative state via spec 013's adaptive routing, then (a) if the visitor has no stored handle, the existing identity card (FR-004) prompts for one before proceeding — the handle is never pre-filled from the URL; (b) after onboarding (or if a handle is already saved), an interstitial asks whether the visitor wants to Play or Spectate. If the match is full, already running, or collected, only Spectate is offered. Choosing Play seats the visitor (subject to FR-010's atomic seat assignment); choosing Spectate attaches them as a spectator. The interstitial MUST be keyboard-accessible and announced for screen readers.
- **FR-030**: A participant (seated player) or spectator opening `/match/<matchId>` MUST go straight into the match view without an interstitial — the adaptive entry resolves their existing association and restores the correct view.
- **FR-031**: Spectating a private match via its shareable link MUST work identically to spectating a public match: the link holder receives the existing full-visibility read-only spectator view, with no seat assignment and no ability to issue player orders. The existing spectator join accepts a private `MatchId` unchanged; no new wire path is required. This extends FR-012's scope to private matches reached via link.
- **FR-032**: `/match/<matchId>` MUST be the canonical in-match URL for all entry paths — lobby join, deep-link entry, and reconnect. The URL MUST remain stable and visible through waiting, live play, spectation, reconnect, and terminal display, per spec 013's route contract.
- **FR-033**: Unknown, expired, collected, or otherwise unavailable match IDs surfaced through the deep-link entry flow MUST show the existing recoverable "match not found" state (spec 006 FR-006 single code path) with a return-to-lobby action, never a blank or silent screen. The failure MUST be keyboard-accessible and announced for screen readers.
- **FR-034**: The self-hosted host script (`packages/console/scripts/host.ts`) MUST emit join URLs using the canonical `/match/<matchId>` scheme (per spec 013) and MUST support a `publicBaseUrl` configuration (or equivalent) so that emitted URLs are absolute when the server is not reachable from the client's origin (e.g., behind a reverse proxy). When `publicBaseUrl` is not configured, the host MAY use `window.location.origin` at copy time (FR-028) or a sensible default for the emitted terminal URLs.
- **FR-035**: The same implementation change set MUST update applicable user-facing documentation (player manual) and developer/operator documentation (README, self-hosting guidance) to describe the copy-link affordance, the deep-link entry flow, and the play-or-spectate interstitial. Documentation MUST explain that private matches are joinable and spectatable only via the shareable link, and that `/match/<matchId>` is the canonical shareable URL.

### Key Entities

- **GuestPlayerIdentity**: Ephemeral, non-authenticated, server-recognized guest player identity containing an opaque, non-secret guest player ID, current handle, active-session status, and reconnect association. It is backed by browser/server memory and is lost when browser storage is cleared or the server restarts. The handle is preferred as a display label; the ID may be used for correlation.
- **Handle**: User-facing name associated with one active GuestPlayerIdentity; validated, trimmed for comparison, and unique case-insensitively among active identities.
- **PublicMatch**: In-memory public match projection with a unique identifier, supported settings summary, capacity, occupancy, and lifecycle status.
- **LobbyEntry**: Safe public projection of a PublicMatch used to decide whether Join or Spectate is available; it contains no private or hidden match data.
- **Seat**: Existing matchmaking binding between a GuestPlayerIdentity and a player position; a spectator has no Seat.

## Non-Functional Requirements

- **NFR-001 (Responsiveness)**: Under normal self-hosted conditions, the landing interface MUST show the initial identity/lobby state within 2 seconds of page readiness and MUST reflect a successful create, join, or leave action within 1 second of the authoritative response.
- **NFR-002 (Concurrency)**: The server MUST preserve unique active handles and atomic seat assignment when concurrent requests target the same handle or final open seat; acceptance tests MUST cover at least 10 simultaneous conflicting requests.
- **NFR-003 (Identity and privacy boundaries)**: Public listings MUST contain only public-match data needed for discovery, but player IDs are non-secret identity/reference data and MAY be exposed where useful. UI prefers handles and may fall back to a generic label or ID. Bearer credentials, private-match existence, authorization, and fog-filtered game state remain protected; no authentication or personal data collection is required.
- **NFR-004 (Compatibility)**: Existing gameplay, wire-version, reconnect-grace, fog-of-war, spectator, and match-terminal contracts MUST remain behaviorally compatible for clients entering a match through the lobby.
- **NFR-005 (Operations)**: A self-hosted operator MUST be able to run the feature with the existing single-process launch instructions and no cloud service or persistent database.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In 10/10 fresh-browser trials, a visitor receives a GuestPlayerIdentity, sets a valid handle, and reaches the lobby without account creation or manual server intervention.
- **SC-002**: Two browser clients complete create → join → first authoritative tick through the landing interface in under 2 seconds after the second seat is accepted, including existing map generation.
- **SC-003**: In a 50-cycle concurrent conflict test, no two active sessions hold the same normalized handle and no match receives more seats than its configured capacity.
- **SC-004**: In 10/10 trials, the lobby shows Join for an open public match, changes the entry on start, shows Spectate for an in-progress public match, and shows neither the finished match nor a history entry after collection.
- **SC-005**: A spectator can enter 10/10 sampled in-progress public matches from the lobby, receives full-visibility read-only views, and produces zero accepted player orders. (Private-match spectation via link is covered by SC-016.)
- **SC-006**: A keyboard-only accessibility pass can complete identity setup, create or join a match, spectate an in-progress match, and return to the lobby; all failure and empty states are announced and actionable.
- **SC-007**: A 50-match sequential create/join/finish/collect soak leaves zero active matches, seats, or GuestPlayerIdentity sessions that should have expired under the existing lifecycle policy.
- **SC-008**: In 10/10 two-client trials, each player's accepted handle appears on the correct waiting/live seat and remains correct after the first authoritative tick. Any guest/player IDs present in lobby, match UI, or received player/spectator view data are treated as non-secret correlation data: they grant no seat, order, or view authority, disclose no hidden state, and do not replace the handle-first label rule.
- **SC-009**: In a test with two seated players, 100 orders (including forged alternate handle, ID, and seat fields) result in every accepted order being attributed to the connection's server-authoritative seat, with all forged cross-player claims rejected and no unauthorized world-state change.
- **SC-010**: In 10/10 reconnect trials within the existing grace period, each player resumes the original seat, handle, and view association; invalid or cross-player reconnect credentials produce no seat, order, or view reassignment.
- **SC-011**: A documentation diff in the implementation change set updates the applicable player manual/user guidance and developer/operator/API/README/self-hosting guidance, and an automated or review checklist confirms that each describes handle visibility, authoritative identity association, and the opaque in-memory ID boundary without misrepresenting non-secret IDs as credentials, authority, or stable authenticated accounts.
- **SC-012**: In 10/10 trials, a player who creates or joins a match (public or private) can copy a shareable `/match/<matchId>` link from the match UI with visible clipboard confirmation; the action is keyboard-accessible. For private matches, the affordance is prominent and unmissable.
- **SC-013**: In 10/10 fresh-browser deep-link trials, opening `/match/<matchId>` for a waiting match with open seats prompts a handle-less visitor through identity setup (if needed), presents the play-or-spectate interstitial, and seats the visitor on Play or attaches them as spectator on Spectate. For a full or in-progress match, only Spectate is offered.
- **SC-014**: In 10/10 trials, a participant or spectator opening `/match/<matchId>` for a match they are already in goes straight into the match view without an interstitial.
- **SC-015**: In 10/10 trials, opening `/match/<matchId>` for an unknown, expired, or collected match shows a recoverable "match not found" state with a return-to-lobby action — never a blank screen.
- **SC-016**: A spectator can enter 10/10 sampled private matches via shareable link, receives full-visibility read-only views, and produces zero accepted player orders — identical to public-match spectation (FR-012/FR-031).

## Out of Scope

- Accounts, passwords, authentication, cross-device identity, durable profiles, link rotation, link revocation, or link expiry (link rotation/revocation/expiry is deferred to the future accounts feature).
- Database or file persistence, match history, replays, ratings, leaderboards, chat, moderation, or invitations.
- Changes to city, pipe, combat, fog-of-war, tick, victory, spectator, reconnect, or order mechanics.
- End-to-end expansion of 3–4 player browser flows; the existing v1 contract remains 2-player end-to-end while engine/matchmaking support is retained.

## Assumptions

- The existing feature 004 reconnect grace period is authoritative for preserving an active identity and handle during temporary disconnects.
- Browser storage is available and may be cleared by the user or browser; clearing it creates a fresh GuestPlayerIdentity and does not recover the old handle.
- The existing feature 006 validation, lifecycle, cleanup, match settings, and public-match semantics are reused rather than redefined.
- The host's normal launch serves the lobby; operators may run multiple independent self-hosted instances, each with its own in-memory lobby.
- User-facing text may be localized later; v1 requires clear English labels and status announcements.

## Clarifications

### Session 2026-08-30 — Semantic route supersession (v1.7)

Feature 013 is authoritative for browser URL routing. `/lobby` is the canonical landing path, `/match/<matchId>` is the adaptive match path, and `/match/<matchId>/join` plus `/match/<matchId>/spectate` are explicit shortcuts. The former direct `?live` compatibility contract is retired; lobby identity, match lifecycle, public-listing, spectator, and accessibility behavior remains unchanged. The unchanged `?e2e` query is test-only and is not part of the production lobby contract.

### Session 2026-08-25 — Approved product decisions (v1.0)

No interactive clarification questions were required. The approved decisions resolve the material scope, identity, privacy, lifecycle, and persistence ambiguities:

- Handles are renameable, but normalized trimmed and case-insensitive uniqueness is enforced server-side for active users/sessions only.
- Handles use the v1 validation default of 1–24 Unicode characters after trimming, at least one non-whitespace character, and no control characters; this avoids an otherwise unresolved client/server validation boundary while leaving richer naming policy for a future moderation feature.
- The existing reconnect grace period reserves the original user's handle; after expiry and cleanup, another active user may claim it.
- Finished matches are cleaned up and never displayed in history.
- This feature supports public matches only; private matches are explicitly deferred.
- Accounts/authentication, persistent storage, chat, ratings, invitations, and match history are excluded.
- Existing server-authoritative, deterministic, accessibility-minded, self-hostable, and current engine/networking/matchmaking/console constraints remain binding.

### Session 2026-08-25 — Product-owner identity propagation amendment (v1.1)

> **Historical policy note (superseded by v1.2 and v1.7 below):** The ID-visibility sentence in this amendment was an interim product decision and is no longer normative. The current rule permits non-secret ID correlation while preserving the credential, authority, private-match, and fog boundaries.

- GuestPlayerIdentities and accepted handles follow players from the lobby into authoritative match/session and seat records and remain associated through orders, reconnects, terminal state, and player/spectator views.
- Match UI identifies occupied seats with accepted handles when available, including the local player; a generic fallback or non-secret player ID is allowed when no handle exists.
- Identity, seat, order, reconnect, and view association is server-authoritative. Client-supplied identity, handle, or seat claims cannot reassign authority.
- Guest player IDs remain non-semantic, session-scoped implementation identifiers. (The former “private/not exposed” wording is superseded; see the current identity-visibility rule below.)
- Documentation updates are part of the same implementation change set: applicable player-facing/manual content and applicable developer/operator/API/README/self-hosting content must describe the behavior and its in-memory privacy/lifecycle boundary.

### Session 2026-08-25 — Product-owner terminology amendment (v1.2)

- The feature uses `GuestPlayerIdentity`/guest player identity consistently. A GuestPlayerIdentity is a guest player identity, not an authenticated account: it has a unique server-recognized opaque guest player ID and handle, is backed by browser/server memory, and is lost when browser storage is cleared or the server restarts.
- Guest player IDs are non-secret identity references and MAY be exposed in UI, public listings, URLs, views, or documentation examples. Handles remain the preferred participant labels; IDs do not grant authority or disclose hidden state.

### Session 2026-08-25 — Wire error detail field ruling (v1.3)

- US3 AC-4 ("rejected with field-specific feedback") and FR-018's actionable-failure requirement cannot be delivered by code-only wire errors: a browser can only render field-specific guidance when the server tells it which fields failed. PM ruling (2026-08-25): the wire `error` `LobbyEvent` variant gains an additive optional `detail` record mirroring matchmaking's `LobbyError.detail` (`Readonly<Record<string, string | number | boolean>>`, field name → message/value). Servers populate it wherever actionable specifics exist (e.g., the rejected create-form settings fields); clients render actionable text from `code` plus `detail` and MUST tolerate its absence (older servers, or codes needing no specifics). Additive-only — unknown-field tolerance already covers older clients, so `NETWORK_API_VERSION` is NOT bumped. Contract surfaces updated in the same change set: both canonical networking contract copies, `contracts/lobby-wire.md`, and networking conformance coverage for the changed payload.

### Session 2026-08-25 — Handle case-folding normalization ruling (v1.4)

- FR-005's "case-insensitive" uniqueness comparison is implemented with JavaScript's locale-independent built-in case conversion: the uniqueness key is the trimmed handle lowercased with `String.prototype.toLowerCase()` (default Unicode case mappings; no locale overrides; no full case folding, which ECMAScript does not provide). Rationale: determinism across runtimes and self-hosted instances (constitution Principle II) and simplicity (Principle V) — richer folding policies are deferred to a future moderation feature.
- What folds: case-based default mappings only — e.g. `Å→å`, `Ö→ö`, and multi-character expansions such as `İ` (U+0130) → `i` + combining dot above (two code points). What does NOT fold: `ß` is never expanded to `SS` (so `Straße` and `STRASSE` remain distinct handles), and locale-specific conventions (e.g., Turkish dotless-i rules) are deliberately not applied.
- The accepted display handle is the trimmed submission with casing preserved verbatim (FR-005); the uniqueness key is derived from it and never displayed or projected.
- Uniqueness keys are held for ACTIVE identities and for identities retained by the reconnect grace window; keys are freed when grace expires or the identity is explicitly released (edge case: handle availability).

### Session 2026-08-25 — Handle validation hardening + local mirror pin ruling (v1.5)

- Wave-2 security audit findings LOW-6 (bidirectional-text spoofing) and LOW-7 (lone-surrogate corruption) are resolved at the validation source. FR-004's rejection set gains two classes, enforced inside `validateHandle` before any handle reaches a seat label, lobby row, or log line:
  - Bidirectional formatting controls U+202A–U+202E (LRE/RLE/PDF/LRO/RLO overrides) and U+2066–U+2069 (LRI/RLI/FSI/PDI isolates) — nine code points in total — are REJECTED. Rationale: participant labels are identity (FR-020); these invisible characters visually reorder how a handle renders for OTHER players while appearing benign to the submitter, so a submitter could spoof or impersonate another participant's label rendering. Rejections return `handle_invalid` with machine-readable `detail.reason: 'bidi_control'`.
  - Handles containing lone (unpaired) surrogate code points (Unicode category Cs, U+D800–U+DFFF without a partner) are REJECTED. Rationale: lone surrogates mutate to U+FFFD replacement characters on UTF-8 encoding, corrupting server logs and downstream storage. Rejections return `handle_invalid` with `detail.reason: 'lone_surrogate'`. Detection operates per CODE POINT after code-point iteration, so well-formed surrogate pairs are unaffected.
- Scope of the reclassification: only the nine bidi controls above and unpaired surrogates change status. Other format-category (Cf) characters — notably zero-width spaces such as U+200B and the soft hyphen U+00AD — REMAIN valid content, and well-formed surrogate pairs (e.g., astral emoji) remain single valid characters under FR-004's code-point counting. Rejection precedence over previously-shipped inputs is unchanged (`empty` → `too_long` → `control_character` → `bidi_control` → `lone_surrogate`).
- Local contract mirror repair + cross-package pin: matchmaking's local `LobbyEvent` declaration had lagged networking's canonical wire copy since Clarifications v1.3 — the wire `error` variant's optional `detail` record was missing locally, undetected because mutual assignability cannot see a missing OPTIONAL field. Ruling: the local copy is repaired field-for-field (identical JSDoc normative wording), and matchmaking's locally declared lobby-domain types (`LobbyEvent`, `IdentityState`, `PublicLobbyEntry`) are pinned mutually assignable to networking's canonical wire declarations by the feature-010 conformance program, plus an indexed-access witness that fails compilation while either side lacks or retypes the optional `detail` record. Networking's public barrel re-exports the three names (as it already did the two settings mirrors) so the pins import the built package surface like every other cross-package witness.

### Session 2026-08-26 — Claim provenance / identity-event delivery channel (v1.6)

- **The gap (verified)**: FR-002 has the server assign each visitor an opaque GuestPlayerId and FR-003 has the browser store it locally so a reload restores the active identity within the reconnect grace window — but NO server→client channel carried that id. `IdentityState` was id-free in both canonical contract copies, `GuestIdentityClaim.guestPlayerId` was documented as "previously issued to this browser", and nothing ever issued/delivered it: on claim-miss the registry minted a server-side opaque ID that never reached the browser, so reload-restore could never work end-to-end.
- **PM ruling (2026-08-26, final)**: `IdentityState` gains an ADDITIVE OPTIONAL `guestPlayerId?: GuestPlayerId` in BOTH canonical contract copies (matchmaking's `lobby-types.ts` and networking's wire mirror; no `NETWORK_API_VERSION` bump — same additive ruling pattern as v1.3's `detail`). The directed `identity` `LobbyEvent` becomes THE FR-003 delivery channel: the lobby facade populates the AUTHENTICATED owner's id when projecting identity state for that event (`establishIdentity`, `setHandle`, and every restore path), and the dispatcher forwards it verbatim — directed delivery to exactly ONE connection, the owner's. This mirrors feature-004's sessionToken delivery precedent.
- **Witness-envelope change**: identity IDs are non-secret and may be carried by projections and correlation surfaces. Compile-time witnesses continue to enforce shape compatibility; runtime checks must still verify that IDs do not grant authority, expose credentials, enumerate private matches, or bypass fog filtering.
- **Client contract**: browsers persist the server-delivered id (replacing any local bootstrap mint — the local mint remains first-frame bootstrap only) so reload-restore works end-to-end; clients MUST tolerate the field's absence (older servers).

### Session 2026-08-30 — Product-owner identity-visibility correction (v1.7)

- Guest identity IDs and gameplay `PlayerId` values are non-secret correlation data and may appear in URLs, wire payloads, internal state, logs, diagnostics, documentation, and examples.
- Handles remain preferred participant labels; a generic fallback or player ID is acceptable when no handle is available.
- Session/reconnect tokens remain bearer credentials and are not permitted in public app URLs, logs, diagnostics, or documentation examples. Narrow exception: the temporary/local `pnpm host` operator flow MAY print tokenized join URLs for local seat handoff; this is not a general app URL policy, and operators must treat those URLs as secrets because anyone who obtains one may attempt to resume that seat during the grace window. Private-match existence and fog-of-war boundaries are unchanged.

### Session 2026-09-06 — Issue #34 shareable match links amendment (v1.8)

This amendment picks up the previously deferred scope of private matches and shareable invitations (former Out of Scope line: "Private matches, shareable invitations, or hidden-match links"). It adds copy-link UX, deep-link onboarding, and play-or-spectate interstitial behavior on top of the existing lobby, identity, and semantic URL infrastructure (spec 013). Key decisions from the issue's resolved design decisions (do not relitigate):

- **Copy-link scope**: all matches get a "Copy link" affordance; more prominent for private matches (the only entry path), quieter for public matches. The link is the canonical `/match/<matchId>` URL (spec 013 scheme).
- **Spectate-by-link for private matches**: link holders may spectate a private match — the link is the invitation (spec 006 Q2 model). FR-012 is amended to cover private matches reached via link; no new wire path needed (existing spectator join accepts a private `MatchId` unchanged).
- **URL construction**: FR-028 uses the canonical `/match/<matchId>` URL. FR-034 addresses self-hosted absolute URL generation via `publicBaseUrl` configuration or `window.location.origin` at copy time — the exact mechanism is an implementation choice.
- **Handle on deep link**: always through the identity card / already-saved handle (FR-004); the URL never pre-fills a handle.
- **Play-or-spectate interstitial**: presented only to non-participants who reach `/match/<matchId>` via deep link. Play is offered only when seats are open; full/running/collected matches offer only Spectate. Participants and spectators go straight in (FR-030).
- **Canonical in-match URL**: `/match/<matchId>` for all entry paths (lobby join, deep link, reconnect), per spec 013's route contract (FR-032).
- **Failure handling**: unknown/expired/collected match IDs show the existing recoverable "match not found" state (spec 006 FR-006) with a return-to-lobby action (FR-033).

Binding decisions preserved: private matches remain invisible in the lobby (binding decision 4); link rotation/revocation/expiry deferred to future accounts feature; the match ID is the admission reference, not a bearer credential (spec 006 v1.2).

## Implementation Notes and Validation

The shipped implementation resolves the following integration details without
changing the normative requirements or the v1.6 clarifications above:

- `pnpm host` starts in lobby mode with no pre-created match. The explicit
  `pnpm host --create` mode remains available for the two-seat quick flow.
- The lobby derives its WebSocket endpoint from the page host. A `?ws=`
  override is accepted only for the same host (including supported local
  loopback cases); cross-host and credential-bearing overrides are rejected
  before identity setup.
- Accepted handles are overlaid onto match registration and view/player-list
  payloads at the networking boundary. This preserves the engine's immutable
  simulation data and does not mutate engine state.
- Spectators use the existing full-visibility, read-only path: they receive no
  player seat and cannot issue orders.
- The lobby distinguishes an initial loading state from a successfully loaded
  empty state, so an empty match list is not mistaken for a failed request.
- The server-delivered identity claim is sent only in the directed identity
  event to its owner. Public projections, other connections, UI labels, URLs,
  logs, and player/spectator views may carry non-secret identity identifiers;
  handles are the only participant names shown to users.
- Identity, handle, lobby, session, and match state is in memory. A server
  restart resets the lobby and browser resume assumptions; the next visit
  establishes a fresh guest session.

The durable documentation/privacy check is
`node specs/010-public-lobby-match-browser/check-documentation-privacy.mjs`.
It verifies handle/lobby coverage across the README, player manual, package
documentation, and feature artifacts; rejects opaque identity or credential
names and credential-bearing examples from player-facing surfaces; and rejects
credential-bearing example values in the implementation/spec surfaces. It
fails nonzero and reports each offending file and rule, so adding a forbidden
identifier or example cannot silently pass review.

### C-010 final review (2026-08-31)

- This branch is a correction to existing Feature 010 and its approved
  cross-references. It does not create Feature 013.
- The Phase 4–5 artifacts (`plan.md`, `research.md`, `data-model.md`,
  `quickstart.md`, `tasks.md`, and `orchestration.md`) describe planning and
  delivery tracking only; all implementation changes in this branch are
  accounted for by C-001 through C-010. No untracked implementation task was
  discovered.
- Review of FR-002/003/020/021/023/024/026/027 and NFR-003/004 confirms that
  guest/player IDs remain non-secret correlation data, handles remain the
  preferred labels, and server authority, reconnect credentials,
  private-match non-enumeration, and fog filtering remain unchanged.
- No runtime gameplay behavior or protocol version changed. The sole explicit
  URL exception remains local `pnpm host` tokenized seat handoff; those URLs
  remain bearer secrets and are not generalized to public app URLs, logs,
  diagnostics, or documentation examples.

### Issue #34 shareable match links implementation (2026-09-06)

The following implementation decisions resolve the integration details for
the shareable match links feature (FR-028–FR-035) without changing the
normative requirements above:

- **Clipboard fallback (plan decision D6)**: The copy-link action uses
  `navigator.clipboard.writeText()` with a hidden-input fallback when the
  Clipboard API is unavailable (insecure context, permission denied). On
  failure, the URL is displayed as selectable text so the user can copy it
  manually. The action never silently fails without feedback.
- **Interstitial state (plan decision D3)**: The play-or-spectate
  interstitial is a transient UI state within the lobby (`deepLinkInterstitial`
  phase in `LobbyState`), not a new URL or route. The URL stays as
  `/match/<matchId>` throughout. Back/Forward navigation re-resolves the
  route and dismisses the interstitial. Participants (existing seat holders)
  bypass the interstitial entirely via the `activeMatchId` check (plan D4).
- **Visibility tracking (plan decision D2)**: Match visibility (`public` or
  `private`) is stored locally in the lobby state when a match is entered
  (create/join/spectate). This avoids changing the wire contract and keeps
  the decision local to the console UI. The visibility determines whether
  the copy-link button is rendered prominently (private) or subtly (public).
- **Host script changes (plan decision D7)**: `--public-url` /
  `HOST_PUBLIC_URL` configures an absolute public URL base for terminal join
  URLs. When set, `--create` mode prints `${publicUrl}/match/<matchId>`
  instead of the default `${protocol}://${publicHost}:${port}/match/<matchId>`.
  The value is also passed to `createMatchmaker({ publicBaseUrl })` so
  `joinLinks()` returns absolute `joinUrl` when configured. The canonical
  URL scheme is `/match/<matchId>` (plan decision D8); the matchmaker's
  `joinPath` stays as `/join/<matchId>` for backward compatibility.

### v1.11 (2026-09-11) — 12-character NanoID-style universal identity lifecycle (issue #74)

- The opaque server-generated `GuestPlayerId` is the universal player identity used by lobby, match seats, engine, wire, console, and rematch records. It persists through active reload/reconnect and rematch; it is lost on storage clear, server restart, expiry, or collection.
- The ID is non-secret correlation data, never a bearer credential. Lobby actions, seat claims, handle changes, orders, and views require server-bound session/reconnect proof; a client-supplied ID cannot impersonate another identity.
- The server uses the exact alphabet `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-` and length 12 (72 bits), with CSPRNG generation, canonical validation `^[A-Za-z0-9_-]{12}$`, active uniqueness, and collision retry/fail-closed behavior. UI remains handle-first; IDs are fallback/correlation labels only. Future account linking is a separate boundary and is not defined here.
- A small internal rejection-sampling generator is preferred over a new runtime dependency: current manifests have no direct `nanoid` dependency; installed `nanoid@3.3.18` is only transitive through Vite/PostCSS. This honors the constitution's simplicity, licensing, and self-hosting constraints while avoiding reliance on a tooling dependency.
- **FR-036**: The universal ID MUST remain unchanged from lobby identity through seat, match, reconnect, terminal, and accepted rematch while the guest identity is active.
- **FR-037**: The server MUST enforce active ID uniqueness and MUST reject or retry collisions; clients cannot choose or replace another identity's ID.
- **FR-038**: The ID MUST be non-secret correlation data; every privileged action requires its existing server-bound session/reconnect proof.
- **FR-039**: Share-link create/join/spectate handoffs MUST use the mounted router and end at the canonical `/match/<matchId>` route with the matching mounted view.

### v1.12 (2026-09-12) — Issue #139 spec consolidation (absorbed features 023, 015-profile, 012-3-4)

- **Absorbed feature 023 (lobby roster, issue #62) — presence and roster**:
  - **023-FR-001**: The lobby MUST display a roster of connected players (handle + presence status) in a dedicated roster card.
  - **023-FR-002**: The server MUST emit a `roster` event on the existing `lobbyEvent` frame (no new frame type, no wire-version bump).
  - **023-FR-003**: The roster payload MUST be a `RosterSnapshot` with `{ revision, players: [{ handle, status }] }`.
  - **023-FR-004**: `status` MUST be one of `in_lobby | in_game | spectating`.
  - **023-FR-005**: A separate `rosterRevision` counter MUST increment on every roster change and MUST never reset during a server session.
  - **023-FR-006**: The server MUST send a full roster snapshot on connect and on every change (periodic full snapshot ≥ 60 s as a safety net).
  - **023-FR-007**: Roster entries MUST be ordered deterministically (handle, then ID) — never by connection order.
  - **023-FR-008**: Roster events MUST be lobby-only (never delivered inside a match).
  - **023-FR-009**: A player's roster status MUST be derived from authoritative match state (in-game when seated in a live match, spectating when in a spectator session).
  - **023-FR-010**: The roster MUST NOT leak private-match information (no match IDs, no private-match membership).
  - **023-FR-011**: The server MUST debounce roster broadcasts with a 500 ms anti-flap window.
  - **023-FR-012**: The console roster card MUST render handle + status with "(you)" marking the local identity.
  - **023-FR-013**: The roster card header MUST read "Players online (N)".
  - **023-FR-014**: When the roster is unavailable (no server), the card MUST show "Presence unavailable" and never crash.
  - **023-FR-015**: Roster UI MUST be accessible (semantic list, aria-live for changes) and honor reduced motion.
  - **023-FR-016**: The manual MUST document the roster (roster.md page) and the README notes the feature.
  - **023-FR-017**: The wire contract MUST be documented in `contracts/roster-wire.md` (moved from the absorbed feature directory into `010/contracts/` in the same change set).
  - **023-FR-018**: The roster MUST NOT be used for matchmaking decisions (display-only).
  - **023-FR-019**: Roster events MUST be ignored by clients that do not implement the roster (forward-compatible).
  - **023-FR-020**: The roster MUST NOT include handles that fail validation (invalid handles are rejected server-side).
  - **023-FR-021**: The roster MUST update within 1 second of a presence change (anti-flap window included).
  - **023-FR-022**: The roster MUST be deterministic across reconnects (same revision sequence for the same event order).
- **Absorbed feature 015-profile (identity onboarding, issue #49) — lobby identity surface**:
  - **015-FR-011**: The lobby MUST display a compact identity card (handle + "Manage profile" link) instead of the full inline identity form; the full form lives on `/profile`.
  - **015-FR-017**: The server MUST create a guest identity (universal `PlayerId`) on first handle set and restore it on subsequent visits while storage persists.
  - **015-FR-018**: Clearing browser storage MUST end the identity lifecycle (no durable recovery promised).
  - **015-FR-019**: The ID MUST NOT be proof of possession; privileged lobby actions require the server-bound session credential.
- **Absorbed feature 012-3-4 (3–4 player support, issue #6) — lobby create/list chrome**:
  - **012-FR-002**: The lobby create form MUST pre-select the board size from the 012-FR-001 defaults by chosen player count (2p → 32, 3p/4p → 48) and allow an explicit 32 | 48 override; it MUST NOT silently overwrite a user-chosen size when the player count changes.
  - **012-FR-003**: The lobby match list MUST show occupancy/capacity text (e.g., "2/4 players"), a board-size label, and lifecycle status per FR-006/FR-007; private matches are never listed.
- **Contract move note**: the absorbed feature's `contracts/roster-wire.md` is relocated to `010/contracts/` (same change set); the networking conformance suite's byte-identity check re-points at the new path.
