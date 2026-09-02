# Tasks: Europa Neo Logo and Favicon/Icon Set

**Phase 6 routing**: PM/orchestrator recommended. Ownership labels identify the
implementation owner; waves are dependency ordered and `[P]` means parallel-safe
after all preceding wave dependencies are complete.

## Wave 0 — freeze contracts and harnesses

- [ ] T-001 (architect): Review this plan, data model, contract, and spec against `AGENTS.md` and the constitution; record any approved implementation clarifications before coding.
- [ ] T-002 (design): Write the original-art direction sheet (geometry, clear space, backgrounds, minimum sizes, blue/orange non-color encoding) without referencing mockup pixels or `europa-source/` artwork.
- [ ] T-003 [P] (design): Add source-tree inventory fixtures and a typed manifest test scaffold under `packages/design/tests/brand/`; assert every required logical asset is named before generators exist.
- [ ] T-004 [P] (build): Decide and document the exact design-package build/staging command boundaries, including fresh-checkout Pages ordering and Docker transitive staging.

## Wave 1 — canonical artwork and package generator

- [ ] T-005 (design): Author the nine self-contained SVG masters under `packages/design/src/brand/masters/`; include meaningful title/description in standalone emblem files and keep all geometry original.
- [ ] T-006 (design): Add documented brand tokens or token references using existing `@europa/design` values; prove light/dark/monochrome contrast and non-color distinction before raster generation.
- [ ] T-007 (build): Implement strict typed brand manifest and package-local source/distribution path helpers; reject traversal, undeclared, and consumer-source paths.
- [ ] T-008 (build): Implement SVG structural validation for parseability, viewBox, embedded raster, external/network references, fonts, scripts, animation, and malformed content.
- [ ] T-009 [P] (test): Add source SVG tests for inventory, title/description, geometry invariance between treatments, no-forbidden-content, and combined-lockup size limits.
- [ ] T-010 (build): Implement deterministic resvg generation for variant SVG distribution copies and exact 180/192/512/512-maskable/1200×630 PNG outputs with system fonts disabled.
- [ ] T-011 (build): Implement deterministic ICO packaging from generated 16/32/48 PNG layers and expose a parser/validator for directory dimensions, offsets, and payload bounds.
- [ ] T-012 (build): Generate the local web manifest with relative paths, correct purposes, theme/background tokens, and stable formatting; export the typed manifest via `@europa/design/brand`.
- [ ] T-013 [P] (test): Add dimension, ICO, manifest, safe-zone, and reproducibility tests, including a failure test for missing/stale/generated output.
- [ ] T-014 (build): Add `@europa/design/brand` and `@europa/design/brand/*` package exports, build ordering, package files policy, and a distribution-surface compile test.

## Wave 2 — design documentation and staging

- [ ] T-015 (docs): Update root `DESIGN.md` with every master/generated file, token/background pairing, clear space, minimum sizes, export contract, staging rules, accessibility, and originality/licensing statement.
- [ ] T-016 (docs): Update `packages/design/README.md` with authoring, generation, validation, and consumer import/staging instructions; do not describe `dist` as hand-editable.
- [ ] T-017 (build): Extend the canonical design build/vendor pipeline to stage the selected brand set into `docs/manual/assets/brand/` deterministically from package distribution.
- [ ] T-018 [P] (test): Add design drift tests for manifest↔files, source↔generated output, package exports, `DESIGN.md` inventory, and manual staging byte/content identity.
- [ ] T-019 [P] (docs/CI): Update Pages workflow to build the design package and stage assets from a clean checkout before Jekyll; preserve path gates, permissions, artifact scope, and timeout discipline.

## Wave 3 — console, manual, host, and Docker integration

- [ ] T-020 (console): Update Vite entry metadata and base-path handling for local favicon SVG/ICO, Apple touch icon, manifest, Open Graph, and Twitter preview URLs.
- [ ] T-021 (console): Extend `build-assets.ts` to resolve `@europa/design` distribution and stage only manifest-selected files into `dist/assets/brand`; fail on absent or mismatched files.
- [ ] T-022 [P] (console): Integrate meaningful combined/compact logo variants into lobby and a decorative emblem into an in-match persistent surface without duplicating the page name or altering controls/simulation.
- [ ] T-023 [P] (console): Add responsive CSS and tests for the 160 CSS px lockup threshold, emblem fallback, intrinsic dimensions, no overflow, focus preservation, and reduced-motion behavior.
- [ ] T-024 (manual): Update the shared Jekyll layout/header with local logo, favicon, manifest, and social metadata using `relative_url`; ensure all manual pages inherit it and accessible repetition rules hold.
- [ ] T-025 [P] (manual): Add Pages-style build/staged-asset tests covering every referenced path, repository-base deployment, and missing-asset failure.
- [ ] T-026 (host): Add `.webmanifest` MIME handling and static-host tests for all staged brand assets, 404 behavior, traversal safety, and no external fallback.
- [ ] T-027 [P] (Docker): Add single-port Docker build/smoke validation proving console build output contains the design-owned brand set and runtime serves it with correct types; do not add a second server.
- [ ] T-028 (integration): Add cross-surface tests proving console, manual, host, and Docker references resolve to locally staged design distribution files rather than competing copies.

## Wave 4 — accessibility, visual review, originality, and gates

- [ ] T-029 (a11y): Add browser/axe coverage for meaningful logo names, decorative hidden/empty alt, logo-only link names, contrast, keyboard focus, compact fallback, and reduced-motion behavior.
- [ ] T-030 (visual): Review actual 16/32/48/180/192/512 renderings, maskable crop, light/dark treatments, monochrome meaning, and 1200×630 safe margins in Chromium; record findings and remediate before acceptance.
- [ ] T-031 (licensing): Complete and commit an originality/licensing review record naming the authoring process, dependency/tool licenses, and negative checks for mockup pixels, `europa-source/`, third-party marks, restricted fonts, and remote assets.
- [ ] T-032 (docs): Update relevant manual/index and README references so user-facing brand paths and usage rules remain truthful; update spec implementation notes/status only after acceptance is proven.
- [ ] T-033 (review): Run targeted design/console/manual/host/Docker suites and confirm new executable helpers meet ≥80% coverage with no lint suppressions or weak types.
- [ ] T-034 (release): Run the complete repository gate from a clean build: typecheck, lint, format check, all package tests, browser tests, E2E, self-host/Docker checks, drift/privacy/vendor guards, and final artifact inspection.
- [ ] T-035 (architect/PM): Review every acceptance criterion AC-001–AC-010, attach command output and visual/originality evidence, and obtain product-owner sign-off before merging.
