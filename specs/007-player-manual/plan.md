# Implementation Plan: Player Manual & GitHub Pages Publishing (Feature 007)

**Branch**: `001-europa-core` | **Date**: 2026-08-24 | **Spec**: [`specs/007-player-manual/spec.md`](./spec.md)

**Input**: Feature specification from `specs/007-player-manual/spec.md` (v1.0) — an end-user instruction book for players as plain Markdown under `docs/manual/`, published to GitHub Pages by an official-actions workflow on merge to `main`.

**Note**: This plan was produced by following the `/speckit.plan` workflow. The branch is `001-europa-core` (the repo's per-delivery branch; the spec-kit default of `git checkout -b 007-player-manual` is deliberately skipped per the product-owner decision to fold this feature into PR #1, matching the precedent recorded in AGENTS.md). All artifacts live under `specs/007-player-manual/`.

---

## Summary

Feature 007 ships two things:

1. **The manual itself** — 13 plain-Markdown pages under `docs/manual/` (index + 12 focused pages), written entirely from the implemented specs (001–006) and shipped code. Zero prose from `europa-source/` (SOS license). Every control row audited against `DEFAULT_INPUT_MAPPING`; every number in the appendix traceable to `ENGINE_CONSTANTS` / `NETWORK_CONSTANTS` / console defaults.
2. **The publishing workflow** — `.github/workflows/pages-deploy.yml`, using the official chain (`configure-pages` → `jekyll-build-pages` → `upload-pages-artifact` → `deploy-pages`), triggered on push to `main` with a path filter on `docs/manual/**` (+ the workflow file), plus `workflow_dispatch`. Jekyll's default Markdown conversion renders the pages; no SSG config, no theme, no client-side JavaScript.

There is **no application code** in this feature. The deliverables are prose, tables, one YAML file, and README link touch-ups. Correctness is enforced by audits (SC-001 controls, SC-002 numbers, SC-005 license hygiene, SC-006 accessibility structure) and a human playtest (SC-003, post-merge), not automated tests — the spec's Assumptions make this explicit ("Test-coverage gates do not apply to prose").

---

## Technical Context

**Language/Version**: English prose in GitHub-Flavored Markdown. The workflow file is GitHub Actions YAML targeting `ubuntu-latest` with the default `GITHUB_TOKEN` (no secrets).

**Primary Dependencies**: None added. Jekyll rendering comes from `actions/jekyll-build-pages` (which bundles the `github-pages` gem's defaults inside the action's Docker image); no Ruby, Bundler, or Gemfile enters the repository.

**Storage**: None.

**Testing**: Not applicable to prose (see Summary). Verification is audit-based — see "Verification Approach" below.

**Target Platform**: The published site targets any browser without JavaScript (FR-011). Authoring targets any text editor. v1 documents desktop-browser play only (spec Edge Case: mobile/tablet stated plainly as unsupported).

**Project Type**: Repository-level documentation + one CI workflow file. No package changes; no workspace registration; no dependency-tree changes (constitution licensing constraint trivially satisfied — zero new dependencies).

---

## Constitution Check

*Gate: every principle evaluated against this docs-only change.*

### Principle I — Type Safety First

Not applicable — no TypeScript is written or modified. The workflow YAML is hand-reviewed and structurally validated (T018). ✅ passes (vacuously).

### Principle II — Server-Authoritative Deterministic Simulation

Not applicable — the manual describes the simulation but contains none. ✅ passes (vacuously). Note: the manual must *describe* determinism-visible behavior faithfully (fixed 250 ms cadence), which the numbers audit (SC-002) covers.

### Principle III — Tested Game Logic

No game logic changes. Spec Assumptions explicitly scope coverage gates out of this feature; content correctness is enforced by SC-001/SC-002 audits and SC-003 playtests instead. ✅ passes with the documented scope note.

### Principle IV — Specs as Documentation

This feature *is* documentation — and it extends Principle IV to player-facing docs via FR-012: gameplay changesets must update the manual in the same change set. The plan operationalizes this with a standing policy note in AGENTS.md (task T017) so future agents know the manual is part of the "specs stay truthful" contract. ✅ passes — actively strengthened.

### Principle V — Simplicity Over Cleverness

The whole design is the simplest thing that works: plain Markdown, default Jekyll styling, official action chain, no SSG config, no custom theme, no search/analytics/comments (all Out of Scope). One deliberate simplicity decision: **no `_config.yml`** — `actions/jekyll-build-pages` renders `.md` through Jekyll's default conversion with zero configuration, and navigation is provided by the index page's table of contents (a linked Markdown list), not a theme nav bar. If the default render ever proves insufficient, a minimal `_config.yml` can be added later without churn. ✅ passes.

### Principle VI — Accessibility-Minded UI

FR-011 makes the manual itself accessible: one h1 per page, hierarchical headings, header rows on all tables, alt text on images (none planned in v1 — no screenshots), descriptive link text, readable without JavaScript. Verified structurally at T019 (SC-006 pre-audit). Plain-text tables also serve screen readers well. ✅ passes.

### Principle VII — Self-Hostable by Default

The manual is *more* self-hostable than the app: it is static Markdown readable from a repo checkout with no build step (FR-001 requires the raw Markdown to remain first-class — the README links both the rendered site and the raw files). GitHub Pages is the *default* delivery vehicle, not a lock-in: any static file server can serve `docs/manual/` unchanged (constitution "no vendor lock-in" — the publishing integration is a single swappable workflow file). ✅ passes.

**Verdict**: ✅ All principles pass. No conflicts to surface.

---

## Project Structure

New files only; nothing existing is modified except `README.md` (link section) and `AGENTS.md` (state + FR-012 policy note).

```
docs/
└── manual/                          # The entire published site (FR-015 artifact scope)
    ├── index.md                     # Welcome, 60-second concept, ToC (page 1)
    ├── quick-start.md               # From join link to first orders (page 2)
    ├── objective.md                 # Win / lose / surrender / draw (page 3)
    ├── the-board.md                 # Grid, elevation, water, fair maps (page 4)
    ├── cities-and-troops.md         # Production, saturation, capture (page 5)
    ├── pipes.md                     # Region targeting, slope, feeding, decay (page 6)
    ├── combat.md                    # Attrition in plain language (page 7)
    ├── special-weapons.md           # Paratroopers + guns (page 8)
    ├── reserves.md                  # Holding troops back (page 9)
    ├── fog-of-war.md                # Sensor radius, no memory, spectators (page 10)
    ├── controls.md                  # Complete pointer + keyboard reference (page 11)
    ├── reading-the-screen.md        # HUD tour incl. all 7 status values (page 12)
    └── numbers.md                   # Auditable tunables appendix (page 13)
.github/
└── workflows/
    └── pages-deploy.yml             # Official Pages chain (new)
README.md                            # Modified: links to site + raw Markdown
AGENTS.md                            # Modified: current-state entry + FR-012 standing policy
```

Page order follows the spec's Manual Content Outline table verbatim (13 entries). Filenames are frozen by the spec — do not rename.

---

## Content Sourcing Map

Every page names its authoritative sources. `research.md` §2–§4 expands this into the per-page verification checklist with exact claims and known nuances. Rule of precedence (FR-002): implemented specs (001–006) and shipped code win over the original archive; **zero prose from `europa-source/`**.

| Page | Primary sources (verify against, never copy) |
| --- | --- |
| `index.md` | Spec outline; README §"Game concept" (adapted, same authorship); ToC = links to the other 12 pages |
| `quick-start.md` | US2/FR-004 · `packages/console/src/internal/live-runtime.tsx` (URL params `?live&ws=&match=&name=[&token=]`) · `packages/console/scripts/host.ts` (join URLs printed by `pnpm host`) · `NETWORK_CONSTANTS.defaultReconnectGraceMs` (60 s) · `packages/console/src/ui/waiting-overlay.tsx` · `packages/console/src/net/ws-match-client.ts` (reconnect snapshot+replay) |
| `objective.md` | US1/FR-003 · `packages/engine/src/resolution/terminal.ts` + `capture.ts` (elimination = 0 troops AND 0 cities) · engine `OrderSurrender` confirm flow (`SurrenderModal.tsx`) · draw by mutual elimination |
| `the-board.md` | FR-008 · spec 003 · `packages/terrain/src/constants.ts` (water ratio bounds, elevation range) · `packages/console/src/render/palette.ts` (elevation shading) · point-symmetric fair maps |
| `cities-and-troops.md` | FR-006 · `resolution/production.ts` + `ENGINE_CONSTANTS.productionRate` (1/tick) / `cityCapacity` (30) · `resolution/capture.ts` |
| `pipes.md` | FR-006 · `resolution/flow.ts` + `flowBase` (1) / `flowDownhillFactor` (1) / `flowUphillFactor` (**0 — uphill pipes are inert at v1 tuning**) · `decay.ts` + `decayPerTick` (−1/tick unfed; mutual feeding sustains) · console region targeting (`src/input/hit-test.ts`, `src/input/subcell.ts`) · max 4 directional pipes/cell |
| `combat.md` | FR-006 · `resolution/combat.ts` (attrition: equal forces trade equally; larger side eliminates smaller and keeps the difference) · mutual-feeding stalemate callout |
| `special-weapons.md` | FR-006 · `resolution/paratroop.ts` + `paratroopCost` (10 ⇒ an order costs 20 at source, lands 10 — the "20→10" nuance) · Chebyshev range ≤ 2 · clears destination pipes · no water targets · `resolution/gun.ts` + `gunCost` (5) / `gunDamage` (2, hits everything in the cell — friendly fire included) |
| `reserves.md` | FR-006 · engine reserves rule · digit keys 0–9 → 0–90% in 10% steps (`resolveReservePercent` in `src/input/order-reserves.ts`) · why reserves beat hoarding in open cells (open cells cap at `cellCapacity`) |
| `fog-of-war.md` | FR-007 · spec 002 · `visibilityRadiusDefault` (4, Chebyshev) · union across stacks · no memory · spectator full-board view, no orders |
| `controls.md` | FR-005 · `DEFAULT_INPUT_MAPPING` (`packages/console/contracts/console-types.ts` — the canonical table) · camera: wheel zoom-toward-cursor, middle-drag pan, `DEFAULT_CAMERA` (zoom 32 px/cell, bounds 12–96) · HUD buttons: order-bar Exclusive toggle + Clear-pipes (`src/ui/order-bar.tsx`), reserves slider + digit buttons (`src/ui/reserves-panel.tsx`), Surrender… + confirm modal (`src/render/SurrenderModal.tsx`) |
| `reading-the-screen.md` | FR-009 · all seven status values from `src/net/connection.ts`: `idle`, `connecting`, `live`, `reconnecting`, `expired`, `spectating`, `game_over` · tick counter · minimap navigation · order bar · reserves panel · transient feedback (`formatActionConfirmation`/`formatRejection`) · waiting overlay · reconnecting banner · end-of-match announcement |
| `numbers.md` | FR-010 · `ENGINE_CONSTANTS` + `DEFAULT_TICK_INTERVAL_MS` (250 ms ≈ 4 ticks/s) · default board 32×32 · vision radius 4 · `DEFAULT_PLAYER_COLORS` (red/blue/emerald/amber hexes) · camera zoom bounds 12–96 px/cell · reconnect grace 60 s (`NETWORK_CONSTANTS`) |

---

## Publishing Workflow Design

File: `.github/workflows/pages-deploy.yml` (name: **Pages Deploy**). Design decisions, each traceable to a requirement or repo convention:

1. **Triggers (FR-013)**: `push` to `branches: [main]` with `paths: ['docs/manual/**', '.github/workflows/pages-deploy.yml']`, plus `workflow_dispatch`. This mirrors the path-gating convention established repo-wide in commit `2835e64` (every workflow lists its own file in its paths filter so workflow edits redeploy/re-run).
2. **Official chain (FR-014)**, two jobs:
   - `build`: `actions/checkout` → `actions/configure-pages` → `actions/jekyll-build-pages` with `source: ./docs/manual`, `destination: ./_site` → `actions/upload-pages-artifact` with `path: ./_site`.
   - `deploy`: `needs: build`, `environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }`, step `actions/deploy-pages` (id `deployment`).
3. **Permissions (least privilege)**: top-level `permissions: { contents: read }`; the `deploy` job elevates to `pages: write` + `id-token: write` (required for OIDC-verified Pages deployment). No other permissions anywhere.
4. **Action pinning — reconciliation decision**: FR-014 says "pinned to major version tags"; the repo convention (all six existing workflows, post-`2835e64`) pins **full commit SHAs with a trailing comment naming the version** (e.g., `actions/checkout@11bd71… # v4.2.2`). This plan adopts the repo convention: SHA pinning strictly satisfies "major version" intent while adding supply-chain integrity, and consistency beats exception. Majors current as of planning (implementation re-verifies before pinning): `checkout` v4.x, `configure-pages` v6.x, `jekyll-build-pages` v1.x, `upload-pages-artifact` v3.x, `deploy-pages` v5.x (v5 requires upload-pages-artifact ≥ v3 — satisfied).
5. **Artifact scope (FR-015)**: because `jekyll-build-pages`'s `source` is scoped to `./docs/manual`, the uploaded artifact contains only rendered manual HTML/CSS — no package source, specs, or workflows.
6. **Concurrency**: `concurrency: { group: pages, cancel-in-progress: false }` — serializes deployments so a rapid merge sequence can't interleave deploys.
7. **One-time prerequisite (FR-016)**: a header comment block in the workflow documents that an admin must set Settings → Pages → Source = "GitHub Actions" once; the default `GITHUB_TOKEN` cannot automate it. Until flipped, runs fail visibly in Actions (spec Edge Case + SC-004 dependency). Task T016 records this as a deployment note in the README's manual section too.
8. **Honest limitation (recorded here per dispatch instructions)**: the workflow only executes on `main` post-merge — path-gated push triggers cannot fire on the feature branch, and PR preview deployments are Out of Scope. Therefore **feature-branch validation is necessarily partial**: (a) YAML structural validity (parse + key checks, task T018), (b) local Jekyll build if practical (a Docker-based `jekyll build` smoke run; skipped if tooling isn't available locally — it is NOT a merge gate), else (c) structural review of front-matter-free Markdown + relative-link integrity. SC-004's end-to-end proof lands only after PR #1 merges; the plan treats post-merge verification as a follow-up owned by the product owner, with the failure mode documented (visible red run + remedy comment).
9. **No `_config.yml`** (Constitution V): Jekyll defaults render each page through the default layout; index.md's ToC is the navigation. Revisit only if the default render proves unusable.

---

## Verification Approach

Automated test gates don't apply to prose (spec Assumptions). Instead, each task embeds its own accuracy check, and the final phase runs five explicit audits:

| Audit | Spec | Method |
| --- | --- | --- |
| Controls drift | SC-001 | Walk every row of `controls.md` against `DEFAULT_INPUT_MAPPING` + HUD components; then reverse-walk every shipped player-facing control into the manual (both directions, zero drift) |
| Numbers drift | SC-002 | Every value in `numbers.md` traced to its constant declaration line (`ENGINE_CONSTANTS`, `DEFAULT_TICK_INTERVAL_MS`, `NETWORK_CONSTANTS`, `DEFAULT_CAMERA`, `DEFAULT_PLAYER_COLORS`, terrain default) |
| Comprehension playtest | SC-003 | Post-merge human activity — two volunteers complete a hosted match using only the manual. Out of implementation scope; noted as the owner's follow-up |
| License hygiene | SC-005 | Final sweep confirms zero text sourced from `europa-source/` (all mechanics rewritten from implemented-spec descriptions; archive consulted, if at all, only to check comprehension) |
| Accessibility structure | SC-006 | Per-page structural pass: exactly one h1, hierarchical h2/h3, every table has a header row, descriptive link text, no JS dependence (rendered-HTML axe scan happens naturally post-merge if desired; the authoring-side audit is the gate here) |

Plus workflow validation (YAML parse, official-pattern conformance vs the actions' documented inputs, permission minimality) and cross-page link integrity (relative links resolve within `docs/manual/`).

---

## Risks & Open Questions

1. **Jekyll default render quality** (low): default layout gives bare-bones styling. Accepted by product owner ("Jekyll default styling"). Mitigation if unacceptable later: minimal `_config.yml` + theme — additive, no content churn.
2. **Relative links under a subpath Pages URL** (medium): project pages deploy under `/<repo>/`; root-relative links (`/pipes.md`) would break. **Decision: all intra-manual links are relative** (`./pipes.md` or `pipes.md`), verified in T019. Jekyll rewrites `.md` links to rendered permalinks in default conversion — verify rendered output during the local-build step if available.
3. **Jekyll file exclusions** (low): Jekyll skips files starting with `_` and honors `exclude` defaults; our filenames are safe. No `README.md` inside `docs/manual/` (it would render as an extra page) — the directory holds exactly the 13 pages.
4. **deploy-pages major bump** (low): v5 is a Node-runtime bump; if pin-time verification finds a compatibility caveat with `upload-pages-artifact@v3`, fall back to the proven v4 pairing and record the choice in the workflow comment.
5. **Manual staleness** (standing): mitigated by FR-012 + the AGENTS.md policy note (T017), making manual updates a reviewable expectation on gameplay changesets — same enforcement model as spec truthfulness (review-time, not tooling-enforced).

---

## Artifact Inventory

| Artifact | Status | Notes |
| --- | --- | --- |
| `plan.md` | This document | |
| `research.md` | Written alongside | Accuracy-source audit: exact files, exact values, known nuances, per-page checklist |
| `tasks.md` | Written alongside | Ordered solo-sized tasks with embedded verification |
| `data-model.md` | N/A stub | Documentation feature — see the one-line justification in that file |
| `contracts/` | N/A | No API surface exists; the "contract" for this feature is the spec's FR-001..FR-016 themselves |
| `quickstart.md` | N/A | No code to run; tasks.md Phase 5 IS the validation recipe (workflow + audits) |
