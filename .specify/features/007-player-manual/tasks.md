# Tasks: Player Manual & GitHub Pages Publishing (Feature 007)

**Input**: Design documents from `.specify/features/007-player-manual/`
**Prerequisites**: `plan.md` (required), `spec.md` (required), `research.md` (the audit shelf — every writing task below verifies against it)
**Branch**: `001-europa-core` (folded into PR #1 — no separate branch; never commit to `main`)
**Spec**: [spec.md](./spec.md) — 6 user stories (US1–US3 = P1, US4–US6 = P2), 16 functional requirements (FR-001..FR-016), 6 success criteria

**Tests**: Not applicable to prose — spec Assumptions scope constitution III coverage gates out of this feature. Instead, **every writing task embeds its own accuracy verification** against the exact files in `research.md` §2, and Phase 7 runs the five audits (SC-001/SC-002/SC-005/SC-006 structural + workflow validation). SC-003 (comprehension playtest) and SC-004's live-deploy proof are post-merge owner follow-ups by design.

**Organization**: Content pages are written in spec-priority order (P1 stories first), one task per page, each independently completable in a sitting. The publishing workflow is independent of content and can be built any time after Phase 1. Solo-sized throughout; `[P]` marks tasks with no file overlap.

## Format: `[ID] [P?] Description`

- **[P]**: different files, no dependency on an incomplete task
- Every task names exact paths; every content task ends with a verification step citing `research.md`

---

## Phase 1: Setup & Scaffold

**Purpose**: Create the directory and the entry page that everything else links from.

- [x] T001 Create `docs/manual/` and write `docs/manual/index.md` — welcome heading (single h1), 60-second game concept (adapted from README §"Game concept", rewritten for players), a plain statement of v1 scope (desktop browsers, English, two-player matches via join links), and a table of contents linking all twelve sibling pages (`./quick-start.md` … `./numbers.md`) using **relative links only** (plan.md Risk 2). ToC entries may be placeholder-titled until pages land, but every link target filename must match the spec outline exactly. Verify: exactly one h1; links resolve to files that will exist by Phase 4's end.

**Checkpoint**: `docs/manual/index.md` exists; directory matches plan.md Project Structure.

---

## Phase 2: P1 Content Pages (US1–US3)

**Purpose**: The three make-or-break pages. Each task = write + verify against shipped code.

- [x] T002 Write `docs/manual/objective.md` (US1 · FR-003): last-player-standing victory (elimination = zero troops AND zero cities), surrender incl. the confirmation modal step and flip to spectator view, draw by mutual elimination; name cities/troops/pipes as the player's levers. Verify against `packages/engine/src/resolution/terminal.ts` + `capture.ts` and spec 001's terminal FRs. Comprehension bar (US1 Independent Test): a reader of this page alone can state how matches end.
- [x] T003 Write `docs/manual/quick-start.md` (US2 · FR-004): what a join URL contains (match id, optional seat token, display name), opening it lands you seated or on the waiting-for-opponent overlay (auto-hides at first tick when the match auto-starts), refreshing your own link within the grace window reclaims your seat, dropping beyond it forfeits (`expired`); suggest first safe things to try (click pipes, set reserves). Verify against `packages/console/src/internal/live-runtime.tsx`, `packages/console/scripts/host.ts`, `NETWORK_CONSTANTS.defaultReconnectGraceMs` (60 s), `packages/console/src/ui/waiting-overlay.tsx`. Nuances: research.md §4 items 5.
- [x] T004 Write `docs/manual/controls.md` (US3 · FR-005) — the most-revisited page: pointer table (left-click cell region toggles pipe toward that region; right-click OR Alt+click = exclusive pipe replacing all others), keyboard table (i/j/k/l, Alt+variants, Space, p/h, g/o, 0–9, Escape, arrows), camera rows (wheel zoom-toward-cursor, middle-drag pan), HUD buttons (order-bar Exclusive toggle + Clear-pipes, reserves slider + digit buttons, Surrender… with confirm). Verify row-by-row BOTH directions against `DEFAULT_INPUT_MAPPING` (`packages/console/contracts/console-types.ts`) + `src/ui/order-bar.tsx` + `src/ui/reserves-panel.tsx` + `src/render/SurrenderModal.tsx` — every manual row matches code AND every shipped control appears (SC-001 method). Record the audit pass/fail in the task notes.

**Checkpoint**: US1–US3 acceptance scenarios are satisfiable from these three pages alone.

---

## Phase 3: P2 Mechanics Pages (US4)

**Purpose**: Plain-language mechanics with the real numbers. All seven tasks are mutually independent.

- [x] T005 [P] Write `docs/manual/the-board.md` (FR-008): square grid (default 32×32), elevation shading, impassable water pools, fair point-symmetric maps with equal starting cities and guaranteed land routes. Verify vs spec 003 + `packages/terrain/src/constants.ts` + `src/render/palette.ts`.
- [x] T006 [P] Write `docs/manual/cities-and-troops.md` (FR-006): cities produce 1 troop/tick until saturated at 30, capturable by elimination-of-occupants rules. Verify vs `resolution/production.ts` + `resolution/capture.ts`.
- [x] T007 [P] Write `docs/manual/pipes.md` (FR-006): region targeting recap, up to four directional pipes/cell, flow moves 1 troop/tick downhill or flat, **uphill pipes move nothing at v1 tuning**, feeding prevents decay, unfed stacks lose 1 troop/tick, mutual feeding sustains indefinitely. Verify vs `resolution/flow.ts` + `resolution/decay.ts` (`flowUphillFactor: 0`). Nuance: research.md §4 items 1, 4.
- [x] T008 [P] Write `docs/manual/combat.md` (FR-006): attrition in plain language (equal forces trade equally; larger side eliminates smaller and keeps the difference), when attacking pays, mutual-feeding stalemate callout. Verify vs `resolution/combat.ts`.
- [x] T009 [P] Write `docs/manual/special-weapons.md` (FR-006): paratroopers cost twice what lands (order = −20 source, +10 target), fly ≤ 2 cells Chebyshev, clear destination pipes, cannot target water; guns cost 5, deal 2 damage to everything in the target cell at resolution time — friendly fire included. Verify vs `resolution/paratroop.ts` + `resolution/gun.ts` + console preflight. Nuance: research.md §4 items 2, 3.
- [x] T010 [P] Write `docs/manual/reserves.md` (FR-006): reserves hold a percentage back from outflow, digits 0–9 → 0–90% in 10% steps (never 100%), why reserving beats hoarding in open cells (open cells cap at 30). Verify vs engine reserves rule + `src/input/order-reserves.ts`.
- [x] T011 [P] Write `docs/manual/fog-of-war.md` (FR-007): vision = union of 4-cell Chebyshev radii around your stacks, enemies visible only inside your horizon, no memory (abandoned ground goes dark), spectators see everything but issue no orders. Verify vs spec 002 + `visibilityRadiusDefault`.

**Checkpoint**: US4 Independent Test answerable — given two stacks' numbers and pipe setup from these pages, a reader predicts the engagement winner and decay behavior.

---

## Phase 4: P2 Reference Pages (US5)

- [x] T012 Write `docs/manual/reading-the-screen.md` (FR-009): HUD tour — all seven status values (`idle`, `connecting`, `live`, `reconnecting`, `expired`, `spectating`, `game_over`) each explained in one sentence with the action to take (use research.md §3 status table as source text), tick counter, minimap navigation, order bar, reserves panel, transient feedback messages, waiting overlay, reconnecting banner, surrender modal, end-of-match announcement + what spectating offers afterward. Verify vs `src/net/connection.ts` + `src/render/App.tsx` + overlays.
- [x] T013 Write `docs/manual/numbers.md` (FR-010): single auditable table from research.md §5 — every player-facing tunable with its shipped value and constant name (tick cadence, board size, vision radius, production/caps/decay/flow/paratroop/gun numbers, grace window, reserves steps, zoom bounds, player colors). Verify EVERY row against its constant declaration line (SC-002 method); fix any drift found by updating the page, never the code.

**Checkpoint**: All 13 pages exist; index ToC links all resolve.

---

## Phase 5: Publishing Workflow (US6)

- [x] T014 Create `.github/workflows/pages-deploy.yml` per plan.md §Publishing Workflow Design: triggers `push` → `branches: [main]` + `paths: ['docs/manual/**', '.github/workflows/pages-deploy.yml']`, plus `workflow_dispatch`; top-level `permissions: { contents: read }`; job `build` (checkout → `actions/configure-pages` → `actions/jekyll-build-pages` with `source: ./docs/manual`, `destination: ./_site` → `actions/upload-pages-artifact` with `path: ./_site`); job `deploy` (`needs: build`, environment `github-pages` with url output, `permissions: { pages: write, id-token: write }`, `actions/deploy-pages` id `deployment`); `concurrency: { group: pages, cancel-in-progress: false }`. Pin every action to its current full commit SHA with a trailing version comment (repo convention from commit `2835e64`; re-verify latest majors at implementation — planning-time majors: checkout v4.x, configure-pages v6.x, jekyll-build-pages v1.x, upload-pages-artifact v3.x, deploy-pages v5.x). Include the FR-016 header comment documenting the one-time admin prerequisite (Settings → Pages → Source = "GitHub Actions") and the visible-failure remedy.
- [x] T015 Validate the workflow: YAML parses cleanly (e.g., `node -e "require('js-yaml')…"` or `actionlint` if available); structural conformance check against the official pattern (source/destination paths agree between build + upload steps; permissions minimal; no secrets; artifact contains only `docs/manual` render output). Record the honest limitation in the PR description: this workflow cannot execute pre-merge (main-only trigger); live proof is SC-004, post-merge.

**Checkpoint**: Workflow file valid and convention-conformant; deployment note ready for README.

---

## Phase 6: Integration Touch-ups

- [x] T016 Update `README.md`: under Quick start (or a new short "Player manual" subsection), link both the published Pages site (default `https://shaunburdick.github.io/europa-neo/` — confirm repo-slug URL at implementation) and the raw Markdown entry (`docs/manual/index.md`), plus the one-line Pages-enablement note for fork owners. Gameplay-content ONLY — do not add hosting/contributor docs here (binding product-owner decision).
- [x] T017 Update `AGENTS.md` Current state: feature 007 planning complete (plan/research/tasks committed; implementation pending), plus the standing FR-012 policy note ("changesets that alter gameplay documented by the manual must update `docs/manual/` in the same change set" — constitution IV extended to player docs).

---

## Phase 7: Final Validation & Commit

- [x] T018 Cross-page consistency pass: every relative link resolves within `docs/manual/`; terminology consistent across pages (one canonical name per concept — e.g., always "exclusive pipe", always "region"); no page promises what v1 doesn't ship (no lobby, no mobile, no translations); filenames match the spec outline exactly.
- [x] T019 Audit sweep: SC-006 structural a11y pass (exactly one h1/page, hierarchical headings, header row on every table, descriptive link text, no images ⇒ alt-text rule vacuous); SC-005 license hygiene sweep per research.md §6; SC-002 numbers re-audit of `numbers.md` against constants; spot re-check of `controls.md` rows (SC-001). Fix findings in the same sitting.
- [x] T020 Final verification & commit: run repo checks that apply to touched files (`pnpm lint`, `pnpm format:check` — Biome ignores Markdown but the workflow YAML and any incidental edits must not break checks); `git branch --show-current` confirms `001-europa-core`; stage `docs/manual/`, `.github/workflows/pages-deploy.yml`, `README.md`, `AGENTS.md`, `.specify/features/007-player-manual/`; commit `feat(007): add player manual and Pages publish workflow` (or split docs/ci commits if cleaner). Do NOT push — PR #1 absorbs the work per product-owner decision.

---

## Task dependency graph (waves)

```
Wave 1: T001
Wave 2: T002, T003, T004        (P1 pages; parallel-safe, distinct files)
Wave 3: T005..T011              ([P] mechanics pages)
Wave 4: T012, T013              (reference pages; benefit from waves 2–3 existing)
Wave 5: T014, T015              (workflow — independent of content, may run any time after Wave 1)
Wave 6: T016, T017              (integration touch-ups; need final page set + workflow name)
Wave 7: T018, T019, T020        (audits then commit — strictly sequential)
```

Solo-execution note: waves exist so a future orchestrator can parallelize; a solo implementer simply runs T001→T020 in order.

---

## Implementation audit record (2026-08-24)

- **T004 / SC-001 controls audit: PASS (zero drift, both directions).** Every `controls.md` row matched against `DEFAULT_INPUT_MAPPING` (`packages/console/contracts/console-types.ts:728`) + `order-bar.tsx` + `reserves-panel.tsx` + `SurrenderModal.tsx` + `region-select.ts` (Alt+click exclusive intent) + `zoom.ts`/`ZoomPanController` (wheel zoom-toward-cursor, middle-drag pan); reverse walk confirmed every shipped player-facing control appears in the manual. Toggle semantics verified (`present → clearPipe, absent → setPipe`).
- **SC-002 numbers audit: PASS (zero drift).** All 18 `numbers.md` rows traced to declaration lines: engine constants (`packages/engine/src/constants.ts:33-69`), `SUBCELL_RANGE`/`DEFAULT_CAMERA`/`DEFAULT_PLAYER_COLORS` (`console-types.ts:247,473-496`), `defaultReconnectGraceMs` (`networking/constants.ts:89`), `DEFAULT_MATCH_SETTINGS.boardSize` (`matchmaking/contracts/match-types.ts:315`), `emptyMatchTtlMs` (`matchmaking/src/constants.ts:30`), reserves mapping (`src/input/order-reserves.ts`).
- **SC-005 license sweep: PASS.** Mechanical n-gram comparison of all 13 pages vs all archive HTML: zero shared 6-grams; the single 5-gram overlap is the compass enumeration "north, east, south, or west" (functional vocabulary, structurally different sentences — "same facts, different sentences" bar met).
- **SC-006 structural a11y: PASS.** Automated per-page check: exactly one h1, no heading level jumps, header separator on every table, zero nondescriptive link texts, zero images (alt-text rule vacuous).
- **Cross-page consistency (T018): PASS.** 43/43 automated checks: 13 pages exactly matching the spec outline; every intra-manual link relative and resolving; no http(s) links between pages; forbidden-promise grep clean (all "lobby"/"touch" hits are negative statements or substrings like "untouched").
- **Workflow validation (T015): PASS.** 20/20 structural checks (YAML parse, triggers, permission minimality, official chain order, source/destination agreement, SHA+version-comment pinning ×5, no secrets, concurrency). Live deploy proof remains SC-004, post-merge by design.
- **PM-notable finding:** shipped `ConsoleConnectionStatus` has EIGHT values — FR-009's parenthetical enumerated seven. Manual documents all eight (`closed` included) per FR-009's operative "every console status value" wording; flagged for the product owner in the PR description.
