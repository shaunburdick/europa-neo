# Implementation Plan: Europa Neo Logo and Favicon/Icon Set

**Feature**: 015-logo-assets
**Branch**: `issue-54-logo`
**Status**: Phase 4 plan / Phase 5 tasking complete; implementation intentionally not started

## 1. Technical context

| Area | Decision | Reason |
|---|---|---|
| Canonical owner | `packages/design` | One source prevents consumer-specific artwork drift. This is the product-owner-confirmed architecture and satisfies AGENTS.md's simplicity and specs-as-documentation principles. |
| Master artwork | Hand-authored, self-contained SVGs in `packages/design/src/brand/masters/` | SVG remains editable, scalable, inspectable, and independent of a font, network, or raster source. |
| Raster generation | Existing `@resvg/resvg-js` dev dependency, run by a deterministic TypeScript build script | It is already used by the console asset pipeline, avoids a new runtime dependency, disables system fonts, and renders SVG locally. |
| ICO generation | Small deterministic TypeScript ICO container writer which embeds the generated PNG layers | ICO is a container; this avoids adding a second image dependency. It emits exactly three PNG-backed directory entries—one each at 16×16, 32×32, and 48×48—with no undocumented extras. |
| Social image | Render a dedicated, programmatically composed 1200×630 SVG scene using the original lockup and brand background, then rasterize it | The preview remains derived from original vector work without becoming a competing master logo. |
| Package surface | `@europa/design/brand` manifest plus `@europa/design/brand/*` generated files | Consumers never reach into source files. Export targets are generated/owned package distribution files only. |
| Consumer staging | Build-time copies from the design distribution into console `dist/` and manual `docs/manual/assets/brand/` | Runtime remains local and self-hostable. Docker inherits the console build output; no asset server is added. |
| Base paths | Console uses Vite's existing base strategy; manual uses Jekyll `relative_url`; metadata is generated from the same relative manifest | Prevents root-absolute references under GitHub Pages repository subpaths. |
| Web metadata | Console `index.html` declares favicon, ICO, Apple touch, manifest, OG and Twitter tags. Manual layout declares the same local icon/preview metadata. | Both entry points need complete local browser/share metadata, while gameplay behavior remains unchanged. |

## 2. Architecture

### 2.1 Design package pipeline

1. Author nine SVG masters under `packages/design/src/brand/masters/`:
   `lockup.svg`, `emblem.svg`, `lockup-light.svg`, `lockup-dark.svg`,
   `lockup-mono.svg`, `emblem-light.svg`, `emblem-dark.svg`,
   `emblem-mono.svg`, and `emblem-compact.svg`.
2. Keep every SVG self-contained: viewBox, title/description where meaningful,
   token-derived or documented brand colors, no `<image>`, external href,
   stylesheet, font, script, animation, or network reference.
3. A typed manifest describes logical asset names, relative paths, dimensions,
   intended background, safe-area rules, and accessibility usage. The manifest
   is emitted as `dist/brand/index.js` and declarations.
4. The brand build validates masters before generating output. It rasterizes the
   emblem and lockup-derived compositions at the exact requested dimensions,
   writes `favicon.ico`, and writes a deterministic `site.webmanifest`.
5. Generated files are emitted below `packages/design/dist/brand/`; no source
   file outside the design package is a master artwork copy.

### 2.2 Consumer pipeline

- `@europa/design` owns two deliberately separate boundaries: `pnpm --filter
  @europa/design build` produces the complete package distribution under
  `packages/design/dist/` (including the generated brand manifest/files and the
  existing stylesheet output), while `pnpm --filter @europa/design stage:manual`
  is the only command allowed to copy generated design outputs into
  `docs/manual/assets/brand/`. The staging command is deterministic and
  idempotent, reads only from the freshly built package distribution, and fails
  closed when that distribution or a manifest-selected file is absent. The
  package build invokes this staging command as its final workspace-side step to
  preserve the repository's existing `pnpm build` one-command behavior; explicit
  callers still use `stage:manual` so the cross-package write boundary is visible
  and testable.
- The Pages workflow runs, in this exact order, after checkout:
  `pnpm install --frozen-lockfile`, `pnpm --filter @europa/design build`,
  `pnpm --filter @europa/design stage:manual`, then
  `actions/jekyll-build-pages` with `source: ./docs/manual` and
  `destination: ./_site`. It must not run Jekyll before staging, resolve a
  developer or cache-provided `dist`, or widen the Jekyll source/artifact path.
  The repeated stage call is intentional: it makes the workflow's prerequisite
  explicit while remaining harmless when `build` already performed the
  idempotent stage.
- The console asset build resolves the built workspace package's `dist/brand`
  directory and copies the selected files to `packages/console/dist/assets/brand`.
  It fails loudly if the manifest or any selected file is absent. Vite HTML uses
  relative links so its configured base path remains authoritative.
- The single-port host serves the console `dist` tree using its existing MIME
  table. Add `application/manifest+json` for `.webmanifest`; existing SVG, PNG,
  and ICO handling remains local. Docker keeps its existing transitive boundary:
  the build stage runs `pnpm install --frozen-lockfile` followed by `pnpm build`,
  pnpm builds the design workspace before its console consumer, and the runtime
  stage serves only the resulting `packages/console/dist` tree. Docker does not
  run a second design server, resolve brand files at runtime, or copy the manual
  staging tree into the image.
- Console UI uses a semantic logo link on the lobby and a decorative emblem in
  the persistent in-match footer/HUD. CSS switches lockup to compact/emblem at
  the documented 160 CSS px threshold without changing controls or simulation.
- The manual layout uses a meaningful logo link or decorative repeated mark as
  appropriate, with `relative_url` for every URL and a non-duplicating heading.

### 2.3 Validation architecture

The design package owns a Node validation command and tests. Validation is
layered:

1. source SVG structural checks;
2. manifest/export/generated-file drift checks;
3. PNG dimensions, the exactly three PNG-backed ICO directory entries (16×16,
   32×32, and 48×48, with no extras), maskable safe-zone geometry, and
   social image dimensions;
4. contrast and non-color semantic checks using the canonical design tokens;
5. consumer staging and HTML/base-path checks;
6. browser accessibility and responsive checks;
7. host and Docker HTTP/content-type smoke checks;
8. full repository verification and an explicit originality/licensing review.

## 3. Data flow and failure policy

`SVG masters → validate → resvg PNGs / ICO packer / manifest → design dist →
consumer build staging → local static HTTP response`.

Builds fail closed on missing, malformed, stale, external, or undocumented
assets. There is no runtime CDN fallback. A generated output is never edited by
hand; the remediation message names the source and build command.

## 4. Constitution and repository alignment

- **Type safety**: all generators, manifest types, and validators are strict
  TypeScript, with no `any` or lint suppressions (Principle I).
- **Determinism**: sorted inputs, fixed renderer configuration, no timestamps,
  random IDs, or system-font discovery (Principle II and AGENTS.md).
- **Coverage**: generator/validator behavior gets focused tests and ≥80% coverage;
  this is a merge gate even though the feature is not simulation logic (Principle
  III / NFR-005).
- **Documentation truth**: `DESIGN.md`, package README, manual layout, and this
  spec change with the implementation (Principle IV and AGENTS.md rule 4).
- **Simplicity**: reuse existing resvg and staging conventions; do not introduce
  an asset service, framework, or second design owner (Principle V).
- **Accessibility**: alt/name semantics, contrast, non-color distinction, focus,
  and reduced motion are tested rather than inferred (Principle VI).
- **Self-hosting/licensing**: all generated files are local; tooling is
  permissively licensed; no `europa-source/` material or mockup pixels are used
  (Principle VII and additional constraints).

## 5. Planned file areas

Implementation is expected to touch only these areas plus tests and generated
staging outputs:

- `packages/design/src/brand/masters/`, `src/brand/`, `scripts/brand/`,
  `tests/brand/`, `package.json`, and package export/build configuration;
- `packages/console/index.html`, console UI/header/footer styles and tests,
  plus `scripts/build-assets.ts` and staged `dist/assets/brand/`;
- `docs/manual/_layouts/default.html`, manual assets/layout tests, and staged
  `docs/manual/assets/brand/`;
- `packages/console/scripts/host.ts`, its MIME/static tests, and Docker smoke
  coverage; `Dockerfile` only if a build-stage copy needs an explicit guard;
- root `DESIGN.md`, relevant READMEs, Pages workflow, and feature documentation.

No gameplay, networking, routing semantics, or web-component behavior changes
are planned.

## 6. Quality gates and acceptance mapping

The implementation waves must leave these executable gates green:

| Gate | Evidence |
|---|---|
| Inventory/source | all nine masters and every generated path are present and manifest-exported |
| Binary | exact PNG sizes; ICO has exactly three PNG-backed entries—16×16, 32×32, and 48×48, with no extras; social PNG is 1200×630 |
| SVG safety | parser rejects raster, external references, fonts, scripts, animation, and malformed XML |
| Visual | Chromium render review at 16, 32, 48, 180, 192, 512 and light/dark/social surfaces |
| Accessibility | axe/browser tests, accessible-name tests, contrast calculations, reduced-motion and responsive tests |
| Delivery | console/manual/host/Docker paths return local files with correct MIME and base paths |
| Drift | generated output, exports, staging, and `DESIGN.md` inventory mismatch tests fail |
| Originality/licensing | checked-in review record and permissive-tool/license evidence; no forbidden-source references |
| Repository | `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, targeted tests, full tests, builds, and existing guards |

## 7. Routing recommendation

This is **medium scope and should be routed to PM/orchestrator for Phase 6**.
It crosses original visual design, binary generation, package exports, two build
systems, Pages, host/Docker delivery, browser accessibility, and licensing
review. The work is parallelizable after the design contract is frozen, but
integration and full-suite verification must remain serialized. A solo
implementation is technically possible, but explicit ownership lowers the risk
of one consumer silently growing its own logo (the classic favicon hydra).

## 8. Wave 0 implementation clarifications

The following clarifications were recorded during the T-001 review against
`AGENTS.md` and `.specify/memory/constitution.md`. They are binding for
implementation and do not change the feature's user-facing scope:

1. **Rasterizer ownership**: `@resvg/resvg-js` is currently declared only by
   `@europa/console`, although this plan runs the generator in `@europa/design`.
   The design package must declare the rasterizer as its own direct development
   dependency (and update the lockfile), rather than importing a transitive
   console dependency or relying on a hoisted installation. The generator must
   retain `loadSystemFonts: false` and use only package-local inputs.
2. **Manifest inventory boundary**: the generated manifest must list every
   consumer-facing generated file: the nine generated SVG variants, `favicon.svg`,
   `favicon.ico`, the four install/icon PNGs (`apple-touch-icon.png`,
   `icon-192.png`, `icon-512.png`, and `icon-512-maskable.png`), the social PNG,
   and `site.webmanifest`. The nine `masters/*.svg` files remain source-only and
   must not be exported or staged. `site.webmanifest` may be explicitly treated
   as metadata in the generated-file drift rule, but it must still be manifest
   listed.
3. **Manifest path semantics**: `BrandAsset.path` is package-relative and must
   always begin with `brand/`, matching the `@europa/design/brand/*` export
   pattern. Staging code strips no path components: it resolves the path below
   `dist/` and copies the resulting file to the consumer's local `brand/` root.
   Source master paths are never valid manifest paths.
4. **ICO cardinality**: emit exactly three PNG-backed directory entries: exactly
   one at each of 16×16, 32×32, and 48×48. Validators must reject duplicate,
   missing, or undocumented extra entries.
5. **Build ordering and clean checkouts**: the design build/generator is the
   prerequisite for console and manual staging. Root recursive builds must use
   the workspace dependency order; Pages must explicitly install dependencies,
   build `@europa/design`, and run its staging command before Jekyll. Consumer
   staging must fail closed when `dist/brand` is absent; it must never use a
   developer's stale or untracked `dist` tree.
6. **Docker transitive staging**: Docker continues to use the existing single
   port and root build. No separate design asset server or runtime package
   resolution is permitted; the runtime must serve the already staged files from
   the console distribution. Docker validation must start from a clean build
   context so an ignored local distribution cannot mask a missing staging step.
7. **Base-path metadata**: retain relative/base-path-aware metadata exactly as
   required by the spec and contract, including social metadata. Do not convert
   URLs to root-absolute paths or invent an origin for repository-subpath Pages
   deployments; the self-hosted host may use its configured public origin only
   where an absolute URL is explicitly required by its existing mechanism.
8. **Documentation and source drift**: `DESIGN.md` is the authoritative human
   inventory and must name both source masters and generated files, while the
   typed manifest is the authoritative machine inventory for generated outputs.
   Any generator, staging, export, or consumer metadata change must update the
   relevant spec/contract or documentation in the same change set. No changes
   may touch `europa-source/`, and no generated asset may be hand-edited.

## 9. Wave 0 command-boundary decision

The command contract below is the implementation target for T-004. It removes
the otherwise easy-to-miss distinction between generating package outputs and
staging consumer assets:

| Context | Required command boundary | Writes | Must not do |
|---|---|---|---|
| Design package development | `pnpm --filter @europa/design build` | `packages/design/dist/**`, then the existing CSS vendor output and idempotent manual stage | Read from `console/dist`, copy source masters to consumers, or depend on an unbuilt/stale distribution |
| Explicit manual staging | `pnpm --filter @europa/design stage:manual` | Only manifest-selected generated files under `docs/manual/assets/brand/` (plus the existing design stylesheet vendor path) | Generate artwork, read `europa-source/`, or stage masters/unlisted files |
| Root local build | `pnpm install --frozen-lockfile && pnpm build` | Design distribution, manual staging, and console distribution in pnpm workspace dependency order | Require Jekyll or a running server; use an ignored local distribution as input |
| GitHub Pages | `pnpm install --frozen-lockfile` → `pnpm --filter @europa/design build` → `pnpm --filter @europa/design stage:manual` → Jekyll `source: ./docs/manual`, `destination: ./_site` → privacy check → upload `./_site` | Only the checkout's generated/manual paths and the scoped `_site` artifact | Run Jekyll before staging or upload `packages/**`, `specs/**`, or `.github/**` |
| Docker | Build stage: `pnpm install --frozen-lockfile && pnpm build`; runtime stage copies the built package tree and runs `pnpm host` | Console `dist/**`, including `dist/assets/brand/**`, then the existing runtime image | Add an asset server, runtime package resolution, or rely on host-local ignored `dist` files |

The Pages sequence is intentionally explicit even if the package build invokes
the idempotent staging helper: a clean checkout cannot accidentally pass because
of an untracked or stale distribution, and the Jekyll source remains the sole
artifact boundary. Docker validation must use a clean build context (for
example, `docker build --no-cache` after the checkout's ignored distributions
are absent) so its transitive design→console staging is actually exercised.
