# Acceptance Review: Feature 015 — Logo and Favicon/Icon Set

**Reviewer:** Implementation engineer (T-035)
**Date:** 2026-09-02
**Branch:** `issue-54-logo`
**Spec:** `specs/015-logo-assets/spec.md` v1.3

---

## AC-001 — SVG masters, validation, and variants

**Verdict: PASS**

### Evidence

**10 master SVGs present** under `packages/design/src/brand/masters/`:

| # | File | Purpose |
|---|------|---------|
| 1 | `lockup.svg` | Default horizontal lockup |
| 2 | `lockup-dark.svg` | Dark-background lockup |
| 3 | `lockup-light.svg` | Light-background lockup |
| 4 | `lockup-mono.svg` | Monochrome lockup |
| 5 | `lockup-vertical.svg` | Retained vertical lockup |
| 6 | `emblem.svg` | Default standalone emblem |
| 7 | `emblem-dark.svg` | Dark-background emblem |
| 8 | `emblem-light.svg` | Light-background emblem |
| 9 | `emblem-mono.svg` | Monochrome emblem |
| 10 | `emblem-compact.svg` | Compact emblem for constrained headers |

**Validation rejects external/raster references**: `packages/design/src/brand/validate-svg.ts` enforces a safe SVG element allowlist, rejects `<image>`, `<use>` to external resources, `http`/`https`/`ftp`/`javascript`/`blob` URLs, `<script>`, `<foreignObject>`, event handlers (`on*` attributes), font references, doctype/entity/stylesheet declarations, and malformed XML. Tests in `validate-svg.test.ts` and `source.test.ts` verify all 10 masters pass and forbidden content is rejected.

**Combined (lockup) and standalone (emblem) variants exist**: 5 lockup variants + 5 emblem variants = 10 masters. Both combined and standalone categories are represented.

**Test**: 267 design package tests all pass (39 test files). Source SVG tests (`source.test.ts`) validate inventory, title/description, geometry invariance between treatments, no-forbidden-content, and combined-lockup size limits.

---

## AC-002 — Raster dimensions and ICO structure

**Verdict: PASS**

### Evidence

**favicon.ico** binary inspection (6,518 bytes):
- 3 ICO directory entries: **16×16**, **32×32**, **48×48** ✓
- Type = 1 (ICO), reserved = 0

**PNG icon dimensions** (verified via IHDR chunk parsing):

| File | Dimensions | Expected |
|------|-----------|----------|
| `apple-touch-icon.png` | **180×180** ✓ | 180×180 |
| `icon-192.png` | **192×192** ✓ | 192×192 |
| `icon-512.png` | **512×512** ✓ | 512×512 |
| `icon-512-maskable.png` | **512×512** ✓ | 512×512 |
| `europa-neo-social.png` | **1200×630** ✓ | 1200×630 |

**Test**: `generated-output.test.ts` validates every manifest asset's dimensions, binary signatures, ICO cardinality through the existing parser, and byte-identical reproducibility. The generator assertion (`assert-brand-output.ts`) also enforces the same output contract.

---

## AC-003 — Emblem not clipped at target sizes

**Verdict: PASS**

### Evidence

**Maskable safe-area tests** (`generate.test.ts`): Verifies 15 conservative boundary points from authored space. The maximum transformed distance from center is ~198.58 px, within the safe radius of 204.8 px (>6.2 px margin). The test also decodes the actual rendered 512×512 maskable PNG and measures every non-plate pixel against the manifest's centered circle (`diameterRatio: 0.8`). Both the standalone SVG helper and the generated `icon-512-maskable.png` artifact are verified. A regression proves `scale(0.8)` would have clipped shield corners, confirming `scale(0.72)` is mathematically necessary.

**Visual review** (`visual-review.md`): Documents that at 16×16 the shield silhouette remains the primary recognition cue; at 32×32 the shield + moon are distinguishable; at 48×48 the full emblem details are visible; at 180×180+ all internal details are crisp. The maskable icon uses `scale(0.72)` with the full shield, moon, circuitry, and energy beams within the safe circle.

**Size inventory** (from visual-review.md §1): All renderings from `createIconSvg` wrap the emblem in a 512×512 SVG with the emblem at scale 1, then resvg renders to target dimensions. No clipping occurs.

---

## AC-004 — Contrast and non-color distinction

**Verdict: PASS**

### Evidence

**A11y contrast tests** (`packages/console/tests/a11y/logo-accessibility.test.tsx`): 10 test cases covering:
- Meaningful logo names (axe image-alt and redundant-name rules)
- Decorative hidden/empty alt (axe presentation-role checks)
- Logo-only link names (WCAG 2.4.4 / 4.1.2)
- Contrast — footer text colors meet WCAG AA against backgrounds (axe color-contrast)
- Keyboard focus — logo elements do not trap focus; interactive elements are keyboard-operable
- Compact fallback — responsive CSS properly hides/shows logo variants
- Reduced-motion — `prefers-reduced-motion: reduce` is respected

**Visual review** (`visual-review.md` §2.6): Variant treatment comparison table documents that monochrome replaces blue (`#374151`) and orange (`#6b7280`) with gray values while maintaining identical geometry. Terminal shapes (square vs. triangular) and route topology (left vs. right positioning) provide redundant non-color cues. The collision core uses a 4-stop gray gradient instead of the warm red/orange gradient.

**Review finding — monochrome non-color distinction**: "The monochrome treatment replaces the blue channel gradient with `#374151` (dark gray) and the orange channel with `#6b7280` (medium gray). The terminal shapes (square vs. triangular) and route topology (left vs. right positioning) provide redundant non-color cues. This satisfies FR-004."

---

## AC-005 — Console integration without regression

**Verdict: PASS**

### Evidence

**T-022 console integration tests** (`brand-logo-integration.test.tsx`): 10 test cases verifying:
- Lobby lockup renders with correct `alt="Europa Neo"` and `src="assets/brand/europa-neo-lockup-dark.svg"`
- Logo does not duplicate the page heading name as adjacent text
- Logo renders for unnamed visitors
- Logo renders in failure state
- Footer emblem renders with empty `alt=""` and `aria-hidden="true"`
- Footer emblem uses correct asset path

**T-023 responsive CSS tests** (`logo-responsive.test.tsx`): 10 test cases verifying:
- 160 CSS px lockup threshold (FR-005)
- Emblem fallback (broken lockup img shows emblem background)
- Intrinsic dimensions (width/height prevent CLS)
- No overflow (containers never cause horizontal overflow)
- Focus preservation (logo link gets visible focus ring)
- Reduced-motion (transitions disabled under `prefers-reduced-motion`)

**T-029 a11y tests** (`logo-accessibility.test.tsx`): 10 test cases with axe-core scans covering all seven logo-specific a11y requirements. No violations reported.

**Existing console tests**: 709 tests all pass across 61 test files. No regressions.

---

## AC-006 — Package exports and manual metadata

**Verdict: PASS**

### Evidence

**T-014 package exports** (`package-surface.test.ts`): Verifies:
- `@europa/design/brand` exports typed manifest and metadata (`index.d.ts` + `index.js`)
- `@europa/design/brand/*` wildcard resolves to `./dist/brand/*`
- `BRAND_MANIFEST` loads at runtime and exposes all assets
- No master source files leak through exports

**Package.json exports** (confirmed):
```json
"./brand": { "types": "./dist/brand/index.d.ts", "import": "./dist/brand/index.js" },
"./brand/*": "./dist/brand/*"
```

**T-017 manual staging tests** (`manual-layout.test.ts`): Verifies:
- Every local brand reference in `_layouts/default.html` uses `| relative_url`
- Share metadata (og:image, twitter:card) is present
- Accessible names and decorative hidden attributes are correct
- No root-absolute asset URLs
- Shared layout applies to all 14 manual Markdown pages

**Manual layout metadata** (from `docs/manual/_layouts/default.html`):
- Favicon SVG/ICO, Apple touch icon, manifest, OG/Twitter preview all present
- Logo in header with `aria-hidden="true"` and `alt=""`
- All paths use `| relative_url` for Pages base-path support

**T-019 Pages workflow** (`.github/workflows/pages-deploy.yml`):
- Builds `@europa/design` before Jekyll
- Stages brand assets via `pnpm --filter @europa/design stage:manual`
- Path filter gates on `packages/design/**` and `docs/manual/**`

---

## AC-007 — pnpm host and Docker staging

**Verdict: PASS**

### Evidence

**T-026 host MIME tests**: `packages/console/scripts/host.ts` serves brand assets with correct MIME types:
- `.svg` → `image/svg+xml`
- `.png` → `image/png`
- `.ico` → `image/x-icon`
- `.webmanifest` → `application/manifest+json; charset=utf-8`

**T-027 Docker smoke** (`scripts/docker-smoke.sh`): Builds single-port image from no-cache context, reads `@europa/design/brand` manifest inside the image, verifies every selected asset is present in `packages/console/dist/assets/brand`, and checks served Content-Type. The Dockerfile stages assets from `@europa/design` at build time.

**Cross-surface integration tests** (`cross-surface.test.ts`): Proves console, manual, host, and Docker references resolve to locally staged design distribution files rather than competing copies. Byte-identical verification between design dist and staged outputs.

**Console index.html metadata** (confirmed):
- `favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `site.webmanifest`
- `og:image`, `og:image:alt`, `og:image:type`, `og:image:width`, `og:image:height`
- `twitter:image`, `twitter:image:alt`
- All using relative URLs (Vite base-path mechanism)

---

## AC-008 — Test coverage and 80% gate

**Verdict: PASS**

### Evidence

**Design package coverage** (Vitest with coverage):
| Metric | Coverage |
|--------|----------|
| Statements | **94.07%** (698/742) ✓ |
| Branches | **84.68%** (387/457) ✓ |
| Functions | **98.95%** (95/96) ✓ |
| Lines | **95.39%** (663/695) ✓ |

**Console package coverage**:
| Metric | Coverage |
|--------|----------|
| Statements | **91.19%** (1646/1805) ✓ |
| Branches | **83.43%** (831/996) ✓ |
| Functions | **91.48%** (333/364) ✓ |
| Lines | **91.13%** (1625/1783) ✓ |

**Test counts**:
- Design package: **267 tests** across 39 test files (brand: masters, source, generated-output, validate-svg, inventory, paths, ico, drift, cross-surface, manual-layout, package-surface, staged-asset-integrity, generate, generator-ico, vendor-to-docs, web-manifest)
- Console package: **709 tests** across 61 test files (including brand-logo-integration, logo-responsive, logo-accessibility, cross-surface, and all existing suites)

**All ≥80% on every metric** ✓

---

## AC-009 — DESIGN.md documentation and drift tests

**Verdict: PASS**

### Evidence

**T-015 DESIGN.md** documents:
- Complete source inventory (10 masters) with paths, descriptions, and backgrounds
- Complete generated distribution inventory (17 files) with formats and dimensions
- Package export contract (`@europa/design/brand` + `@europa/design/brand/*`)
- Build-time staging rules for manual, console, host, and Docker
- Brand palette extension (`#3b82f6`, `#f97316`) with product-approval
- Clear-space, minimum-size, and variant-selection rules
- Accessibility rules (meaningful alt, decorative hidden, contrast requirements)
- Original-artwork and licensing statement

**T-018 drift tests** (`drift.test.ts`):
- Manifest ↔ files drift: fails if inventory file is added/removed without manifest update
- Source ↔ generated output drift: fails if masters change without regeneration
- Package exports drift: fails if `@europa/design/brand` export is removed/renamed
- DESIGN.md drift: fails if master or generated file is added/removed without documentation update
- Manual staging drift: fails if staged files don't match design distribution

---

## AC-010 — Originality and licensing review

**Verdict: PASS**

### Evidence

**Originality review document** (`originality-review.md`):
- All SVG artwork hand-authored as original vector geometry
- No mockup pixels traced or copied ✓
- No `europa-source/` artwork referenced ✓ (grep returns zero matches)
- No third-party trademarks or logos used ✓
- No restricted-license fonts — Montserrat is SIL OFL 1.1 ✓
- No remote/CDN assets loaded at runtime ✓
- SVGs are fully self-contained ✓
- Build-time tool (`@resvg/resvg-js`) is MIT licensed ✓
- `europa-source/` unmodified on branch ✓
- Approval chain documented: PO → engineer → PO review → automated validation → licensing sign-off

---

## AC-011 — PO visual review of primary lockup composition

**Verdict: PASS**

### Evidence

**Product-owner approval** (documented in `orchestration.md` §Product-Owner Checkpoint):
- PO rejected initial logo direction as diverged from reference
- PO clarified revised primary lockup must retain full composition as original vector artwork
- PO approved **Option B**: preserve the supplied artwork while normalizing it for production
- PO follow-up corrected wordmark placement: normalized path wordmark is clipped and centered over upper moon/shield area in every lockup treatment

**Visual review** (`visual-review.md` §2):
- **Europa planet/moon**: Circle at `(256, 248)` with `r=112`, with cracked terrain surface details
- **Icy outer shield/frame**: 7-vertex polygon with gradient border, occupies ~368×436 units
- **Circuitry behind the planet**: 17 stroke paths with 10 node circles, clipped to shield, rendered at 35% opacity behind moon
- **Blue-vs-orange energy beam**: Two opposing arrow-shaped gradient beams (blue left-to-right, orange right-to-left) with octagonal collision core and sparks
- **EUROPA-over-NEO wordmark**: Montserrat ExtraBold converted to paths, positioned via `translate(256 100) scale(.55)` centered in upper moon area — `EUROPA` is visually dominant over `NEO`

**Clarification #9 (spec v1.4)**: "The normalized Montserrat path wordmark is layered over the upper portion of the moon/shield in every lockup treatment. It MUST remain entirely visible, within the SVG viewBox, and outside the shield and moon clipping masks; it MUST NOT be positioned as an external label to the right of the shield."

**Composition elements verified**:
- ✓ Europa planet/moon central visual
- ✓ Icy outer shield/frame
- ✓ Circuitry behind the planet
- ✓ Strong horizontal blue-versus-orange energy beam/clash
- ✓ Clear `EUROPA`-over-`NEO` wordmark hierarchy
- ✓ Wordmark sits over upper moon/shield area (not external right-hand label)
- ✓ Full composition present — not abstract shield-only or route-only substitute

---

## Overall Verdict: **ALL 11 ACCEPTANCE CRITERIA PASS**

| AC | Description | Verdict |
|----|-------------|---------|
| AC-001 | SVG masters, validation, variants | **PASS** |
| AC-002 | Raster dimensions and ICO structure | **PASS** |
| AC-003 | Emblem not clipped at target sizes | **PASS** |
| AC-004 | Contrast and non-color distinction | **PASS** |
| AC-005 | Console integration without regression | **PASS** |
| AC-006 | Package exports and manual metadata | **PASS** |
| AC-007 | pnpm host and Docker staging | **PASS** |
| AC-008 | Test coverage ≥80% | **PASS** |
| AC-009 | DESIGN.md documentation and drift tests | **PASS** |
| AC-010 | Originality and licensing review | **PASS** |
| AC-011 | PO visual review of composition | **PASS** |

### Repository Gate Status (T-034)
- Typecheck: ✓ (all packages clean)
- Lint: ✓ (zero errors, zero warnings)
- Format: ✓ (clean repo-wide)
- Design tests: ✓ (267/267)
- Console tests: ✓ (709/709)
- Coverage: ✓ (all ≥80% on every metric)
- Branch: `issue-54-logo`
- Commit history: clean conventional commits from T-001 through T-035

### Minor Observations (non-blocking)
1. Social preview top margin: `createSocialSvg` places lockup at y=59, below design direction's 72px minimum for `<g>` origin, but effective artwork margin is ~102px (adequate). Cosmetic only.
2. `lockup-light.svg` wordmark uses same fill/stroke as dark variant — the dark stroke (`#0f172a`, 3px) provides contrast against the light shield. Valid technique at 160px+ display width.
