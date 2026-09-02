# Implementation Plan: Profile Route & Identity Onboarding

**Branch**: `015-profile-route` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-profile-route/spec.md`

## Summary

Add a dedicated `/profile` route to the console SPA that replaces the inline lobby identity card (`lobby-identity-card.tsx`). The profile view handles three identity states: unnamed (handle-setting form), named (welcome card + continue button), and restoring (session restoration indicator). A `returnTo` query parameter enables stateless match-join redirects — players arriving at `/match/<id>/join` without an identity are transparently redirected to `/profile?returnTo=<encoded>` and returned to the match after name setup. The lobby landing gains a compact identity display with a "Manage profile" link.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), React 19.x  
**Primary Dependencies**: React (JSX components), Zustand (state store via `useSyncExternalStore`), `@europa/design` (web components)  
**Storage**: localStorage for identity persistence (existing `europa:lobby:identity:v1` — no changes)  
**Testing**: Vitest (unit + component), vitest-browser-react (component a11y), no new test framework  
**Target Platform**: Browser (SPA), desktop-first  
**Project Type**: Web application (console package within monorepo)  
**Performance Goals**: No new performance requirements — profile view is a static form/card  
**Constraints**: Zero new dependencies, no server changes, no reducer changes, no new view mode  
**Scale/Scope**: ~5-7 tasks, 1 new component (~120 lines), 3 modified files, ~150 lines of tests

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Type Safety First | ✅ | New `Route` variant enforced by exhaustive switch; `ProfileViewProps` fully typed; no `any` |
| II. Server-Authoritative Deterministic Simulation | ✅ | Profile view is UI-only; no game logic touched |
| III. Tested Game Logic (≥80%) | ✅ | No game logic changed; new component/a11y tests added |
| IV. Specs as Documentation | ✅ | Spec updated same change set; plan + tasks committed |
| V. Simplicity Over Cleverness | ✅ | Single component, no new state, no new reducer, no new view mode |
| VI. Accessibility-Minded UI | ✅ | WCAG 2.2 AA: label, role="alert", keyboard-native, `<bdi>` for handles |
| VII. Self-Hostable by Default | ✅ | Pure client-side; no new server requirements |

**No constitution violations.**

## Architecture Overview

### Data Flow

```
Browser URL: /profile?returnTo=%2Fmatch%2Fabc123%2Fjoin
         │
         ▼
parseRoute('/profile') → { kind: 'profile', pathname: '/profile' }
         │
         ▼
adaptRoute(profileRoute, snapshot) → { kind: 'profile', route }
         │
         ▼
bootstrapProductionRoute() → mountLobby(root)  [same as /lobby]
         │
         ▼
LobbyRoot renders:
  pathname === '/profile' → ProfileView
  pathname === '/lobby'    → LobbyLanding
  viewMode === 'match'    → MatchLegHost
```

### Key Architectural Decisions

1. **No new view mode**: The profile view renders within `viewMode === 'lobby'`, distinguished by `window.location.pathname === '/profile'`. This avoids reducer changes, keeps the lobby context intact, and preserves the existing Back/Forward handling.

2. **Bootstrap-level route handling**: `parseRoute()` gains `'profile'` as a recognized route kind. `adaptRoute()` returns `{ kind: 'profile', route }` — no I/O, no snapshot lookup. `bootstrapProductionRoute()` mounts the lobby runtime (same as `/lobby`), which internally gates on pathname.

3. **Stateless returnTo**: The `returnTo` parameter lives in the URL query string only. No localStorage, no session storage. The profile view reads `window.location.search` at render time, validates safety, and navigates via `history.pushState`.

4. **Lobby landing identity replacement**: The `LobbyIdentityCard` component is fully replaced by a compact inline display in `LobbyLanding`. The `onSubmitHandle` prop is removed from `LobbyLandingProps` — the lobby no longer owns identity form logic.

5. **Match-join redirect timing**: The redirect from `/match/<id>/join` to `/profile?returnTo=...` happens in `LobbyRoot` AFTER identity resolution (not at bootstrap), so returning players with established handles proceed directly to the match.

## Project Structure

### Documentation (this feature)

```text
specs/015-profile-route/
├── spec.md              # Feature specification (v1.0)
├── plan.md              # This file
├── research.md          # Codebase research
├── data-model.md        # State changes, type extensions
├── contracts/
│   └── type-contracts.md # Type contract specifications
└── tasks.md             # Ordered task list
```

### Source Code Changes

```text
packages/console/src/
├── routing/
│   ├── route.ts              # MODIFY: add 'profile' to Route union + parseRoute
│   └── route-adapter.ts      # MODIFY: add 'profile' to RouteEntry + adaptRoute/executeRouteEntry
├── ui/
│   ├── profile-view.tsx      # NEW: ProfileView component (~120 lines)
│   ├── lobby-landing.tsx     # MODIFY: replace LobbyIdentityCard with compact identity display
│   └── lobby-identity-card.tsx  # DELETE: fully replaced by profile route
├── internal/
│   └── lobby-runtime.tsx     # MODIFY: add profile route case in view gate + match-join redirect
└── main.tsx                  # MODIFY: add 'profile' to bootstrap switch

packages/console/tests/
├── unit/routing/
│   ├── route.test.ts              # MODIFY: add profile route parser tests
│   ├── route-contract.test.ts     # MODIFY: add profile to contract tests
│   └── route-adapter.test.ts      # MODIFY: add profile adapter tests
├── unit/ui/
│   └── profile-view.test.ts       # NEW: returnTo validation + ProfileView logic tests
├── component/ui/
│   └── profile-view.test.tsx      # NEW: ProfileView component tests (unnamed/named/restoring)
├── component/ui/
│   └── lobby-landing.test.tsx     # MODIFY: update tests for compact identity display
└── a11y/
    └── profile-view.test.tsx      # NEW: a11y assertions for ProfileView
```

## Key Decisions & Rationale

### Decision 1: Profile as sub-view of lobby (not new viewMode)

**Chosen**: Render ProfileView when `viewMode === 'lobby'` AND pathname is `/profile`.  
**Rejected alternative**: Add `'profile'` to `LobbyViewMode` union.  
**Rationale**: Adding a view mode requires reducer changes (`lobbyReturned` logic), affects every reducer branch that checks `viewMode`, and introduces unnecessary state complexity. The pathname check is simpler, testable, and matches the existing pattern where `LobbyLanding` already knows it's in the lobby context.

### Decision 2: Bootstrap mounts lobby runtime for /profile

**Chosen**: `bootstrapProductionRoute()` treats `/profile` like `/lobby` — same lobby runtime mount.  
**Rejected alternative**: Separate bootstrap path for profile.  
**Rationale**: The profile view needs the same lobby connection, controller, and state infrastructure. A separate mount would duplicate wiring. The lobby runtime's view gate handles the profile/lobby distinction cleanly.

### Decision 3: Compact identity display in lobby (not conditional card)

**Chosen**: Replace `LobbyIdentityCard` with inline compact display (no separate component).  
**Rejected alternative**: Keep `LobbyIdentityCard` but hide the form when on lobby.  
**Rationale**: The lobby landing is simpler without the form — just "Playing as {handle}" + "Manage profile" link. A separate component would be over-engineering for ~20 lines of JSX. The `onSubmitHandle` prop is removed from `LobbyLandingProps` since the lobby no longer owns form logic.

### Decision 4: Match-join redirect in LobbyRoot (not bootstrap)

**Chosen**: Redirect unnamed players from match routes to `/profile?returnTo=...` in `LobbyRoot` after identity resolution.  
**Rejected alternative**: Redirect at bootstrap before mounting.  
**Rationale**: At bootstrap time, `identityStatus` is `'restoring'` — we don't know yet if the player has an established handle. The redirect must wait for the identity event. The lobby runtime already handles this timing correctly for other identity-dependent actions.

## Constitution Alignment

- **Simplicity (V)**: One new component, three modified files, no new state, no new dependencies. The profile view reuses existing validation, controller commands, and connection infrastructure.
- **Accessibility (VI)**: ProfileView follows the exact same a11y contract as `LobbyIdentityCard` — label, role="alert", `<bdi>` for handles, keyboard-native controls. Heading is focusable with `tabIndex={-1}`.
- **Type Safety (I)**: Exhaustive switch on `Route.kind` and `RouteEntry.kind` enforced by TypeScript. No `any`, no suppressions.
- **Specs as Documentation (IV)**: This plan, research, data-model, and tasks are committed alongside the implementation. Manual updates (FR-012 per spec 007) will be addressed in the implementation phase.
