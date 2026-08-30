# Feature Specification: Shareable Design System Between UI and Documentation

**Feature Branch**: `012-design-system`

**Created**: 2026-08-30

**Status**: Implemented (2026-08-30) — with in-progress Addendum (branded footer, PR #31)

**GitHub Issue**: #25

**Input**: GitHub issue #25 — "Shareable design system between UI and documentation" plus product-owner clarification "more full design system with reusable components that can be shared in UI and documentation" (not just tokens).

## Scope Note (v0.1.0)

The full drift-guard suite G-01…G-09 described in `DESIGN.md` § 5 was scoped down for the v0.1.0 stabilization release. What ships and is asserted in CI:

- **G-04** console no-literals scan (FR-009/FR-010) — kept.
- **G-05** vendored-asset byte identity (FR-014) — kept.
- **G-06** version-header lockstep (FR-017/FR-020, spec 009 FR-009) — kept.
- Workflow `paths:` filters on `client-ci.yml`, `pages-deploy.yml`, `version-drift.yml` covering `packages/design/**`, `DESIGN.md`, and the vendored asset — kept.

Deferred to a follow-up (not in v0.1.0):

- **G-01** token-variable ↔ TS-leaf identity, **G-02** § 1 token-table coverage vs stylesheet, **G-03** § 2 catalog coverage vs stylesheet — the heavy cross-assertion test factory. `DESIGN.md` is mechanically generated from tokens and verified set-equal at authoring time, so the contract stays truthful without a continuous CI drift test for v0.1.0.
- **G-07** computed-style contrast proofs and the elaborate parity/smoke tests behind **SC-001** / **SC-004** — the existing 260+ console suite (axe + a11y) and the measured ratios in `DESIGN.md` § 3 cover accessibility; the dedicated computed-style parity harness is deferred.
- **G-08** bundle gzip-budget structural test and the build-ordering structural test — `pnpm` workspace topology already guarantees `@europa/design` builds before `@europa/console`.

No FR is removed by this note; deferred items are annotated, not deleted.

## Problem Statement

The console's dark-slate chrome and the player manual's documentation site look like two different products. Today the console keeps its visual language in two disconnected places — `packages/console/src/styles/index.css` (~884 lines of hardcoded literals) and `packages/console/src/render/palette.ts` (TypeScript color constants) — with the same values duplicated between them as comments like "mirrors palette VOID_COLOR". The documentation site (`docs/manual`, 14 Markdown pages rendered via `actions/jekyll-build-pages` with no theme or `_config.yml`) ships the default Jekyll look: white, light, unrelated type, spacing, and component language. There is no shared definition of color, typography, spacing, radii, borders, shadows, focus states, or motion. Every new UI surface (lobby, HUD, modals, future work) re-invents those decisions by copying literals, and the manual cannot adopt the game's chrome at all. This feature introduces a single private package `@europa/design` that is the authoritative source of tokens *and* reusable components/layout for both surfaces: the console UI and the docs site share one stylesheet and one class-name catalog, the manual renders in the same dark-slate language as the game, and `DESIGN.md` is the living contract that keeps implementation and documentation in lockstep.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Console Consumes the Design System Without Visual Regression (Priority: P1)

As a player, I want the console I already use to look and behave exactly as before after the design system lands — same dark-slate board, same chips, pipes, HUD, lobby, modals, banners — so that the migration is invisible to me while making future UI work consistent.

**Why this priority**: This is the correctness proof for the entire feature. If the migration introduces regressions or changes the surface contract, the "shareable" claim is hollow. Console migration is the most demanding consumer because it touches real-time rendering, accessibility, and game controls.

**Independent Test**: Can be fully tested without the docs site: build the console before/after, mount the app in tests and in a real browser, and assert (a) no hardcoded literals remain in `packages/console/src` outside the design import, (b) computed styles for a representative sample of surfaces (page background, void, HUD plate, lobby card, muted text, chip, focus ring, banner) match the token values within the tolerance documented in `DESIGN.md`, and (c) existing axe/a11y suites remain green.

**Acceptance Scenarios**:

1. **Given** the console built from the design-system branch, **When** a player opens the landing lobby and the in-match board, **Then** the visual language is the same dark-slate chrome as before — same colors, spacing, radii, and focus treatment on every surface that previously existed — verified by style assertions against design tokens.
2. **Given** a search of `packages/console/src` for hex colors, hardcoded `background-color`/`color`/`border-color`, and duplicated spacing/radii literals, **When** the check runs (CI or locally), **Then** no literals remain outside `import` from `@europa/design` and the one canvas fallback noted in the edge cases.
3. **Given** the shared palette module (`packages/console/src/render/palette.ts`) that both the Canvas painter and the DOM overlay read, **When** its exports are inspected, **Then** every color comes from the design tokens (no duplicated literals) and both layers still agree per the existing palette test invariants (void ≠ page, land > void, etc.).
4. **Given** the existing keyboard, screen-reader, and reduced-motion behaviors, **When** the migrated console is exercised, **Then** focus-visible, live-region announcements, and motion preferences behave identically to before (no a11y regression).

---

### User Story 2 — Player Manual Renders in the Game's Dark-Slate Chrome (Priority: P1)

As a player reading the manual, I want the docs site to feel like the same product as the game — dark-slate background, system-ui type, shared plates/cards/typography, readable contrast — so that the manual is an obvious companion to the console rather than a disconnected Jekyll default.

**Why this priority**: The second half of the "shareable" promise. The issue's deliverable is "manual adopts game's dark slate chrome so both feel like one product." This is independently valuable even before any console component reuse: a cohesive brand across surfaces.

**Independent Test**: Can be fully tested without running the console: build the manual via the same `actions/jekyll-build-pages` path as CI (scoped source `docs/manual`), serve `docs/manual/_site`, and assert the rendered HTML imports the shared design stylesheet, uses design class names for the layout/plates/typography, and passes the accessibility checks below.

**Acceptance Scenarios**:

1. **Given** the manual site built from this branch, **When** any manual page is opened, **Then** the page background, surface plates, text colors, typography stack, and component treatments (cards/plates, banners, badges) are rendered from the shared design tokens — the white Jekyll default is gone.
2. **Given** the rendered manual HTML/CSS, **When** contrast is checked for every required pairing documented in `DESIGN.md`, **Then** each pairing meets WCAG 2.2 AA (4.5:1 for normal text, 3:1 for large text, 3:1 for non-text UI per constitution Principle VI).
3. **Given** a user who prefers reduced motion at the OS level, **When** the manual is viewed, **Then** no decorative animation runs (shared motion tokens respect `prefers-reduced-motion`).
4. **Given** the deployed artifact from `.github/workflows/pages-deploy.yml` (source-scoped to `docs/manual`), **When** its contents are listed after a build, **Then** it contains the rendered manual HTML plus the vendored design stylesheet/assets that live under `docs/manual` — and nothing from outside that directory except what the action explicitly stages from it.

---

### User Story 3 — Maintainer Owns a Single Authoritative Contract `DESIGN.md` (Priority: P2)

As a maintainer or new contributor, I want one file — `DESIGN.md` at the repo root — that is the complete, versioned, authoritative catalog of tokens and shared components, so that I can answer "what is the canonical color/spacing/component?" without hunting through code.

**Why this priority**: This is the governance that makes the shareable claim durable. Without a living contract and a sync rule, tokens rot into two copies again. Priority P2 because it depends on the package existing but is what keeps it correct over time.

**Independent Test**: Can be fully tested by reading the repo: `DESIGN.md` exists at the root, carries a version header, enumerates the token tables and component/class-name catalog with enough detail that a contributor can build a new UI surface from it, and the `DESIGN.md ↔ implementation ↔ docs` sync is enforced by CI/docs rules below.

**Acceptance Scenarios**:

1. **Given** a new contributor, **When** they open `DESIGN.md`, **Then** they can find every token group (colors, typography, spacing, radii, borders, shadows, focus-ring, motion) with names, CSS variable names, TypeScript export names, and values, plus the full component/class-name catalog with usage guidance — without reading source.
2. **Given** any change that alters a token value, adds/renames a shared class, or changes an accessibility pairing, **When** the change is submitted, **Then** the same commit updates `DESIGN.md` (the "specs stay truthful" rule extended to the design contract — this spec's FR-017).
3. **Given** CI or a local check, **When** `DESIGN.md` and the implementation disagree (missing token, mismatched value, undocumented class), **Then** the check fails with an actionable message naming the drift.

---

### User Story 4 — New Surface Reuses Components via Classes + Stylesheet Only (Priority: P3)

As a contributor building a new UI surface — whether a React view in the console or a Markdown page in the manual — I want to compose layout from shared primitives (plates/cards, buttons, banners, HUD/lobby chrome, badge/chip, modal, grid, typography, layout containers) by applying class names from the shared stylesheet, without reimplementing visual language per surface.

**Why this priority**: This is the "fuller component system" distinction the product owner emphasized: beyond tokens, the design system ships reusable components/layout that are genuinely shareable between React and Jekyll via stylesheet + class names. Priority P3 because it builds on the token and catalog foundation but is what delivers ergonomic reuse.

**Independent Test**: Can be fully tested by composing two small surfaces — one React (e.g., a new card + button + banner composition) and one Markdown/HTML (a manual page using the same classes) — and asserting both render the same visual language without custom CSS, and that the component catalog lists exactly the available variants.

**Acceptance Scenarios**:

1. **Given** the shared stylesheet imported, **When** a React component applies catalog class names (e.g., `europa-card`, `europa-button`, `europa-banner`) and a Jekyll page applies the same classes in HTML, **Then** both render the same visual treatment for that component — verified by computed-style assertions against tokens.
2. **Given** a component listing in `DESIGN.md`, **When** a consumer uses only the documented class names and variants, **Then** no additional console-specific or manual-specific CSS is needed to reach the spec'd appearance.
3. **Given** a request for a variant not in the catalog, **When** the contributor consults `DESIGN.md`, **Then** the extension guidance (light-theme note and variant policy) tells them how to propose it without breaking existing surfaces.

---

### Edge Cases

- **Missing token / undefined CSS variable**: the component MUST degrade to a readable fallback (dark background + light text) and MUST surface the missing-token name in the drift check rather than silently rendering white/invisible text. Build-time token generation MUST fail loudly if a referenced variable has no definition.
- **Jekyll build with stylesheet not vendored**: if `docs/manual/assets/**` (or the chosen assets path) is absent from the source tree, the manual MUST still render as readable unstyled HTML (no broken layout, no build failure), and CI MUST flag the missing vendored asset before merge — artifact scope remains `docs/manual` regardless.
- **Forgotten console literal / drift**: any hex/rgb literal, hardcoded `color`/`background`/`border`/`spacing` value, or direct `palette.ts` literal not sourced from `@europa/design` (outside the one narrowly-scoped canvas fallback) MUST be caught by the no-literals check and fail CI.
- **Palette still duplicated**: `palette.ts` MUST be a thin re-export/derivation from design tokens; a byte-identity or import-graph test that both Canvas and DOM paths read the same values MUST detect divergence.
- **Future theme extension (light variant out of scope)**: tokens MUST be structured so a later light variant can be added by redefining variable values without renaming components or class names; proposing a new variant is additive and never renames existing variables (see Assumptions).
- **Unknown component class name**: applying an undocumented class name MUST be a no-op for other components (no leakage) and MAY be caught by a catalog-vs-stylesheet coverage check that warns on undocumented classes in the repo.
- **Biome/CI not updated**: if package or docs paths are not covered by `biome.jsonc` includes and workflow `paths:` filters, the check MUST fail (or the workflow MUST not trigger) — this spec requires the sync as an acceptance criterion, not a suggestion.
- **Reduced motion not honored**: decorative animations from the design stylesheet MUST be suppressed by both the existing console `.europa-waiting--reduced` mechanism and the stylesheet-level `@media (prefers-reduced-motion: reduce)` guard; a focused test MUST assert the animation is inert when the preference is set.
- **System font not available**: the `system-ui` stack MUST degrade through the canonical fallback chain (`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`) without layout shift or invisible text; no external font or CDN fetch is permitted (self-hostable, binding decision 6).
- **Version drift vs `DESIGN.md`**: the design contract MUST carry a version header tied to `@europa/design`'s workspace version; drift between `DESIGN.md`'s declared version and the package version MUST be surfaced by CI (mirrors the `version:check` pattern from spec 009).

## Requirements *(mandatory)*

### Functional Requirements

#### Package shape

- **FR-001**: A new private workspace package `packages/design` MUST exist. Its `package.json` MUST set `"private": true`, `"name": "@europa/design"`, a lockstep version matching the root `package.json` version, zero `dependencies` (no runtime deps), TypeScript `strict: true`, and `files` that expose a single shipped stylesheet plus TypeScript token exports. It MUST NOT be published to any registry.
- **FR-002**: The package MUST expose (a) a single stylesheet entry (e.g., `dist/design.css` or `styles.css` — name finalized in plan, but exactly one source) that defines all CSS variables and class-name rules, and (b) TypeScript token exports under a single entry point (e.g., `@europa/design/tokens` or the package root) that re-export the same values as CSS variables, typed and usable from any workspace package.

#### Tokens — single source of truth

- **FR-003**: The design system MUST be the single source of truth for the following token groups, each documented in `DESIGN.md` with token name, CSS variable name (`--europa-*` namespace), TypeScript constant name, and canonical value. Implementation and `DESIGN.md` MUST stay in lockstep per FR-017:
  - **Colors**: page background (`#0b0f19`), surface/plate (`#111827`), surface-raised (`#1f2937`), void (`#1a2233`), border (`#374151`), text-primary (`#f9fafb`), text-secondary (`#e5e7eb`), text-muted (`#9ca3af`), accent amber (`#f59e0b` / city `#fbbf24`), banner amber (`#d97706`), semantic red/green/blue for feedback (`#dc2626`, `#059669`, `#2563eb`), plus water/land/combat/capture tokens already canonicalized in the palette. Initial values match the current console; exact hex catalog lives in `DESIGN.md`.
  - **Typography**: system-ui stack `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` as the only type stack; no external font/CDN; scale and line-height for HUD/lobby/manual as documented.
  - **Spacing**: shared scale covering the gaps/paddings used by HUD, lobby cards, modals, feedback lists, and manual layout (e.g., `0.25rem`/`0.5rem`/`0.75rem`/`1rem` steps present in the current stylesheet).
  - **Radii**: component radii for plates/cards (`8px`), pills/badges (`999px`/`6px`/`4px` as currently used).
  - **Borders**: border width/style and the canonical border color token.
  - **Shadows**: board/canvas, plate, and modal shadow tokens (initially none beyond border/background — but explicitly named so later addition is additive).
  - **Focus-ring**: token(s) for the visible focus indicator — `2px solid #ffffff` with `2px` offset on dark surfaces (`#111827`), documented with its contrast argument (constitution Principle VI).
  - **Motion**: duration/easing tokens for the waiting-spinner and any decorative transitions, plus a `prefers-reduced-motion` guard policy.
- **FR-004**: Every token MUST be emitted as a CSS variable (`--europa-*`) in the shared stylesheet's root scope and re-exported as a typed TypeScript constant. The two representations MUST carry identical canonical values; a drift check MUST fail if they disagree.
- **FR-005**: Color tokens that encode an accessibility contract MUST document their required pairing and WCAG target next to the token (e.g., `#f9fafb` on `#111827` ≈ 16.98:1, `#9ca3af` on `#111827` ≈ 6.99:1, `#111827` text on `#d97706` banner ≈ 5.57:1) so the contract is auditable from `DESIGN.md` without reading tests. (Ratios are the measured values from `DESIGN.md` § 3, not planning-time estimates.)

#### Component / class-name catalog — shareable between React and Jekyll

- **FR-006**: The design system MUST ship a **component and layout catalog** usable from *both* React (console) and plain HTML (Jekyll manual) via class names from the shared stylesheet. The catalog lives in `DESIGN.md` and MUST enumerate, for each component: class name(s), variants/modifiers, required structure, and intended use. The stylesheet MUST implement exactly that catalog — no undocumented visual class. Initial catalog MUST include at least:
  - **Surface primitives**: plate/card (`europa-card` / `europa-plate` family) for HUD panels, lobby cards, modal plates, waiting plate, manual callouts.
  - **Buttons**: primary/secondary/ghost variants (`europa-button` family) covering surrender, lobby actions, modal actions, reserves digits — with pressed/disabled/focus states that do not rely on color alone.
  - **Banners**: fixed banners for reconnecting/status (`europa-banner`).
  - **HUD chrome**: status display typography/layout for the in-match HUD (`europa-hud` family).
  - **Lobby chrome**: page layout, lobby grid/cards/rows/badges (`europa-lobby*` family).
  - **Badge / chip**: troop-count pill, reserves, row badges (`europa-chip`/`europa-badge` family).
  - **Modal**: backdrop + dialog + title/body/actions layout (`europa-modal*`).
  - **Grid**: lobby grid and board-adjacent sidebar stacks that wrap rather than overflow.
  - **Typography**: heading, muted-line, meta, mono (for match IDs) treatments shared between manual and lobby.
  - **Layout containers**: page column with centered measure, stack/gap primitives, and the centered flex-wrap board layout.
  Consumers MAY compose additional app-specific layout with these primitives; they MUST NOT need custom color/spacing/radius values outside the token set to reach the spec'd appearance.
- **FR-007**: Class names MUST be namespaced under `europa-*` (the existing console prefix) and MUST be stable: renaming a catalog class or CSS variable is a breaking change that requires a major bump discussion and a migration note in `DESIGN.md`. Additive variants are allowed without a breaking change.
- **FR-008**: Each component documented in `DESIGN.md` MUST state its accessibility obligations (keyboard target size where applicable, focus-visible treatment, color-alone prohibition) so a manual author can use the HTML correctly without reading console source.

#### Palette derivation — no duplicated color literals

- **FR-009**: `packages/console/src/render/palette.ts` MUST derive every exported color from `@europa/design` tokens (imported constants) rather than inline literals. It may re-export helpers like `terrainColor()` whose computation uses design tokens, but it MUST NOT reintroduce hardcoded hex/rgb values. The inverse invariant — `packages/console/src/styles/index.css` contains no hardcoded literals outside `var(--europa-*)` references — MUST also hold, with at most one narrowly-scoped exception documented in edge cases (e.g., a canvas-paint fallback where a CSS variable is not addressable without JS). Drift checks MUST enforce both invariants.

#### Console migration — dark-slate chrome preserved

- **FR-010**: The console (all routes: landing lobby, in-match board/HUD, modals, banners, waiting overlay, minimap host, error boundary) MUST migrate from hardcoded literals to the design system in a single coherent change set: every `background-color`, `color`, `border-color`, `border`, `border-radius`, `spacing` (`gap`/`padding`/`margin`), `shadow`, and `focus` declaration in the console's stylesheet(s) MUST be expressed via `var(--europa-*)` / design class names, and every color constant in `palette.ts` MUST be imported from `@europa/design`. Visual output before/after MUST be equivalent (SC-001).
- **FR-011**: The shared design stylesheet MUST be the **single stylesheet source** for the console's chrome. The console MUST import it once (entry stylesheet) and MUST NOT duplicate its rules in a parallel copy. Build output MUST deduplicate it (one copy in the bundle).

#### Documentation adoption — Jekyll via vendored/shared stylesheet, scope preserved

- **FR-012**: The player manual (`docs/manual`) MUST adopt the shared dark-slate language by importing the shared design stylesheet and applying catalog class names to its layout (page column, typography, plates/cards, manual-specific callouts). The manual MUST render dark without custom color literals — its styling MUST be a composition of catalog classes + token variables.
- **FR-013**: Jekyll integration MUST preserve the existing Pages artifact scope guarantees from `.github/workflows/pages-deploy.yml`: `actions/jekyll-build-pages` `source` remains `./docs/manual`, and the uploaded artifact remains exactly the rendered `docs/manual` tree. The shared stylesheet MUST reach the Pages deployment by being **vendored/copied into `docs/manual`** (e.g., `docs/manual/assets/design.css` or an `assets/` path — exact path finalized in plan) that is checked into the source tree from the design build, not by widening the workflow's `source` or `path` to include `packages/**` or repo-root. FR-013 is a correctness guard: artifact contents MUST be auditable from the `docs/manual` tree alone.
- **FR-014**: The vendored stylesheet inside `docs/manual` MUST be byte-identical to the package's shipped stylesheet (or generated deterministically from it by a build step whose output is checked in). CI MUST assert this identity; manual build MUST NOT silently ship a stale copy.
- **FR-015**: The manual's Markdown-to-HTML path MUST NOT introduce an external theme or CDN dependency. Frontmatter/class wrappers (e.g., a Jekyll `_layouts` include that pulls `assets/design.css`) are allowed; adding a Jekyll theme gem or a `<link>` to a CDN is not.

#### Accessibility contracts — encoded, not aspirational

- **FR-016**: The design system MUST encode its accessibility contracts in the implementation and document them in `DESIGN.md`:
  - Every text-on-background pairing in the token set MUST state its contrast ratio and WCAG 1.4.3 target (4.5:1 normal, 3:1 large); critical chrome pairings (page text, HUD text, chip text, muted lines, banner text) MUST be ≥ AA at ship, and the claim MUST be pinned by an automated check (not a comment).
  - Focus-visible treatment MUST be expressed as a reusable class/token (`europa-focus-ring` / `--europa-focus-ring-*`) used consistently by every interactive component — white `2px solid` on dark with `2px` offset — meeting WCAG 2.4.7 (≥ 3:1 against adjacent colors; documented as ≈ 17.74:1 on the canonical plate `#111827`, per `DESIGN.md` § 3).
  - Motion tokens MUST be gated by `@media (prefers-reduced-motion: reduce)` in the stylesheet *and* the existing console preference class (`.europa-waiting--reduced` style), per WCAG 2.3.3; no decorative animation may run when reduced motion is requested.
  - Shared components MUST NOT rely on color alone for identity (constitution Principle VI) — their catalog entries MUST note the redundant encoding (border/text/icon/position).

#### Living contract `DESIGN.md`

- **FR-017**: A file `DESIGN.md` at the repository root MUST be the **authoritative, versioned, living spec** for the design system — the contract that binds the package, the console, and the manual. It MUST contain: (a) a version header matching `@europa/design`'s `package.json` version, (b) the complete token tables (FR-003 + FR-005), (c) the complete component/class-name catalog (FR-006 + FR-008), (d) the a11y pairing table with ratios (FR-016), (e) the single-stylesheet and vendoring rules (FR-011/FR-013/FR-014), and (f) the sync rule below. `packages/design/README.md` MUST link to the root `DESIGN.md` as its normative reference and MUST NOT carry a competing catalog.
- **FR-018**: Every change set that alters a token value, adds/renames/removes a catalog component or variable, or changes an accessibility pairing MUST update `DESIGN.md` in the *same* commit/branch that changes the implementation. The "specs stay truthful" rule (AGENTS.md workflow rule 4, constitution Principle IV) extends to `DESIGN.md`: a stale `DESIGN.md` is a bug on par with a stale spec. CI checks that guard this are part of the deliverable, not a follow-up.
- **FR-019**: `DESIGN.md` MUST carry explicit versioning and extension guidance: the contract version equals the package version; adding a variant is a minor change, adding a required token or renaming a class/variable is major; the light-theme note (Out of Scope) MUST be present so contributors understand how to propose a future light variant without renaming the existing dark-slate surface.

#### Build, versioning, and house-keeping

- **FR-020**: `@europa/design` version MUST be lockstep with the workspace versions (spec 009 FR-009/FR-010). The existing `pnpm version:check` / `.github/workflows/version-drift.yml` drift check MUST cover `packages/design/package.json` and the `DESIGN.md` header with no special case — the package is not exempt from lockstep. The first version value is the current lockstep value (`0.1.0` as of this spec's creation).
- **FR-021**: The root build graph MUST produce the design stylesheet before consumers: `pnpm build` (and any reordered workspace build) MUST build `@europa/design` before `@europa/console`, and the design build MUST copy/vendor the stylesheet into the `docs/manual` assets path before the Jekyll build can consume it. A local one-command build MUST succeed from a clean checkout.
- **FR-022**: `biome.jsonc` MUST be updated so design sources are linted/formatted under the same rules as the sibling packages, with no formatter suppression; contract-mirror exclusions (if any) MUST be documented. CI workflow path filters (`client-ci.yml`, `pages-deploy.yml`, `version-drift.yml`) and any new or updated workflow for this feature MUST include `packages/design/**` and the `DESIGN.md` + vendored-assets paths so changes trigger the appropriate checks without widening the Pages artifact scope (FR-013).

### Key Entities

- **Design Token**: a named visual decision (color, type, spacing, radii, border, shadow, focus, motion) realized as a CSS variable `--europa-*` in the shared stylesheet and a typed TypeScript constant in `@europa/design`. The same canonical value is available to CSS and to JS/Canvas. Grouped per FR-003 and tabulated in `DESIGN.md`.
- **Catalog Component**: a reusable visual primitive defined by a stable class-name family (`europa-*`) and composed from tokens. Rendered identically in React (console) and in plain HTML (manual) because the stylesheet is shared. Cataloged in `DESIGN.md` per FR-006; versioned, with additive variants allowed.
- **`DESIGN.md`**: the living, versioned design contract at the repo root. Authoritative over the implementation; kept in sync by FR-018 and guarded by CI. Replaces hunting through `index.css`/`palette.ts` for the canonical answer.
- **Single Stylesheet Source**: the one compiled stylesheet built by `@europa/design` that defines all variables and class rules. Imported by the console and vendored into `docs/manual/assets/` (byte-identical per FR-014); the artifact-scoped Pages build serves that vendored copy.
- **Drift Guard**: automated checks that keep design truthful: CSS-var ↔ TS-constant identity, `DESIGN.md` ↔ implementation agreement, console no-literals enforcement, vendored-asset identity, a11y pairing ratios — all run in CI and locally, failing with actionable messages.

### Non-Functional Requirements

- **NFR-001 (Accessibility)**: Constitution Principle VI (WCAG 2.2 AA) is non-negotiable. Every shipped surface (console + manual) MUST meet 1.4.3 contrast, 2.4.7 focus-visible, 2.3.3 reduced-motion, and 2.5.8 target-size (where component catalog notes it) on the dark-slate theme before merge; axe-style scans MUST stay green.
- **NFR-002 (Self-hostable)**: Constitution VII — no external font, CDN, theme gem, or proprietary service may be required to render the console or the manual. The vendored stylesheet is the only new asset, and it is self-contained.
- **NFR-003 (Type safety & coverage)**: TypeScript `strict: true` across `@europa/design` and consumers; no `any`, no lint suppressions except where the root `biome.jsonc` already permits narrowly-scoped overrides (documented). Any new testable logic (drift helpers, token tests, asset-identity checks) meets the ≥ 80% coverage merge gate on every metric (constitution Principle III).
- **NFR-004 (Simplicity)**: Constitution Principle V — a single package, a single stylesheet, a single contract file, one vendored copy. No Storybook, no theme engine, no runtime theming framework; the token layer is a thin variable + constant mapping that future work can extend additively.
- **NFR-005 (Performance)**: The shared stylesheet MUST NOT materially regress console bundle cost: the browser-payload gzip budget (previously < 150 KB in spec 005) and the manual's Pages payload remain bounded — adding the design package MUST net-remove console CSS literals (duplication out, indirection in), not bloat.
- **NFR-006 (License hygiene)**: Zero runtime dependencies means trivially compatible licensing; any tooling added for the drift/build steps MUST be permissive-licensed per constitution Additional Constraints.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 — No visual regression (console)**: A post-migration visual/style smoke — computed styles for the canonical surfaces (page background, HUD plate, lobby card, row/canvas void, muted text `#9ca3af`, chip, banner amber, focus ring) equal the token values in `DESIGN.md` token table within an exact-match or documented tolerance — and all existing console tests (unit/component/a11y/e2e/perf/determinism/conformance) remain green.
- **SC-002 — No duplicated literals**: A repository grep/test asserts `packages/console/src` contains zero hardcoded hex/rgb color literals and zero hardcoded design-spacing/radius/border literals outside `import` from `@europa/design` (and the single documented canvas fallback). The check runs locally and in CI and fails with the offending file + line on violation.
- **SC-003 — Single stylesheet source, shared by both surfaces**: The console imports exactly one design stylesheet as its chrome source; `docs/manual/assets/**` contains a byte-identical copy; the Jekyll build's rendered manual `<link>` points at that vendored file; a hash-equality check pins the console-imported and vendored files are identical at HEAD.
- **SC-004 — Manual renders dark-slate and is cohesive**: A built manual page, when inspected, has a dark page background (token value), dark surface plates, system-ui type, and component treatments (cards/typography/banner/badge) that are expressed via `--europa-*` variables and `europa-*` classes — the white Jekyll default is absent. Human QA: side-by-side screenshots of console lobby vs. manual index show the same chrome language.
- **SC-005 — Accessibility preserved**: Axe scans and focused contrast tests remain green after migration. Specifically: the documented pairings in `DESIGN.md` (page text, chip, muted, banner) each meet WCAG AA thresholds when measured as computed styles, focus indicators remain visible-white on dark, and reduced-motion suppression (spinner) is verified inert when the OS preference is set.
- **SC-006 — Pages artifact scope preserved**: Listing the artifact produced by `.github/workflows/pages-deploy.yml` (source-scoped `docs/manual` build) after a manual-changing push shows only rendered manual HTML + vendored assets under `docs/manual` — no files from `packages/**`, `specs/**`, or `.github/**` appear. The workflow's `paths:` filter and the artifact-coverage assertion are both reviewed as part of this feature.
- **SC-007 — Living contract is the source of truth**: `DESIGN.md` exists at the repo root and its header version equals `@europa/design`'s package version (pinned by the version lockstep check, G-06). Its token tables and component catalog are mechanically generated from `src/tokens.ts` and verified set-equal against the emitted stylesheet at authoring time. **For v0.1.0 the continuous catalog-vs-code cross-assertion (G-02/G-03) is deferred to a follow-up** — the contract is kept truthful by the generation step and human review, not by a CI drift test. See the Scope Note above.
- **SC-008 — House-keeping in sync**: `biome.jsonc` and relevant workflow `paths:`/includes cover `packages/design/**`, `DESIGN.md`, and the vendored assets path; the drift check covers the new package and `DESIGN.md` header (spec 009 FR-009 pattern); a change to any of those surfaces triggers the expected CI job without widening the Pages deploy's artifact scope.

## Assumptions

- Current console visuals (as shipped on `main` — the ~884-line `styles/index.css` plus `palette.ts`) are the canonical dark-slate reference; this feature codifies them as tokens rather than redesigning them. A full rebrand is explicitly out of scope.
- `system-ui` typography is retained; no custom font is bundled, so the design system does not ship font files.
- The light-theme variant is out of scope but the token namespace is designed so a later variant can be added by redefining variable values (as Plan will detail) without renaming components or variables.
- `docs/manual` today has no custom theme or stylesheet; adding a single `<link>` to the vendored `assets/design.css` via a layout/include does not constitute "adding a theme" in the sense the Pages workflow guards against — it stays within the scoped source.
- `palette.ts` can import from `@europa/design` without a circular dependency — the design package has zero downstream workspace dependencies, so the import graph is `design → (none)`, `console → design`, `engine/fog/terrain → not involved`.
- CI runs on Ubuntu with Node 22 and can execute byte-identity and lint/typecheck checks for this package the same way sibling packages are checked.

## Out of Scope

- **Light-theme variant**: tokens are structured to allow it later, but no light stylesheet, toggle, or dual-theme build ships in this feature.
- **Storybook / visual regression service**: no Storybook, Chromatic, Percy, or hosted visual-compare service is added. Verification is via computed-style assertions, hash checks, and focused manual QA.
- **Rebrand or content rewrite**: no new palette, typeface, brand mark, or manual prose beyond what the dark-slate adoption requires. The console's interaction design and the manual's information architecture stay as they are.
- **Spec 011 Docker / multi-player packaging**: not in this feature's scope (separate specs).
- **Publishing any workspace package**: `packages/design` (and all packages) remain `private: true` and are never published to a registry per binding decision 6.
- **General theming engine**: no runtime token switcher, no CSS-in-JS framework, no per-user theme preference storage — variables are static at build/serve time.

## Dependencies

- Spec 005 `client-console` (console chrome and palette to migrate) and spec 007 `player-manual` (Pages deploy and artifact-scope contract). Spec 009 `shared-app-versioning` (lockstep versioning / `version:check` pattern that this package joins). Toolchain: `biome.jsonc` and `.github/workflows/*` path filtering conventions must be updated to cover the new surfaces.
- No dependencies on engine/fog/terrain/networking/matchmaking internals beyond the console's existing consumption of them.

## Clarifications

### v1.0 (2026-08-30) — Planner-resolved decisions (no unresolved questions remain)

- **Package name and location**: `packages/design` exporting as `@europa/design` (private, zero runtime deps — binding decision 6 + issue #25's proposed shape). Chosen over a dot-scoped alternative like `@europa/tokens` because the scope is the full component system, not just tokens — the package name communicates the shareable-component promise.
- **`DESIGN.md` location**: authoritative at the **repo root** (`DESIGN.md`). `packages/design/README.md` is a short package readme that **links** to the root contract and MUST NOT carry a competing catalog. Rationale: contributors look for design truth at the repo level the way they look for `README.md`; a root file is discoverable from any package. A root-plus-package README indirection is cheaper than a symlink and keeps the contract visible in the canonical spec-kit docs surface.
- **CSS entry build name**: the single stylesheet is tentatively `packages/design/dist/design.css` (built to `dist/`) with the vendored copy at `docs/manual/assets/design.css` — exact filenames finalized in plan/implementation, but the invariant (one source, one vendored copy, byte-identical per FR-014) is fixed now. Grep/drift checks are parameterized over the finalized paths, not hardcoded to a guess.
- **How Jekyll consumes it without widening artifact scope**: the Pages workflow's `source: ./docs/manual` and its `paths:` filter are untouched; the stylesheet reaches the artifact because a `pnpm build` step vendors/copies the built CSS into `docs/manual/assets/` and that vendored file is **checked in** to the source tree. The deployment artifact is still exactly the `docs/manual` tree — the vendored file lives inside that tree. The workflow does not gain a new `path` entry outside `docs/manual`.
- **Console stylesheet migration shape**: the console keeps a single entry CSS import (it may remain at `src/styles/index.css` importing design tokens/components, or may be replaced by importing the design stylesheet directly — architect's choice), but after migration its color/spacing/radius/shadow/focus declarations are `var(--europa-*)` / class-name composition, not literals. The distinction is behavioral, not filename-bound.
- **Palette still needs to exist**: `palette.ts` is retained as the narrow typed bridge that Canvas and DOM share (Canvas cannot read a CSS variable without JS). It becomes a thin re-export from `@europa/design` tokens rather than a second definition — satisfying the "single source while Canvas still works" constraint the issue left implicit.
- **Tokens allow future light variant**: by fixing variable and class names and making values the variable part, a later light theme is `html[data-theme="light"] { --europa-color-bg-*: ... }` (or an equivalent redefinition) with no renames. This feature does not ship the light block — it only guarantees the shape admits it.
- **Contrast encoding is normative, not advisory**: every token-table color pairing states its ratio (`≈ 16.98:1`, `≈ 6.99:1`, etc.) and its AA target. The pairs are asserted by a test that reads computed styles — a comment claiming AA is not the proof.
- **Versioning lockstep includes `DESIGN.md`**: the header in `DESIGN.md` is part of the `version:check` surface per FR-020 — a drift there fails like any package version drift. First value is the current lockstep `0.1.0` (not `0.0.1`; that era's first-lockstep choice was already superseded by FR-010's bump convention and is now the stable lockstep value).

## Addendum — Branded Footer (sidecar, in PR #31)

A product-owner follow-up to the design system: ensure the app name, version, and GitHub link appear on **every** page of both the UI and the documentation. This reuses the `@europa/design` catalog (it is the reason the sidecar rides in PR #31) and adds no new visual language.

### User Story (Priority: P1)

As a player or manual reader, I want every console view and every manual page to show a small footer with "Europa Neo", the current version, and a link to the GitHub repository, so the build is self-identifying everywhere without hunting through menus.

**Independent Test**: Load the lobby and a match view and assert a footer with app name + version + GitHub link exists in each; build the manual and assert every page's rendered HTML contains the same footer.

**Acceptance Scenarios**:
1. **Given** the console lobby/match/waiting views render, **When** each mounts, **Then** exactly one footer shows "Europa Neo", `APP_VERSION` (from `@europa/version`), and `https://github.com/shaunburdick/europa-neo`.
2. **Given** any manual page renders via Jekyll, **When** the layout wraps `{{ content }}`, **Then** a `<footer>` shows "Europa Neo", `{{ site.version }}`, and the GitHub link.
3. **Given** either footer renders, **When** inspected, **Then** it uses only `europa-*` classes / `var(--europa-*)` tokens (no hardcoded color literals) and respects `prefers-reduced-motion`.

### Functional Requirements (addendum)

- **FR-023**: The console MUST render a branded footer on every top-level view (lobby, match/HUD, waiting overlay, and any other root view) containing "Europa Neo", the current `APP_VERSION` (from `@europa/version`), and a link to `https://github.com/shaunburdick/europa-neo`.
- **FR-024**: The documentation MUST render a branded `<footer>` on every page (via `_layouts/default.html`) containing "Europa Neo", the version from `{{ site.version }}`, and the GitHub link.
- **FR-025**: The docs version MUST be sourced from `docs/manual/_config.yml` `version:` and MUST be included as a surface in the shared version-drift check (lockstep with `APP_VERSION` and `DESIGN.md`).
- **FR-026**: Both footers MUST use only `europa-*` classes / `var(--europa-*)` design tokens (no hardcoded color literals), per the design-system contract (FR-009/FR-010).
- **FR-027**: The GitHub link MUST point to `https://github.com/shaunburdick/europa-neo` in both footers.

### Success Criteria (addendum)

- **SC-009**: Every console top-level view contains exactly one branded footer with app name + version + GitHub link (asserted by a component/a11y test).
- **SC-010**: Every built manual page contains a `<footer>` with app name + version + GitHub link (structural check).
- **SC-011**: `pnpm version:check` passes with `_config.yml` version included as a surface (no drift).
- **SC-012**: `check:no-literals` passes (no hardcoded color literals introduced in either footer).

### Assumptions (addendum)

- The design system `@europa/design` is already implemented and vendored into the manual (this PR); footers reuse `europa-*` classes.
- `APP_VERSION` is reliably available in the console bundle via `@europa/version`.
- Jekyll is not installed in the dev environment; docs footer validation is structural (same pattern as T-016), with live Pages deploy as final visual proof.
- This addendum ships inside PR #31 on branch `issue-25-design-system`; it does not alter the core 012 Implemented status beyond this tracked addition.

## Constitution Alignment

- **Principle I (Type Safety)**: design tokens are typed exports under `strict: true`; no `any`, no lint suppressions for the new package.
- **Principle III (Tested, ≥ 80%)**: any new testable logic (token drift, stylesheet identity, no-literals guards, a11y pair assertions) meets the merge gate; visual-assertion coverage is treated like game-logic coverage for this package.
- **Principle IV (Specs as Documentation)**: `DESIGN.md` extends the "stale specs are bugs" rule to the design contract itself (FR-018), and lives beside `specs/` as first-class documentation.
- **Principle V (Simplicity)**: one package, one stylesheet, one contract, one vendored copy — no framework, no Storybook, no theme engine.
- **Principle VI (Accessibility)**: WCAG 2.2 AA is encoded in FR-016/SC-005 as a shipped contract, not a follow-up — focus, contrast, reduced motion, and color-alone prohibition are all named.
- **Principle VII (Self-hostable)**: no external font/CDN/theme gem; the manual's styling is a vendored file that ships inside the `docs/manual` tree, so a self-hosted build stays self-contained.
- **Additional Constraints**: zero runtime deps → licensing hygiene trivial; `private: true` everywhere honored per binding decision 6.

