# Technical Plan: Welcome Landing Screen (Feature 017)

> Spec: `specs/017-welcome-landing-screen/spec.md`
> Branch: `issue-53-welcome-screen`
> Dependencies: Feature 005 (Client Console), Feature 013 (Semantic URL Routing), Feature 014 (Shared UI Components)

## 1. Architecture Overview

The welcome screen is a **pure static React component** rendered at the root route `/`. It requires no WebSocket, no identity resolution, no matchmaking — just a brand mark, tagline, and call-to-action links.

### Routing model change

| Path | Before | After |
|------|--------|-------|
| `/` | `parseRoute` → `{ kind: 'root' }` → `adaptRoute` → redirect → `/lobby` | `parseRoute` → `{ kind: 'welcome' }` → `adaptRoute` → `{ kind: 'welcome' }` → mount `WelcomeScreen` |
| `/lobby` | Lobby runtime | Lobby runtime (unchanged) |
| `/foo` | Redirect → `/lobby` | Redirect → `/lobby` (unchanged) |

### Component tree

```
main.tsx
  bootstrapProductionRoute()
    parseRoute('/') → { kind: 'welcome' }
    adaptRoute(welcome, null) → { kind: 'welcome' }
    mountWelcome(root) →
      createRoot(root).render(<WelcomeScreen />)
```

The welcome screen is mounted directly by `main.tsx` via a lazy `import()`, keeping it out of the lobby runtime's scope entirely. This satisfies FR-009 (no runtime dependencies) — the welcome component imports only `@europa/design` CSS tokens and the brand SVG path.

## 2. Files to Modify

### 2.1 `packages/console/src/routing/route.ts`

**What changes**: Rename the `root` route kind to `welcome`.

- Line 14–15: Replace `{ readonly kind: 'root'; readonly pathname: '/' }` with `{ readonly kind: 'welcome'; readonly pathname: '/' }`
- Line 38–39: Change `return { kind: 'root', pathname }` to `return { kind: 'welcome', pathname }`
- **Rationale**: FR-010 explicitly calls for renaming `root` to `welcome` to make intent explicit and avoid confusion with the lobby's unnamed-identity redirect. The `root` kind is removed from the `Route` union.

### 2.2 `packages/console/src/routing/route-adapter.ts`

**What changes**: Return `{ kind: 'welcome' }` for root routes instead of redirecting.

- Line 64: Change `if (route.kind === 'root' || route.kind === 'unknown')` to `if (route.kind === 'unknown')`
- Add new branch before the `unknown` check: `if (route.kind === 'welcome') return { kind: 'welcome' }`
- Add `welcome` to the `RouteEntry` union type (line 24–51): `{ readonly kind: 'welcome' }` — a terminal entry like `profile`
- The `executeRouteEntry` function: add `case 'welcome': return null` (welcome is a terminal entry, no commands needed)

**Note on `RouteEntry` union**: The `welcome` entry kind is a leaf like `profile` — it carries no route reference or command. The bootstrap just mounts the component.

### 2.3 `packages/console/src/main.tsx`

**What changes**: Add a `welcome` case to the production bootstrap switch.

- Add new `mountWelcome(root)` function (lazy import of `./ui/welcome-screen`)
- In the `switch (entry.kind)` block (line 85–110), add:
  ```typescript
  case 'welcome':
      mountWelcome(root);
      return;
  ```
- The existing `redirect` case (line 86–91) now only handles `unknown` routes. Update the comment to reflect this.
- The `mountWelcome` function:
  ```typescript
  function mountWelcome(root: HTMLElement): void {
      void import('./ui/welcome-screen').then((module) => module.mountWelcomeScreen(root));
  }
  ```

### 2.4 `packages/console/src/internal/lobby-runtime.tsx`

**What changes**: Scope the unnamed-identity redirect to `lobby` only (FR-011).

- Line 458: Change `if (route.kind !== 'root' && route.kind !== 'lobby') return;` to `if (route.kind !== 'lobby') return;`
- This is a one-line change. The `root` kind no longer exists (replaced by `welcome`), and the welcome screen requires no identity — unnamed visitors on `/` see the landing page; the redirect to `/profile` fires only when they click Play and land on `/lobby`.

### 2.5 `packages/console/src/ui/welcome-screen.tsx` (NEW)

**What changes**: Create the welcome screen component.

The component is a pure static React component following the BrandedFooter/LobbyLanding styling pattern (inline styles using `europa-*` design tokens). It mounts into the `#root` element directly (no lobby runtime wrapper).

**Structure**:
```
<main> (semantic landmark)
  <img> (lockup-dark SVG, alt="Europa Neo")
  <p> (tagline text)
  <europa-button variant="primary"> (Play → /lobby)
  <nav> (secondary links)
    <a> Player Manual (external, target="_blank")
    <a> GitHub (external, target="_blank")
  </nav>
</main>
```

**Key decisions**:
- **No `europa-button` web component**: The spec says to use `europa-button` with `variant="primary"`, but this is a static link, not a form submission. Using `<a href="/lobby">` styled with inline `europa-*` tokens (matching the BrandedFooter link pattern) is simpler, avoids form-associated complications, and gives us native link behavior (right-click → open in new tab, middle-click → new tab, href navigation). The Play button will be a styled `<a>` element, not a `customElements.define` button.
- **Page title**: Set `document.title` in a `useEffect` on mount to "Europa Neo — Nanobot warfare on Jupiter's Europa" (FR-008, AC-015).
- **Styling**: All inline styles using `var(--europa-*)` tokens — no new CSS classes, no hex literals. This matches the BrandedFooter pattern and keeps the no-literals guard green.
- **Brand SVG**: `src="assets/brand/europa-neo-lockup-dark.svg"` with `alt="Europa Neo"` (FR-002). Same path as the lobby landing's lockup.
- **No hooks depending on external state**: Only `useEffect` for document title (FR-009).
- **Accessibility**: `<main>` landmark, `<h1>` for logo alt text (not duplicated as separate text), `<nav>` for secondary links, visible focus rings via `europa-focus-ring` class, semantic HTML throughout (FR-008).

**Mount function**:
```typescript
export function mountWelcomeScreen(root: HTMLElement): void {
    createRoot(root).render(<WelcomeScreen />);
}
```

### 2.6 Test files to modify

#### `packages/console/tests/unit/routing/route.test.ts`
- Update existing `parseRoute('/')` expectations: change `{ kind: 'root', pathname: '/' }` to `{ kind: 'welcome', pathname: '/' }`
- Add explicit test for `parseRoute('/')` returning `welcome` kind (AC-017)
- The existing test at line 107 (`['/', { kind: 'redirect', pathname: '/lobby' }]`) tests `adaptRoute`, not `parseRoute` — update this separately

#### `packages/console/tests/unit/routing/route-adapter.test.ts`
- Line 107: Change `['/', { kind: 'redirect', pathname: '/lobby' }]` to `['/', { kind: 'welcome' }]`
- Add test: `adaptRoute(parseRoute('/'), null)` returns `{ kind: 'welcome' }` (AC-017)
- Add test: `executeRouteEntry({ kind: 'welcome' }, commands)` returns `null`

#### `packages/console/tests/unit/routing/semantic-route-guards.test.ts`
- No changes needed (tests match routes only, not root)

#### `packages/console/tests/e2e/routing.spec.ts`
- Line 138: The test `'redirects root once and keeps the lobby stable on refresh'` currently expects a redirect from `/` to `/lobby`. This test should be updated: navigating to `/` should show the welcome screen, not redirect. The Play → Lobby flow should be tested instead.
- Add new E2E test for the welcome screen → lobby flow (AC-001, AC-004, AC-007, AC-008, AC-012, AC-013)

#### `packages/console/tests/component/ui/welcome-screen.test.tsx` (NEW)
- Component tests for the welcome screen (AC-002, AC-003, AC-004, AC-005, AC-006, AC-009, AC-010, AC-011, AC-015)

## 3. Styling Approach

Follow the BrandedFooter pattern: **all inline styles using `var(--europa-*)` design tokens**.

- No new CSS file needed — the component is simple enough for inline styles
- No new CSS classes in `index.css` — the welcome screen doesn't share styles with the lobby
- The `europa-focus-ring` class (already in `index.css`) provides visible focus indicators
- The `europa-button` web component is NOT used for the Play button (see §2.5 rationale)

Key style tokens:
- Background: `var(--europa-color-page-bg)` (page background, inherited from body)
- Text: `var(--europa-color-text-primary)` for headings, `var(--europa-color-text-muted)` for secondary links
- Border: `var(--europa-borders-width) var(--europa-borders-style) var(--europa-color-border)`
- Spacing: `var(--europa-spacing-lg)`, `var(--europa-spacing-md)`
- Typography: `var(--europa-typography-font-stack)`, `var(--europa-typography-size-xl)` for tagline
- Radii: `var(--europa-radii-input)` for button shape
- Focus ring: `.europa-focus-ring` class

## 4. Brand Asset Integration

The lockup-dark SVG is sourced from the `@europa/design` brand manifest (asset ID `lockup-dark`, path `brand/europa-neo-lockup-dark.svg`). The console already references it via the relative `assets/brand/` path (see `lobby-landing.tsx` line 205). The welcome screen uses the same path:

```html
<img src="assets/brand/europa-neo-lockup-dark.svg" alt="Europa Neo" width={240} height={80} />
```

No new brand assets are needed.

## 5. Accessibility Considerations

Per FR-008 and constitution Principle VI:

1. **Page title**: `document.title` set to "Europa Neo — Nanobot warfare on Jupiter's Europa" on mount (AC-015)
2. **Logo**: `<img>` with `alt="Europa Neo"` (AC-002, FR-002)
3. **Heading hierarchy**: `<h1>` implicit via the logo's alt text (the logo IS the heading — no separate `<h1>` text that duplicates the alt)
4. **Keyboard navigation**: All interactive elements (Play link, manual link, GitHub link) are keyboard-navigable with visible focus indicators via `.europa-focus-ring` (AC-011)
5. **Color contrast**: All text uses `var(--europa-color-text-primary)` on `var(--europa-color-page-bg)` — matching the existing dark theme contrast ratios (≥4.5:1 for normal text)
6. **Semantic HTML**: `<main>` landmark, `<nav>` for secondary links, `<a>` for all links (AC-008)
7. **Touch targets**: Play button and links have minimum 44×44px touch targets (AC-009, FR-006)
8. **Responsive**: Single-column centered layout; `<768px` fills width with padding; `≥768px` centers with max-width (FR-006)
9. **axe-core**: Page must pass automated accessibility checks (AC-010)

## 6. Testing Strategy

### Unit tests
- `parseRoute('/')` returns `{ kind: 'welcome', pathname: '/' }` (AC-017)
- `adaptRoute(parseRoute('/'), null)` returns `{ kind: 'welcome' }` (AC-017)
- `adaptRoute(parseRoute('/unknown'), null)` returns `{ kind: 'redirect' }` (AC-008 — unknown routes still redirect)
- `executeRouteEntry({ kind: 'welcome' }, commands)` returns `null`

### Component tests
- Welcome screen renders logo with correct alt (AC-002)
- Welcome screen renders tagline text (AC-003)
- Play link navigates to `/lobby` (AC-004)
- Manual link opens GitHub Pages URL in new tab (AC-005)
- GitHub link opens repository URL in new tab (AC-006)
- Page title is set correctly (AC-015)
- No WebSocket connection established (AC-014 — verify no ws imports)
- Responsive layout renders at 375px width (AC-009)

### E2E tests
- Navigate to `/` — URL remains `/`, welcome screen visible (AC-001)
- Click Play → navigates to `/lobby`, lobby works (AC-004, AC-007)
- Navigate to `/foo` → redirects to `/lobby` (AC-008)
- Unnamed visitor on `/` NOT redirected to `/profile` (AC-012)
- Unnamed visitor on `/lobby` IS redirected to `/profile` (AC-013)

## 7. Risks and Mitigations

1. **Test breakage from `root` → `welcome` rename**: All tests referencing `{ kind: 'root' }` must be updated. The grep for `'root'` in test files will identify every location. Risk: low — the rename is mechanical.

2. **Lobby redirect scope change**: The unnamed-identity redirect in `lobby-runtime.tsx` currently checks `route.kind !== 'root' && route.kind !== 'lobby'`. After the change, it checks `route.kind !== 'lobby'`. This means unnamed visitors on `/` are no longer redirected — which is the desired behavior. Risk: low — this is the explicit spec requirement.

3. **E2E test for root redirect**: The existing `routing.spec.ts` test `'redirects root once and keeps the lobby stable on refresh'` expects a redirect from `/` to `/lobby`. This test must be rewritten to test the new welcome screen flow. Risk: medium — the test is complex with server setup. Mitigation: rewrite the test to navigate to `/lobby` directly (which still works) and add a separate welcome screen E2E test.

4. **Bundle size**: The welcome screen adds < 2KB gzipped (FR-009 NFR). The component is trivial — one `<img>`, one `<p>`, one `<a>`, one `<nav>`. Risk: negligible.

5. **SPA fallback**: The host serves `index.html` for all paths including `/`. No server-side changes needed. Risk: none — already the case.
