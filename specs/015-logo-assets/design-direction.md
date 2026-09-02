# Europa Neo Logo — Original-Art Direction Sheet

**Feature:** 015-logo-assets
**Status:** Approved direction for SVG authoring
**Owner:** `packages/design`

This sheet freezes the visual decisions needed to author the nine SVG masters. It
is an implementation brief, not a finished logo. All geometry must be authored
as new vector work in `packages/design/src/brand/masters/`; no raster tracing,
pixel sampling, or artwork reuse is permitted.

## 1. Design idea

The mark is a compact **ice-core shield**: a faceted, upright enclosure around
two opposing signal paths. It should suggest a frozen moon, engineered terrain,
and a tactical contest without depicting a literal planet, weapon, animal, or
letterform. The wordmark is a quiet technical counterweight to the energetic
emblem: `Europa` on the first line and `Neo` on the second in the same
system-font-independent outlined geometry used by the master, not a bundled or
remote font.

The identity is recognized by its silhouette and internal construction first;
blue and orange are supporting team treatments, never the only identifying
information.

## 2. Canonical geometry

### 2.1 Coordinate system

- Draw the emblem in a square `0 0 256 256` viewBox.
- Use a 16-unit construction grid. Primary vertices sit on grid intersections;
  secondary cuts may use 8-unit subdivisions.
- Keep the silhouette inside `x=24..232`, `y=16..240`. This leaves 24 units of
  intrinsic breathing room on every side and gives a stable crop for square
  icons.
- Use filled paths and straight line segments only for the core silhouette.
  Rounded joins are allowed on signal terminals, but no filter, raster image,
  external resource, animation, or font dependency is allowed.

### 2.2 Emblem construction

1. **Outer shield:** an asymmetric-but-balanced six-vertex outline: a broad
   shoulder at `(48,64)`, upper crown at `(128,24)`, opposite shoulder at
   `(208,64)`, then two lower shoulders at `(192,184)` and `(128,232)`, and
   `(64,184)`. Close the path. The lower point is the visual anchor; do not
   flatten it into a generic badge.
2. **Ice facets:** inset the shield by 16 units to form a continuous inner
   field. Split that field with two diagonal seams descending toward the lower
   anchor. Seams are structural negative space, not decorative texture: retain
   them in monochrome and at compact size.
3. **Signal channels:** place two separate angular paths on opposite sides of
   the centerline. Each starts at a shoulder terminal, makes two 45-degree
   turns, and terminates before the lower point. The channels must never touch
   each other or merge into a single lightning bolt.
4. **Conflict core:** reserve a narrow vertical negative-space gap of at least
   12 units between the channels. The gap must remain visible at 16 px after
   rasterization. Add one small central hexagonal node, no larger than 32 units
   across, between the channels; it is the shared objective, not a third team.
5. **Terminals:** terminate each channel with a distinct geometric cap: the
   blue-side path ends in a squared cap, while the orange-side path ends in a
   triangular cap. Caps must remain visible when colors are removed.
6. **Stroke discipline:** where strokes are used for seams or channels, use a
   nominal 12-unit width at master scale, round line joins, and butt/round caps
   consistently within a treatment. Do not use hairlines below 8 units in the
   emblem master; they will disappear in favicon sizes.

The resulting silhouette should read as one shield at a glance, then as two
separated routes converging on a shared node. It must not depend on a letter
inside the shield to be recognizable.

### 2.3 Lockup geometry

- Use a `640 0 640 256` viewBox for the horizontal lockup.
- Place the emblem at `x=0..256`, aligned to the wordmark's optical cap height.
- Keep a 32-unit gap between emblem and wordmark boundary.
- Set the wordmark block to `x=288..624`, vertically centered. `Europa` is the
  dominant line; `Neo` is subordinate but not smaller than 60% of the dominant
  line height.
- Construct the wordmark as stable outlined paths or simple authored geometric
  letterforms. Do not rely on a user's installed font, a web font, text layout,
  or external font file.
- The combined lockup must preserve the emblem's clear space and must not add a
  slogan, subtitle, tag line, or extra symbol.

## 3. Composition and optical balance

- The emblem owns approximately 40% of the lockup's width; the wordmark owns
  approximately 53%; the remaining width is the required gap and side padding.
- The emblem is visually heavier than the wordmark. Compensate by centering the
  wordmark block on its combined two-line mass rather than its first line.
- Keep the center node on the emblem's vertical axis. Internal channels may be
  mirrored in direction, but their negative-space gap and terminal scale must
  remain equal.
- Do not add stars, orbit rings, battle damage, gradients, drop shadows, glow,
  bevels, or perspective. Flat geometry is intentional and survives every
  output size and background.
- Light, dark, and monochrome treatments change fills and value hierarchy only;
  they do not move vertices, change proportions, or alter the channel topology.

## 4. Clear space and placement

Define `u` as the width of the emblem's central node. The minimum clear space is
`2u` on every side of the standalone emblem and around the entire horizontal
lockup. If the node is too small to measure in a consumer, use 8% of the
asset's shorter dimension, whichever is larger.

- No text, UI control, border, crop, or decorative background detail may enter
  the clear-space zone.
- For a square icon, center the complete emblem inside the canvas; do not use
  the intrinsic 24-unit viewBox margin as a substitute for consumer clear
  space.
- For the horizontal lockup, align the emblem and wordmark on a common optical
  centerline. Do not vertically align to a browser header's text baseline.
- In a social composition, reserve at least 96 px on the left and right and
  72 px on the top and bottom before placing the lockup.
- If available space cannot honor clear space, use the compact emblem rather
  than scaling the full lockup until its wordmark becomes illegible.

## 5. Background and treatment matrix

| Treatment | Intended background | Construction | Required behavior |
|---|---|---|---|
| Default lockup/emblem | Transparent or `surface` | Balanced two-channel color treatment | Use only where the surrounding surface is stable and uncluttered. |
| Light lockup/emblem | Light, near-white page surface | Dark outline/wordmark with saturated channel fills | Keep the outer silhouette and node readable without a plate. |
| Dark lockup/emblem | `surface` / `page-bg` / `void-bg` | Light outline/wordmark with channel fills | Preferred console treatment; no glow is needed to separate it from the UI. |
| Monochrome lockup/emblem | Print, emboss, one-ink, or unknown background | One value family with positive/negative channel geometry | Preserve the channel gap, unequal terminal shapes, and center node. Never substitute grayscale shades as the only team cue. |
| Compact emblem | Constrained dark or light header | Emblem geometry with simplified internal seams | Use below 160 CSS px lockup width; preserve silhouette, node, channel gap, and terminal shapes. |

Transparent artwork is not a universal fallback. If the surface is busy,
photographic, or insufficiently contrasting, place the mark on an opaque token
plate before rendering it. The plate belongs to the consumer composition, not
inside the transparent master.

## 6. Blue/orange conflict treatment without color dependence

Blue and orange identify the two opposing signal channels in the full-color
treatments. They must also differ by **shape, value, and topology**:

- **Blue channel:** squared terminal cap, continuous single-width route, darker
  value against a light treatment and lighter value against a dark treatment.
- **Orange channel:** triangular terminal cap, one deliberate 45-degree elbow
  nearer the center node, brighter value against a dark treatment and darker
  value against a light treatment.
- Keep the channels spatially separated by the central gap. Do not overlay them
  or use a color blend to imply conflict.
- In monochrome, blue becomes the lower-value route and orange the higher-value
  route, while the square/triangle caps and elbow placement remain unchanged.
- In compact output, retain the square-versus-triangle terminal pair and the
  left/right route placement. Remove only secondary facet seams that would
  collapse at the target size; never remove the central gap.
- Any consumer label, legend, or accessibility text must name the side/team
  rather than saying “the blue one” or “the orange one.”

This provides at least three independent cues—terminal shape, route topology,
and relative value—before color is considered.

## 7. Minimum sizes and simplification rules

| Variant | Minimum display size | Guidance |
|---|---:|---|
| Full lockup | 160 CSS px wide | Below this threshold, switch to compact emblem; never squeeze the wordmark. |
| Standalone emblem | 16 CSS px square | At 16–24 px use the bold outer silhouette, center node, gap, and terminal shapes only. |
| Compact emblem | 16 CSS px square | Same minimum as the emblem; no wordmark and no extra micro-detail. |
| Apple/PWA icon | 180, 192, 512 px | Use centered opaque composition with the mark inside the documented safe area. |
| Favicon | 16, 32, 48 px | Emblem only; use the simplified compact geometry at all three layers. |
| Social preview | 1200×630 px | Use the full lockup with the prescribed 96/72 px minimum margins and a quiet dark field. |

At 16 px, the outer shield must occupy no less than 12 px of the shorter
dimension after clear-space padding. The node must remain a visible solid or
negative-space hexagonal cue, and the two terminal shapes must not fuse. If a
renderer cannot preserve those constraints, use the compact variant rather
than adding a stroke or enlarging beyond the canvas.

## 8. Authoring guardrails

- The nine masters share geometry through authored path data or a documented
  local generation step; consumer files must be generated from those masters.
- Every standalone emblem includes a meaningful title and description. A
  meaningful in-page lockup exposes the accessible text “Europa Neo”; a
  decorative repetition is empty-alt or hidden from assistive technology.
- Use existing `@europa/design` tokens or a documented brand-token extension for
  all color values. Do not introduce console-only literals.
- Keep all SVGs self-contained: no `<image>`, external references, stylesheets,
  fonts, scripts, animation, or network URLs.
- This direction is wholly original project work. No third-party mark, source
  artwork, restricted typeface, or externally fetched visual material may enter
  the master or any generated asset.

## 9. Review checklist for the first rendered sheet

- [ ] Shield silhouette is identifiable without color or wordmark.
- [ ] Channel gap, square/triangle terminal pair, and center node survive 16 px.
- [ ] Lockup remains readable at 160 CSS px and switches cleanly to compact form.
- [ ] Light, dark, and monochrome treatments are geometrically identical.
- [ ] Clear space is visible on transparent, light, dark, and social compositions.
- [ ] Blue/orange conflict remains distinguishable when rendered grayscale.
- [ ] No gradients, glow, font dependency, external resource, or non-original
      artwork has entered the authoring tree.
