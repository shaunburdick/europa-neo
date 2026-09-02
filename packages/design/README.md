# `@europa/design`

Europa Neo's shared design system and canonical owner of the project's brand
artwork. The package is private and is not published to a registry.

- **Package**: `packages/design` → `@europa/design` (`private: true`)
- **Design contract**: [`DESIGN.md`](../../DESIGN.md) at the repository root
- **Brand specification**: [`specs/015-logo-assets/spec.md`](../../specs/015-logo-assets/spec.md)
- **Brand masters**: `src/brand/masters/`
- **Generated distribution**: `dist/brand/`

The root `DESIGN.md` is the authoritative visual contract. This README explains
the package workflow and distribution boundary; it is not a competing asset
catalog.

## Authoring brand artwork

Edit only the original SVG masters in `src/brand/masters/`. Masters must be
self-contained, scalable SVG files with a `viewBox`, meaningful title and
description metadata, no raster images, external resources, fonts, scripts, or
network references. The master inventory currently includes the lockups,
emblems, compact emblem, and vertical lockup treatments. Do not add a master
copy to a consumer package, `docs/manual`, or `europa-source/`.

Before generating outputs, review the variant's intended background, minimum
display size, clear space, accessibility treatment, and blue/orange
non-color distinction in `DESIGN.md`.

## Generate the distribution

From the monorepo root, run:

```bash
pnpm --filter @europa/design build
```

The build validates every master, copies the declared SVG variants, and
deterministically generates the favicon, ICO, Apple/PWA icons, maskable icon,
social preview, and web manifest under `dist/brand/`. Rasterization is local
and runs with system-font discovery disabled. Re-running the build with the
same sources produces byte-identical output.

`dist/` is generated output. **Never hand-edit files below `dist/`, including
`dist/brand/` or its package entry files.** Change a master or generator source
and rebuild instead. Generated output may be absent in a fresh checkout until
the design package has been built.

## Validate changes

Focused validation from the repository root:

```bash
pnpm --filter @europa/design check:brand-types
pnpm --filter @europa/design check:brand-surface
pnpm --filter @europa/design test -- tests/brand/
pnpm --filter @europa/design lint
pnpm --filter @europa/design format:check
```

The build's output assertion fails closed for missing, stale, malformed,
unexpected, dimensionally incorrect, or source-drifting files. The brand
surface check verifies that the generated inventory and package export targets
remain within the declared boundary. Run the package build first when
validating a clean checkout.

## Package exports and consumer imports

Consumers may use only generated package exports:

```ts
import { BRAND_MANIFEST } from '@europa/design/brand';

const logo = BRAND_MANIFEST.assets.find((asset) => asset.id === 'lockup-dark');
```

Individual generated files are available through the wildcard export, for
example in a bundler that supports URL imports:

```ts
import lockupUrl from '@europa/design/brand/europa-neo-lockup-dark.svg';
```

The manifest is the source for selecting a file and its metadata (format,
dimensions, purpose, background, accessibility text, and safe area). The
`@europa/design/brand` entry exposes the typed manifest; the
`@europa/design/brand/*` entry exposes only declared files below `dist/brand/`.
Source masters under `src/brand/masters/` are not package exports.

For plain HTML, have the consumer build resolve the generated package asset
and copy only the selected manifest entries into its own local static tree:

```html
<img src="/assets/brand/europa-neo-lockup-dark.svg" alt="Europa Neo">
<link rel="icon" href="/assets/brand/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/assets/brand/favicon.ico" sizes="any">
```

Consumer staging is a build-time operation, not a runtime fetch. Build
`@europa/design` first, then stage manifest-selected files into the consumer's
local asset directory (for example `dist/assets/brand/` or
`docs/manual/assets/brand/`). Staging must fail if the design distribution is
missing and must never copy masters, hand-maintained duplicates, or unlisted
files. The consumer integration owns its staging command; this package owns
generation only. Do not implement or bypass that boundary by editing consumer
assets manually.

## Development

```bash
pnpm install
pnpm --filter @europa/design build
pnpm --filter @europa/design test
pnpm --filter @europa/design lint
pnpm --filter @europa/design typecheck
pnpm --filter @europa/design format:check
```

The package also contains the shared token stylesheet and web components. Use
the package stylesheet as the single CSS source:

```ts
import { TOKENS } from '@europa/design';
import '@europa/design/dist/design.css';
```

---

## License

Open source; license TBD by the project owner.
