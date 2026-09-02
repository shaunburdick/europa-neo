# Tasks: Europa Neo Logo and Favicon/Icon Set

**Phase 6 routing**: PM/orchestrator recommended. Ownership labels identify the
implementation owner; waves are dependency ordered and `[P]` means parallel-safe
after all preceding wave dependencies are complete.

## Wave 0 — freeze contracts and harnesses

- [x] T-001 (architect): Review this plan, data model, contract, and spec against `AGENTS.md` and the constitution; record any approved implementation clarifications before coding.
- [x] T-002 (design): Write the original-art direction sheet (geometry, clear space, backgrounds, minimum sizes, blue/orange non-color encoding) without referencing mockup pixels or `europa-source/` artwork. See [`design-direction.md`](design-direction.md).
- [x] T-003 [P] (design): Add source-tree inventory fixtures and a typed manifest test scaffold under `packages/design/tests/brand/`; assert every required logical asset is named before generators exist.
- [x] T-004 [P] (build): Decide and document the exact design-package build/staging command boundaries, including fresh-checkout Pages ordering and Docker transitive staging. See [`plan.md` §9](plan.md#9-wave-0-command-boundary-decision).

## Wave 1 — canonical artwork and package generator

- [x] T-005 (design): Revise and normalize the supplied artwork into self-contained SVG masters under `packages/design/src/brand/masters/`, preserving the full composition and adding the required horizontal lockup plus retained `lockup-vertical.svg`; convert the Montserrat ExtraBold wordmark to paths. Product-owner follow-up places the wordmark as a clipped overlay in the shield's upper moon area for every lockup treatment; it is not an external right-hand label.
- [x] T-006 (design): Revalidate documented brand tokens, treatments, accessibility metadata, normalized IDs, and blue/orange non-color distinction for the revised composition before raster generation. Product-owner visual review remains the gate for the next wave.
- [x] T-007 (build): Implement strict typed brand manifest and package-local source/distribution path helpers; reject traversal, undeclared, and consumer-source paths.
- [x] T-008 (build): Implement SVG structural validation for parseability, viewBox, embedded raster, external/network references, fonts, scripts, animation, and malformed content.
- [x] T-009 [P] (test): Add source SVG tests for inventory, title/description, geometry invariance between treatments, no-forbidden-content, and combined-lockup size limits.
- [x] T-007–T-009 remediation (review): Harden SVG validation with a safe element allowlist and event-handler rejection; document the approved self-contained artwork palette (including the product-approved blue/orange extension); add SVG palette drift coverage; instrument executable brand TypeScript in Vitest coverage. Code-quality review HOLD resolved; T-010+ remain paused.
- [x] T-010 (build): Implement deterministic resvg generation for variant SVG distribution copies and exact 180/192/512/512-maskable/1200×630 PNG outputs with system fonts disabled.
- [x] T-010 remediation (code-quality HOLD): Make the package build fail closed around generation and output inventory, validate every master before use, generate `favicon.svg`, and add focused clean-build, favicon, and maskable-safe-area coverage. T-011 through T-014 remain pending.
- [x] Review HOLD remediation (maskable geometry): Replace the insufficient 80% whole-emblem scale with the mathematically verified centered `scale(0.72)` transform; regression-test shield, moon, circuitry, and energy bounds against the 80%-diameter circle. T-011 through T-014 remain pending.
- [x] Review HOLD follow-up (maskable regression coupling): Assert the emitted maskable SVG transform and emblem body, then generate into an isolated output directory, decode the actual emitted `icon-512-maskable.png`, and measure its non-plate pixels against the explicitly pinned manifest safe circle (`diameterRatio: 0.8`). Preserve `scale(0.72)` and approved masters; do not begin T-013/T-014.
- [x] T-011 (build): Implement deterministic ICO packaging from generated 16/32/48 PNG layers and expose a parser/validator for directory dimensions, offsets, and payload bounds.
- [x] T-012 (build): Generate the local web manifest with relative paths, correct purposes, theme/background tokens, and stable formatting; export the typed manifest via `@europa/design/brand`.
- [x] T-013 [P] (test): Add dimension, ICO, manifest, safe-zone, and reproducibility tests, including a failure test for missing/stale/generated output. `generated-output.test.ts` validates the complete manifest inventory, binary signatures/dimensions, SVG source identity, relative manifest paths, clean-output rejection, and byte-identical repeated generation; the generator assertion now enforces the same output contract.
- [x] T-014 (build): Add `@europa/design/brand` and `@europa/design/brand/*` package exports, build ordering, package files policy, and a distribution-surface compile test.

## Wave 2 — design documentation and staging

- [x] T-015 (docs): Update root `DESIGN.md` with every master/generated file, token/background pairing, clear space, minimum sizes, export contract, staging rules, accessibility, and originality/licensing statement. Manual staging is implemented by T-017; consumer integrations remain pending in Wave 3.
- [x] T-016 (docs): Update `packages/design/README.md` with authoring, generation, validation, and consumer import/staging instructions; do not describe `dist` as hand-editable.
- [x] T-017 (build): Extend the canonical design build/vendor pipeline to stage the selected brand set into `docs/manual/assets/brand/` deterministically from package distribution.
- [x] T-018 [P] (test): Add design drift tests for manifest↔files, source↔generated output, package exports, `DESIGN.md` inventory, and manual staging byte/content identity.
- [x] T-019 [P] (docs/CI): Update Pages workflow to build the design package and stage assets from a clean checkout before Jekyll; preserve path gates, permissions, artifact scope, and timeout discipline.

## Wave 3 — console, manual, host, and Docker integration

- [x] T-020 (console): Update Vite entry metadata and base-path handling for local favicon SVG/ICO, Apple touch icon, manifest, Open Graph, and Twitter preview URLs.
- [x] T-021 (console): Extend `build-assets.ts` to resolve `@europa/design` distribution and stage only manifest-selected files into `dist/assets/brand`; fail on absent or mismatched files.
- [x] T-022 [P] (console): Integrate meaningful combined/compact logo variants into lobby and a decorative emblem into an in-match persistent surface without duplicating the page name or altering controls/simulation.
- [ ] T-023 [P] (console): Add responsive CSS and tests for the 160 CSS px lockup threshold, emblem fallback, intrinsic dimensions, no overflow, focus preservation, and reduced-motion behavior.
- [x] T-024 (manual): Update the shared Jekyll layout/header with local logo, favicon, manifest, and social metadata using `relative_url`; ensure all manual pages inherit it and accessible repetition rules hold.
- [ ] T-025 [P] (manual): Add Pages-style build/staged-asset tests covering every referenced path, repository-base deployment, and missing-asset failure.
- [x] T-026 (host): Add `.webmanifest` MIME handling and static-host tests for all staged brand assets, 404 behavior, traversal safety, and no external fallback.
- [x] T-027 [P] (Docker): Add single-port Docker build/smoke validation proving console build output contains the design-owned brand set and runtime serves it with correct types; do not add a second server.
- [ ] T-028 (integration): Add cross-surface tests proving console, manual, host, and Docker references resolve to locally staged design distribution files rather than competing copies.

## Wave 4 — accessibility, visual review, originality, and gates

- [ ] T-029 (a11y): Add browser/axe coverage for meaningful logo names, decorative hidden/empty alt, logo-only link names, contrast, keyboard focus, compact fallback, and reduced-motion behavior.
- [ ] T-030 (visual): Review actual 16/32/48/180/192/512 renderings, maskable crop, light/dark treatments, monochrome meaning, and 1200×630 safe margins in Chromium; record findings and remediate before acceptance.
- [ ] T-031 (licensing): Complete and commit an originality/licensing review record naming the authoring process, dependency/tool licenses, and negative checks for mockup pixels, `europa-source/`, third-party marks, restricted fonts, and remote assets.
- [ ] T-032 (docs): Update relevant manual/index and README references so user-facing brand paths and usage rules remain truthful; update spec implementation notes/status only after acceptance is proven.
- [ ] T-033 (review): Run targeted design/console/manual/host/Docker suites and confirm new executable helpers meet ≥80% coverage with no lint suppressions or weak types.
- [ ] T-034 (release): Run the complete repository gate from a clean build: typecheck, lint, format check, all package tests, browser tests, E2E, self-host/Docker checks, drift/privacy/vendor guards, and final artifact inspection.
- [ ] T-035 (architect/PM): Review every acceptance criterion AC-001–AC-010, attach command output and visual/originality evidence, and obtain product-owner sign-off before merging.
