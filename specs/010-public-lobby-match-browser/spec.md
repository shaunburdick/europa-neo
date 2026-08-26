# Feature Specification: Public Lobby & Match Browser

**Feature Branch**: `010-public-lobby-match-browser`
**Dependencies**: Feature 004 (multiplayer networking), Feature 005 (client console), Feature 006 (match lifecycle and matchmaking)
**Created**: 2026-08-25
**Last Updated**: 2026-08-26 (v1.6)
**Version**: 1.6
**Status**: Draft — phases 1–3 complete
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
5. **Given** a match contains players, **When** a participant views the match waiting/live UI, **Then** each occupied player seat is labeled with that player's accepted handle, including the viewer's own seat, and no participant is labeled with an opaque guest player ID.

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
- Opaque guest player IDs are implementation/session identifiers, not display names: they are not rendered in lobby or match UI, public lobby projections, or spectator/player views, and are not accepted as a user-selectable participant identity.
- The implementation change that adds this feature MUST update applicable user-facing documentation, including the player manual, to explain guest player identity, handle selection, and how participant names appear in matches.
- The same implementation change MUST update applicable developer/operator/API documentation, including README and self-hosting/launch guidance, to document identity and handle propagation, the relevant wire/session behavior, and the in-memory privacy/lifecycle boundary.

## Requirements

### Functional Requirements

- **FR-001**: The service MUST provide one landing/lobby interface as the default entry point instead of automatically creating or selecting one match at startup.
- **FR-002**: The server MUST assign each new visitor a `GuestPlayerIdentity` containing an opaque unique guest player ID and MUST keep the active guest player identity available to the application for lobby and match actions. A GuestPlayerIdentity is not an authenticated account: it is ephemeral, backed by browser and server memory, and lost when browser storage is cleared or the server restarts.
- **FR-003**: The browser MUST store the opaque guest player ID and selected handle locally so a reload can restore the active GuestPlayerIdentity; this storage MUST NOT be treated as an account or durable server record. The opaque guest player ID is not a public display name and MUST NOT be exposed in UI, public listings, URLs, views, or documentation examples.
- **FR-004**: Users MUST be able to set and rename a handle without authentication; a valid handle MUST contain 1–24 Unicode characters after trimming, contain at least one non-whitespace character, and contain no control characters. Uniqueness MUST be enforced among active users/sessions.
- **FR-005**: Handle uniqueness MUST compare trimmed, case-insensitive values; the displayed value MAY preserve accepted casing, and the existing reconnect grace period MUST preserve the original user's handle.
- **FR-006**: The lobby MUST list public matches only and MUST expose each listing's match identifier, occupancy/capacity, supported settings summary, and lifecycle status.
- **FR-007**: The lobby MUST distinguish at least waiting-for-players and in-progress public matches, offering Join only for open waiting matches and Spectate only for in-progress matches.
- **FR-008**: Users MUST be able to create public matches through the landing interface using the existing matchmaking-supported player-count and map-setting constraints; private matches are not part of this feature.
- **FR-009**: Creating a match MUST reserve the creator's seat and make the match visible as a public waiting entry until it starts or is collected.
- **FR-010**: Joining MUST be an atomic server-authoritative operation that assigns no more than one seat to a request and returns a clear error when the match is full, unavailable, or the identity is already committed elsewhere.
- **FR-011**: A public match MUST start automatically when its required seats fill; v1 MUST NOT require a separate manual start action. At start, the feature MUST hand off to the existing matchmaking, networking, terrain, fog-of-war, engine, and console contracts without changing gameplay mechanics or visibility rules.
- **FR-012**: The feature MUST allow a user to spectate an in-progress public match through the existing spectator mode, with no seat assignment and no ability to issue player orders.
- **FR-013**: The lobby MUST update when public matches are created, filled, started, or collected; stale entries MUST be removed or marked unavailable before offering an invalid action.
- **FR-014**: Finished matches MUST be cleaned up using the existing match lifecycle policy and MUST NOT be displayed in a history list.
- **FR-015**: The feature MUST retain all lobby, identity, and match state in memory only; no accounts, authentication, database/persistent storage, chat, ratings, invitations, private matches, or match history may be introduced.
- **FR-016**: The interface MUST provide accessible keyboard navigation, semantic names and statuses for controls and match rows, visible focus, sufficient contrast, and announcements for identity errors, empty/loading states, and action failures in line with WCAG 2.2 AA goals.
- **FR-017**: The default self-hosted launch MUST serve the landing interface without a pre-created match, while preserving an explicit path for a user to create one; gameplay remains server-authoritative and fixed-tick deterministic.
- **FR-018**: The feature MUST surface recoverable failures (identity setup, duplicate handle, unavailable match, full match, lost connection, and server restart) without trapping the user on a blank or silent screen, and MUST provide a retry, correction, or return-to-lobby action where applicable.
- **FR-019**: When a player creates or joins a match, the server MUST propagate the active `GuestPlayerIdentity` reference and its accepted handle into the authoritative match/session and seat records. The association MUST remain available through waiting, start, gameplay, terminal, and existing reconnect-grace states; a handle rename MUST update future match projections for that identity without changing the identity reference.
- **FR-020**: The match waiting/live interface MUST identify every occupied player seat with the server-authoritative accepted handle, including the local player's own seat and other participants visible to that player. The UI MUST provide a distinct, accessible label for each player and MUST NOT display an opaque guest player ID as a participant name.
- **FR-021**: The server MUST attribute every accepted order to the server-resolved player seat and GuestPlayerIdentity associated with the connection/session, regardless of any client-supplied handle, opaque guest player ID, or seat claim. An order claiming a different player MUST be rejected without changing world state, and the rejection MUST be observable to the requesting client.
- **FR-022**: Existing reconnect handling MUST restore the same identity, handle, seat, and participant label when a reconnect credential is valid and within the existing grace period. Invalid, expired, mismatched, or already-consumed reconnect credentials MUST NOT attach the connection to another player's seat, orders, or view and MUST follow the existing recoverable reconnect failure behavior.
- **FR-023**: Player and spectator views MUST be generated from server-authoritative seat/identity associations. Player views MAY expose the handles needed to identify visible participants, while spectator views MAY expose all match participant handles; neither view may allow a client to rewrite identity, seat ownership, or order authority.
- **FR-024**: Guest player IDs MUST be opaque, unique among active GuestPlayerIdentities, non-semantic, and unsuitable as user-facing names. They MUST NOT appear in public lobby entries, participant labels, player views, spectator views, URLs, or documentation examples; transport/session records MAY retain them only as needed for server-authoritative association and reconnect handling.
- **FR-025**: The feature's identity propagation behavior MUST have acceptance coverage proving that two players' handles follow them from lobby into match/session records and UI, that orders are attributed to the correct server-side seat, that reconnect restores the same association, and that player/spectator views do not leak opaque identifiers.
- **FR-026**: The same implementation change set MUST update applicable user-facing documentation and the player manual with the guest player identity lifecycle, handle validation/rename behavior, and match participant identification. Documentation acceptance MUST verify that the manual describes what players see and how they are identified without exposing opaque guest player IDs.
- **FR-027**: The same implementation change set MUST update applicable developer/operator/API documentation, including the README and self-hosting/launch documentation, with the GuestPlayerIdentity/handle propagation contract, server-authoritative association rules, reconnect/order/view implications, and the fact that guest player identities, handles, sessions, and matches are in-memory and lost on browser storage clearing or server restart. These documents MUST not present guest player IDs as stable accounts or public identifiers.

### Key Entities

- **GuestPlayerIdentity**: Ephemeral, non-authenticated, server-recognized guest player identity containing an opaque guest player ID, current handle, active-session status, and reconnect association. It is backed by browser/server memory and is lost when browser storage is cleared or the server restarts. Its opaque ID is not a public display name and is never exposed in UI, public listings, URLs, views, or documentation examples.
- **Handle**: User-facing name associated with one active GuestPlayerIdentity; validated, trimmed for comparison, and unique case-insensitively among active identities.
- **PublicMatch**: In-memory public match projection with a unique identifier, supported settings summary, capacity, occupancy, and lifecycle status.
- **LobbyEntry**: Safe public projection of a PublicMatch used to decide whether Join or Spectate is available; it contains no private or hidden match data.
- **Seat**: Existing matchmaking binding between a GuestPlayerIdentity and a player position; a spectator has no Seat.

## Non-Functional Requirements

- **NFR-001 (Responsiveness)**: Under normal self-hosted conditions, the landing interface MUST show the initial identity/lobby state within 2 seconds of page readiness and MUST reflect a successful create, join, or leave action within 1 second of the authoritative response.
- **NFR-002 (Concurrency)**: The server MUST preserve unique active handles and atomic seat assignment when concurrent requests target the same handle or final open seat; acceptance tests MUST cover at least 10 simultaneous conflicting requests.
- **NFR-003 (Privacy)**: Public listings MUST contain only public-match data needed for discovery; opaque guest player IDs MUST remain server-side/session-scoped and MUST NOT be exposed in public listings, URLs, UI labels, player/spectator views, or documentation examples. Handles are the only participant identity shown to users, subject to the GuestPlayerIdentity's ephemeral, in-memory lifecycle; no authentication or personal data collection is required.
- **NFR-004 (Compatibility)**: Existing gameplay, wire-version, reconnect-grace, fog-of-war, spectator, and match-terminal contracts MUST remain behaviorally compatible for clients entering a match through the lobby.
- **NFR-005 (Operations)**: A self-hosted operator MUST be able to run the feature with the existing single-process launch instructions and no cloud service or persistent database.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In 10/10 fresh-browser trials, a visitor receives a GuestPlayerIdentity, sets a valid handle, and reaches the lobby without account creation or manual server intervention.
- **SC-002**: Two browser clients complete create → join → first authoritative tick through the landing interface in under 2 seconds after the second seat is accepted, including existing map generation.
- **SC-003**: In a 50-cycle concurrent conflict test, no two active sessions hold the same normalized handle and no match receives more seats than its configured capacity.
- **SC-004**: In 10/10 trials, the lobby shows Join for an open public match, changes the entry on start, shows Spectate for an in-progress public match, and shows neither the finished match nor a history entry after collection.
- **SC-005**: A spectator can enter 10/10 sampled in-progress public matches, receives full-visibility read-only views, and produces zero accepted player orders.
- **SC-006**: A keyboard-only accessibility pass can complete identity setup, create or join a match, spectate an in-progress match, and return to the lobby; all failure and empty states are announced and actionable.
- **SC-007**: A 50-match sequential create/join/finish/collect soak leaves zero active matches, seats, or GuestPlayerIdentity sessions that should have expired under the existing lifecycle policy.
- **SC-008**: In 10/10 two-client trials, each player's accepted handle appears on the correct waiting/live seat and remains correct after the first authoritative tick; neither client sees either opaque guest player ID in lobby, match UI, or received player/spectator view data.
- **SC-009**: In a test with two seated players, 100 orders (including forged alternate handle, ID, and seat fields) result in every accepted order being attributed to the connection's server-authoritative seat, with all forged cross-player claims rejected and no unauthorized world-state change.
- **SC-010**: In 10/10 reconnect trials within the existing grace period, each player resumes the original seat, handle, and view association; invalid or cross-player reconnect credentials produce no seat, order, or view reassignment.
- **SC-011**: A documentation diff in the implementation change set updates the applicable player manual/user guidance and developer/operator/API/README/self-hosting guidance, and an automated or review checklist confirms that each describes handle visibility, authoritative identity association, and the opaque in-memory ID boundary without documenting opaque IDs as public identifiers.

## Out of Scope

- Private matches, shareable invitations, or hidden-match links.
- Accounts, passwords, authentication, cross-device identity, or durable profiles.
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

- GuestPlayerIdentities and accepted handles follow players from the lobby into authoritative match/session and seat records and remain associated through orders, reconnects, terminal state, and player/spectator views.
- Match UI identifies occupied seats with accepted handles, including the local player; opaque guest player IDs are never participant labels.
- Identity, seat, order, reconnect, and view association is server-authoritative. Client-supplied identity, handle, or seat claims cannot reassign authority.
- Guest player IDs remain private, non-semantic, session-scoped implementation identifiers. They are not exposed in lobby projections, URLs, UI labels, player/spectator views, or documentation examples.
- Documentation updates are part of the same implementation change set: applicable player-facing/manual content and applicable developer/operator/API/README/self-hosting content must describe the behavior and its in-memory privacy/lifecycle boundary.

### Session 2026-08-25 — Product-owner terminology amendment (v1.2)

- The feature uses `GuestPlayerIdentity`/guest player identity consistently. A GuestPlayerIdentity is a guest player identity, not an authenticated account: it has a unique server-recognized opaque guest player ID and handle, is backed by browser/server memory, and is lost when browser storage is cleared or the server restarts.
- The opaque guest player ID is not a public display name and MUST NOT be exposed in UI, public listings, URLs, views, or documentation examples. Handles remain the only participant identity shown to users.

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

- **The gap (verified)**: FR-002 has the server assign each visitor an opaque GuestPlayerId and FR-003 has the browser store it locally so a reload restores the active identity within the reconnect grace window — but NO server→client channel carried that id. `IdentityState` was id-free in both canonical contract copies, `GuestIdentityClaim.guestPlayerId` was documented as "previously issued to this browser", and nothing ever issued/delivered it: on claim-miss the registry minted a server-side UUID that never reached the browser, so reload-restore could never work end-to-end.
- **PM ruling (2026-08-26, final)**: `IdentityState` gains an ADDITIVE OPTIONAL `guestPlayerId?: GuestPlayerId` in BOTH canonical contract copies (matchmaking's `lobby-types.ts` and networking's wire mirror; no `NETWORK_API_VERSION` bump — same additive ruling pattern as v1.3's `detail`). The directed `identity` `LobbyEvent` becomes THE FR-003 delivery channel: the lobby facade populates the AUTHENTICATED owner's id when projecting identity state for that event (`establishIdentity`, `setHandle`, and every restore path), and the dispatcher forwards it verbatim — directed delivery to exactly ONE connection, the owner's. This mirrors feature-004's sessionToken delivery precedent.
- **Witness-envelope change**: the compile-time privacy witnesses are re-scoped — `PublicLobbyEntry`, `LobbySnapshot`, and every action target still MUST NOT carry the id (unchanged), while the directed identity state is the ONE sanctioned exception, pinned for optionality + brand on both sides of the mirror (indexed-access witnesses, since plain mutual assignability cannot see a missing optional field). Runtime privacy scans stay truthful: entries, snapshots, action outcomes, and OTHER connections' deliveries remain scanned strictly id-free, and a dedicated pin proves a second connection NEVER receives another identity's guestPlayerId. Public listings/snapshots/targets/UI/URLs/logs remain strictly id-free (NFR-003/FR-024 unchanged).
- **Client contract**: browsers persist the server-delivered id (replacing any local bootstrap mint — the local mint remains first-frame bootstrap only) so reload-restore works end-to-end; clients MUST tolerate the field's absence (older servers).
