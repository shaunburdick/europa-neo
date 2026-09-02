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
| ICO generation | Small deterministic TypeScript ICO container writer which embeds the generated PNG layers | ICO is a container; this avoids adding a second image dependency. The required 16/32/48 layers are independently testable. |
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

- `@europa/design` build stages selected brand files into the manual asset tree,
  alongside its existing byte-identical stylesheet vendoring. The Pages workflow
  continues to build only `docs/manual`, but first installs/builds the workspace
  so the staging step is reproducible from a fresh checkout.
- The console asset build resolves the built workspace package's `dist/brand`
  directory and copies the selected files to `packages/console/dist/assets/brand`.
  It fails loudly if the manifest or any selected file is absent. Vite HTML uses
  relative links so its configured base path remains authoritative.
- The single-port host serves the console `dist` tree using its existing MIME
  table. Add `application/manifest+json` for `.webmanifest`; existing SVG, PNG,
  and ICO handling remains local. Docker's existing `pnpm build` therefore stages
  the same files before the runtime stage copies the built packages.
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
3. PNG dimensions, ICO directory entries, maskable safe-zone geometry, and
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
| Binary | exact PNG sizes; ICO has 16/32/48 entries; social PNG is 1200×630 |
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
