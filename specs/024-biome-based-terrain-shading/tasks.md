# Tasks: Biome-Based Terrain Shading (Feature 024)

> Spec: `specs/024-biome-based-terrain-shading/spec.md` v1.2
> Plan: `specs/024-biome-based-terrain-shading/plan.md` v1.0

## Task List

- [x] T-001: Update design tokens — retire flat land tokens, add `biomeZones` array to `TOKENS.color` in `packages/design/src/tokens.ts` (FR-001, FR-007, FR-031)
- [x] T-002: Update `EuropaElevationSwatch` component in `packages/design/src/components/game/elevation-swatch.tsx` to use `biomeZones` instead of `landBandCount`/`landBandLightness` (FR-041)
- [x] T-003: Update palette module in `packages/console/src/render/palette.ts` — new exports (`BIOME_ZONES`, `PIPE_OUTLINE_COLOR`, `biomeZoneForElevation`), update `landBandIndex`, `landBandColor`, `terrainColor` (FR-002, FR-003, FR-004, FR-005, FR-006)
- [x] T-004: [P] Update palette tests in `packages/console/tests/unit/render/palette.test.ts` — 4-zone band indices, biome zone boundary values, `biomeZoneForElevation` pure function, updated contrast assertions (AC-022, AC-020)
- [x] T-005: Update `.europa-pipe` CSS rule in `packages/console/src/styles/index.css` — add `filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.7))` for DOM overlay pipe outline (FR-021, AC-016)
- [x] T-006: Update Canvas renderer in `packages/console/src/render/canvas.ts` — pipe outline stroke in `drawPipes` (FR-010), contour threshold update (FR-012), pre-computed color cache (FR-011)
- [x] T-007: [P] Update canvas terrain tests in `packages/console/tests/unit/render/canvas-terrain.test.ts` — pipe outline stroke verification, contour threshold zone ≥ 2, all-terrain-types render test (AC-010, AC-023)
- [x] T-008: [P] Update or add DOM overlay pipe tests — verify drop-shadow filter is applied to `.europa-pipe` elements (AC-016)
- [x] T-009: [P] Update design system elevation swatch tests — swatch renders 4 biome zone colors, not 6 bands (AC-024)
- [x] T-010: Update DESIGN.md — replace terrain token rows in § 1.1 (retire `land-hue`/`land-saturation-pct`/`land-min-lightness-pct`/`land-max-lightness-pct`, add biome zone documentation), update § 3 contrast pairs for new biome backgrounds, update note N-3 and N-4 (FR-032)
- [x] T-011: Run `pnpm verify` — full verification pass (typecheck, lint, format, all package tests, design guards) (AC-026)
- [x] T-012: Visual smoke test — render a board with cells spanning all 4 biome zones, verify distinct hues at zone boundaries, verify pipe outline visible against all backgrounds (AC-001–AC-015)

## Parallel-Safe Tasks

The following tasks can be executed in parallel (no dependencies between them):
- **T-004** (palette tests) — depends only on T-003 spec, not its implementation
- **T-005** (CSS) — independent of palette/canvas implementation
- **T-007** (canvas tests) — depends on T-006 spec, but can be written in advance
- **T-008** (DOM overlay tests) — independent of other implementation tasks
- **T-009** (design swatch tests) — independent of console implementation

## Dependency Order

```
T-001 (tokens)
  └─→ T-002 (elevation swatch)
  └─→ T-003 (palette)
        ├─→ T-004 [P] (palette tests)
        └─→ T-006 (canvas)
              └─→ T-007 [P] (canvas tests)
T-005 [P] (CSS)
T-008 [P] (DOM overlay tests)
T-009 [P] (design swatch tests)
T-010 (DESIGN.md) — can run after T-001
T-011 (verification) — after all implementation tasks
T-012 (visual smoke) — after T-006 and T-005
```

## Execution Waves

### Wave 1: Foundation (no dependencies)
- T-001: Update design tokens
- T-005: Update CSS (parallel-safe)

### Wave 2: Core Implementation (depends on T-001)
- T-002: Update elevation swatch
- T-003: Update palette module

### Wave 3: Renderer + Tests (depends on T-003)
- T-006: Update Canvas renderer
- T-004: Update palette tests (parallel-safe with T-006)
- T-008: DOM overlay tests (parallel-safe)
- T-009: Design swatch tests (parallel-safe)

### Wave 4: Documentation + Verification (depends on all above)
- T-007: Update canvas tests (after T-006)
- T-010: Update DESIGN.md
- T-011: Run `pnpm verify`
- T-012: Visual smoke test
