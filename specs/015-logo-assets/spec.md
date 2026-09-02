# Feature Specification: Europa Neo Logo and Favicon/Icon Set

> Version: 1.2
> Last Updated: 2026-09-02
> Status: Draft
> GitHub Issue: #54
> Feature Branch: `issue-54-logo`
> Dependencies: Feature 012 (`012-design-system`), Feature 013 (`013-semantic-url-routing`), Feature 014 (`014-shared-ui-components`)
> Size: Medium

## Problem Statement

Europa Neo has a recognizable dark-slate product surface but no owned brand mark. The console, player manual, and self-hosted landing page therefore lack a consistent identity in headers, browser chrome, bookmarks, and link previews. This feature establishes an original, reusable visual identity: a combined emblem and “Europa Neo” wordmark, a standalone emblem, and a complete icon/preview set derived from the same vector source.

The supplied mockup is visual inspiration only. The approved primary-lockup direction is its full composition: an Europa planet/moon as the central visual, enclosed by an icy outer shield/frame, with circuitry behind the planet, a strong horizontal blue-versus-orange energy beam/clash, and a clear “EUROPA NEO” wordmark hierarchy. The artwork must be newly authored for Europa Neo and must not copy raster artwork, traced shapes, or third-party marks.

## User Scenarios & Testing

### User Story 1 — Player Recognizes the Product (Priority: P1)

As a player, I want the lobby and match console to display a clear Europa Neo brand mark so that I can distinguish the game from an unbranded self-hosted page.

**Independent Test**: Open the built console at `/lobby` and `/match/<id>` at desktop and mobile widths and verify the intended logo variant, accessible name, intrinsic dimensions, and no layout overflow.

**Acceptance Scenarios**:

1. **Given** the console landing/lobby, **when** it renders, **then** it displays the combined lockup at normal width and preserves existing keyboard, focus, contrast, and responsive behavior.
2. **Given** a narrow viewport or compact header, **when** the lockup would become unreadable, **then** the standalone emblem is used and the product name remains available to assistive technology.
3. **Given** a decorative logo beside an accessible page heading, **when** a screen reader traverses the page, **then** it does not announce the same brand name twice.

### User Story 2 — Maintainer Uses the Brand Everywhere (Priority: P1)

As a maintainer, I want original assets in predictable self-hosted paths so that the console, manual, and static host can reference them without a CDN or registry service.

**Independent Test**: Build the workspace and inspect emitted static files; fetch each documented asset URL from the self-hosted server and from the Pages artifact.

**Acceptance Scenarios**:

1. **Given** the manual site, **when** any page is rendered, **then** its shared layout shows the logo and its favicon metadata resolves to local assets.
2. **Given** the self-hosted static server, **when** a browser requests a logo, favicon, touch, PWA, or preview asset, **then** it receives the correct content type and no external request is required.
3. **Given** a deployment under a repository subpath, **when** the manual or console loads, **then** asset URLs use the existing base-path strategy and do not assume `/`.

### User Story 3 — User Shares or Bookmarks Europa Neo (Priority: P2)

As a player or maintainer, I want browser icons and a share preview that remain legible at their target sizes so that bookmarks, installed PWAs, and shared links identify the game.

**Independent Test**: Validate binary dimensions and metadata, render icons at 16–512 px, and inspect the social preview at 1200×630 px on light and dark viewers.

**Acceptance Scenarios**:

1. **Given** a browser tab or bookmark, **when** it uses the favicon set, **then** the standalone emblem is recognizable at 16×16 and 32×32 without the wordmark.
2. **Given** an Apple or Android/PWA install surface, **when** the icon is loaded, **then** it has the documented dimensions, safe-area treatment, and no clipped artwork.
3. **Given** a supported social crawler, **when** it reads self-hosted page metadata, **then** it finds a local 1200×630 preview image with the lockup and descriptive alternative metadata.

## Functional Requirements

### Brand artwork and source of truth

- **FR-001**: The feature MUST provide newly authored Europa Neo artwork consisting of a combined primary lockup + “EUROPA NEO” wordmark and a standalone emblem. The primary lockup MUST retain the approved full composition: Europa planet/moon as the central visual; an icy outer shield/frame; circuitry visibly positioned behind the planet; a strong horizontal blue-versus-orange energy beam/clash; and a clear wordmark hierarchy in which `EUROPA` is dominant and `NEO` is subordinate. Simplified emblem variants MAY reduce detail for small sizes, but MUST preserve the recognizable planet, frame, circuitry, and conflict cues. Artwork MUST NOT copy, trace, embed, or derive pixels from the supplied raster mockup or from `europa-source/`.
- **FR-002**: `packages/design` MUST own the master artwork and generated brand asset source of truth. Master artwork MUST be editable, scalable SVG with a `viewBox`, no embedded raster images, no external stylesheet, no external font, and no network dependency. Standalone SVGs MUST include a meaningful `<title>`/description. No consumer may maintain a competing copy of a master asset.
- **FR-003**: The inventory MUST be authored under `packages/design` (master SVGs under its source tree and generated outputs under its distribution tree) and MUST include these original SVGs: combined lockup, standalone emblem, light-background lockup, dark-background lockup, monochrome lockup, light-background emblem, dark-background emblem, monochrome emblem, and a compact emblem variant for constrained headers. Variant names and intended background MUST be documented in `DESIGN.md`.
- **FR-004**: Light and dark variants MUST preserve geometry and meaning while meeting NFR-002. Monochrome variants MUST remain identifiable without blue/orange color distinction.
- **FR-005**: The wordmark MUST remain readable at its documented minimum display width of 160 CSS px. Below that width consumers MUST use the compact emblem; the emblem MUST remain recognizable from 16 CSS px through 512 CSS px.
- **FR-006**: Brand colors MUST reference existing `@europa/design` tokens or a documented brand-token extension in `DESIGN.md`; no ad-hoc console-only color literals may be introduced. Conflict colors MUST be blue and orange with sufficient non-color shape/value distinction.

### Favicon, app, and sharing assets

- **FR-007**: The set MUST include a favicon SVG and a `favicon.ico` containing 16×16, 32×32, and 48×48 icon images. The favicon MUST use the emblem only.
- **FR-008**: The set MUST include a 180×180 Apple touch icon, 192×192 Android/PWA icon, and 512×512 Android/PWA icon. The 512×512 icon MUST also have a documented maskable-safe variant with artwork inside the central safe area if the manifest uses `purpose: maskable`.
- **FR-009**: The set MUST include a 1200×630 social/share preview image in PNG or JPEG, generated from original vector artwork. It MUST include the combined lockup, dark Europa/icy visual language, and documented safe margins.
- **FR-010**: `@europa/design` MUST document a consumer export surface for the complete brand set: `@europa/design/brand` for the typed asset manifest/metadata and `@europa/design/brand/*` for generated SVG/raster files. The package export MUST resolve only to files generated or owned by `packages/design`; consumers MUST NOT import unpublished source files or copy assets manually.
- **FR-011**: Web entry points MUST declare local favicon, Apple touch icon, manifest/PWA icons where applicable, and Open Graph/Twitter-compatible preview metadata. Metadata MUST use the existing self-hosted base-path mechanism and MUST NOT point at a CDN.

### Product integration

- **FR-012**: The console MUST integrate the brand in the lobby/landing surface and at least one in-match persistent surface without obscuring gameplay controls, changing simulation behavior, or duplicating an accessible page-level name. Console build output MUST receive assets from the `@europa/design` distribution, not a hand-maintained console asset copy.
- **FR-013**: The player manual MUST integrate the logo in its shared layout/header and include local favicon metadata. The manual build MUST copy or stage selected files from the `@europa/design` distribution into its existing local asset area, continue to build with the existing GitHub Pages workflow, and contain no independent master artwork.
- **FR-014**: The `pnpm host` static surface and the single-port Docker image MUST, at build time, copy/stage selected generated files from `@europa/design` into their served static tree and expose the same local brand asset paths, including preview metadata, without requiring a separate asset server.
- **FR-015**: Root `DESIGN.md` MUST document the inventory, `packages/design` ownership, consumer exports, build-time distribution contract, variant selection, minimum sizes, clear space, backgrounds, color usage, accessibility rules, file paths, and original-art/licensing statement. Future asset changes MUST update `DESIGN.md` in the same change set.

### Validation and accessibility

- **FR-016**: Automated asset validation MUST fail on missing inventory items, malformed SVG, SVG raster/embed or external-reference content, incorrect raster dimensions, missing ICO sizes, broken local references, missing package exports, or generated output that differs from the declared `packages/design` source.
- **FR-017**: Integration tests MUST verify that console, manual, static host, and Docker-served HTML reference existing locally staged assets from `@europa/design` and that response content types are correct. Tests MUST cover repository-base and non-root deployment base paths where supported.
- **FR-018**: Meaningful logo images MUST have accessible text equivalent “Europa Neo”; decorative repetitions MUST use empty alternative text or be hidden from assistive technology. A logo-only link MUST provide the link's accessible name.
- **FR-019**: Implementation MUST preserve visible focus indicators, keyboard operation, reduced-motion behavior, and existing WCAG 2.2 AA checks. Decorative SVG motion is not required and MUST be absent or disabled by default.

## Non-Functional Requirements

- **NFR-001 (Self-hosting)**: Runtime assets are local, cacheable static files staged from `@europa/design` during each consumer build. No external CDN, font, analytics, image proxy, SaaS API, or network fetch is required.
- **NFR-002 (Contrast)**: Logo text and essential non-text marks MUST meet WCAG 2.2 AA contrast against each documented intended background: 4.5:1 for normal wordmark text and 3:1 for essential graphical marks. If a treatment cannot meet the mark threshold on a busy background, it MUST use its documented plate.
- **NFR-003 (Compatibility)**: SVGs MUST render in current Chromium, Firefox, and Safari; raster icons MUST work in current desktop/mobile browsers; ICO MUST contain the three required square images.
- **NFR-004 (Performance)**: Brand assets MUST add no more than 25 KB gzipped to the console browser payload excluding social/install icons, and the combined lockup SVG MUST be no larger than 30 KB uncompressed.
- **NFR-005 (Quality)**: Strict TypeScript, lint, format, typecheck, and existing tests remain green; new executable asset/integration helpers achieve at least 80% coverage.
- **NFR-006 (Licensing)**: Source artwork, generated assets, and generation scripts MUST be original project work or use permissively licensed tooling. No third-party logo, copyrighted raster artwork, or restricted font may be included.

## Acceptance Criteria

- [ ] **AC-001**: `packages/design` contains the documented SVG masters and generated inventory, validates each SVG as having no raster or external/network references, and includes combined and standalone variants.
- [ ] **AC-002**: `favicon.ico` contains valid 16×16, 32×32, and 48×48 images; PNG icons are exactly 180×180, 192×192, and 512×512; preview is exactly 1200×630.
- [ ] **AC-003**: At 16×16, 32×32, 48×48, 180×180, 192×192, and 512×512 renderings, the emblem is not clipped and remains distinguishable by geometry/image review.
- [ ] **AC-004**: Automated contrast checks confirm light/dark and monochrome variants meet NFR-002 on intended backgrounds; a test confirms meaning is not conveyed by color alone.
- [ ] **AC-005**: Console lobby/landing and an in-match persistent surface display the responsive variant with no existing console accessibility or interaction regression.
- [ ] **AC-006**: `@europa/design/brand` and `@europa/design/brand/*` resolve the documented manifest and generated assets, and every manual page's shared layout exposes local logo/favicon metadata from a Pages-style build containing all referenced staged assets.
- [ ] **AC-007**: `pnpm host` and single-port Docker build steps stage assets from `@europa/design`, then serve and render the local logo, favicon, PWA metadata, and social metadata without CDN requests or a second asset server.
- [ ] **AC-008**: Tests cover inventory, dimensions, references, metadata, accessible names, responsive selection, and missing-asset failures; new executable code meets the 80% coverage gate.
- [ ] **AC-009**: `DESIGN.md` documents every master/generated file, package export, staging rule, and usage rule, and drift tests fail when an inventory file, export, generated output, or integration reference is removed/renamed without documentation.
- [ ] **AC-010**: Final originality/licensing review records that no mockup raster pixels, `europa-source/` code/artwork, restricted font, or third-party mark was copied.
- [ ] **AC-011**: Product-owner visual review confirms that the primary lockup is a newly authored full composition containing, and visually reading in this order, an Europa planet/moon central visual, icy outer shield/frame, circuitry behind the planet, a strong horizontal blue-versus-orange energy beam/clash, and a clear `EUROPA`-over-`NEO` wordmark hierarchy; an abstract shield-only or route-only substitute fails acceptance.

## Edge Cases

- **Tiny display**: Wordmark is not forced into favicon or compact-header dimensions; emblem-only fallback is selected.
- **Light/dark preference**: Explicit light/dark selection follows the surface background; monochrome remains available for print/constrained contexts.
- **Transparent background**: Transparent variants are used only where the background is documented; otherwise the required plate is used.
- **Broken base path**: Tests catch root-absolute asset URLs in repository-subpath deployments.
- **Missing asset**: Validation fails with the missing relative path; runtime never silently fetches a remote replacement.
- **Unsupported SVG feature**: Artwork uses broadly supported SVG primitives and has a documented fallback asset.
- **Screen-reader duplication**: Repeated header marks are hidden/empty while logo-only links retain an accessible name.
- **PWA maskable crop**: Essential geometry stays within the safe area and accepts platform corner masking.

## Examples

```html
<a href="/lobby" aria-label="Europa Neo home">
  <img src="/assets/brand/europa-neo-lockup-dark.svg" alt="Europa Neo">
</a>
<link rel="icon" href="/assets/brand/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/assets/brand/favicon.ico" sizes="any">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/brand/apple-touch-icon.png">
<meta property="og:image" content="/assets/brand/europa-neo-social.png">
```

For a decorative repeated header mark:

```html
<img src="/assets/brand/europa-neo-emblem-dark.svg" alt="" aria-hidden="true">
<h1>Europa Neo lobby</h1>
```

## Assumptions

- Product owner approved the combined emblem + wordmark direction and Medium scope; exact geometry is an implementation/design responsibility, not a request to reproduce the mockup.
- `packages/design` is the canonical owner for both master SVGs and generated outputs. Existing console, Jekyll, `pnpm host`, Docker, and base-path/static-serving mechanisms consume its documented distribution rather than owning copies.
- The project remains self-hosted and all workspace packages remain private; no brand asset is published to npm.
- Architect may choose a permissively licensed local rasterization/ICO tool or deterministic generation process, provided outputs and licensing requirements are met.

## Out of Scope

- Reproducing/tracing the supplied mockup or artwork under `europa-source/`.
- Animated logo treatments, 3D models, video, custom web fonts, or a complete marketing site.
- Gameplay, simulation, networking, routing semantics, or design-system component behavior changes beyond visual integration.
- Accounts, analytics, remote image transformation, CDN hosting, npm publication, or hosted asset service.

## Clarifications Applied

### v1.0 (2026-09-02) — Planner-resolved decisions (no unresolved questions remain)

| # | Question | Decision | Requirement(s) |
|---|---|---|---|
| 1 | What does “if feasible” mean for the requested set? | Approved Medium scope includes the full requested inventory; raster/install files derive from original SVG rather than separate artwork. | FR-002–FR-009 |
| 2 | Which sizes and preview format are authoritative? | ICO is 16/32/48; Apple is 180; Android/PWA is 192/512 plus maskable-safe treatment; preview is PNG 1200×630. | FR-007–FR-009 |
| 3 | Where are assets served? | One local documented brand root is copied/served by console, manual, `pnpm host`, and single-port Docker; no CDN or package publication. | FR-010–FR-013 |
| 4 | What accessibility applies to repeated logos? | Meaningful images expose “Europa Neo”; decorative repetitions are hidden/empty; logo-only links are named. | FR-017–FR-018 |
| 5 | How does the mockup constrain implementation? | It supplies mood only; new vector geometry, no traced/copied pixels, and an originality review are mandatory. | FR-001, FR-002, AC-010 |

### v1.1 (2026-09-02) — Product-owner architectural confirmation

| # | Question | Decision | Requirement(s) |
|---|---|---|---|
| 6 | Which package owns brand assets and how do consumers receive them? | `packages/design` owns master SVGs and generated outputs. Consumers use the documented `@europa/design/brand` manifest and `@europa/design/brand/*` asset exports; no consumer maintains master copies. | FR-002, FR-003, FR-010, FR-015, FR-016 |
| 7 | How do runtime surfaces receive assets while remaining self-hosted? | Console, manual, `pnpm host`, and Docker stage selected generated files from `@europa/design` at build time into local static trees. No CDN, registry publication, or second asset server is introduced. | FR-011–FR-017, NFR-001, AC-006–AC-009 |

### v1.2 (2026-09-02) — Product-owner visual-direction clarification

| # | Question | Decision | Requirement(s) |
|---|---|---|---|
| 8 | What visual composition must the revised primary lockup deliver? | The primary lockup must retain the mockup’s full compositional idea as original vector artwork: Europa planet/moon central, icy outer shield/frame, circuitry behind it, a strong horizontal blue-versus-orange beam/clash, and an explicit `EUROPA`-dominant / `NEO`-subordinate hierarchy. This is an approved direction, not permission to trace or copy the mockup. | FR-001, AC-011 |

## Constitution Alignment

- **Principle I**: Integration helpers and validation code use strict TypeScript with no `any` or suppressions.
- **Principle IV**: `DESIGN.md`, this spec, and player-facing manual integration remain synchronized; asset drift is testable.
- **Principle V**: One vector source and derived outputs avoid parallel hand-maintained artwork and unnecessary runtime abstraction.
- **Principle VI**: Contrast, alternative text, non-color distinction, focus preservation, and reduced-motion behavior are explicit.
- **Principle VII**: All assets work from local static files in self-hosted and Pages deployments with no external service.
- **Additional constraints**: Original artwork and permissively licensed tooling preserve licensing hygiene; package privacy is unchanged.
