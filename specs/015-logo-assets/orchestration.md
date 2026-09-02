# Orchestration Log: Europa Neo Logo and Favicon/Icon Set

## Status
- **Current Wave**: Artwork milestone complete — awaiting product review
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
- T-006 — ✅ verified clean metadata/namespaces, stable IDs, complete accessibility
  metadata, preserved gradients/filters, and documented token/licensing choices
- T-007 through T-014 — ⏸ paused pending product-owner visual approval

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

## Blockers & Escalations
- Downstream generation, raster/ICO/PWA/social output, and all consumer integration
  remain paused until the normalized artwork passes AC-011 and receives product-owner
  visual approval. This is intentional; the artwork review is not a covert invitation
  to grow another asset hydra.

## New Tasks Discovered
- None.

## Review Findings
- T-001 review completed against `AGENTS.md` and `.specify/memory/constitution.md`.
- The plan's rasterizer statement needed correction: `@resvg/resvg-js` is currently
  console-only and must become a direct design-package development dependency.
- Manifest boundary, package-relative paths, strict ICO cardinality, clean-checkout
  build ordering, Docker staging, base-path metadata, and documentation/source-drift
  rules are now explicit in `plan.md` §8.
