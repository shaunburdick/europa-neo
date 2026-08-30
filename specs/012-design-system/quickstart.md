# Quickstart: Shareable Design System Between UI and Documentation

**Feature**: `012-design-system` (issue #25) | **Branch**: `issue-25-design-system`

How to build and verify the design system locally — from a clean checkout to the full SC checklist.

---

## Prerequisites

* **Node 22**, **pnpm 11.22** (see `package.json#engines`).
* No external font, CDN, or GitHub token needed — the repo is self-contained (constitution Principle VII).

---

## One-command build (fresh clone)

```bash
pnpm install --frozen-lockfile
pnpm build
# Expected: @europa/design builds first (tsup → dist/design.css + dist/index.{js,dts}),
# then vendors dist/design.css → docs/manual/assets/design.css,
# then @europa/console builds (Vite dedupes the shared stylesheet).
# Every workspace's tsc/bundle step is green.
```

The vendored file at `docs/manual/assets/design.css` is tracked — `pnpm build` regenerates it deterministically. A subsequent `git diff --stat` shows it changed only when `packages/design/src/tokens.ts` (or the emitter) changed, and the hash matches `packages/design/dist/design.css`.

---

## Per-step verification (what to run, what must be green)

| Command | What it checks | Must pass for |
|---------|---------------|---------------|
| `pnpm --filter @europa/design build` | Emits `dist/design.css` + `dist/index.*` deterministically | SC-003, FR-002/FR-004 |
| `sha256sum packages/design/dist/design.css docs/manual/assets/design.css` | Byte identity of vendor copy | SC-003, FR-014 — hashes must match |
| `pnpm --filter @europa/design test -- --coverage` | Token ↔ CSS-var identity, DESIGN.md ↔ implementation coverage, catalog-vs-stylesheet, palette derivation | SC-007, SC-002, G-01–G-03, G-06, NFR-003 (≥80% on every metric) |
| `pnpm --filter @europa/design check:drift   # or check:no-literals` | Console no-literals deny-list + single-exception scope | SC-002, FR-009/FR-010 |
| `pnpm --filter @europa/console typecheck` | Strict TS across the consumer (importing `@europa/design`) | NFR-003 |
| `pnpm typecheck` (root) | Every workspace TS program + conformance programs | Constitution I |
| `pnpm lint && pnpm format:check` | Biome — `@europa/design` formatted/linted like every other package | FR-022, NFR-003 |
| `pnpm --filter @europa/console test -- --run` + `pnpm --filter @europa/console exec vitest run --config vitest.config.browser.ts tests/a11y` | Computed-style no-regression smoke (page/HUD/lobby/void/muted/chip/banner/focus), axe scans, reduced-motion inert | SC-001, SC-005, NFR-001 |
| `pnpm version:check` | `APP_VERSION` = every `package.json#version` = `DESIGN.md` header = `packages/design` version | SC-007, SC-008, FR-020 |
| `pnpm build && du -h packages/console/dist/assets/*.css packages/console/dist/assets/*.js docs/manual/assets/design.css` | Gzip budget: console browser payload < 150 KB gz, manual payload bounded | NFR-005 |

### Visual QA (human, side-by-side)

1. `pnpm --filter @europa/console dev` → open `http://localhost:5173` — lobby chrome + in-match HUD/tiles/chips/banners must render the same dark-slate language as before (SC-001).
2. Build and serve the manual:
   ```bash
   pnpm --filter @europa/design build   # ensures docs/manual/assets/design.css is fresh
   bundle exec jekyll build --source docs/manual --destination /tmp/manual-site   # or: actions/jekyll-build-pages locally via docker
   python -m http.server --directory /tmp/manual-site 8000
   # open http://localhost:8000 — page bg is #0b0f19, plates are #111827, system-ui type, europa-card/typography visible
   ```
   Alternatively just open `docs/manual/index.md` rendered via GitHub Pages preview — the Chrome language must be observably the same as the console lobby (SC-004).
3. Tab-cycle the console + manual page with keyboard only — focus rings must be visible white 2px solid + 2px offset on every interactive component.
4. Toggle `prefers-reduced-motion: reduce` in devtools — the waiting spinner's animation must be inert.

### Artifact-scope assertion (SC-006)

After any `docs/manual`-changing push, list the would-be Pages artifact's contents (mirrors what `pages-deploy.yml` uploads):

```bash
# Simulate the Pages build step:
npx --yes @action/jekyll-build-pages --source ./docs/manual --destination /tmp/pages-site
ls -R /tmp/pages-site | grep -E 'packages|specs|\.github' && echo 'FAIL: leak' || echo 'PASS: scope intact'
```

Expected: only files derived from `./docs/manual` (HTML + `assets/design.css`) — no `packages/**`, `specs/**`, `.github/**`.

### Catalog composability smoke (FR-006 / User Story 4)

Create two throwaway surfaces, each importing only the design stylesheet / catalog classes:

* **React** — a JSX fragment using `europa-card`, `europa-button`, `europa-banner`, `europa-chip`.
* **HTML** — add a temporary Markdown page under `docs/manual/smoke.md` using the same classes in raw HTML.

Both should render the same treatment for each class without custom CSS. Delete the smoke pages after.

---

## DESIGN.md — what to edit when you change the system

* Every change to a token value, variable name, class name/variant, or a11y pairing must touch `DESIGN.md` in the **same commit** as the code (FR-018). CI fails if they diverge (G-02/G-03/G-06).
* New variants are additive (minor). Renaming a class or `--europa-*` variable is a breaking change — add a migration note in `DESIGN.md` § Extension Guidance and discuss a major bump.
* `DESIGN.md` links are normative: `packages/design/README.md` points to root `DESIGN.md` and carries no competing catalog.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `DRIFT: docs/manual/assets/design.css stale` | `packages/design/src/tokens.ts` changed without re-vendoring | `pnpm --filter @europa/design build` then `git add docs/manual/assets/design.css` |
| `literal #374151 at console/src/styles/index.css:142` | Leftover hex outside `var(--europa-*)` | Replace with `var(--europa-color-border)` |
| `DESIGN.md header 0.1.0 !== packages/design 0.1.1` | Lockstep bump missed `DESIGN.md` | Update `DESIGN.md` header to `0.1.1` in the same bump commit (FR-020) |
| `orphan token in DESIGN.md: --europa-color-…` | Token removed from code without removing the table row (or vice versa) | Remove/add the row + class as required; coverage test names the orphan |
| Manual still shows white Jekyll default | `_layouts/default.html` missing or vendored CSS path wrong | Ensure `docs/manual/_layouts/default.html` links `{{ '/assets/design.css' | relative_url }}` and pages use `layout: default` |
| Build bloats past 150 KB gz | Unintended duplication of design rules | Check that console imports `@europa/design/dist/design.css` once and does not re-declare rules |

---

## Checklist before opening a PR

* [ ] `pnpm install --frozen-lockfile && pnpm build` — green from a clean checkout
* [ ] `pnpm lint && pnpm format:check && pnpm typecheck` — zero errors, zero suppressions
* [ ] `pnpm version:check` — exit 0 (reads `DESIGN.md` header + every `package.json`)
* [ ] `pnpm --filter @europa/design test -- --coverage` — ≥80% on every metric, drift + catalog checks green
* [ ] `sha256sum` — `dist/design.css` ↔ `docs/manual/assets/design.css` identical
* [ ] Manual page inspected — dark-slate chrome, system-ui type, `europa-*` classes in DOM
* [ ] `DESIGN.md` updated in the same commit if any token/class/pairing changed (FR-018)
