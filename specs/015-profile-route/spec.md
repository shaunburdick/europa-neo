# Feature Specification: Profile Route & Identity Onboarding

**Feature Branch**: `015-profile-route`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "Dedicated `/profile` route for name/handle setup, replacing the inline lobby identity card. Returning players see 'Welcome back, {handle}' with a Continue button. New players see the full handle-setting form. Match-join without identity redirects to `/profile?returnTo=<encoded-match-url>` — stateless, no storage."

**Dependencies**: Feature 005 (Client Console), Feature 010 (Public Lobby), Feature 013 (Semantic URL Routing)

## Problem Statement

The lobby's inline identity card (`lobby-identity-card.tsx`) currently serves dual duty as both the first-time name picker and the returning-player status display. This conflates two distinct user intents: onboarding (setting a name for the first time) and identity management (viewing/changing a name). A dedicated route provides a clearer mental model — "set up your profile" vs. "browse matches" — and is extensible for future login, avatar, or account features without further crowding the lobby landing page. Additionally, players arriving via a match-join deep link (`/match/<id>/join`) without an established identity currently land in the lobby with no obvious path to the identity form; a redirect to `/profile` with a `returnTo` parameter solves this cleanly.

## User Scenarios & Testing

### User Story 1 — First-Time Player Onboarding (Priority: P1)

As a new visitor with no established handle, I want a focused identity-setup screen so that I can choose a display name and start playing without navigating the lobby.

**Why this priority**: First-time onboarding is the primary reason for this feature; without it, new players must find the identity card among lobby controls.

**Independent Test**: Can be tested by visiting `/profile` with `identityStatus === 'unnamed'` and asserting the handle form is displayed and functional.

**Acceptance Scenarios**:

1. **Given** a visitor with no stored handle arrives at `/profile`, **When** the page renders, **Then** a handle input form is displayed with a label ("Display name"), a text input, a submit button ("Set name"), and local validation error messages — matching the current `lobby-identity-card.tsx` form UX.
2. **Given** the visitor enters a valid handle and submits, **When** the server accepts it, **Then** the identity status transitions to `named`, and the profile page updates to show "Welcome back, {handle}" with a Continue button.
3. **Given** the visitor enters an invalid handle (empty, too long, control characters, bidi controls, lone surrogates), **When** they submit, **Then** the same local validation errors from `lobby-handle.ts` are displayed inline without a server round-trip.
4. **Given** the server rejects the handle (e.g., `handle_taken`), **When** the response arrives, **Then** the server error is displayed inline below the input, matching the existing `describeActionError` presentation.

---

### User Story 2 — Returning Player Quick-Continue (Priority: P1)

As a returning player with an established handle, I want to see "Welcome back, {handle}" with a single Continue button so that I can proceed to the lobby without re-entering my name.

**Why this priority**: Returning players should have a zero-friction path back into the game; the full form is unnecessary for them.

**Independent Test**: Can be tested by visiting `/profile` with `identityStatus === 'named'` and asserting the welcome message and Continue button are displayed; clicking Continue navigates to `/lobby`.

**Acceptance Scenarios**:

1. **Given** a returning visitor with an accepted handle arrives at `/profile`, **When** the page renders, **Then** a card displays "Welcome back, {handle}" (handle inside `<bdi>` for bidi isolation) and a "Continue to lobby" button.
2. **Given** the visitor clicks "Continue to lobby", **When** the click fires, **Then** the browser navigates to `/lobby` via `history.pushState`.
3. **Given** a returning visitor arrives at `/profile?returnTo=/match/<id>/join`, **When** they click Continue, **Then** the browser navigates to the decoded `returnTo` URL (the original match-join deep link), not to `/lobby`.
4. **Given** a returning visitor arrives at `/profile` and the `identityStatus` is `restoring` (mid-reconnect), **When** the page renders, **Then** a restoring status indicator is shown and the Continue button is disabled until identity resolves.

---

### User Story 3 — Match-Join Redirect Without Identity (Priority: P1)

As a player who arrives via a match-join deep link (`/match/<id>/join`) without an established handle, I want to be transparently redirected to `/profile` so that I can set a name and be returned to the match I was trying to join.

**Why this priority**: Deep links are a primary entry path; without this redirect, players land in the lobby with no clear next step.

**Independent Test**: Can be tested by navigating to `/match/<id>/join` with `identityStatus === 'unnamed'` and asserting the browser redirects to `/profile?returnTo=<encoded-match-url>`.

**Acceptance Scenarios**:

1. **Given** a player navigates to `/match/abc123/join` and `identityStatus === 'unnamed'`, **When** the route resolves, **Then** the browser URL changes to `/profile?returnTo=%2Fmatch%2Fabc123%2Fjoin` (stateless query param, no localStorage).
2. **Given** the player completes handle setup on `/profile` and clicks Continue, **When** the navigation fires, **Then** the browser navigates to `/match/abc123/join` (the decoded `returnTo` value), not to `/lobby`.
3. **Given** a player navigates to `/match/abc123/join` and `identityStatus === 'named'`, **When** the route resolves, **Then** the player proceeds directly to the match (no redirect — identity already established).
4. **Given** a player arrives at `/profile?returnTo=<malformed-or-external-url>`, **When** the profile page reads the param, **Then** the Continue button navigates to `/lobby` (fallback to safe default; the `returnTo` param is ignored when it fails URL safety validation).

---

### User Story 4 — Lobby Identity Card Replacement (Priority: P2)

As a player browsing the lobby, I want the identity card replaced with a compact static display of my current handle and a "Manage profile" link so that the lobby page is less cluttered and identity management has a clear home.

**Why this priority**: Clean-up after the dedicated route exists; the lobby gains a link instead of a full inline form.

**Independent Test**: Can be tested by rendering `LobbyLanding` with `identityStatus === 'named'` and asserting the inline form is absent and a "Manage profile" link points to `/profile`.

**Acceptance Scenarios**:

1. **Given** a named player views the lobby landing, **When** the page renders, **Then** the identity card section shows "Playing as {handle}" as static text and a "Manage profile" link pointing to `/profile` — no input form is present.
2. **Given** an unnamed player views the lobby landing, **When** the page renders, **Then** the identity card section shows "Choose a name" with a link to `/profile` instead of an inline form.
3. **Given** a player clicks "Manage profile" on the lobby, **When** the click fires, **Then** the browser navigates to `/profile` via `history.pushState`.

---

## Requirements

### Functional Requirements

- **FR-001**: The console MUST register `/profile` as a recognized route in `parseRoute()` (`route.ts`), returning `{ kind: 'profile', pathname: '/profile' }` — a new variant added to the `Route` union type.
- **FR-002**: The `adaptRoute()` function MUST map the `profile` route kind to a new `RouteEntry` variant `{ kind: 'profile', route }` that the lobby runtime resolves into the profile view without any I/O.
- **FR-003**: The lobby runtime (`lobby-runtime.tsx`) MUST render a `ProfileView` component when `state.viewMode === 'lobby'` AND the browser pathname is `/profile`, instead of the `LobbyLanding` component.
- **FR-004**: The profile view MUST read an optional `returnTo` query parameter from `window.location.search`. The parameter value is decoded with `decodeURIComponent`. If decoding fails, the parameter is treated as absent.
- **FR-005**: The profile view MUST validate `returnTo` URLs against a safety check: the decoded value must be a relative pathname (no protocol, no host, no `//` prefix). Unsafe values are treated as absent (fallback to `/lobby`).
- **FR-006**: When `identityStatus === 'unnamed'` and the lobby connection is `ready`, the profile view MUST render a handle input form: a text input with a `<label>` ("Display name"), the same local validation from `lobby-handle.ts` (`validateHandleDraft`), a submit button ("Set name"), and inline error display (`role="alert"` + `aria-describedby` + `aria-invalid`).
- **FR-007**: When `identityStatus === 'named'` and `handle` is non-null, the profile view MUST render a card showing "Welcome back, {handle}" (handle inside `<bdi>`) and a "Continue to lobby" button. The button navigates to the decoded `returnTo` URL if present, otherwise to `/lobby`.
- **FR-008**: When `identityStatus === 'restoring'`, the profile view MUST show a "Restoring your session…" status indicator and disable the Continue button until identity resolves.
- **FR-009**: On handle submission, the profile view MUST delegate to the same `onSubmitHandle` callback used by the current `LobbyIdentityCard`, which calls `controller.setHandle(raw)`. The profile view does NOT own the transport call.
- **FR-010**: After a successful handle submission (identity transitions from `unnamed` to `named`), the profile view MUST automatically navigate to the decoded `returnTo` URL if present, or `/lobby` otherwise, using `history.pushState` — no manual Continue click required for first-time setup.
- **FR-011**: The lobby landing page (`lobby-landing.tsx`) MUST replace the inline `LobbyIdentityCard` form with a compact identity display: static "Playing as {handle}" text (handle in `<bdi>`) and a "Manage profile" link pointing to `/profile` when named; "Choose a name" link to `/profile` when unnamed. The `onSubmitHandle` prop is removed from `LobbyLandingProps`.
- **FR-012**: The `Route` type in `route.ts` MUST add a `'profile'` variant: `{ readonly kind: 'profile'; readonly pathname: '/profile' }`. The `parseRoute()` function MUST recognize `/profile` and return this variant. Any query parameters on `/profile` are NOT part of the route classification (they are read separately by the profile view).
- **FR-013**: The `RouteEntry` union in `route-adapter.ts` MUST add a `{ readonly kind: 'profile'; readonly route: Extract<Route, { readonly kind: 'profile' }> }` variant. `adaptRoute()` MUST return this for profile routes. `executeRouteEntry()` MUST return `null` for profile entries (no I/O).
- **FR-014**: The profile view MUST be accessible (WCAG 2.2 AA): the page heading is focusable (`tabIndex={-1}`), the input has a tied `<label>`, errors use `role="alert"`, and all controls are keyboard-operable native elements.
- **FR-015**: The profile view MUST display connection status in a non-intrusive line (e.g., "Connected" / "Connecting to lobby…"), matching the existing identity card's connection-status pattern.
- **FR-016**: The profile page MUST use design-system components (`<europa-page>`, `<europa-card>`, `<europa-button>`, `<europa-stack>`, `<europa-typography>`) for consistent styling with the rest of the console.

### Key Entities

- **Route (extended)**: The `Route` union gains `{ kind: 'profile'; pathname: '/profile' }`.
- **RouteEntry (extended)**: The `RouteEntry` union gains `{ kind: 'profile'; route }`.
- **ProfileView**: New React component owning the profile page rendering. Props: `identityStatus`, `handle`, `connection`, `actionStatus`, `onSubmitHandle`, `returnTo: string | null`.
- **returnTo parameter**: A URL-encoded relative pathname carried in the `?returnTo=` query string on `/profile`. Stateless — no localStorage, no session storage. Validated for safety (relative pathname only).

## Success Criteria

### Measurable Outcomes

- **SC-001**: A first-time visitor (unnamed) navigating to `/profile` sees the handle form, can set a valid name, and is automatically redirected to the lobby or a `returnTo` destination within one form submission.
- **SC-002**: A returning visitor (named) navigating to `/profile` sees the welcome card and can reach the lobby (or `returnTo` destination) with a single button click.
- **SC-003**: A deep link to `/match/<id>/join` without identity redirects to `/profile?returnTo=<encoded>` and, after name setup, navigates back to the match-join URL — the full round-trip involves zero manual URL entry.
- **SC-004**: The lobby landing page renders without the inline identity form; the "Manage profile" link navigates to `/profile` and back correctly.
- **SC-005**: All profile view elements are keyboard-navigable and screen-reader accessible (automated a11y tests pass).
- **SC-006**: The `returnTo` parameter is rejected for external URLs (`https://evil.com`) and malformed values, falling back to `/lobby`.

## Assumptions

- The lobby connection is established before the profile view renders — the profile view does not own transport setup.
- Handle validation rules are identical to the current `lobby-handle.ts` mirror; no new validation rules are introduced.
- The profile route is only reachable in the lobby context (not during an active match). A player in a match who navigates to `/profile` is ignored or redirected to `/lobby`.
- `prefers-reduced-motion` is honored for any transitions in the profile view (design system default).

## Out of Scope

The following are explicitly **not** part of this feature:

- **Login / authentication**: The profile route is a guest-identity surface only; no email, password, OAuth, or account creation.
- **Avatar / profile picture**: Not in v1; the route is extensible for this later.
- **Server-side profile storage**: The handle is stored via the existing `setHandle` wire command and lobby-state projection; no new persistence layer.
- **Profile editing beyond handle rename**: The profile view does not include settings, preferences, or other management controls.
- **Mobile/responsive layout adaptation**: Desktop-first, same as the rest of the console; the layout must not preclude mobile later but is not optimized for it.
- **Animated transitions between lobby and profile**: The profile view swaps without page-transition animations (simplicity, constitution V).

## Edge Cases

- **returnTo with external URL**: `?returnTo=https://evil.com/path` → treated as absent, Continue navigates to `/lobby`.
- **returnTo with `//` prefix**: `?returnTo=//evil.com` → treated as absent.
- **returnTo with URL-encoded slashes**: `?returnTo=%2Fmatch%2Fabc%2Fjoin` → decoded to `/match/abc/join`, navigated correctly.
- **returnTo with empty value**: `?returnTo=` → treated as absent.
- **returnTo with `..` path traversal**: `?returnTo=%2F..%2Fsecret` → treated as absent (relative-pathname check rejects `..` segments).
- **Connection drops during handle submission**: The `actionStatus.error` slot surfaces the error (transport/timeout); the form remains functional for retry.
- **Server rejects handle (handle_taken)**: The server error message is displayed inline below the input; the form remains functional for retry.
- **Identity restored while on /profile**: If `identityStatus` transitions from `restoring` to `named` while the profile view is mounted, the view updates to show the welcome card and auto-navigates if `returnTo` is present.
- **Browser Back from /profile to /lobby**: Handled by the existing `popstate` listener in `lobby-runtime.tsx` — the profile route is just another lobby-context view.

## Examples

### Profile page — unnamed visitor

```
┌─────────────────────────────────────────────┐
│  Europa Neo — Profile                       │
│                                             │
│  ┌─────────────────────────────────────────┐│
│  │  Set up your profile                    ││
│  │                                         ││
│  │  Connection: Connected                  ││
│  │                                         ││
│  │  Display name                           ││
│  │  ┌─────────────────────────────────┐    ││
│  │  │                                 │    ││
│  │  └─────────────────────────────────┘    ││
│  │  [Set name]                             ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

### Profile page — returning visitor

```
┌─────────────────────────────────────────────┐
│  Europa Neo — Profile                       │
│                                             │
│  ┌─────────────────────────────────────────┐│
│  │  Welcome back, Alice                   ││
│  │                                         ││
│  │  [Continue to lobby]                    ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

### Profile page — returning visitor with returnTo

```
┌─────────────────────────────────────────────┐
│  Europa Neo — Profile                       │
│                                             │
│  ┌─────────────────────────────────────────┐│
│  │  Welcome back, Alice                   ││
│  │                                         ││
│  │  [Continue to match]                    ││
│  └─────────────────────────────────────────┘│
```
(URL: `/profile?returnTo=%2Fmatch%2Fabc123%2Fjoin`)
(Button label: "Continue to match" when returnTo contains `/match/`)

### Lobby landing — named player (replaced identity card)

```
┌─────────────────────────────────────────────┐
│  Europa Neo lobby                           │
│                                             │
│  ┌──────────────┐  ┌──────────────────────┐│
│  │ Your name     │  │ Create a match       ││
│  │              │  │                      ││
│  │ Playing as   │  │ ...                  ││
│  │ Alice        │  │                      ││
│  │              │  │                      ││
│  │ Manage       │  │                      ││
│  │ profile →    │  │                      ││
│  └──────────────┘  └──────────────────────┘│
│                                             │
│  ┌──────────────────────────────────────────┐│
│  │ Public matches                           ││
│  │ ...                                      ││
│  └──────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

## Clarifications Applied

*None yet — this spec is at v1.0 draft. Clarifications will be documented here during Phase 3.*
