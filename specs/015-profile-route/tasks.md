# Tasks: Profile Route & Identity Onboarding

**Input**: Design documents from `/specs/015-profile-route/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Phase 1: Routing Foundation (Blocking)

**Purpose**: Extend the routing system to recognize `/profile` — all subsequent tasks depend on this.

- [x] T001 **[US1/US2/US3]** Add `'profile'` variant to `Route` union in `packages/console/src/routing/route.ts`
  - Add `{ readonly kind: 'profile'; readonly pathname: '/profile' }` to the `Route` type
  - Add `parseRoute('/profile')` recognition before the match prefix check
  - Add `buildProfileUrl()` helper (mirrors `buildLobbyUrl` pattern)
  - Update exhaustive switch in `unknown()` if needed

- [x] T002 **[US1/US2/US3]** Add `'profile'` variant to `RouteEntry` in `packages/console/src/routing/route-adapter.ts`
  - Add `{ readonly kind: 'profile'; readonly route: Extract<Route, { readonly kind: 'profile' }> }` to `RouteEntry`
  - Add profile case in `adaptRoute()` — return `{ kind: 'profile', route }` (no snapshot lookup needed)
  - Add profile case in `executeRouteEntry()` — return `null` (no I/O)

- [x] T003 **[US1/US2/US3]** Update `bootstrapProductionRoute()` in `packages/console/src/main.tsx`
  - Add `case 'profile':` to the `entry.kind` switch
  - Route falls through to `mountLobby(root)` (same as lobby — the profile view is a sub-view of the lobby runtime)

## Phase 2: ProfileView Component

**Purpose**: Create the dedicated profile page component.

- [x] T004 **[US1/US2]** Implement `readReturnTo(search: string): string | null` in `packages/console/src/ui/profile-view.ts`
  - Pure function: decode, validate safety (no external URLs, no traversal, no empty)
  - Return safe relative pathname or null
  - Tests: unit tests for all edge cases (external, traversal, empty, malformed, valid)

- [x] T005 **[US1/US2]** Implement `ProfileView` component in `packages/console/src/ui/profile-view.tsx`
  - Props: `identityStatus`, `handle`, `connection`, `actionStatus`, `onSubmitHandle`, `returnTo`
  - Three render states:
    - `restoring`: "Restoring your session…" indicator, disabled Continue button
    - `unnamed`: Handle input form (reuses `lobby-handle.ts` validation, `lobby-labels.ts` error mapping)
    - `named`: "Welcome back, {handle}" card + "Continue" button
  - Design system components: `<europa-page>`, `<europa-card>`, `<europa-stack>`, `<europa-button>`
  - a11y: heading `tabIndex={-1}`, input with `<label>`, errors `role="alert"`, `<bdi>` for handles
  - Auto-navigate on successful handle submission (FR-010): `history.pushState(null, '', returnTo ?? '/lobby')`
  - Connection status line (FR-015): non-intrusive "Connected" / "Connecting to lobby…"

## Phase 3: Lobby Runtime Integration

**Purpose**: Wire the profile view into the lobby runtime's view gate.

- [x] T006 **[US1/US2/US3]** Update `LobbyRoot` view gate in `packages/console/src/internal/lobby-runtime.tsx`
  - Add profile detection: `window.location.pathname === '/profile'` when `viewMode === 'lobby'`
  - Render `ProfileView` instead of `LobbyLanding` when on `/profile`
  - Pass `returnTo: readReturnTo(window.location.search)` to `ProfileView`
  - Pass `onSubmitHandle` (existing `submitHandle` function)
  - Handle match-join redirect (US3): when `identityStatus === 'unnamed'` AND `currentRoute` is a match route, redirect to `/profile?returnTo=<encoded-match-url>` via `history.replaceState`

- [x] T007 **[US4]** Replace `LobbyIdentityCard` with compact identity display in `packages/console/src/ui/lobby-landing.tsx`
  - Remove `LobbyIdentityCard` import and usage
  - Remove `onSubmitHandle` prop from `LobbyLandingProps`
  - Add compact identity section:
    - Named: "Playing as {handle}" (handle in `<bdi>`) + "Manage profile" link to `/profile`
    - Unnamed: "Choose a name" + link to `/profile`
  - Remove `LobbyIdentityCard` from exports (delete `packages/console/src/ui/lobby-identity-card.tsx`)

## Phase 4: Tests

**Purpose**: Verify all acceptance criteria and a11y requirements.

- [x] T008 **[P]** **[US1/US2/US3]** Route parser + adapter tests in `packages/console/tests/unit/routing/`
  - `route.test.ts`: add `'/profile'` → `{ kind: 'profile', pathname: '/profile' }` test
  - `route-contract.test.ts`: add profile to non-match route classification tests, add query-parameter isolation test for `/profile?returnTo=...`
  - `route-adapter.test.ts`: add profile adaptation test (returns profile entry, executes to null)

- [x] T009 **[P]** **[US1/US2]** `readReturnTo` unit tests in `packages/console/tests/unit/ui/profile-view.test.ts`
  - Valid relative paths: `/lobby`, `/match/abc/join`, `/match/abc123/spectate`
  - Unsafe values: external URLs, protocol-relative, `..` traversal, empty, malformed encoding, missing leading slash

- [x] T010 **[P]** **[US1/US2]** `ProfileView` component tests in `packages/console/tests/component/ui/profile-view.test.tsx`
  - Unnamed: form visible, input label, submit button, error display
  - Named: welcome card, handle in bdi, Continue button
  - Restoring: indicator visible, Continue disabled
  - Connection status line renders correctly
  - Auto-navigate on successful handle submission

- [x] T011 **[P]** **[US4]** Update `LobbyLanding` component tests in `packages/console/tests/component/ui/lobby-landing.test.tsx`
  - Named: compact "Playing as {handle}" display, no input form, "Manage profile" link
  - Unnamed: "Choose a name" link, no input form
  - `onSubmitHandle` prop removed from test calls

- [x] T012 **[P]** **[US1/US2]** ProfileView a11y tests in `packages/console/tests/a11y/profile-view.test.tsx`
  - Heading focusable (`tabIndex={-1}`)
  - Input has tied `<label>`
  - Errors use `role="alert"`
  - All controls keyboard-operable native elements
  - No a11y violations (automated check)

## Phase 5: Polish

**Purpose**: Final verification and cleanup.

- [x] T013 Verify all acceptance criteria from spec (SC-001 through SC-006)
  - SC-001: First-time visitor → form → set name → auto-redirect
  - SC-002: Returning visitor → welcome card → single click to lobby
  - SC-003: Deep link redirect round-trip (unnamed → profile → match)
  - SC-004: Lobby landing compact identity display
  - SC-005: a11y automated tests pass
  - SC-006: returnTo safety validation (external URLs rejected)

- [x] T014 Run full verification suite: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`
  - All existing tests continue passing (no regressions)
  - New tests pass
  - Coverage ≥80% on new code

## Dependencies & Execution Order

### Phase Dependencies
- **Phase 1 (T001-T003)**: Foundation — blocks all user stories
- **Phase 2 (T004-T005)**: Depends on Phase 1 — ProfileView component
- **Phase 3 (T006-T007)**: Depends on Phase 2 — runtime integration + lobby replacement
- **Phase 4 (T008-T012)**: Depends on Phase 3 — tests verify implementation
- **Phase 5 (T013-T014)**: Final verification

### Parallel Opportunities
- T008, T009, T010, T011, T012 can run in parallel (all test tasks, independent files)
- T001, T002, T003 are sequential (each depends on the previous)

### Critical Path
T001 → T002 → T003 → T005 → T006 → T007 → T013 → T014
