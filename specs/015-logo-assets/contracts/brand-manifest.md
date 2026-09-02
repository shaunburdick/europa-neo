# Contract: `@europa/design/brand`

The brand subpath is a package contract, not an implementation detail.

```ts
export type BrandFormat = 'svg' | 'png' | 'ico' | 'webmanifest';
export type BrandPurpose =
    | 'logo'
    | 'favicon'
    | 'apple-touch'
    | 'pwa'
    | 'maskable'
    | 'social'
    | 'metadata';

export interface BrandAsset {
    readonly id: string;
    readonly path: `brand/${string}`;
    readonly format: BrandFormat;
    readonly width: number | null;
    readonly height: number | null;
    readonly purpose: BrandPurpose;
    readonly background: 'light' | 'dark' | 'transparent' | 'opaque' | 'mixed';
    readonly alt: string | null;
    readonly safeArea: { readonly shape: 'circle'; readonly diameterRatio: 0.8 } | null;
}

export interface BrandManifest {
    readonly version: 1;
    readonly assets: readonly BrandAsset[];
    readonly generatedFrom: 'packages/design/src/brand/masters';
}

export declare const BRAND_MANIFEST: BrandManifest;
```

Package exports MUST resolve as follows:

- `@europa/design/brand` → generated `dist/brand/index.js` and declarations;
- `@europa/design/brand/*` → files below generated `dist/brand/` only.

Consumers may select a manifest entry and stage its declared `path`; they may
not import source masters or maintain a copied master. A consumer build fails if
the selected path, format, or dimensions do not match the manifest.

## Web manifest contract

`site.webmanifest` is local JSON served as `application/manifest+json` and has:

- `name: "Europa Neo"`, `short_name: "Europa Neo"`, `display: "standalone"`;
- relative local paths for `icon-192.png`, `icon-512.png`, and
  `icon-512-maskable.png`;
- `purpose: "any"` on the normal icons and `purpose: "maskable"` on the
  maskable entry;
- `theme_color` and `background_color` derived from documented design tokens;
- no absolute root path, CDN URL, remote font, or network dependency.

## HTML metadata contract

Both console and manual entry layouts must reference local, base-path-aware
URLs for favicon SVG/ICO, Apple touch icon, manifest, `og:image`, and
`twitter:image`. The social metadata must include width 1200, height 630, PNG
type, descriptive alt text, and `summary_large_image`. The manual uses Jekyll's
`relative_url`; the console uses Vite's configured base URL.
