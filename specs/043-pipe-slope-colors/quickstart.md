# Quickstart: Pipe Slope Colors (Issue #43)

## What this fixes

The CSS-based pipe rendering in the console was never updated when issue #30 landed slope color-coding. All pipe triangles rendered as amber (`var(--europa-color-accent)`) regardless of slope. The Canvas 2D path was correct, but the DOM overlay (accessibility layer) ignored slope.

## What this adds

- **Slope-colored pipes** in both CSS and Canvas paths (downhill green, flat amber, uphill red, stalled gray)
- **Intensity encoding** as triangle size/thickness (bigger = stronger slope)
- **Web component** `EuropaPipeSlope` accepts `intensity` attribute

## Key changes

| Layer | Before | After |
|-------|--------|-------|
| CSS pipes | All amber | Slope-specific colors via `data-slope` attribute |
| CSS pipe size | Fixed 6px | Scales 2.4–6px based on `data-intensity` |
| Canvas pipes | Correct colors, fixed size | Correct colors, size scales with intensity |
| Web component | Fixed size | Accepts `intensity` prop for size scaling |
| Data model | `pipeSlopes` only | `pipeSlopes` + `pipeIntensities` (0–1) |

## Validation

### Q-C01: Slope colors in CSS path
- Render a board with downhill/flat/uphill/stalled pipes
- Verify DOM spans have `data-slope` attributes matching slope classification
- Verify visual colors match design tokens

### Q-C02: Intensity scaling
- Render pipes with varying elevation deltas
- Verify triangle sizes vary: Δ=1 small, Δ=5 max (downhill), Δ=7 max (uphill)
- Verify stalled pipes are fixed size

### Q-C03: Canvas parity
- Canvas and CSS paths should produce visually similar output
- Slope colors match between both paths

### Q-C04: Web component
- `<europa-pipe-slope direction="downhill" intensity="0.5">` renders smaller than intensity="1"
- `<europa-pipe-slope direction="stalled">` ignores intensity (always full size)

### Q-C05: Backward compatibility
- All existing tests pass (no regressions)
- Existing pipe rendering behavior preserved for flat pipes (intensity=0 → small but visible)

## Validation Results

| Gate | Status | Notes |
|------|--------|-------|
| `pnpm typecheck` | PASS | All packages clean |
| `pnpm lint` | PASS | Biome clean |
| `pnpm format:check` | PASS | All packages clean |
| `pnpm version:check` | PASS | No drift |
| Console unit tests | PASS | 50 files, 651 tests |
| Console conformance | PASS | 9 tests (byte-identity + type witnesses) |
| Design tests | PASS | 23 files, 174 tests |
| pipeIntensity unit tests | PASS | 7 tests (all slope classes + boundaries) |
| pipe-intensities buildMapView | PASS | 6 tests (downhill/flat/uphill/stalled/fog) |
| Component: data-slope attrs | PASS | DOM spans carry correct data-slope |
| Component: intensity sizing | PASS | --europa-pipe-tri varies with intensity |
| Component: canvas intensity | PASS | Canvas triangle size varies with intensity |
| Web component: intensity prop | PASS | 10 tests (scale, stalled, aria-label, clamping) |
