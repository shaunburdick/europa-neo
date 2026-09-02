# Research: Profile Route & Identity Onboarding

## 1. Routing System Architecture

**Current state**: `packages/console/src/routing/route.ts` defines a closed `Route` union:
- `{ kind: 'root'; pathname: '/' }`
- `{ kind: 'lobby'; pathname: '/lobby' }`
- `{ kind: 'match'; pathname: string; matchId: string; intent: MatchRouteIntent }`
- `{ kind: 'unknown'; pathname: string; reason: RouteRejection }`

`parseRoute()` classifies a pathname WITHOUT consulting query parameters — query params are read separately by consuming components (e.g. `?e2e` by the E2E harness, `?ws=` by the lobby runtime). This means `/profile?returnTo=...` parses as `{ kind: 'profile', pathname: '/profile' }` and the profile component reads `returnTo` from `window.location.search`.

**Key pattern**: The `RouteRejection` union is extensible for future rejection reasons. Adding `'profile'` as a new `kind` is additive and non-breaking. The exhaustive switch in `parseRoute()` is the only place where the new branch must be added.

**Relevant files**:
- `packages/console/src/routing/route.ts` (lines 14-23, 36-70) — Route type + parseRoute
- `packages/console/src/routing/route-adapter.ts` (lines 24-50, 62-99) — RouteEntry + adaptRoute
- `packages/console/tests/unit/routing/route.test.ts` — route parser tests
- `packages/console/tests/unit/routing/route-contract.test.ts` — contract tests
- `packages/console/tests/unit/routing/route-adapter.test.ts` — adapter tests
- `packages/console/tests/unit/routing/semantic-route-guards.test.ts` — guard tests
- `packages/console/tests/unit/routing/semantic-route-security.test.ts` — security tests

## 2. Bootstrap Routing (main.tsx)

`main.tsx` → `bootstrapProductionRoute()` calls `parseRoute(window.location.pathname)` then `adaptRoute(route, null)` (null snapshot = pre-baseline). The switch on `entry.kind` currently handles: redirect, lobby, resolve, player, spectator, unavailable.

Adding `'profile'` is a new case in this switch. The profile route needs NO I/O at bootstrap — it just mounts the lobby runtime with a profile-specific initial state. The existing pattern passes the route through to `LobbyRoot` which decides what to render.

**Key decision**: `/profile` should be treated like `/lobby` at bootstrap — mount the lobby runtime (which handles the identity card → profile view swap internally). This avoids a separate runtime mount and keeps the single-connection architecture clean.

**Relevant files**:
- `packages/console/src/main.tsx` (lines 75-118) — bootstrapProductionRoute

## 3. Identity Flow

**Current flow**: `lobby-runtime.tsx` → `LobbyRoot` → renders `LobbyLanding` when `viewMode === 'lobby'`. The landing renders `LobbyIdentityCard` which owns the set-name form.

**Identity state** (`lobby-state.ts`):
- `identityStatus: 'restoring' | 'unnamed' | 'named'`
- `handle: string | null`
- `actionStatus` (per-action loading/error tracking for `setHandle`)

**Controller commands**: `controller.setHandle(raw)` delegates to `transport.setHandle(handle)` — the profile view does NOT own transport setup.

**Key insight**: The `LobbyIdentityCard` currently handles both unnamed (form) and named (display + rename) states. The profile view will handle unnamed (form → auto-navigate) and named (welcome + continue). The lobby landing will only show a compact static display.

**Relevant files**:
- `packages/console/src/state/lobby-state.ts` (lines 57, 143-198) — LobbyIdentityStatus, LobbyState
- `packages/console/src/state/lobby-controller.ts` (lines 113-150, 349-361) — setHandle command
- `packages/console/src/ui/lobby-identity-card.tsx` (full) — current identity card
- `packages/console/src/ui/lobby-handle.ts` (full) — client-side validation
- `packages/console/src/ui/lobby-labels.ts` (lines 37-68) — connectionLabel, identityStatusLabel

## 4. Design System Components

Available `<europa-*>` components for profile view layout:
- `<europa-page>` — light-DOM page wrapper (div.europa-page)
- `<europa-card>` — light-DOM card wrapper (div.europa-card)
- `<europa-stack>` — vertical layout primitive (div.europa-stack)
- `<europa-button>` — native `<button>` with focus ring
- `<europa-typography>` — typography wrapper

All are Light DOM with manual child reparenting. Used in JSX like `<europa-page><h1>Title</h1>...</europa-page>`.

**Pattern from lobby-landing.tsx**: The landing uses raw `<section>` with CSS classes (`europa-lobby__card`, `europa-lobby__card-title`) rather than europa-card for the identity card section. The profile view can follow either pattern — design system components for consistency or raw elements for closer visual match to existing lobby cards.

**Decision**: Use design system components (`<europa-page>`, `<europa-card>`, `<europa-stack>`, `<europa-button>`) for the profile view per FR-016, while keeping the same CSS class conventions for the form elements.

## 5. Lobby View Gate in lobby-runtime.tsx

The `LobbyRoot` component currently has this view gate (lines 418-510):
1. `noticeKind !== null` → RouteNotice
2. `state.viewMode === 'match'` → MatchLegHost
3. Default → LobbyLanding

The profile view fits between step 2 and 3: when `viewMode === 'lobby'` AND `window.location.pathname === '/profile'`, render `ProfileView` instead of `LobbyLanding`. The `returnTo` parameter is read from `window.location.search` at render time.

**Key timing**: The profile view must wait for the identity to resolve before showing the form vs welcome card. During `identityStatus === 'restoring'`, show a restoring indicator. The connection must also be established (or at least attempting) for the status line.

**Relevant files**:
- `packages/console/src/internal/lobby-runtime.tsx` (lines 195-510) — LobbyRoot view gate

## 6. returnTo Safety Validation

The `returnTo` query parameter carries a URL-encoded pathname. Safety checks needed:
1. Decode with `decodeURIComponent` — if it throws, treat as absent
2. Must NOT contain `://` or start with `//` (external URL)
3. Must NOT contain `..` (path traversal)
4. Must start with `/` (relative pathname)
5. Must NOT contain protocol prefix (`http:`, `https:`, etc.)

Pattern already exists in `route.ts`'s `validateDecodedMatchId()` for match ID safety. The returnTo validation is simpler (just needs to be a safe relative pathname).

**Relevant files**:
- `packages/console/src/routing/route.ts` (lines 160-177) — validateDecodedMatchId pattern
- `packages/console/tests/unit/internal/url-security.test.ts` — URL security test pattern

## 7. Match-Join Redirect Flow

When a player arrives at `/match/<id>/join` without identity:
1. `bootstrapProductionRoute()` calls `parseRoute('/match/abc123/join')` → `{ kind: 'match', ... }`
2. `adaptRoute()` returns a match entry
3. The lobby runtime mounts and tries to resolve the match
4. BUT: if `identityStatus === 'unnamed'`, the player needs to set a name first

**Current behavior**: The lobby runtime tries to join/spectate immediately. With the profile route, we need to redirect unnamed players from `/match/<id>/join` to `/profile?returnTo=<encoded-match-url>`.

**Implementation approach**: The redirect happens in `LobbyRoot` after the lobby connection establishes and identity resolves. When `identityStatus === 'unnamed'` AND `currentRoute` is a match join/spectate route, redirect to `/profile?returnTo=<encoded>`. This is stateless — no localStorage.

**Key timing**: The redirect must happen AFTER identity resolution (not at bootstrap), because a returning player with a stored handle proceeds directly to the match.

## 8. Test Patterns

**Unit tests** (node-mode, `.test.ts`):
- Route parser: `parseRoute('/profile')` returns `{ kind: 'profile', pathname: '/profile' }`
- Route adapter: `adaptRoute(profileRoute, snapshot)` returns `{ kind: 'profile', route }`
- returnTo validation: pure function tests for safety checks
- URL security: external URLs, `..` traversal, malformed encoding

**Component tests** (browser-mode, `.test.tsx`):
- ProfileView renders form when unnamed
- ProfileView renders welcome when named
- ProfileView renders restoring indicator
- LobbyLanding shows compact identity display (no form)
- ProfileView auto-navigates after successful handle submission

**A11y tests** (browser-mode):
- ProfileView heading is focusable
- Input has tied label
- Errors use role="alert"
- All controls keyboard-operable

**Test fixture pattern** (from lobby-landing.test.tsx):
```typescript
function stateOf(overrides: Partial<LobbyState> = {}): LobbyState {
    return { ...INITIAL_LOBBY_STATE, ...overrides };
}
```
