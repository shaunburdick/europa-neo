# Orchestration Log: Europa Neo Logo and Favicon/Icon Set

## Status
- **Current Wave**: Wave 0 — contract and harness freeze
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
- First reviewable milestone: original SVG masters plus a rendered preview sheet after
  Wave 1. Pause for product-owner feedback before committing to downstream generated
  assets and consumer integration.

## Task Wave Progress

### Wave 0 — freeze contracts and harnesses — 🔄 In Progress
- T-001 architect contract review — ✅ complete; eight implementation clarifications recorded in `plan.md` §8
- T-002 original-art direction sheet — ✅ done (`design-direction.md`)
- T-003 source inventory and typed-manifest test scaffold — ✅ done (`packages/design/tests/brand/inventory.fixture.ts`, `inventory.test.ts`)
- T-004 build/staging boundary decision — ✅ done; exact package, Pages, root-build,
  and Docker command boundaries recorded in [`plan.md` §9](plan.md#9-wave-0-command-boundary-decision)

### Wave 1 — canonical artwork and package generator — ⏳ Pending
- T-005 through T-014

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

## Blockers & Escalations
- None.

## New Tasks Discovered
- None.

## Review Findings
- T-001 review completed against `AGENTS.md` and `.specify/memory/constitution.md`.
- The plan's rasterizer statement needed correction: `@resvg/resvg-js` is currently
  console-only and must become a direct design-package development dependency.
- Manifest boundary, package-relative paths, strict ICO cardinality, clean-checkout
  build ordering, Docker staging, base-path metadata, and documentation/source-drift
  rules are now explicit in `plan.md` §8.
