# Plan: Pipe Slope Colors — Issue #43

## Problem

The console's CSS-based pipe rendering (`cell-view.tsx` → `index.css`) was never updated when issue #30 landed slope color-coding. All pipe triangles use `var(--europa-color-accent)` (amber) regardless of slope classification. The Canvas 2D painter (`canvas.ts`) renders correctly with `pipeSlopeColor(slope)`, but the DOM overlay (used for accessibility) ignores slope entirely.

Additionally, the spec 005 FR-013 originally stated "no intensity scaling — a fixed three-color scheme." The product owner has confirmed this should be enhanced: pipes should encode intensity (normalized 0–1 based on `|Δ|` / max possible delta) as triangle size/thickness. Stalled pipes remain fixed size (no intensity variation).

## Scope

**In scope:**
1. Fix CSS pipe colors to use slope-specific design tokens (downhill green, flat amber, uphill red, stalled gray)
2. Add normalized intensity (0–1) to the pipe data model per direction
3. Render intensity as triangle size/thickness in both CSS and Canvas paths
4. Update the `EuropaPipeSlope` web component to accept an `intensity` prop
5. Amend spec 005 FR-013 to reflect the new intensity behavior
6. Update manual pipes.md and numbers.md to document intensity

**Out of scope:**
- Engine changes (flow formula, constants) — none needed
- Matchmaking changes — none needed
- New design tokens — existing pipe tokens are sufficient

## Architecture Decisions

### AD-1: Intensity computation lives in `pipe-slope.ts` (console mirror)

The console cannot import `@europa/engine` at runtime (features 001/004 boundary rule). The intensity computation mirrors the engine's constants via `PIPE_SLOPE_CONSTANTS`, just like the existing `classifyPipeSlope`.

**Formula:**
- Downhill: `intensity = min(|Δ|, flowSlopeDeltaCap) / flowSlopeDeltaCap` → ranges 0–1, capped at flowSlopeDeltaCap (5)
- Uphill: `intensity = min(Δ, flowBase / flowSlopeStep) / (flowBase / flowSlopeStep)` → ranges 0–1, capped at stall point (7)
- Flat: `intensity = 0` (no visual intensity — flat pipes have no gradient signal)
- Stalled: `intensity = 0` (fixed size, no variation — hollow treatment is the signal)
- Fog fallback: `intensity = 0` (same as flat)

### AD-2: Data model — additive `pipeIntensities` map on `CellRenderInfo`

A new `readonly pipeIntensities: ReadonlyMap<Direction, number>` field (0–1 normalized). Additive; consumers that don't need intensity ignore it. Both contract mirrors (`packages/console/contracts/console-types.ts` and `specs/005-client-console/contracts/console-types.ts`) updated in the same commit.

### AD-3: CSS rendering via `data-slope` + `data-intensity` attributes

The `<span>` in `cell-view.tsx` gains `data-slope` and `data-intensity` attributes. CSS rules use attribute selectors:
- `--europa-pipe-color` custom property per slope class
- Size scaled via `--europa-pipe-tri` modulated by intensity (min 40% at intensity=0, max 100% at intensity=1)
- Stalled pipes: fixed size, hollow (border-only treatment)

### AD-4: Canvas rendering — stroke width variation for intensity

The canvas `drawPipes` method already handles colors correctly. Intensity scales the triangle size (smaller at low intensity, full size at high intensity). Stalled pipes remain fixed size with hollow stroke.

### AD-5: Web component — optional `intensity` attribute

`EuropaPipeSlope` gains an optional `intensity` attribute (string, parsed to 0–1). The internal triangle scales proportionally. Absent intensity = full size (backward compatible).

## Data Model Changes

### `CellRenderInfo` (console-types.ts)

```typescript
export interface CellRenderInfo {
    // ... existing fields unchanged ...
    readonly pipeSlopes: ReadonlyMap<Direction, PipeSlope>;
    /**
     * Per-direction normalized intensity (0–1) for pipe rendering.
     * 0 = no gradient signal (flat/stalled/fog), 1 = maximum gradient.
     * Additive field — consumers that don't render intensity may ignore it.
     */
    readonly pipeIntensities: ReadonlyMap<Direction, number>;
}
```

### `pipe-slope.ts` (console mirror)

New exported function:
```typescript
/**
 * Compute normalized intensity (0–1) for a pipe direction.
 * Downhill: |Δ| / flowSlopeDeltaCap (capped at 1).
 * Uphill: Δ / (flowBase / flowSlopeStep) (capped at 1).
 * Flat/stalled/fog: 0.
 */
export function pipeIntensity(
    srcElev: number,
    dstElev: number | null,
    slope: PipeSlope,
    constants: PipeSlopeConstants,
): number;
```

### `build-map-view.ts`

During the existing pipe-slope computation loop, also compute and store intensity:
```typescript
pipeIntensities.set(
    direction,
    pipeIntensity(info.elevation, dstInfo?.elevation ?? null, slope, PIPE_SLOPE_CONSTANTS),
);
```

## CSS Rendering Approach

### Attribute-based slope coloring

```css
.europa-pipe[data-slope="downhill"] { --europa-pipe-color: var(--europa-color-pipe-downhill); }
.europa-pipe[data-slope="flat"]     { --europa-pipe-color: var(--europa-color-pipe-flat); }
.europa-pipe[data-slope="uphill"]   { --europa-pipe-color: var(--europa-color-pipe-uphill); }
.europa-pipe[data-slope="stalled"]  { --europa-pipe-color: var(--europa-color-pipe-stalled); }
```

Each directional class (N/S/E/W) uses `var(--europa-pipe-color)` instead of `var(--europa-color-accent)`.

### Intensity-based sizing

Intensity scales the `--europa-pipe-tri` variable (half-width of the triangle):
- Base: 6px (current value)
- Min: 2.4px (40% of base — intensity=0 gives a small but visible triangle)
- Max: 6px (100% of base — intensity=1)
- Formula: `--europa-pipe-tri: calc(2.4px + var(--pipe-intensity) * 3.6px)`

For N/S pipes, `--europa-radii-plate` (height) is also scaled proportionally.

### Stalled hollow treatment

```css
.europa-pipe[data-slope="stalled"] {
    /* Fixed size — no intensity scaling */
    --europa-pipe-tri: 6px;
    /* Hollow: border-only (no fill) — achieved by making the "fill" color
       match the background. But since these are CSS border-triangles,
       the "fill" IS the border. Stalled uses a different approach:
       the border IS the color, but we reduce the triangle size and
       use outline or double-border for the hollow effect. */
}
```

Actually, CSS border-triangles don't support hollow rendering easily. The simplest approach: stalled pipes get a fixed smaller size + the stalled color. The color difference (gray vs colored) combined with the fixed (non-intensity-scaled) size provides sufficient visual distinction. If true hollow is needed, we can use a `box-shadow` trick or switch to SVG/inline — but that's complexity for marginal gain. The canvas path already handles hollow correctly.

**Decision**: CSS stalled = fixed size + gray color. Canvas stalled = hollow outline. This is acceptable because the CSS path is the accessibility overlay (screen readers see direction via `aria-hidden`), not the primary visual.

### Size consistency fix

Current CSS: N/S use `--europa-radii-plate` for height, E/W use `--europa-pipe-tri`. After this change, both dimensions use `--europa-pipe-tri` consistently (the triangle "depth" is uniform in all directions).

## Canvas Rendering Approach

The canvas `drawPipes` already uses correct colors. Changes:
1. Triangle size scales with intensity: `const size = zoom * PIPE_SIZE_RATIO * (0.4 + intensity * 0.6)`
2. Stalled pipes remain full size with hollow stroke (existing behavior)
3. Intensity is read from `info.pipeIntensities.get(direction) ?? 0`

## Web Component Changes

`EuropaPipeSlope` gains:
- `intensity` observed attribute (string, parsed to 0–1, default 1)
- Triangle border-width scales: `borderBottom: ${16 * (0.4 + intensity * 0.6)}px`, sides: `${12 * (0.4 + intensity * 0.6)}px`
- `aria-label` includes intensity description when < 1

## Test Strategy

1. **Unit tests** (`pipe-slope.test.ts`): add `pipeIntensity` tests for all slope classes, boundary values (Δ=0, Δ=max, fog, stalled)
2. **Unit tests** (`pipe-intensity.test.ts`): dedicated intensity computation tests
3. **Drift test** (`slope-drift.test.ts`): extend to verify intensity computation matches engine formula
4. **Component tests** (`pipe-slope.test.tsx`): verify CSS pipe elements have correct `data-slope` and `data-intensity` attributes
5. **Canvas tests** (`pipe-slope.test.tsx`): extend existing pixel-readback tests to verify size variation
6. **A11y tests**: existing axe scan should remain green (no structural DOM changes)
7. **Build-map-view tests**: verify `pipeIntensities` is populated correctly

## Constitution Alignment

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Type Safety | ✅ | All new fields typed; no `any` |
| II. Deterministic | ✅ | Intensity is pure function of elevations + constants |
| III. Tested | ✅ | Unit + component + drift tests |
| IV. Specs | ✅ | Spec 005 FR-013 amended same change set |
| V. Simplicity | ✅ | Additive fields; no new tokens; formula is one line |
| VI. A11y | ✅ | CSS path maintains `aria-hidden`; canvas is visual layer |
| VII. Self-hostable | ✅ | No new dependencies |

## Affected Files

| File | Change |
|------|--------|
| `packages/console/contracts/console-types.ts` | Add `pipeIntensities` to `CellRenderInfo` |
| `specs/005-client-console/contracts/console-types.ts` | Mirror the above |
| `packages/console/src/render/pipe-slope.ts` | Add `pipeIntensity()` function |
| `packages/console/src/state/build-map-view.ts` | Compute `pipeIntensities` in loop |
| `packages/console/src/render/cell-view.tsx` | Pass `data-slope` + `data-intensity` attributes |
| `packages/console/src/styles/index.css` | Replace amber with slope vars + intensity sizing |
| `packages/console/src/render/canvas.ts` | Scale triangle size with intensity |
| `packages/design/src/components/game/pipe-slope.ts` | Accept `intensity` attribute |
| `specs/005-client-console/spec.md` | Amend FR-013 Clarifications v1.3 |
| `docs/manual/pipes.md` | Document intensity encoding |
| `docs/manual/numbers.md` | Document intensity constants |
