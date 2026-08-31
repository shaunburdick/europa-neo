# Feature Specification: Player Manual & GitHub Pages Publishing

**Feature Branch**: `001-europa-core` (folded into PR #1 by product-owner decision — no separate `007-*` branch is created)

**Created**: 2026-08-24

**Last Updated**: 2026-08-30

**Version**: 1.3

**Status**: Implemented (2026-08-30)

**Input**: User description: "Before I merge the PR, let's write a simple instruction book for players. This can be a new spec, as this is end-user documentation. I'm thinking this could be its own part of the repo that can be published to the github repo pages using a git action."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Understand the Game From Zero (Priority: P1)

As a new player who has never seen Europa, I want a short manual that explains what the game is, what my objective is, and how someone wins, so that I can decide to play and know what "winning" looks like before I ever open a join link.

**Why this priority**: A manual that doesn't teach the goal fails at its one job; everything else in the document is detail around this.

**Independent Test**: Give the objective section alone to a reader who has never played; they can state, unprompted, how matches are won, lost, surrendered, and drawn.

**Acceptance Scenarios**:

1. **Given** a reader finishes the objective section, **When** asked how a match ends, **Then** they can name last-player-standing victory (opponent reduced to zero troops AND zero cities), surrender, and draw by mutual elimination.
2. **Given** the same reader, **When** asked what they control, **Then** they can name cities, troops, and pipes as their levers.

---

### User Story 2 - Get Into a Match (Priority: P1)

As a player with a join link, I want step-by-step instructions for getting seated in a match — opening the URL, my display name, and what the "waiting for opponent" screen means — so that I am never stuck before the first tick.

**Why this priority**: v1 has no lobby screen; joining happens through URLs. If the manual can't bridge this, players cannot start playing at all.

**Independent Test**: A reader follows only the manual's getting-in section against a locally hosted match (`pnpm host`) and reaches a live console without outside help.

**Acceptance Scenarios**:

1. **Given** a player opens a join URL, **When** the console loads, **Then** the manual has already told them what each part of the address means (match id, optional seat token) and that refreshing the same link reclaims their own seat within the grace window.
2. **Given** a player seated in an unfilled match, **When** the "Waiting for opponent to join…" overlay appears, **Then** the manual explains it hides automatically when the match starts.
3. **Given** a player whose connection drops mid-match, **When** they reopen their join link, **Then** the manual explains the reconnecting banner and that abandoning too long forfeits the seat.

---

### User Story 3 - Learn the Controls From One Reference (Priority: P1)

As a player, I want a single controls page listing every pointer gesture and keyboard command exactly as implemented, so that I can keep one table open and play without guessing.

**Why this priority**: The original's control scheme is preserved deliberately; a complete, accurate reference is the manual's most-revisited page.

**Independent Test**: Walk every row of the manual's control tables against the shipped input mapping and HUD buttons; every row matches, and no shipped control is missing from the tables.

**Acceptance Scenarios**:

1. **Given** the controls page, **When** a player reads the pointer rows, **Then** they learn that clicking a region of a cell toggles a pipe toward that region, and right-click (or Alt+click) issues an exclusive pipe replacing all others.
2. **Given** the keyboard table, **When** a player presses i/j/k/l, Space, p/h, g/o, 0–9, Escape, or the arrow keys, **Then** each key's documented effect matches actual behavior.
3. **Given** the camera rows, **When** a player uses the mouse wheel or middle-drag, **Then** zoom-toward-cursor and pan behave as documented.

---

### User Story 4 - Understand the Mechanics (Priority: P2)

As a player, I want plain-language explanations of cities, pipes, decay, combat, paratroopers, guns, reserves, terrain, and fog of war — with the real numbers — so that I can make informed decisions instead of trial-and-error guesses.

**Why this priority**: Depth of understanding separates a manual from a pamphlet; essential after the basics but not blocking a first session.

**Independent Test**: Given two cells' troop counts and pipe setup from the manual's rules, a reader can predict which side wins the engagement and whether the loser's stack decays.

**Acceptance Scenarios**:

1. **Given** the mechanics pages, **When** a reader asks why their troops vanished, **Then** the decay rule (unfed stacks lose troops every tick) explains it, including the mutual-feeding exception.
2. **Given** the special-weapons page, **When** a reader plans a raid, **Then** they know paratroops cost twice what lands, clear enemy pipes on arrival, cannot target water, and guns damage friends as well as foes.
3. **Given** the fog-of-war page, **When** a reader marches a stack forward, **Then** they expect vision only within sensor range of their stacks, no memory of left-behind ground, and full visibility only as a spectator.

---

### User Story 5 - Read the Screen (Priority: P2)

As a player, I want a guide to the console's HUD — status chip, tick counter, minimap, order bar, reserves panel, feedback messages, and the game-over moment — so that every state the interface can show is recognizable.

**Why this priority**: The console is minimal by design, but statuses like `reconnecting` or `spectating` are cryptic without a legend.

**Independent Test**: For each status value the console can display, the HUD guide contains a matching plain-language explanation and the action (if any) the player should take.

**Acceptance Scenarios**:

1. **Given** the HUD guide, **When** the status chip shows any of idle/connecting/live/reconnecting/expired/spectating/game_over, **Then** the reader finds each value explained in one sentence.
2. **Given** a finished match, **When** the console announces "Match over", **Then** the manual explains what ends a match and what spectating offers afterward.

---

### User Story 6 - Manual Is Published Automatically (Priority: P2)

As a project owner, I want the manual published to GitHub Pages by a workflow whenever a merge to `main` touches it, so that players always read the current version without downloading the repo.

**Why this priority**: Publishing is the delivery vehicle, but the content is the value; the workflow must not gate the writing.

**Independent Test**: Merge a trivial manual edit to `main`; the Pages site updates with rendered HTML within minutes, and merges that don't touch the manual do not redeploy it.

**Acceptance Scenarios**:

1. **Given** a push to `main` changing files under the manual directory, **When** the workflow runs, **Then** the Pages deployment completes with Jekyll-rendered HTML.
2. **Given** a push to `main` touching only package source, **When** CI runs, **Then** the Pages workflow does not deploy (path filter).
3. **Given** a fork where Pages was never enabled, **When** the workflow runs, **Then** it fails visibly with the documented one-time remedy (set Pages source to "GitHub Actions").

---

### Edge Cases

- What happens when gameplay changes make manual text stale? → FR-012 requires the manual to ride in the same change set as the gameplay change (constitution IV extended to player docs); the path-filtered workflow republishes on merge.
- What if the original Europa's rules differ from ours? → The manual describes this implementation only; where tuning differs from the 1990s original (e.g., the exact flow-rate gradient constants, which the original never documented numerically), the manual documents what ships.
- Who hosts the matches players join? → Irrelevant to the manual: joining is described generically via links; hosting/self-hosting instructions stay out of scope (README territory).
- Can a mobile or tablet player follow the manual? → v1 targets desktop browsers; the manual states this plainly rather than implying touch support.
- Do colorblind readers have a path? → v1 ships a fixed four-color palette; the manual names the colors as shipped and does not promise alternatives.
- What if a reader finds a number in the manual that disagrees with the game? → That is a bug in the manual (FR-002/FR-012); the numbers appendix exists precisely to be auditable against `ENGINE_CONSTANTS`.
- What if the repository owner never enables Pages? → Deploys fail visibly in the Actions tab; SC-004 cannot pass until the one-time setting is flipped (documented, not automatable with the default token).

## Requirements *(mandatory)*

### Functional Requirements

**Content & location**

- **FR-001**: The manual MUST live in-repo as plain Markdown under `docs/manual/`, with `docs/manual/index.md` as the entry page; no static-site generator, build step, or client-side JavaScript is required to author or read it. The repo README MUST link to both the published site and the raw Markdown.
- **FR-002**: All content MUST describe the game as implemented in this repository. Where sources conflict, the implemented feature specs (001–006) and shipped code win over the original archive; zero prose may be copied from `europa-source/` (SOS license — reference material only).
- **FR-003**: The manual MUST contain an objective section covering: victory by last-player-standing (a player is eliminated at zero troops AND zero cities), surrender (with its confirm step and transition to spectator view), and draw by mutual elimination.
 - **FR-004**: The manual MUST contain a getting-into-a-match section describing the v1 join flow: matches are reached via shareable semantic paths carrying the match id (for example, `/match/<id>/join` or `/match/<id>/spectate`); display names identify seats; reconnect state remains in the browser session rather than the URL; an unfilled match shows the waiting-for-opponent overlay until auto-start; reopening one's own path within the grace window reclaims the seat; disconnecting beyond the grace window forfeits.
  - **FR-004a**: Guest/player IDs are non-secret correlation data and may be shown when a handle is unavailable; match IDs identify matches. Bearer session and reconnect tokens MUST remain absent from public URLs, logs, diagnostics, and documentation examples.
- **FR-005**: The manual MUST contain a controls reference whose every row matches the shipped input mapping exactly: pointer region targeting (left-click a cell's N/E/S/W region toggles a pipe toward that region; right-click or Alt+click issues an exclusive pipe replacing all pipes in the cell); keyboard equivalents i/j/k/l = north/west/south/east pipes, Alt+key = exclusive variants, Space = clear all pipes in the cell, p/h = paratroop, g/o = gun, 0–9 = reserves 0–90%, Escape = cancel, arrow keys = move selection; camera: mouse wheel zooms toward the cursor, middle-button drag pans; HUD buttons: order-bar Exclusive toggle and Clear-pipes, reserves slider + digit buttons, Surrender… with confirmation modal.
- **FR-006**: The manual MUST explain each mechanic in plain language with the shipped behavior: cities produce troops every tick until saturated and are capturable; land cells hold up to four directional pipes; slope matters — flow rate is a gradient of the elevation change, downhill pipes flow faster than flat, uphill pipes flow slower, and steep uphill stalls at 0 (exact rates in the numbers appendix, FR-010); unfed stacks decay −1 troop per tick while mutually-fed pairs sustain indefinitely; cells cap at capacity; combat is attrition (equal forces trade equally; the larger side eliminates the smaller and keeps the difference); paratroopers cost 2 troops per 1 landed, fly at most 2 cells (Chebyshev), clear the destination's pipes, and cannot target water; guns cost troops and damage everything in the target cell at resolution time — friendly fire included; reserves hold a percentage (0–90% in 10% steps) back from outflow.
- **FR-007**: The manual MUST explain fog of war as implemented: vision extends a fixed radius (4 cells, Chebyshev) around each of your stacks, unioned across stacks; enemies appear only inside your horizon; there is no memory — abandoned ground goes dark again; spectators see the whole board but cannot issue orders.
- **FR-008**: The manual MUST describe the board: square grid (default 32×32), elevation-shaded terrain, impassable water pools, fair maps — point-symmetric terrain with equal starting cities per player and guaranteed land routes between them — and the per-match terrain-smoothing setting (`terrainSmoothing`, default 4, range 0–8): what it does (gentler elevation changes, more viable cross-map routes), that 0 means no smoothing, and that match hosts can adjust it when creating a match.
- **FR-009**: The manual MUST contain a reading-the-screen guide covering every console status value (`idle`, `connecting`, `live`, `reconnecting`, `expired`, `spectating`, `game_over`) in plain language, plus the tick counter, minimap navigation, order bar, reserves panel, transient feedback messages, waiting-for-opponent overlay, reconnecting banner, surrender modal, and the end-of-match announcement.
- **FR-010**: The manual MUST include a numbers appendix table listing every player-facing tunable exactly as shipped (engine constants, tick cadence of 250 ms ≈ 4 ticks/second, default board size, vision radius, per-player colors, camera zoom bounds), each traceable to `ENGINE_CONSTANTS` / shipped defaults. The pipe-flow rows MUST list `flowBase`, `flowSlopeStep`, `flowSlopeDeltaCap`, and the resulting per-tick rates for downhill, flat, uphill, and stalled pipes (feature 001 FR-007, Clarifications v1.2). The terrain rows MUST list `terrainSmoothing` (default 4, range 0–8) traceable to `DEFAULT_GENERATION_SETTINGS` (feature 003 FR-010).
- **FR-011**: The manual itself MUST be accessible: semantic Markdown rendered to semantic HTML (one h1 per page, hierarchical headings, tables with header rows, alt text on any image, descriptive link text), readable and navigable without JavaScript.
- **FR-012**: Any change set that alters gameplay behavior documented by the manual MUST update the manual in the same change set (constitution IV "specs stay truthful," extended to player-facing docs).
- **FR-017**: The manual index page (`docs/manual/index.md`) MUST close with a footer line stating the application version the manual documents (e.g., "*This manual documents Europa Neo v0.0.1.*"); the version string MUST stay in lockstep with the shipped `APP_VERSION` (enforced by feature 009-shared-app-versioning's drift check), and version-bearing updates ride in the same change set as the change that moves them (FR-012 discipline).

**Publishing**

- **FR-013**: A GitHub Actions workflow MUST publish the manual on push to `main` when the change touches the manual directory (path filter), plus a manual `workflow_dispatch` trigger for republishing on demand.
- **FR-014**: The workflow MUST use the official Pages action pattern — checkout → configure-pages → jekyll-build-pages (source scoped to the manual directory) → upload-pages-artifact → deploy-pages — with the deploy job holding `pages: write` + `id-token: write` permissions and targeting the `github-pages` environment; actions pinned to major version tags. The deployment MUST serve rendered HTML (Jekyll's default Markdown conversion), not raw `.md` downloads.
- **FR-015**: The deployed artifact MUST contain only the manual directory — repository source, packages, specs, and workflows MUST NOT be part of the published site.
- **FR-016**: The workflow file MUST document (in comments) the one-time repository prerequisite: Settings → Pages → Source set to "GitHub Actions", which cannot be automated with the default `GITHUB_TOKEN`.

### Key Entities *(include if feature involves data)*

- **ManualPage**: one Markdown file under `docs/manual/`; single h1, focused topic, linked from the index.
- **ControlReferenceTable**: the controls page's authoritative tables; audited row-by-row against the shipped `DEFAULT_INPUT_MAPPING` and HUD components.
- **NumbersAppendix**: the appendix table mapping each player-facing value to its shipped constant.
- **PagesWorkflow**: the publishing workflow; trigger paths, official action chain, permissions, artifact scope.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Control-reference audit passes with zero drift: every manual row equals the shipped input mapping/HUD behavior, and every shipped player-facing control appears in the manual.
- **SC-002**: Numbers audit passes with zero drift: every value in the numbers appendix matches `ENGINE_CONSTANTS` and shipped defaults exactly.
- **SC-003**: Comprehension playtest: two volunteer playtesters who read only the manual each complete a hosted 2-player match (join via link, issue pipes/reserves/paratroop/gun orders, reach a terminal result) without asking a human for help.
- **SC-004**: Publishing works end-to-end: merging a manual-only change to `main` produces an updated live Pages site with rendered HTML within 5 minutes of the workflow starting; a `main` push touching no manual files triggers no deployment.
- **SC-005**: License hygiene: review confirms zero text copied from `europa-source/` (all mechanics rewritten from implemented-spec descriptions).
- **SC-006**: Accessibility audit of the rendered HTML passes: one h1 per page, hierarchical headings, header rows on all tables, alt text on all images, descriptive link text.

## Assumptions

- English-only in v1; translations are future work.
- Multi-page structure (~13 focused pages + index) chosen over one long page for navigability; still generator-free per the product owner's plain-Markdown decision.
- Default `github.io` Pages URL; custom domains/CDN are out of scope.
- No screenshots in v1: they rot quickly and violate simplicity-over-cleverness; text and tables carry the content. Screenshots may be added later if playtesting proves the need.
- The workflow runs on `ubuntu-latest` with the default `GITHUB_TOKEN`; no secrets required.
- Test-coverage gates (constitution III) do not apply to prose; the honest CI implication is that the Pages workflow is deploy-only — correctness of content is enforced by SC-001/SC-002 audits and SC-003 playtests, not automated tests.

## Out of Scope

- Hosting/self-hosting instructions (README/dev-docs territory; the manual covers playing, not running a server)
- Development, contributor, API, or engine documentation
- Static-site generators, custom themes, site search, analytics, or comments
- Video tutorials, interactive walkthroughs, or an in-game tutorial mode
- Translations / i18n
- Documentation for future features (accounts, ratings ladder, chat, replays)
- Custom domain, CDN, or Pages preview deployments for pull requests

## Manual Content Outline

The manual consists of these pages under `docs/manual/` (one-line purpose each):

| # | Page | Purpose |
| --- | --- | --- |
| 1 | `index.md` | Welcome, 60-second game concept, table of contents linking every page, version footer |
| 2 | `quick-start.md` | From link to first orders: opening a join URL, display name, waiting overlay, first safe things to try |
| 3 | `objective.md` | How to win, how players are eliminated, surrendering, draws |
| 4 | `the-board.md` | Grid, elevation shading and its effect on pipe flow, impassable water, fair symmetric maps |
| 5 | `cities-and-troops.md` | City production, saturation caps, capturing enemy cities |
| 6 | `pipes.md` | Region targeting, four directions, exclusive mode, slope gradient (downhill bonus / uphill handicap / stall), feeding and decay |
| 7 | `combat.md` | Attrition in plain language, when to attack, mutual-feeding stalemates |
| 8 | `special-weapons.md` | Paratroopers (cost, range, pipe-cutting) and guns (cost, damage, friendly fire) |
| 9 | `reserves.md` | Holding troops in place, why reserves beat hoarding in open cells |
| 10 | `fog-of-war.md` | Sensor radius, no memory, what enemies see, spectating |
| 11 | `controls.md` | Complete pointer + keyboard reference tables (the most-revisited page) |
| 12 | `reading-the-screen.md` | HUD tour: status chip values, tick counter, minimap, order bar, reserves panel, feedback, overlays, game over |
| 13 | `numbers.md` | Appendix: every shipped tunable in one auditable table |

## Clarifications

### v1.0 (2026-08-24) — Planner-resolved decisions (zero [NEEDS CLARIFICATION] markers)

All ambiguities were resolved from the repository, the binding product-owner
decisions, or the constitution; none required a further product ruling.
Decisions recorded here for cheap veto:

- **Location**: `docs/manual/` at repo root (not inside `packages/`) — it is
  repo-level documentation, not package code; FR-001.
- **Page structure**: multi-page with index rather than one long page —
  better navigation at negligible cost; Assumptions.
- **Rendering**: Jekyll default conversion via the official
  `actions/jekyll-build-pages` step — raw `.md` uploaded without Jekyll would
  download instead of render; FR-014 makes rendered HTML explicit.
- **Trigger scoping**: path filter on the manual directory +
  `workflow_dispatch` — mirrors the repo's existing path-gated CI convention;
  FR-013.
- **Language/screenshots/theme**: English-only, no screenshots in v1, default
  Jekyll styling — simplest thing that satisfies the owner's "simple
  instruction book"; Assumptions and Out of Scope.

### v1.1 (2026-08-25) — Index-page version footer (feature 009-shared-app-versioning)

- **FR-017 (index footer)**: one content requirement added after
  implementation by feature 009 — the manual index closes with a
  footer line naming the application version the text documents.
  The string is drift-checked against the shipped `APP_VERSION`
  (feature 009 FR-009), so the footer stays mechanically honest
  instead of vigilance-maintained; FR-012's same-change-set rule
  governs every future bump that moves it.

### v1.2 (2026-08-30) — Elevation-gradient pipe flow (issue #30)

- **FR-006 amended**: the slope explanation moves from "downhill flows,
  uphill moves nothing at v1 tuning" to the gradient model — downhill
  faster than flat, uphill slower, steep uphill stalls at 0. **FR-010
  amended** to require the flow-rate rows (`flowBase`, `flowSlopeStep`,
  `flowSlopeDeltaCap`, per-tick rates) in the numbers appendix,
  auditable against `ENGINE_CONSTANTS` per SC-002.
- **Required manual-page updates (FR-012 — same change set as the
  gameplay change)**: `docs/manual/pipes.md` (flow table and the
  "classic new-player trap" section rewritten for the gradient; stalled
  pipes documented as visible hollow triangles per feature 005 FR-013),
  `docs/manual/numbers.md` (flow rows replaced with the new constants
  and rates), `docs/manual/index.md` (60-second version's "downhill
  pipes flow while uphill pipes sit idle" → gradient phrasing), and
  `docs/manual/the-board.md` (elevation-shading section: downhill
  bonus / uphill handicap / stall). These pages land with the engine
  change in the implementation change set; this spec amendment is the
  requirement record.
- **Tuning values** (from feature 001 Clarifications v1.1):
  `flowBase = 3`, `flowSlopeStep = 1`, `flowSlopeDeltaCap = 5`; uphill
  stalls at Δ ≥ 3. The manual's numbers appendix must trace each to
  `ENGINE_CONSTANTS`.

### v1.3 (2026-08-30) — Terrain smoothing + re-validated flow tuning (issue #30 scope extension)

- **FR-008 amended**: the board description gains the per-match
  `terrainSmoothing` setting (default 4, range 0–8) — what it does,
  that 0 means no smoothing, and that hosts adjust it at match
  creation. **FR-010 amended**: the numbers appendix gains the
  `terrainSmoothing` row traceable to `DEFAULT_GENERATION_SETTINGS`
  (feature 003 FR-010).
- **Tuning values superseded** (feature 001 Clarifications v1.2):
  `flowBase` rises 3 → 7 (stall threshold Δ ≥ 7); `flowSlopeStep = 1`,
  `flowSlopeDeltaCap = 5` unchanged. The v1.2 Clarifications entry
  above is superseded for the flow rows; the numbers appendix must
  trace the new values to `ENGINE_CONSTANTS` per SC-002.
- **Required manual-page updates (FR-012 — same change set as the
  gameplay change)**: `docs/manual/the-board.md` (elevation-shading
  section: downhill bonus / uphill handicap / stall, plus a
  terrain-smoothing paragraph — what the setting does, default 4,
  range 0–8, and that smoother maps have more viable cross-map
  routes), `docs/manual/numbers.md` (flow rows updated to the v1.2
  values + `terrainSmoothing` row), `docs/manual/pipes.md` (flow
  table updated to the v1.2 rates), and `docs/manual/index.md`
  (60-second version's terrain phrasing if it mentions roughness).
  These pages land with the engine + terrain changes in the
  implementation change set; this spec amendment is the requirement
  record.
