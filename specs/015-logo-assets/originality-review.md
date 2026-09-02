# Originality and Licensing Review — Feature 015 Logo Assets

**Date:** 2026-09-02
**Reviewer:** Implementation engineer (automated review gate)
**Branch:** `issue-54-logo`
**Spec:** `specs/015-logo-assets/spec.md`

## 1. Authoring Process

All SVG artwork in `packages/design/src/brand/masters/` was hand-authored as original
vector artwork based on the approved art direction in `design-direction.md`. The process
was:

1. **Product owner supplied reference artwork** — a visual mockup serving as
   compositional inspiration (layout, element placement, energy beam direction).
2. **Engineer normalized and authored original SVGs** — every path, shape, gradient,
   and composition element was created from scratch as new vector geometry. The mockup
   was used solely as a compositional reference; no raster pixels were sampled, traced,
   or copied.
3. **Wordmark treatment** — the "EUROPA NEO" wordmark uses the Montserrat ExtraBold
   (weight 800) typeface. The font was converted to vector paths in the SVG masters,
   eliminating any runtime font dependency. The vendored `Montserrat-ExtraBold.woff2`
   file exists in `packages/design/src/brand/fonts/` for build-time rasterization only
   (via `@resvg/resvg-js`) and is not loaded by the browser at runtime.
4. **Product owner reviewed and approved** — visual review gate passed before any
   generation or integration work began (see T-006, T-009).

## 2. Dependency and Tool Licenses

| Dependency | License | Usage | Runtime? |
|---|---|---|---|
| Montserrat ExtraBold 800 | SIL Open Font License 1.1 | Converted to paths in SVG masters; vendored `.woff2` used only by `@resvg/resvg-js` for deterministic rasterization at build time | No — paths only in output |
| `@resvg/resvg-js` ^2.6.2 | MIT | Deterministic SVG-to-PNG rasterization in the build pipeline; system fonts disabled; no remote resources | No — build-time only |

**No other creative dependencies.** The `@resvg/resvg-js` package is a devDependency
of `@europa/design` and is never shipped to consumers. The Montserrat font file is
vendored under `packages/design/src/brand/fonts/` with its SIL OFL 1.1 license file
(`Montserrat-LICENSE.txt`) co-located.

## 3. Negative Checks

All of the following were verified and confirmed **did not occur**:

- [x] **No mockup pixels traced or copied** — SVG masters are original vector geometry;
  the mockup was compositional inspiration only per `design-direction.md` §1.
- [x] **No `europa-source/` artwork referenced** — `europa-source/` carries an SOS
  license (© Alex Nicolaou) and is reference-only per AGENTS.md binding decision 5.
  Grep of `packages/design/src/brand/` for `europa-source` returns zero matches.
  `git diff main...HEAD --name-only -- europa-source/` confirms no files in that
  directory were modified on this branch.
- [x] **No third-party trademarks or logos used** — all shapes (Europa planet/moon,
  shield frame, circuit traces, energy beam) are original compositions.
- [x] **No restricted-license fonts** — Montserrat is SIL OFL 1.1, a permissive
  open-source license explicitly allowing embedding and redistribution with software.
  No Reserved Font Name restrictions apply to the bundled subset.
- [x] **No remote/CDN assets loaded at runtime** — grep of all 10 SVG masters for
  `http`, `ftp`, `url(`, `@import`, `<image`, `<use`, `<script`, `<foreignObject`,
  `<iframe`, `<object`, `<embed`, `<link>` returns zero matches. All assets are
  self-contained inline vector graphics.

## 4. SVG Self-Containment Verification

The SVG validation pipeline (`packages/design/src/brand/validate-svg.ts`) enforces
the following at build time and in tests:

- No external URLs (http/https/ftp/file/javascript/blob/data references)
- No `<font-face>`, `font-family`, or `@import` declarations
- No `<script>`, `<foreignObject>`, `<iframe>`, `<object>`, `<embed>` elements
- No `<use>` or `<image>` elements referencing external resources
- No doctype, entity, or stylesheet declarations
- Only safe elements from an explicit allowlist
- No event handlers (`on*` attributes)

All 10 SVG masters pass these checks. The source SVGs contain no embedded raster
images, no external references, and no executable content.

## 5. Approval Chain

```
Product owner → reference artwork (compositional mockup)
       ↓
Engineer → normalized + authored original SVGs from scratch
       ↓
Product owner → visual review and approval (T-006 gate)
       ↓
Automated validation → structural, palette, and self-containment checks
       ↓
This review → licensing and originality sign-off
```

## 6. Summary

| Check | Status |
|---|---|
| SVGs are original vector artwork | PASS |
| No raster tracing or pixel copying | PASS |
| No `europa-source/` artwork used | PASS |
| No third-party trademarks/logos | PASS |
| Font license (SIL OFL 1.1) verified | PASS |
| No restricted-license dependencies | PASS |
| No remote/CDN runtime assets | PASS |
| SVGs are fully self-contained | PASS |
| Build-time tool license (MIT) verified | PASS |
| `europa-source/` unmodified on branch | PASS |
| Approval chain documented | PASS |
