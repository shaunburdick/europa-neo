# Data Model: Brand Asset Distribution

## `BrandAsset`

Logical entry in the generated manifest.

| Field | Type | Constraints |
|---|---|---|
| `id` | string literal union | Stable kebab-case identifier; unique in manifest. |
| `path` | string | Relative path below `brand/`; no `..`, leading slash, query, or fragment. |
| `format` | `'svg' \| 'png' \| 'ico' \| 'webmanifest'` | Matches extension and emitted MIME. |
| `width` | number \| null | Positive integer for raster assets; null for scalable SVG/manifest. |
| `height` | number \| null | Positive integer for raster assets; null for scalable SVG/manifest. |
| `purpose` | `'logo' \| 'favicon' \| 'apple-touch' \| 'pwa' \| 'maskable' \| 'social' \| 'metadata'` | Consumer intent, not visual color meaning. |
| `background` | `'light' \| 'dark' \| 'transparent' \| 'opaque' \| 'mixed'` | Documented intended surface. |
| `alt` | string \| null | Meaningful in-page image equivalent; null for browser metadata/decorative generated files. |
| `safeArea` | `{ shape: 'circle'; diameterRatio: 0.8 }` \| null | Required for maskable assets; null otherwise. |

The manifest is `readonly`, sorted by `id`, and exported from
`@europa/design/brand`. Its file paths are the only paths consumers may use.

## Authoritative asset inventory

### SVG masters (nine)

| ID | Path | Intended use |
|---|---|---|
| `lockup` | `masters/lockup.svg` | Combined default lockup; documented default surface |
| `emblem` | `masters/emblem.svg` | Standalone default emblem |
| `lockup-light` | `masters/lockup-light.svg` | Light background |
| `lockup-dark` | `masters/lockup-dark.svg` | Dark background |
| `lockup-mono` | `masters/lockup-mono.svg` | Monochrome/print |
| `emblem-light` | `masters/emblem-light.svg` | Light background |
| `emblem-dark` | `masters/emblem-dark.svg` | Dark background |
| `emblem-mono` | `masters/emblem-mono.svg` | Monochrome/print |
| `emblem-compact` | `masters/emblem-compact.svg` | Header fallback below 160 CSS px |

Master paths are source-only. Distribution exports use stable generated names
such as `europa-neo-lockup-dark.svg`; consumers never import `src/brand`.

### Generated files

| File | Dimensions/metadata | Purpose |
|---|---|---|
| `favicon.svg` | SVG emblem only | Modern browser favicon |
| `favicon.ico` | Exactly three PNG-backed ICO directory entries: one 16×16, one 32×32, and one 48×48; no other entries | Legacy/browser fallback |
| `apple-touch-icon.png` | 180×180 opaque PNG | Apple home screen |
| `icon-192.png` | 192×192 PNG | PWA `any` icon |
| `icon-512.png` | 512×512 PNG | PWA `any` icon |
| `icon-512-maskable.png` | 512×512 opaque PNG; essential mark inside centered 80% circle | PWA `maskable` icon |
| `europa-neo-social.png` | 1200×630 PNG; documented margins | OG/Twitter/share preview |
| `site.webmanifest` | JSON, local relative icon paths | PWA metadata |

The generated distribution also contains the nine consumer-facing SVG variant
files corresponding to the masters. All generated files are reproducible from
the master tree and generator version/configuration.

## State transitions

`source master → validated → generated → exported → staged → served`.

- A failed source validation cannot enter `generated`.
- A missing or stale generated file cannot enter `exported`.
- A missing staged file fails the consumer build; there is no fallback state.
- A served response must be a local file with a manifest-declared MIME type.

## Validation invariants

1. Every manifest entry resolves to one package-owned distribution file.
2. Every generated distribution file is manifest-listed, except explicitly
   documented build metadata files.
3. Every SVG has a viewBox, parses successfully, and contains no raster,
   external reference, font, script, animation, or network dependency.
4. Raster dimensions equal the inventory exactly. `favicon.ico` contains exactly
   three PNG-backed directory entries: one 16×16, one 32×32, and one 48×48, with
   no undocumented extra entries or duplicate dimensions.
5. Manifest icon paths are relative and resolve from the manifest directory.
6. Lockup accessibility uses “Europa Neo”; decorative repeats use empty alt or
   `aria-hidden`; logo-only links have an accessible name.
7. Variant contrast meets 4.5:1 for normal wordmark text and 3:1 for essential
   marks on documented backgrounds. Color is never the sole distinction.
8. Staged files and package exports are byte/content-identical to the declared
   distribution source; documentation inventory and tests agree.
