# Task Breakdown: Welcome Landing Screen (Feature 017)

> Spec: `specs/017-welcome-landing-screen/spec.md`
> Plan: `specs/017-welcome-landing-screen/plan.md`
> Branch: `issue-53-welcome-screen`

## Execution Order

Tasks are ordered by dependency. Parallel-safe tasks are marked `[P]`.

---

### T001 — Route type rename: `root` → `welcome` [P]

**Spec refs**: FR-010
**Files**: `packages/console/src/routing/route.ts`

**Changes**:
- Line 14–15: Replace `{ readonly kind: 'root'; readonly pathname: '/' }` with `{ readonly kind: 'welcome'; readonly pathname: '/' }`
- Line 38–39: Change `return { kind: 'root', pathname }` to `return { kind: 'welcome', pathname }`

**Verification**: `pnpm typecheck` in `packages/console` — the compiler will flag every site that references `kind: 'root'` as a type error, guiding the remaining changes.

---

### T002 — Adapter update: `welcome` entry kind [P]

**Spec refs**: FR-001, FR-010
**Files**: `packages/console/src/routing/route-adapter.ts`

**Changes**:
- Add `{ readonly kind: 'welcome' }` to the `RouteEntry` union type (after the `redirect` variant, around line 25)
- Line 64: Change `if (route.kind === 'root' || route.kind === 'unknown')` to `if (route.kind === 'unknown')`
- Add new branch before the `unknown` check: `if (route.kind === 'welcome') return { kind: 'welcome' }`
- In `executeRouteEntry` (line 113–126): add `case 'welcome': return null` (welcome is a terminal entry)

**Verification**: `pnpm typecheck` — all call sites of `adaptRoute` that switch on `entry.kind` will now need a `welcome` case (only `main.tsx` does this).

---

### T003 — Bootstrap update: `welcome` case in `main.tsx`

**Spec refs**: FR-001, FR-009
**Files**: `packages/console/src/main.tsx`

**Changes**:
- Add `mountWelcome` function (lazy import):
  ```typescript
  function mountWelcome(root: HTMLElement): void {
      void import('./ui/welcome-screen').then((module) => module.mountWelcomeScreen(root));
  }
  ```
- In the `switch (entry.kind)` block (line 85–110), add new case before `redirect`:
  ```typescript
  case 'welcome':
      mountWelcome(root);
      return;
  ```
- Update the `redirect` case comment (line 87) to clarify it now only handles unknown/malformed paths

**Verification**: `pnpm typecheck` — exhaustive switch check will verify all `RouteEntry` kinds are handled.

---

### T004 — Lobby runtime redirect fix (FR-011)

**Spec refs**: FR-011, AC-012, AC-013
**Files**: `packages/console/src/internal/lobby-runtime.tsx`

**Changes**:
- Line 458: Change `if (route.kind !== 'root' && route.kind !== 'lobby') return;` to `if (route.kind !== 'lobby') return;`
- Update the comment above (lines 442–452) to reflect that the redirect now only applies to `/lobby`, not `/`

**Verification**: `pnpm typecheck` — the `root` kind no longer exists, so the old condition would be a type error. This confirms the change is safe.

---

### T005 — Welcome screen component

**Spec refs**: FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009
**Files**: `packages/console/src/ui/welcome-screen.tsx` (NEW)

**Component design**:
- Pure static React component, no hooks that depend on external state
- Single `useEffect` for `document.title` (FR-008, AC-015)
- `<main>` landmark containing:
  - `<img>` for lockup-dark SVG (`src="assets/brand/europa-neo-lockup-dark.svg"`, `alt="Europa Neo"`, `width={240}`, `height={80}`)
  - `<p>` for tagline: "Nanobot warfare on Jupiter's moon Europa — a real-time multiplayer strategy game"
  - `<a href="/lobby">` styled as Play button (inline styles with `europa-*` tokens, `europa-focus-ring` class)
  - `<nav>` with two `<a>` links:
    - Player Manual → `https://shaunburdick.github.io/europa-neo/manual/` (`target="_blank"`, `rel="noopener noreferrer"`)
    - GitHub → `https://github.com/shaunburdick/europa-neo` (`target="_blank"`, `rel="noopener noreferrer"`)
- All inline styles using `var(--europa-*)` tokens (no hex literals, no new CSS classes)
- `mountWelcomeScreen(root)` export for lazy mounting

**Styling pattern** (matching BrandedFooter):
- Page-level: flexbox column, centered, min-height 100vh, vertical centering
- Play button: styled `<a>` with `var(--europa-color-surface-raised)` background, `var(--europa-color-text-primary)` text, `var(--europa-radii-input)` border-radius, `var(--europa-spacing-sm) var(--europa-spacing-lg)` padding
- Secondary links: `var(--europa-color-accent)` color, underline, `var(--europa-spacing-md)` gap between them
- Responsive: `@media (max-width: 768px)` adjusts padding and max-width

**Verification**: `pnpm typecheck && pnpm lint && pnpm format:check`

---

### T006 — Update route unit tests [P]

**Spec refs**: AC-017
**Files**: `packages/console/tests/unit/routing/route.test.ts`

**Changes**:
- Add explicit test: `parseRoute('/')` returns `{ kind: 'welcome', pathname: '/' }`
- Update any existing expectations that reference `kind: 'root'` to `kind: 'welcome'`
- The existing `parseRoute('/')` test expectations should now expect `welcome`

**Verification**: `pnpm test` in `packages/console`

---

### T007 — Update adapter unit tests [P]

**Spec refs**: AC-017
**Files**: `packages/console/tests/unit/routing/route-adapter.test.ts`

**Changes**:
- Line 107: Change `['/', { kind: 'redirect', pathname: '/lobby' }]` to `['/', { kind: 'welcome' }]`
- Add test: `adaptRoute(parseRoute('/'), null)` returns `{ kind: 'welcome' }` and `executeRouteEntry` returns `null`
- Add test: `adaptRoute(parseRoute('/unknown-path'), null)` returns `{ kind: 'redirect' }` (unknown still redirects)

**Verification**: `pnpm test` in `packages/console`

---

### T008 — Welcome screen component tests

**Spec refs**: AC-002, AC-003, AC-004, AC-005, AC-006, AC-009, AC-010, AC-011, AC-014, AC-015
**Files**: `packages/console/tests/component/ui/welcome-screen.test.tsx` (NEW)

**Test cases**:
1. Renders the lockup-dark SVG with `alt="Europa Neo"` (AC-002)
2. Renders the tagline text (AC-003)
3. Play link has `href="/lobby"` (AC-004)
4. Manual link has correct external URL and `target="_blank"` (AC-005)
5. GitHub link has correct external URL and `target="_blank"` (AC-006)
6. Sets `document.title` to include "Europa Neo" (AC-015)
7. No WebSocket imports (AC-014 — static component analysis)
8. Responsive: renders without overflow at 375px width (AC-009)
9. Accessibility: passes axe-core check (AC-010)

**Verification**: `pnpm test` in `packages/console`

---

### T009 — E2E test: Welcome screen → Lobby flow

**Spec refs**: AC-001, AC-004, AC-007, AC-008, AC-012, AC-013
**Files**: `packages/console/tests/e2e/routing.spec.ts` (modify existing)

**Changes**:
- Rewrite the test `'redirects root once and keeps the lobby stable on refresh'` to test the new flow:
  1. Navigate to `/` → verify URL remains `/`, welcome screen content visible (AC-001)
  2. Click Play → navigates to `/lobby` (AC-004)
  3. Lobby works as before (AC-007)
- Add new test: `'unknown route still redirects to lobby'` (AC-008)
  1. Navigate to `/foo` → URL changes to `/lobby` via redirect
- Add new test: `'unnamed visitor on / is NOT redirected to /profile'` (AC-012)
  1. Navigate to `/` → welcome screen renders, no redirect to `/profile`
- Update existing test `'unnamed visitor on /lobby IS redirected to /profile'` to confirm AC-013 still passes

**Verification**: `pnpm test:e2e` in `packages/console`

---

### T010 — Build verification and full test suite

**Spec refs**: All ACs
**Files**: None (verification only)

**Steps**:
1. `pnpm typecheck` — zero errors across all packages
2. `pnpm lint` — zero warnings/errors
3. `pnpm format:check` — all files formatted
4. `pnpm test` — all unit/component tests pass
5. `pnpm build` — production build succeeds
6. Verify bundle size: welcome screen adds < 2KB gzipped (FR-009 NFR)
7. Manual smoke test: navigate to `/` in browser, verify welcome screen renders, click Play → lobby loads

**Verification**: All gates green, no regressions.

---

### T011 — Spec status flip

**Spec refs**: All
**Files**: `specs/017-welcome-landing-screen/spec.md`

**Changes**:
- Update `Status` from `Draft` to `Implemented` with date
- Add Clarifications section if any decisions were made during implementation

**Verification**: Spec matches implementation.
