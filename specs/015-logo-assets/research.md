# Research: Logo and Favicon/Icon Set

## Findings

1. **PWA icon semantics** — MDN's current Web App Manifest guidance documents
   `purpose: "maskable"` and defines the safe zone as a centered circle whose
   diameter is 80% of the minimum canvas dimension. The plan therefore uses an
   opaque 512×512 maskable PNG with essential geometry inside that circle, and a
   separate `purpose: "any"` 512×512 icon.
   Sources: [MDN icons](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons),
   [MDN define app icons](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Define_app_icons).

2. **Manifest delivery** — MDN recommends a manifest link and the
   `application/manifest+json` media type. The host therefore adds a dedicated
   `.webmanifest` MIME mapping and tests the response rather than relying on a
   generic JSON type.
   Source: [MDN Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest).

3. **ICO compatibility** — ICO is a container with a directory and multiple
   image entries. PNG images may be stored as complete PNG payloads in modern
   ICO files, but each required 16×16, 32×32, and 48×48 entry must be declared
   independently. A deterministic local writer is sufficient and avoids an
   additional package.
   Sources: [ICO format reference](https://en.wikipedia.org/wiki/ICO_(file_format)),
   [ICO structure reference](https://ipfs.io/ipfs/QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco/wiki/ICO_(file_format).html).

4. **Social preview** — Open Graph defines `og:image` and optional structured
   width, height, type, and alt properties; it does not mandate one universal
   size. 1200×630 is the established cross-platform working size and is the
   feature's explicit acceptance target. The plan uses PNG for sharp vector/text
   rendering and supplies `twitter:card=summary_large_image`.
   Sources: [Open Graph protocol](https://ogp.me/),
   [MDN metadata conventions](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta).

5. **Existing repository tooling** — `@resvg/resvg-js` is already a console
   devDependency and the existing `packages/console/scripts/build-assets.ts`
   disables system fonts for reproducible SVG rasterization. Reusing that
   approach in `@europa/design` minimizes dependency and licensing surface.
   The design package already owns deterministic CSS generation and manual
   vendoring through `vendor-to-docs.ts`, making it the natural staging hook.

6. **Existing delivery topology** — the console is a Vite SPA with a single
   Node HTTP/WebSocket host, and Docker runs the root build before copying the
   resulting packages into a runtime image. No new listener or runtime service
   is needed. Relative Vite URLs, Jekyll `relative_url`, and the current static
   path traversal guard are the established base-path/security mechanisms.

## Choices and rejected alternatives

| Choice | Rejected alternative | Rationale |
|---|---|---|
| Existing resvg + local ICO writer | Add sharp/image-magick/online converter | New native dependency or network/toolchain requirement violates simplicity and self-hosting; online conversion violates originality/privacy. |
| SVG masters in design package | Masters in console or manual | Creates competing copies and makes Pages/Docker drift likely. |
| Generated outputs in package `dist/brand` | Commit generated binaries as independent source files | Dist is already the package distribution boundary; generated files can be regenerated and validated from masters. |
| One shared manifest | Hand-authored metadata in each consumer | Repeated filenames and sizes drift. Consumer HTML may select a subset, but paths are checked against the manifest. |
| Programmatic social composition from lockup | Treat social PNG as a separate hand-drawn master | Keeps one brand source and makes the exact 1200×630 output reproducible. |
| PNG-in-ICO layers | Raw DIB encoder | PNG layers are simpler and standards-supported by modern ICO consumers; the required browser targets are modern, while SVG plus ICO provides fallback coverage. |

## Open risks to resolve during implementation

- **Rasterizer rendering differences**: pin the already-resolved workspace
  dependency and use font-free primitives. Golden hashes should be treated as
  build-environment-sensitive only if the renderer changes; structural and
  dimension checks remain authoritative.
- **Small-size legibility**: the architected compact/emblem variants must be
  reviewed at actual pixel size, not only in a large browser preview. Simplify
  geometry if the 16×16 review fails.
- **Pages build ordering**: the current Pages workflow has no Node setup. Add a
  reproducible design-build/staging step before Jekyll, or make the committed
  staged output a verified build artifact; do not let a fresh checkout depend on
  an untracked local `dist` directory.
- **Absolute social crawler URLs**: self-hosted repository-relative deployments
  cannot infer a public origin. Keep page metadata local/base-path-correct as
  required by the spec; document that crawlers need the deployed absolute page
  URL when the static host knows its public origin. Never invent a CDN URL.
- **Contrast over busy social backgrounds**: place the lockup on a documented
  dark plate and test the wordmark as text, not only the surrounding artwork.

## Licensing/originality research record

The supplied mockup is not a source asset. The implementation must author new
paths and shapes from a written visual brief, must not inspect/copy raster pixels,
and must not copy code or artwork from `europa-source/`. The selected tooling is
workspace tooling already used under the repository's permissive dependency
policy. The final task set includes a human-authored review record naming the
authoring date, tools, and explicit negative checks.
