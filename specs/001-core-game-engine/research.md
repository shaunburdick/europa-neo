# Research: Elevation-Gradient Pipe Flow + Terrain Smoothing + Slope Color-Coding (issue #30)

**Branch**: `issue-30-pipe-flow-rate` | **Date**: 2026-08-30 | **Specs**: 001 v1.2 · 003 v1.3 · 005 v1.2 · 006 ImplNotes · 007 v1.3 · 012 companion

Phase-0 research for the issue #30 change set. Each section records the decision, the alternatives considered and rejected, and the evidence. The spec amendments (commits `3907ee1`, `71d46ad`) already resolved the product questions (tuning values, smoothing default/range, color scheme); this document resolves the technical questions (formula mechanics, kernel, plumbing, mirror strategy) and flags the one remaining product ambiguity (R-1).

---

## 1. Flow formula — single source of truth

**Decision (D1)**: export `flowRateForDelta(delta: number, constants: EngineConstants): number` from `@europa/engine` (additive public API) and have `resolveFlow` consume it.

**Why**: three consumers need the identical formula:
1. `resolveFlow` (engine tick) — the shipped behavior.
2. The terrain reachable-land suite (003 US4 AC-1) — computes flow-viable edges over the 200-map suite; the spec requires it to read the stall threshold from `ENGINE_CONSTANTS`.
3. The console slope drift test (005 FR-013) — pins the console's `pipe-slope.ts` mirror against the engine.

If each consumer replicated the formula, the R-1 ambiguity (see §2) would propagate to three copies and a future retune would require three coordinated edits. One exported function makes the formula a single source; the console's src-boundary rule (no runtime `@europa/engine` import in `src/`) is satisfied because the console mirror is pinned by a test in `tests/`, not by a src import.

**Alternatives rejected**:
- *Keep the formula inline in `flow.ts` only* — the terrain suite and console drift test would each replicate it; the R-1 ambiguity would be silently resolved three times. Rejected.
- *Export a constants-only helper (no formula)* — the terrain suite would still need the formula to decide flow-viability; the stall predicate `|Δ| ≥ flowBase/step` is a special case that only holds under the asymmetric reading. Rejected in favor of the full function.

**Additive, not breaking**: a new exported function does not change any existing signature; `ENGINE_API_VERSION` stays put (the `EngineConstants` field swap is enforced by the existing semantic-diff conformance test, not a protocol version).

## 2. The R-1 blocker — FR-007 formula vs the v1.2 constants

**The inconsistency, precisely**: FR-007 as amended reads `max(0, flowBase − flowSlopeStep × min(|Δelev|, flowSlopeDeltaCap))` for uphill. With `flowBase=7, flowSlopeStep=1, flowSlopeDeltaCap=5`:

| Δ (uphill) | min(|Δ|, 5) | symmetric formula | spec v1.2 listing |
| --- | --- | --- | --- |
| 1 | 1 | 6 | 6 |
| 2 | 2 | 5 | 5 |
| 3 | 3 | 4 | 4 |
| 4 | 4 | 3 | 3 |
| 5 | 5 | 2 | 2 |
| 6 | 5 | **2** | **1** |
| 7 | 5 | **2** | **0 (stall)** |
| ≥8 | 5 | **2** | **0 (stall)** |

The symmetric formula caps the handicap at 5 < flowBase=7, so uphill flow is always ≥ 2 and **never stalls**. The spec's own listing (uphill 6/5/4/3/2/1, 0 at Δ≥7) is exactly `max(0, 7 − Δ)` — an **uncapped** handicap. The downhill listing (8/9/10/11/12 at Δ=1/2/3/4/≥5) is exactly `7 + min(Δ, 5)` — a **capped** bonus. So the spec's numbers describe an asymmetric formula: the cap bounds the downhill bonus only.

**Corroborating evidence**:
- US1 AC-5: stall threshold = `flowBase / flowSlopeStep` = 7 — only reachable with an uncapped (or ≥7-capped) handicap.
- Spec 003 v1.3 empirical run: "31.5% of uphill edges stall" at default smoothing — impossible under the symmetric formula (0% stall).
- Spec 005 FR-013: stalled pipes must render hollow — the mechanic must exist.
- Manual 007 v1.3: "uphill 6→1, stall Δ≥7".
- The cap's documented purpose (001 v1.1): "bounds the downhill bonus at 2.7× flat and prevents extreme cliffs … from becoming capacity-filling superhighways" — nothing about the uphill handicap.

**Working assumption (D2)**: asymmetric cap — `downhill: base + step × min(|Δ|, cap)`, `flat: base`, `uphill: max(0, base − step × |Δ|)`. This matches every number in the specs and the empirical validation.

**Alternative considered**: raise `flowSlopeDeltaCap` to ≥ 7 so the symmetric formula can stall. Rejected because it changes the downhill rates to 8..14 (Δ≥7), contradicting the spec's "downhill 8/9/10/11/12 (Δ=1/2/3/4/≥5)" listing and the 2.7×-cap rationale.

**⚠️ This is a product-level ambiguity (it changes shipped flow rates) and is flagged to the PM as a blocker (R-1).** The plan centralizes the formula in `flowRateForDelta` so either resolution is a one-line change; the flow tests are written against the PM-confirmed formula.

## 3. Smoothing kernel — 3×3 box mean

**Decision (D3)**: `smoothElevation(elev, size, passes)` applies a 3×3 box mean with divisor 9, coordinates clamped to `[0, size-1]` (edge cells replicate their edge), and round-half-up via `Math.floor((sum + 4) / 9)`.

**Why this kernel**:
- It is the spec's own reference kernel (003 v1.3: "the reference kernel used for tuning validation is a 3×3 box mean with divisor 9 and clamped coordinates"). The empirical numbers in the spec — max |Δ| 153→28, reachable 0.1%→53.6%, variance 1054.6→393.7, pool contiguity 27→6 pools — were computed with exactly this kernel. Any other kernel would invalidate the spec's validation and require re-running the 200-seed study.
- It is trivially deterministic: a pure function of the field + setting, no RNG, no wall-clock.
- It is symmetry-preserving: the kernel is symmetric, and coordinate clamping commutes with the 180° rotation mapping (cell (x,y)'s neighborhood maps onto its partner's neighborhood under rotation). Verified empirically at k=0,1,2,3,4,5,8 (spec 003 v1.3).
- It is integer-safe: `Math.floor((sum + 4) / 9)` ≡ `Math.round(sum / 9)` for non-negative sums (elevations are uint8 0..255), and the single division is IEEE-754 correctly rounded — identical on every JS engine, so determinism holds cross-platform (constitution II).

**Alternatives considered and rejected**:
- *fBm parameter change (lower roughness / fewer octaves)* — rejected by the spec: not additive (k=0 would not reproduce current output), and the observable effect would not map 1:1 to a setting value.
- *Larger kernels (5×5, Gaussian)* — more smoothing per pass but more arithmetic and no spec grounding; the 3×3 box is the documented reference.
- *Median filter* — not a mean; would change the empirical statistics; more complex to make integer-exact.
- *Float averaging* — rejected by constitution II (no floating-point drift in generation logic); the integer round-half-up avoids the question entirely.

**Pass count semantics**: `terrainSmoothing` = number of passes (default 4, range [0,8] clamped). Each pass applies the box mean once. `passes === 0` returns the input unchanged — byte-identical to pre-smoothing output (backward compatibility; existing seeds/fixtures unaffected).

## 4. Smoothing placement in the generation pipeline

**Decision (D4)**: apply smoothing in `generateBoard` after `generateElevationMap` (which enforces point symmetry) and before `extractWater`.

**Why**: FR-010's exact wording ("running after point-symmetry enforcement and before water classification"). Water classification then sees the smoothed elevation, so pools coalesce (documented side benefit: largest pool 1.7%→3.7%, pool count 27→6). No RNG is consumed by the pass — the elevation substream is already derived, and the pass is a pure function of the field + setting, so the PRNG discipline ("advances by one step per phase") is untouched.

**Alternatives rejected**:
- *Before symmetry enforcement* — would break the symmetry invariant (the pass must preserve the already-enforced symmetry; running before would require re-enforcing after).
- *After water classification* — water cells are classified by elevation threshold; smoothing after would leave water pools inconsistent with the smoothed field.
- *Inside `generateElevationMap`* — would couple the elevation generator to the smoothing setting and complicate the k=0 identity guarantee; a separate module is cleaner and independently testable.

## 5. `terrainSmoothing` settings plumbing

**Decision (D5)**: additive `GenerationSettings.terrainSmoothing: number` (integer, default 4, safe range [0,8]) plumbed through:
- `contracts/terrain-types.ts` (both mirrors) — field + JSDoc + `DEFAULT_GENERATION_SETTINGS.terrainSmoothing = 4`.
- `settings.ts` — `resolveSettings` gains one fallback line; `validateSettings` gains `'terrainSmoothing'` in `integerFields`.
- `clamp.ts` — `TERRAIN_SMOOTHING_MIN = 0`, `TERRAIN_SMOOTHING_MAX = 8`, `clampTerrainSmoothing(v)` (integer clamp via the existing `clampInt`), and `clampSettings` gains one line.
- `generate.ts` — `clampSettings`/`normalizeSettingsForPlayerCount` pass it through via the existing spreads; `effectiveSettings` (in `TerrainGenerationResult` and `MapStats`) surfaces the clamped value automatically because it is a `GenerationSettings` field.

**Why**: mirrors the `citiesPerPlayer` normalization pattern exactly (spec 003 v1.3: "surfaced via `effectiveSettings` (mirroring the `citiesPerPlayer` normalization pattern)"). No new result fields, no new request fields — the field rides the existing `GenerationSettings` shape end-to-end.

**Alternatives rejected**:
- *A separate `smoothing` request field outside `GenerationSettings`* — would break the "settings are the tunable knobs" contract and require new plumbing in `TerrainGenerationRequest`.
- *Rejecting out-of-range values* — FR-008 mandates clamping, never rejection.

## 6. Pipe color tokens — reuse canonical values

**Decision (D6)**: four new token NAMES in `packages/design/src/tokens.ts` reusing existing canonical values:

| Token | Value | Existing token with the same value | §3 pairing already measured |
| --- | --- | --- | --- |
| `pipeDownhill` | `#059669` | `color.green` | green on surface ≈ 4.71:1 (AA 1.4.3) |
| `pipeFlat` | `#f59e0b` | `color.accent` | accent on surface ≈ 8.26:1 (AA 1.4.11) |
| `pipeUphill` | `#dc2626` | `color.red` | red on surface ≈ 3.67:1 (AA 1.4.3 large / 1.4.11) |
| `pipeStalled` | `#9ca3af` | `color.textMuted` | text-muted on surface ≈ 6.99:1 (AA 1.4.3) |

**Why**: zero new hex literals (constitution V — the token table stays small), pairings already measured in `DESIGN.md` §3, and the additive (minor) change policy in `DESIGN.md` §6 applies. The pipe triangles are non-text indicators drawn on the canvas over terrain tiles; the §1.1 rows will state the measured pairing against the darkest land tile / void (the canvas context), and the §3 table gains the four rows with the non-text 1.4.11 target where claimed. The hollow-vs-filled triangle shape is the primary stalled cue (005 FR-013); gray is the secondary (color is never the only carrier — constitution VI).

**Alternatives rejected**:
- *New hex values* — unnecessary; the semantic colors already exist and are measured.
- *Intensity scaling* — explicitly rejected by 005 v1.2 ("no intensity scaling — a fixed three-color scheme").

## 7. Console slope classification — precompute in `buildMapView`

**Decision (D7)**: `CellRenderInfo` gains an additive `pipeSlopes: ReadonlyMap<Direction, PipeSlope>` field; `buildMapView` computes it per cell with pipes by looking up the destination cell in the visible-cells map (absent → `null` → flat fallback); the canvas painter reads it.

**Why**:
- The painter stays a dumb pixel pusher (single responsibility; the existing `drawPipes` signature grows only by reading the precomputed map).
- Classification is pure and unit-testable without a canvas.
- The DOM overlay (`grid-overlay.tsx`) can reuse `pipeSlopes` for accessible names ("pipe downhill", "pipe stalled") — the redundant encoding constitution VI asks for — without recomputing.
- The destination lookup is O(1) in the cells map; total cost is O(cells × pipes) per snapshot, far inside the 50 ms input budget (005 SC-003).

**Why not compute at paint time**: `drawPipes` would need the full cells map plus the classification function, coupling the painter to the mirror module and redoing the lookup per frame. Precomputation also makes the fog fallback explicit in one place (the destination lookup returns `null`).

**Diff logic note**: `diffCellChanges` does not need `pipeSlopes` — it is derived from `pipes` (already compared via `pipesEqual`) and static elevation, so a pipe-slope change always coincides with a pipes change. No diff change required.

## 8. Console mirror + drift pin

**Decision (D8)**: `src/render/pipe-slope.ts` exports:
- `PIPE_SLOPE_CONSTANTS` — a plain readonly object mirroring `flowBase`/`flowSlopeStep`/`flowSlopeDeltaCap` (typed as its own interface, not `EngineConstants`, to avoid a src import).
- `pipeFlowRate(delta, constants)` — the console-side formula mirror.
- `classifyPipeSlope(srcElev, dstElev | null, constants)` — the classification.

The drift test (`tests/unit/render/slope-drift.test.ts`) imports `ENGINE_CONSTANTS` and `flowRateForDelta` from `@europa/engine` (runtime — sanctioned by 005 v1.2: "a drift test importing @europa/engine constants pins the mirror") and asserts:
1. `PIPE_SLOPE_CONSTANTS` equals the three `ENGINE_CONSTANTS` fields.
2. `pipeFlowRate(Δ, PIPE_SLOPE_CONSTANTS)` equals `flowRateForDelta(Δ, ENGINE_CONSTANTS)` for Δ ∈ {−10..10} (including the stall boundary).

**Why**: the console src-boundary rule forbids runtime `@europa/engine` imports in `src/` (features 001/004 boundary; enforced by the conformance suite's type program). The mirror is the console's own module; the drift test pins it so a future engine retune fails loudly in the console suite.

## 9. Matchmaking — zero code change, verification only

**Decision (D9)**: no `packages/matchmaking` source change. `matchmaker.ts` builds `terrainSettings = { ...DEFAULT_GENERATION_SETTINGS, ...partial?.terrainSettings }` (line 239–242), so the new `terrainSmoothing` field flows through automatically; rematch reuses `match.settings.terrainSettings` (line 534), so the value carries over by construction (006 Implementation Notes).

**Verification test**: `tests/integration/terrain-smoothing-passthrough.test.ts` asserts (a) a create with `terrainSettings: { terrainSmoothing: 2 }` produces a match whose settings carry 2 and whose generated board's `effectiveSettings.terrainSmoothing` is 2; (b) an out-of-range value (e.g., 99) is clamped to 8 and surfaced; (c) a rematch reuses the original smoothing value.

## 10. Version discipline

**Decision (D10)**: no version bumps. The `EngineConstants` field swap is internal to the engine's own constants type — no downstream package constructs `EngineConstants` (they consume `ENGINE_CONSTANTS`), and the swap is enforced by the existing semantic-diff conformance tests (engine `contracts-drift.test.ts`). `GenerationSettings.terrainSmoothing` is additive (no `TERRAIN_API_VERSION` bump — additive fields are not breaking). `CellRenderInfo.pipeSlopes` is additive (console conformance suite enforces byte-identical mirrors). No wire surface changes.

## 11. Technology choices

No new runtime dependencies anywhere. Existing stack (verified current in the repo):
- TypeScript ≥ 5.6 strict, Biome 2 (four-space/120-column), Vitest 4 + v8 coverage, tsup 8, Vite 6 (console), tsx (scripts), Playwright (console E2E/component).
- All new logic is pure TypeScript with zero deps — no library research needed beyond what the repo already pins.

## 12. Sources

- Spec amendments: `specs/001-core-game-engine/spec.md` Clarifications v1.1/v1.2; `specs/003-procedural-terrain-generation/spec.md` Clarifications v1.3; `specs/005-client-console/spec.md` Clarifications v1.2; `specs/006-match-lifecycle-matchmaking/spec.md` Implementation Notes; `specs/007-player-manual/spec.md` v1.2/v1.3.
- Original-game reference (qualitative only — no numbers): `europa-source/games.dangerous-minds.net/Europa/html/Europa/rules.html` ("troop flow is assisted and impeded by the terrain") and `strategy.html` ("Its easy to go down a hill, but much more difficult to come up"). The gradient tuning is this spec's decision, not a reconstruction.
- Empirical grounding: the 200-seed × 32×32 delta sampling and reachable-land study recorded in 001 v1.1/v1.2 and 003 v1.3 (replicating `fbm.ts` + the smoothing pass exactly).
- Repo conventions: `AGENTS.md` (workflow rule 4 — specs/manual stay truthful; subagent reliability mitigations), `.specify/memory/constitution.md` (II determinism, III ≥80% coverage, V simplicity, VI a11y), `DESIGN.md` §6 (additive token policy), 012-design-system spec (FR-018 sync rule, G-04 guard).