# Orchestration Log: Europa Neo Logo and Favicon/Icon Set

## Status
- **Current Wave**: Wave 1 T-010 complete — T-011 through T-014 pending
- **Branch**: `issue-54-logo`
- **Last Updated**: 2026-09-02

## Plan Summary
`packages/design` is the canonical owner of original SVG masters and generated brand
assets. Consumer builds will stage selected package outputs into local console,
manual, host, and Docker static trees. Implementation is split into five dependency-
ordered waves, with visual review and product-owner inspection before broad consumer
integration proceeds.

## Product-Owner Checkpoint
- Product owner approved the Phase 4–5 plan and requested an early logo review before
  the remaining integration work advances.
- 2026-09-02: Product owner rejected the initial logo direction as diverged from the
  reference and clarified that the revised primary lockup must retain the full
  composition as original vector artwork: Europa planet/moon central, icy outer
  shield/frame, circuitry behind the planet, strong horizontal blue-versus-orange
  energy beam/clash, and clear `EUROPA`-dominant / `NEO`-subordinate hierarchy.
- First reviewable milestone: original SVG masters plus a rendered preview sheet after
  Wave 1. Pause for product-owner feedback before committing to downstream generated
  assets and consumer integration.

## Task Wave Progress

### Wave 0 — freeze contracts and harnesses — ✅ Complete
- T-001 architect contract review — ✅ complete; eight implementation clarifications recorded in `plan.md` §8
- T-002 original-art direction sheet — ✅ done (`design-direction.md`)
- T-003 source inventory and typed-manifest test scaffold — ✅ done (`packages/design/tests/brand/inventory.fixture.ts`, `inventory.test.ts`)
- T-004 build/staging boundary decision — ✅ done; exact package, Pages, root-build,
  and Docker command boundaries recorded in [`plan.md` §9](plan.md#9-wave-0-command-boundary-decision)

### Wave 1 — canonical artwork and package generator — ✅ Artwork milestone complete / Product Review
- T-005 — ✅ normalized supplied artwork, added horizontal lockup, retained vertical
  variant, and converted the Montserrat ExtraBold wordmark to paths
- Product-owner follow-up — ✅ corrected all lockup placement: the normalized path
  wordmark is clipped and centered over the upper moon/shield area at the intended
  scale in every treatment; the preview now presents the square overlay composition.
- T-006 — ✅ verified clean metadata/namespaces, stable IDs, complete accessibility
  metadata, preserved gradients/filters, and documented token/licensing choices
- T-007 — ✅ strict manifest and package-local path helpers; traversal, undeclared,
  and consumer-source paths are rejected
- T-008 — ✅ structural SVG validation and focused safety tests
- T-009 — ✅ source SVG contract tests (`packages/design/tests/brand/source.test.ts`)
- T-010 — ✅ deterministic `@resvg/resvg-js` generator and focused reproducibility/dimension tests; outputs remain package-owned under `dist/brand/`
- T-011 through T-014 — ⏳ pending
- Review remediation for T-007–T-009 — ✅ complete; downstream generation remains paused

### Wave 2 — design documentation and staging — ⏳ Pending
- T-015 through T-019

### Wave 3 — console, manual, host, and Docker integration — ⏳ Pending
- T-020 through T-028

### Wave 4 — accessibility, visual review, originality, and gates — ⏳ Pending
- T-029 through T-035

## Decisions & Rationale
- 2026-09-02: `packages/design` is the sole canonical asset owner; consumers stage
  generated files at build time to preserve self-hosting and prevent artwork drift.
- 2026-09-02: Pause after the first original SVG artwork milestone for product-owner
  visual review, as requested.
- 2026-09-02: Generation and consumer staging are separate named boundaries:
  `@europa/design build` owns package distribution, while `stage:manual` owns
  writes below `docs/manual/assets/brand/`. Pages explicitly runs install →
  design build → manual staging → Jekyll, and Docker relies on the existing
  clean build-stage `pnpm build` dependency order to transitively stage brand
  files into the console distribution. The explicit Pages stage is idempotent
  even when package build finalization also invokes it.
- 2026-09-02: `favicon.ico` has exactly three PNG-backed directory entries—one
  each at 16×16, 32×32, and 48×48—with no undocumented extra entries.
- 2026-09-02: Product-owner review is required after the first SVG milestone and
  before generated icons or consumer integration proceed.
- 2026-09-02: Product-owner visual clarification supersedes the initial abstract
  shield/route direction. The full composition is mandatory for the primary lockup;
  originality safeguards remain unchanged, including no mockup tracing/copying and
  no use of `europa-source/`.
- 2026-09-02: T-007 implementation uses a readonly manifest inventory and
  package-root-resolved helpers. Source resolution accepts only canonical master
  names; distribution resolution accepts only manifest-declared `brand/` paths.
- 2026-09-02: T-008 uses a dependency-free strict XML scanner. Approved gradients,
  filters, clip paths, and local fragment references remain allowed under Option B;
  active content, embedded/external resources, fonts, malformed markup, and invalid
  viewBoxes fail closed.

## Blockers & Escalations
- Downstream generation, raster/ICO/PWA/social output, and all consumer integration
  remain paused until the normalized artwork passes AC-011 and receives product-owner
  visual approval. This is intentional; the artwork review is not a covert invitation
  to grow another asset hydra.

## New Tasks Discovered
- 2026-09-02: Code-quality review HOLD required validator hardening, explicit artwork-palette documentation/drift coverage, and brand-source coverage instrumentation. Remediated without starting T-010+.

## Review Findings
- 2026-09-02: Initial horizontal masters placed the wordmark outside/right of the
  shield. Product-owner clarification rejected that composition. The four horizontal
  treatments now use the same clipped `wordmark` group (`translate(256 100) scale(.55)`)
  and a square `512 × 512` viewBox; the retained vertical treatment is explicitly
  identified with the same layering contract. Geometry tests pin this placement.
- T-001 review completed against `AGENTS.md` and `.specify/memory/constitution.md`.
- The plan's rasterizer statement needed correction: `@resvg/resvg-js` is currently
  console-only and must become a direct design-package development dependency.
- Manifest boundary, package-relative paths, strict ICO cardinality, clean-checkout
  build ordering, Docker staging, base-path metadata, and documentation/source-drift
  rules are now explicit in `plan.md` §8.

### Review result — 2026-09-02

The code-quality review HOLD is resolved. `validateSvg` now fails closed against an
explicit safe SVG element allowlist and all `on*` event attributes. `#3b82f6` and
`#f97316` remain unchanged as a documented brand-token extension because they are
product-approved artwork colours; a test rejects undocumented SVG colour literals.
Vitest instruments executable `src/brand/**/*.ts` while excluding only masters/fonts/
preview assets. At the review checkpoint, T-010+ generation and integrations had not
yet been implemented.

### T-010 implementation — 2026-09-02

T-010 is complete. The design package now owns a deterministic `@resvg/resvg-js`
generator with system-font discovery disabled. It copies the nine approved SVG
variants and renders the 180×180 Apple icon, 192×192 and 512×512 PWA icons,
80%-scaled centered 512×512 maskable icon, and fixed 1200×630 social PNG under
`dist/brand/`. Focused tests verify PNG dimensions, byte reproducibility, safe-area
transform, local-resource composition, and source-copy identity. ICO, manifest,
exports, staging, and consumer integrations remain intentionally untouched.
