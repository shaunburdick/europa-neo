# Data Model: Profile Route & Identity Onboarding

## 1. State Changes

### No changes to `LobbyState`

The profile view reads existing `LobbyState` fields — no new state fields are introduced:
- `identityStatus` → determines form vs welcome card vs restoring indicator
- `handle` → displayed in welcome card and lobby compact display
- `connection` → displayed as connection status line
- `actions.setHandle` → loading/error tracking for form submission

### No changes to `LobbyAction` union

No new actions are introduced. The profile view delegates to existing `controller.setHandle(raw)`.

### No changes to `LobbyViewMode`

The profile view is NOT a new view mode. It is rendered within the existing `viewMode === 'lobby'` gate, distinguished by `window.location.pathname === '/profile'`. This avoids reducer changes and keeps the profile as a sub-view of the lobby context.

## 2. Route Type Extension

```typescript
// In packages/console/src/routing/route.ts

// BEFORE:
export type Route =
    | { readonly kind: 'root'; readonly pathname: '/' }
    | { readonly kind: 'lobby'; readonly pathname: '/lobby' }
    | { readonly kind: 'match'; readonly pathname: string; readonly matchId: string; readonly intent: MatchRouteIntent }
    | { readonly kind: 'unknown'; readonly pathname: string; readonly reason: RouteRejection };

// AFTER (additive):
export type Route =
    | { readonly kind: 'root'; readonly pathname: '/' }
    | { readonly kind: 'lobby'; readonly pathname: '/lobby' }
    | { readonly kind: 'profile'; readonly pathname: '/profile' }  // NEW
    | { readonly kind: 'match'; readonly pathname: string; readonly matchId: string; readonly intent: MatchRouteIntent }
    | { readonly kind: 'unknown'; readonly pathname: string; readonly reason: RouteRejection };
```

## 3. RouteEntry Extension

```typescript
// In packages/console/src/routing/route-adapter.ts

// BEFORE:
export type RouteEntry =
    | { readonly kind: 'redirect'; readonly route: Route; readonly pathname: '/lobby' }
    | { readonly kind: 'lobby'; readonly route: Route; readonly pathname: '/lobby' }
    | { readonly kind: 'resolve'; readonly route: Extract<Route, { readonly kind: 'match' }>; readonly matchId: MatchId }
    | { readonly kind: 'player'; ... }
    | { readonly kind: 'spectator'; ... }
    | { readonly kind: 'unavailable'; ... };

// AFTER (additive):
export type RouteEntry =
    | { readonly kind: 'redirect'; readonly route: Route; readonly pathname: '/lobby' }
    | { readonly kind: 'lobby'; readonly route: Route; readonly pathname: '/lobby' }
    | { readonly kind: 'profile'; readonly route: Extract<Route, { readonly kind: 'profile' }> }  // NEW
    | { readonly kind: 'resolve'; readonly route: Extract<Route, { readonly kind: 'match' }>; readonly matchId: MatchId }
    | { readonly kind: 'player'; ... }
    | { readonly kind: 'spectator'; ... }
    | { readonly kind: 'unavailable'; ... };
```

## 4. ProfileView Props

```typescript
// In packages/console/src/ui/profile-view.tsx

export interface ProfileViewProps {
    /** Guest-identity lifecycle (unnamed / named / restoring). */
    readonly identityStatus: LobbyIdentityStatus;
    /** Server-confirmed display handle, verbatim; null while unnamed. */
    readonly handle: string | null;
    /** Transport connection lifecycle (rendered as status line). */
    readonly connection: LobbyConnectionState;
    /** The store's setHandle action slot (loading/error tracking). */
    readonly actionStatus: LobbyActionStatus;
    /**
     * Submit a raw (unvalidated) handle draft. Called ONLY after local
     * validation passes; the caller binds the controller command.
     */
    readonly onSubmitHandle: (raw: string) => void;
    /**
     * The decoded returnTo URL (relative pathname) or null if absent/unsafe.
     * Read from window.location.search by the runtime.
     */
    readonly returnTo: string | null;
}
```

## 5. returnTo Validation (Pure Function)

```typescript
// In packages/console/src/ui/profile-view.ts (or a shared util)

/**
 * Read and validate the returnTo query parameter from the current URL.
 *
 * Safety rules:
 * 1. decodeURIComponent must not throw
 * 2. Decoded value must NOT contain '://' (external URL)
 * 3. Decoded value must NOT start with '//' (protocol-relative)
 * 4. Decoded value must NOT contain '..' (path traversal)
 * 5. Decoded value must start with '/' (relative pathname)
 * 6. Decoded value must NOT be empty
 *
 * @returns Safe relative pathname, or null if unsafe/absent.
 */
export function readReturnTo(search: string): string | null
```

## 6. localStorage Schema

**No changes**. The profile route is stateless — `returnTo` lives in the URL query string. Identity persistence remains in the existing `europa:lobby:identity:v1` localStorage key managed by `ws-lobby-client.ts`.

## 7. Type Safety Notes

- All new types are `readonly` (matches existing codebase convention)
- `ProfileViewProps` uses the same `LobbyIdentityStatus`, `LobbyConnectionState`, and `LobbyActionStatus` types already in use — no new type definitions needed for state
- The `returnTo` field is `string | null` (not optional) — explicit null is clearer than undefined for "no return target"
- The `readReturnTo` function is pure (DOM-free) for testability: receives `search` string, returns validated path or null
