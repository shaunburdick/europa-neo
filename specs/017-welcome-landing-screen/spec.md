# Feature Specification: Welcome Landing Screen

> Version: 1.0
> Last Updated: 2026-09-02
> Status: Implemented (2026-09-02)
> Dependencies: Feature 005 (Client Console), Feature 013 (Semantic URL Routing), Feature 014 (Shared UI Components)

## Problem Statement

When a visitor navigates to `/`, they are immediately redirected to `/lobby` via `history.replaceState`. This robs the project of a first impression: there is no branding, no tagline, no introduction. The root URL is the most discoverable, bookmarkable, and shareable path on any site. Europa Neo should use it as a proper landing page — showcasing the brand identity, explaining the game concept, and providing clear entry points to play or learn more.

The lobby is a functional match browser, not a welcome experience. It assumes the visitor already knows what Europa Neo is. A dedicated landing screen solves the cold-start problem for new visitors, provides a home for the brand assets (lockup SVG, tagline), and creates a clear call-to-action funnel (Play → Lobby, Manual → GitHub Pages, Source → GitHub repo).

This page must be entirely static — no WebSocket connection, no lobby state, no identity resolution. It loads, renders, and waits for a click.

## User Stories

### US1 — First Impression (P1)

As a visitor arriving at `/`, I want to see the Europa Neo brand, a brief description, and a clear "Play" button so that I understand what the game is and how to start.

**Why this priority**: This is the core purpose of the feature — replacing a redirect with a landing experience.

**Independent Test**: Navigate to `/` and verify the logo, tagline, Play button, manual link, and GitHub link are visible without any redirect or WebSocket activity.

### US2 — Mobile-Friendly Entry (P1)

As a visitor on a mobile device, I want the landing page to be readable and usable on a narrow screen so that I can navigate to the game from my phone.

**Why this priority**: The AGENTS.md constitution mandates accessibility-minded UI; mobile is the most common narrow-viewport scenario.

**Independent Test**: Render the page at 375px width and verify single-column layout, readable text, and tappable button/link targets (≥44×44px).

### US3 — Direct Link to Manual (P2)

As a curious visitor, I want a link to the player manual so that I can learn the game before committing to play.

**Why this priority**: The manual already exists (Feature 007); surfacing it on the landing page reduces friction for cautious players.

**Independent Test**: Click the manual link and verify it navigates to the GitHub Pages URL (external link, opens in same or new tab per browser defaults).

### US4 — Source Code Link (P2)

As an open-source contributor or self-hoster, I want a link to the GitHub repository so that I can find the source code and contribute.

**Why this priority**: Supporting the open-source mission; secondary to gameplay entry.

**Independent Test**: Click the GitHub link and verify it navigates to `https://github.com/shaunburdick/europa-neo`.

### US5 — Clean Routing Separation (P1)

As a developer, I want `/` to serve its own content (no redirect) and `/lobby` to remain unchanged so that the routing model is clean and the landing page can evolve independently.

**Why this priority**: Routing correctness is a prerequisite for the feature; if the redirect remains, the landing page is unreachable.

**Independent Test**: Load `/` and verify the URL remains `/` (no replaceState to `/lobby`); load `/lobby` and verify it works identically to before this feature.

## Functional Requirements

### FR-001 — Root Route Serves Welcome Screen

The root path `/` renders a static welcome/landing page. The current `history.replaceState` redirect from `/` to `/lobby` in `bootstrapProductionRoute` is removed for root routes. Unknown/malformed routes (`kind: 'unknown'`) still redirect to `/lobby` as before.

**Implementation detail**: In `route-adapter.ts`, `adaptRoute()` currently returns `{ kind: 'redirect', route, pathname: '/lobby' }` for both `root` and `unknown` kinds. After this change, it returns `{ kind: 'welcome' }` for `root` and `{ kind: 'redirect' }` only for `unknown`.

### FR-002 — Logo Display

The landing page displays the Europa Neo lockup SVG (dark variant) as the primary brand element. The SVG is sourced from `@europa/design`'s brand manifest: asset ID `lockup-dark`, path `brand/europa-neo-lockup-dark.svg`. The logo must be rendered as an `<img>` element (not inline SVG) with `alt="Europa Neo"`.

### FR-003 — Tagline

Below the logo, the page displays the tagline: "Nanobot warfare on Jupiter's moon Europa — a real-time multiplayer strategy game". The tagline uses the project's design-system typography (heading or subheading level, not body text).

### FR-004 — Primary CTA: Play Button

A prominent "Play" button is displayed below the tagline. Clicking it navigates to `/lobby` via `history.pushState` (or a `<a href="/lobby">` link). The button must use the `europa-button` web component with `variant="primary"`.

### FR-005 — Secondary Links

Below the Play button, two secondary links are displayed:

1. **Player Manual** — links to the GitHub Pages manual URL. The URL pattern is documented in Feature 007: `https://shaunburdick.github.io/europa-neo/manual/`. This is an external link.
2. **GitHub Repository** — links to `https://github.com/shaunburdick/europa-neo`. This is an external link.

Both links use standard `<a>` elements with `target="_blank"` and `rel="noopener noreferrer"`.

### FR-006 — Responsive Layout

The landing page uses a single-column centered layout. On viewports ≥768px, content is centered horizontally with a max-width constraint. On viewports <768px, content fills the viewport width with appropriate padding. The page is vertically centered (or near-centered) within the viewport.

### FR-007 — Dark Theme Consistency

The landing page uses the project's dark theme tokens (background: `--europa-color-bg` ≈ `#111827`, text: `--europa-color-text` ≈ `#f9fafb`). The page does not introduce any new color literals; all colors come from the existing `@europa/design` token system via `design.css`. The lockup-dark SVG is designed for dark backgrounds and should contrast well.

### FR-008 — Accessibility

The page meets WCAG 2.2 AA:

- The page title is set to "Europa Neo — Nanobot warfare on Jupiter's Europa" (or similar descriptive title).
- The logo `<img>` has `alt="Europa Neo"`.
- The heading hierarchy is logical: a single `<h1>` (the logo or tagline, not both duplicated as headings), followed by `<h2>` for section labels if any.
- All interactive elements (Play button, manual link, GitHub link) are keyboard-navigable with visible focus indicators.
- Color contrast meets 4.5:1 for normal text and 3:1 for large text against the dark background.
- The page uses semantic HTML (`<main>`, `<nav>` for secondary links, `<footer>` for attribution if present).

### FR-009 — Static Page (No Runtime Dependencies)

The welcome screen is a pure static React component. It does not:

- Open a WebSocket connection.
- Import or use the lobby controller, matchmaking, or identity state.
- Import the lobby runtime or any game-specific runtime.
- Read browser localStorage or sessionStorage.
- Use any React hooks that depend on external state.

It imports only `@europa/design` (CSS + web components) and the brand asset SVG.

### FR-010 — Route Type Extension

The `Route` type in `route.ts` gains a new variant: `{ readonly kind: 'welcome'; readonly pathname: '/' }`. The `parseRoute('/')` function returns `{ kind: 'welcome', pathname: '/' }` instead of `{ kind: 'root', pathname: '/' }`. The `root` kind is removed from the `Route` union.

**Rationale**: Renaming `root` to `welcome` makes the intent explicit and avoids confusion with the lobby's unnamed-identity redirect (which currently checks for `root` kind). If `root` is kept as an alias, the lobby redirect effect must be updated to exclude it; renaming is cleaner.

### FR-011 — Lobby Unnamed-Identity Redirect Scope

The unnamed-identity redirect in `lobby-runtime.tsx` (line 453–462) currently fires when `route.kind === 'root' || route.kind === 'lobby'`. After this change:

- `route.kind === 'root'` no longer exists (replaced by `welcome`).
- The redirect effect must check only `route.kind === 'lobby'` — unnamed visitors on `/lobby` are redirected to `/profile`, but unnamed visitors on `/` (the welcome screen) are NOT redirected because the welcome screen requires no identity.

This is a one-line change: `if (route.kind !== 'lobby') return;` (replacing the `root || lobby` check).

### FR-012 — Unknown Route Recovery Preserved

Unknown, malformed, and unsupported routes (e.g., `/foo`, `/match//`, `/match/foo/bar/baz`) continue to redirect to `/lobby` via `history.replaceState`. This behavior is unchanged from Feature 013. Only the `root` kind's redirect is removed.

## Non-Functional Requirements

- **Performance**: The landing page renders in < 100ms after DOMContentLoaded (static content, no network requests beyond the SVG and CSS already cached by the SPA). The SVG asset is small (< 50KB); the component tree is trivial.
- **Bundle Size**: The welcome screen component adds < 2KB gzipped to the production bundle. It is a simple React component with no heavy dependencies.
- **Compatibility**: Renders correctly in Chrome 90+, Firefox 90+, Safari 15+, Edge 90+. The SVG renders in all modern browsers.
- **Accessibility**: WCAG 2.2 AA compliance (see FR-008).
- **Observability**: No logging or metrics required for a static landing page.

## Acceptance Criteria

- [ ] **AC-001**: Navigate to `/` — the URL remains `/` (no redirect to `/lobby`), and the welcome screen content is visible.
- [ ] **AC-002**: The Europa Neo lockup-dark SVG is displayed with `alt="Europa Neo"`.
- [ ] **AC-003**: The tagline "Nanobot warfare on Jupiter's moon Europa — a real-time multiplayer strategy game" is visible below the logo.
- [ ] **AC-004**: A "Play" button is visible; clicking it navigates to `/lobby`.
- [ ] **AC-005**: A "Player Manual" link is visible; clicking it opens `https://shaunburdick.github.io/europa-neo/manual/` in a new tab.
- [ ] **AC-006**: A "GitHub" link is visible; clicking it opens `https://github.com/shaunburdick/europa-neo` in a new tab.
- [ ] **AC-007**: Navigate to `/lobby` — the lobby works identically to before this feature (no behavioral change).
- [ ] **AC-008**: Navigate to `/foo` (unknown route) — the URL changes to `/lobby` via redirect (recovery preserved).
- [ ] **AC-009**: On a 375px-wide viewport, all content is readable in a single column; the Play button and links have ≥44×44px touch targets.
- [ ] **AC-010**: The page passes axe-core automated accessibility checks (zero violations).
- [ ] **AC-011**: Tab-navigating through the page reaches the Play button, manual link, and GitHub link in a logical order with visible focus rings.
- [ ] **AC-012**: An unnamed visitor on `/` is NOT redirected to `/profile` — the welcome screen requires no identity.
- [ ] **AC-013**: An unnamed visitor on `/lobby` IS still redirected to `/profile` (existing behavior unchanged).
- [ ] **AC-014**: No WebSocket connection is established when viewing the welcome screen (verify via browser DevTools Network tab — no `ws://` or `wss://` entries).
- [ ] **AC-015**: The page title includes "Europa Neo" when the welcome screen is active.
- [ ] **AC-016**: E2E tests pass for the new route (Play → Lobby flow, secondary link targets).
- [ ] **AC-017**: Unit tests cover `adaptRoute` returning `welcome` kind for `/`, and `parseRoute('/')` returning `welcome` kind.

## Out of Scope

The following are explicitly **not** part of this feature:

- **Authentication / login**: No sign-up or sign-in flow. The welcome screen is anonymous.
- **Animated or interactive hero**: No animations, particles, game previews, or embedded videos. Static and clean.
- **Marketing content**: No feature lists, screenshots, or testimonials beyond the tagline.
- **SEO / meta tags**: Open Graph, Twitter Cards, or structured data. (Future concern.)
- **Cookie consent or analytics banners**: No tracking.
- **Local storage or session state**: The page is stateless.
- **Change to the lobby UI**: The lobby's layout, identity card, or match browser is untouched.

## Edge Cases

- **Deep link to `/` with query parameters** (e.g., `/?foo=bar`): `parseRoute` ignores query parameters (it only inspects the pathname). The welcome screen renders normally; query parameters are irrelevant.
- **Unnamed visitor on `/`**: The welcome screen renders. The unnamed-identity redirect does NOT fire (FR-011). The visitor can click Play to reach `/lobby`, where the redirect to `/profile` will fire if they are still unnamed.
- **Named visitor on `/`**: The welcome screen renders. Clicking Play navigates to `/lobby` where the visitor sees the match browser.
- **Browser back-button from `/lobby` to `/`**: If the visitor navigated to `/` → clicked Play → landed on `/lobby`, pressing Back returns to `/`. The welcome screen renders. No redirect loop.
- **Hard refresh on `/`**: The SPA serves `index.html` for all paths (SPA fallback). The JavaScript boots, `parseRoute('/')` returns `welcome`, the welcome screen mounts. No server-side routing needed.
- **Server-side SPA fallback**: The host (native or Docker) must serve `index.html` for `/`. This is already the case for all routes (Feature 011/013); `/` is no different.
- **Test-only `?e2e` mode**: The `?e2e` query parameter boots the demo runtime regardless of pathname. If `?e2e` is present on `/`, the demo runtime boots (unchanged behavior — E2E never tests the welcome screen through the demo path).

## Examples

### Welcome Screen Layout (Desktop, ≥768px)

```
┌──────────────────────────────────────────────┐
│                                              │
│           ┌─────────────────────┐            │
│           │  Europa Neo Lockup  │            │
│           │     (dark SVG)      │            │
│           └─────────────────────┘            │
│                                              │
│   Nanobot warfare on Jupiter's moon Europa   │
│   — a real-time multiplayer strategy game    │
│                                              │
│           ┌─────────────────┐                │
│           │     ▶ Play      │                │
│           └─────────────────┘                │
│                                              │
│        Player Manual · GitHub                │
│                                              │
└──────────────────────────────────────────────┘
```

### Welcome Screen Layout (Mobile, <768px)

```
┌────────────────────────┐
│                        │
│   ┌──────────────────┐ │
│   │  Europa Neo      │ │
│   │  Lockup (SVG)    │ │
│   └──────────────────┘ │
│                        │
│  Nanobot warfare on    │
│  Jupiter's moon Europa │
│  — a real-time         │
│  multiplayer strategy  │
│  game                  │
│                        │
│  ┌──────────────────┐  │
│  │     ▶ Play       │  │
│  └──────────────────┘  │
│                        │
│  Player Manual · GitHub│
│                        │
└────────────────────────┘
```

### Route Behavior After Change

| Path | Before | After |
|------|--------|-------|
| `/` | Redirect → `/lobby` | Welcome screen (no redirect) |
| `/lobby` | Lobby runtime | Lobby runtime (unchanged) |
| `/foo` | Redirect → `/lobby` | Redirect → `/lobby` (unchamed) |
| `/match/<id>` | Match resolution | Match resolution (unchanged) |

## Open Questions

None. All requirements are fully specified.

## Clarifications Applied

> Populated during Phase 3. Each entry documents a question asked and the requirement it produced.

_(No clarifications yet — this is the initial draft.)_
