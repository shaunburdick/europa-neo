# Tasks: Astro Migration for Player Manual

## Group 1: Astro Scaffolding

Foundation tasks that set up the Astro project structure. Must be completed before any page migration.

- [ ] T-001: **Create `docs/manual/package.json`** with `astro`, `@astrojs/mdx`, `@europa/design` (workspace), and `unist-util-visit` as dependencies; add `build` and `preview` scripts. **S** — Covers AC-002, NFR-005.

- [ ] T-002: **Create `docs/manual/astro.config.mjs`** with `site`, `base`, `output: 'static'`, `@astrojs/mdx` integration, and rehype plugin registration. **S** — Covers AC-001, FR-002, FR-003, FR-004.

- [ ] T-003: **Create `docs/manual/tsconfig.json`** extending Astro's recommended config. **S** — Supporting file.

- [ ] T-004: **Create `docs/manual/rehype-europa-tables.mjs`** — custom rehype plugin that adds `class="europa-table"` to every `<table>` element using `unist-util-visit`. **S** — Covers FR-004, FR-008, AC-006.

- [ ] T-005: **Create `docs/manual/src/layouts/ManualLayout.astro`** — shared HTML shell with `<html lang="en">`, meta tags, CSS link to `/europa-neo/design.css`, body classes `europa-page europa-stack`, branded footer with version, and `<script>` importing `register()` from `@europa/design/components`. **M** — Covers FR-005, FR-006, FR-031, AC-003, AC-005.

- [ ] T-006: **Move `docs/manual/assets/design.css` to `docs/manual/public/design.css`** — byte-identical copy; verify with sha256sum. **S** — Covers FR-006, AC-005.

- [ ] T-007: [P] **Verify Astro scaffolding builds** — run `pnpm --filter @europa/manual build` (or `pnpm install && pnpm build` from `docs/manual/`); confirm `dist/` is produced with zero errors. **S** — Covers AC-025, NFR-001.

## Group 2: Page Migration

Move all 14 `.md` files to `.mdx`, add frontmatter, remove Jekyll annotations, and fix internal links. These tasks are sequential within each page but some pages are independent.

- [ ] T-008: **Migrate `index.md` → `src/pages/index.mdx`** — add `layout` frontmatter, remove `{: .europa-typography--meta }` annotation (FR-011), update all `./page.md` links to `./page` format (FR-030), deduplicate any repeated content. **M** — Covers FR-007, FR-028, FR-030, AC-004, AC-010, AC-030.

- [ ] T-009: **Migrate `quick-start.md` → `src/pages/quick-start.mdx`** — add frontmatter, fix links, deduplicate the paragraph at lines 19–24 (FR-019). **M** — Covers FR-007, FR-019, FR-028, FR-030, AC-004, AC-016, AC-030, AC-031.

- [ ] T-010: **Migrate `objective.md` → `src/pages/objective.mdx`** — add frontmatter, fix links. **S** — Covers FR-007, FR-028, FR-030, AC-004, AC-030.

- [ ] T-011: **Migrate `the-board.md` → `src/pages/the-board.mdx`** — add frontmatter, fix links. **S** — Covers FR-007, FR-028, FR-030, AC-004, AC-030.

- [ ] T-012: **Migrate `cities-and-troops.md` → `src/pages/cities-and-troops.mdx`** — add frontmatter, fix links. **S** — Covers FR-007, FR-028, FR-030, AC-004, AC-030.

- [ ] T-013: **Migrate `pipes.md` → `src/pages/pipes.mdx`** — add frontmatter, fix links. **S** — Covers FR-007, FR-028, FR-030, AC-004, AC-030.

- [ ] T-014: **Migrate `combat.md` → `src/pages/combat.mdx`** — add frontmatter, fix links. **S** — Covers FR-007, FR-028, FR-030, AC-004, AC-030.

- [ ] T-015: **Migrate `special-weapons.md` → `src/pages/special-weapons.mdx`** — add frontmatter, fix links. **S** — Covers FR-007, FR-028, FR-030, AC-004, AC-030.

- [ ] T-016: **Migrate `reserves.md` → `src/pages/reserves.mdx`** — add frontmatter, fix links. **S** — Covers FR-007, FR-028, FR-030, AC-004, AC-030.

- [ ] T-017: **Migrate `fog-of-war.md` → `src/pages/fog-of-war.mdx`** — add frontmatter, fix links. **S** — Covers FR-007, FR-028, FR-030, AC-004, AC-030.

- [ ] T-018: **Migrate `controls.md` → `src/pages/controls.mdx`** — add frontmatter, fix links. **S** — Covers FR-007, FR-028, FR-030, AC-004, AC-030.

- [ ] T-019: **Migrate `reading-the-screen.md` → `src/pages/reading-the-screen.mdx`** — add frontmatter, fix links. **S** — Covers FR-007, FR-028, FR-030, AC-004, AC-030.

- [ ] T-020: **Migrate `numbers.md` → `src/pages/numbers.mdx`** — add frontmatter, fix links. **S** — Covers FR-007, FR-028, FR-030, AC-004, AC-030.

- [ ] T-021: **Migrate `lobby.md` → `src/pages/lobby.mdx`** — add frontmatter, fix links. **S** — Covers FR-007, FR-029, FR-030, AC-004, AC-030.

- [ ] T-022: **Remove all 23 `{: .europa-table }` annotations** across all migrated MDX files — verify zero remain with grep. **S** — Covers FR-008, AC-007.

- [ ] T-023: **Verify build after page migration** — run `pnpm build` from `docs/manual/`; confirm all 14 HTML pages are in `dist/` and no MDX parse errors occur. **S** — Covers AC-004, AC-025.

## Group 3: Component Integration

Per-page improvements adding inline `<europa-*>` tags. Each task is independent (different pages).

- [ ] T-024: [P] **`index.mdx` — component integration** — replace `<div class="europa-card">` with `<europa-card>` (FR-009, AC-009); replace `{: .europa-typography--meta }` with `<europa-typography variant="caption">` (FR-011, AC-010). **S** — Covers FR-009, FR-011, FR-018, AC-009, AC-010.

- [ ] T-025: [P] **`reading-the-screen.mdx` — component integration** — replace all 8 `<span class="europa-chip">` with `<europa-badge>` (FR-010, FR-017). Verify zero `<span class="europa-chip">` remain. **S** — Covers FR-010, FR-017, AC-008.

- [ ] T-026: [P] **`numbers.mdx` — component integration** — add `<europa-troop-chip>` for troop counts, `<europa-pipe-slope>` for pipe flow rows, `<europa-reserve-indicator>` for reserve values, `<europa-player-badge>` for player color rows, `<europa-chip>` for numeric values. All attributes must use shipped constant values. **M** — Covers FR-012, AC-011.

- [ ] T-027: [P] **`pipes.mdx` — component integration** — add `<europa-pipe-slope direction="...">` in the flow-rate table and pipe slope color table. **S** — Covers FR-013, AC-012.

- [ ] T-028: [P] **`combat.mdx` — component integration** — add `<europa-troop-chip>` in the attrition table's "Your troops" and "Enemy troops" columns. **S** — Covers FR-014, AC-013.

- [ ] T-029: [P] **`special-weapons.mdx` — component integration** — add `<europa-troop-chip>` for cost/landed values; wrap "Friendly fire is real" section in `<europa-banner variant="alert">`. **S** — Covers FR-015, AC-014.

- [ ] T-030: [P] **`reserves.mdx` — component integration** — add `<europa-reserve-indicator percent="N">` for each digit row (0, 10, 50, 90). **S** — Covers FR-016, AC-015.

- [ ] T-031: [P] **`quick-start.mdx` — component integration** — wrap each step section in `<europa-plate>`. **S** — Covers FR-019 (plate wrapping), AC-016.

- [ ] T-032: [P] **`fog-of-war.mdx` — component integration** — add decorative `<europa-fog-overlay aria-hidden="true">` to the "Your sensor horizon" section. **S** — Covers FR-020, AC-017.

- [ ] T-033: [P] **`the-board.mdx` — component integration** — add `<europa-elevation-swatch elevation="N">` at representative values (0, 25, 50, 75, 100) in the elevation-shading section. **S** — Covers FR-021, AC-018.

- [ ] T-034: [P] **`objective.mdx` — component integration** — add `<europa-badge>` for each outcome type in the quick-reference table. **S** — Covers FR-022, AC-019.

- [ ] T-035: [P] **`controls.mdx` — component integration** — add `<europa-badge>` for each key name in the keyboard table. **S** — Covers FR-023, AC-020.

- [ ] T-036: [P] **`cities-and-troops.mdx` — component integration** — add `<europa-chip count="30">` for the saturation cap. **S** — Covers FR-024, AC-021.

- [ ] T-037: **Verify build after component integration** — run `pnpm build` from `docs/manual/`; confirm all pages render without MDX parse errors and components are present in HTML output. **S** — Covers AC-025, AC-026.

## Group 4: Content Rewrite (FR-033–FR-037)

Prose improvements applied to each page. These are interleaved with the migration (Group 2) and component tasks (Group 3) in practice, but listed separately for clarity. Each page is rewritten once — the tasks below capture the per-page rewrite scope.

- [ ] T-038: [P] **`index.mdx` — content rewrite** — add opening purpose statement (FR-034); rewrite prose for clarity and tone (FR-033); ensure consistent terminology (FR-036). **S** — Covers FR-033, FR-034, FR-036, AC-032, AC-033.

- [ ] T-039: [P] **`quick-start.mdx` — content rewrite** — add purpose statement (FR-034); merge duplicate paragraphs (lines 19–24); rewrite for flow and clarity (FR-033, FR-035). **M** — Covers FR-033, FR-034, FR-035, AC-031, AC-032.

- [ ] T-040: [P] **`objective.mdx` — content rewrite** — add purpose statement; rewrite for clarity. **S** — Covers FR-033, FR-034, AC-032.

- [ ] T-041: [P] **`the-board.mdx` — content rewrite** — add purpose statement; rewrite for flow. **S** — Covers FR-033, FR-034, AC-032.

- [ ] T-042: [P] **`cities-and-troops.mdx` — content rewrite** — add purpose statement; rewrite for clarity. **S** — Covers FR-033, FR-034, AC-032.

- [ ] T-043: [P] **`pipes.mdx` — content rewrite** — add purpose statement; rewrite slope/flow explanation for clarity; ensure terminology consistency. **S** — Covers FR-033, FR-034, FR-036, AC-032, AC-033.

- [ ] T-044: [P] **`combat.mdx` — content rewrite** — add purpose statement; rewrite attrition explanation for clarity. **S** — Covers FR-033, FR-034, AC-032.

- [ ] T-045: [P] **`special-weapons.mdx` — content rewrite** — add purpose statement; rewrite for flow. **S** — Covers FR-033, FR-034, AC-032.

- [ ] T-046: [P] **`reserves.mdx` — content rewrite** — add purpose statement; rewrite for clarity. **S** — Covers FR-033, FR-034, AC-032.

- [ ] T-047: [P] **`fog-of-war.mdx` — content rewrite** — add purpose statement; rewrite for clarity. **S** — Covers FR-033, FR-034, AC-032.

- [ ] T-048: [P] **`controls.mdx` — content rewrite** — add purpose statement; ensure code formatting consistency (FR-037). **S** — Covers FR-033, FR-034, FR-037, AC-032.

- [ ] T-049: [P] **`reading-the-screen.mdx` — content rewrite** — add purpose statement; rewrite for flow. **S** — Covers FR-033, FR-034, AC-032.

- [ ] T-050: [P] **`numbers.mdx` — content rewrite** — add purpose statement; rewrite for clarity. **S** — Covers FR-033, FR-034, AC-032.

- [ ] T-051: [P] **`lobby.md` — content rewrite** — add purpose statement; rewrite for clarity. **S** — Covers FR-033, FR-034, AC-032.

- [ ] T-052: **Cross-page terminology audit** — grep all MDX files for inconsistent terms ("units", "soldiers", "conduits", etc.); standardize to canonical terms ("troops", "pipes"). **S** — Covers FR-036, AC-033, AC-034.

## Group 5: CI Workflow Update

- [ ] T-053: **Rewrite `.github/workflows/pages-deploy.yml`** — replace Jekyll chain with `withastro/action@v6` (SHA-pinned `e84f40bd8d2caa9e768ec82ad30dd81f0b280853`); update privacy check path to `docs/manual/dist/`; remove Jekyll-specific path filter entries; keep `docs/manual/**` and workflow file as triggers; preserve permissions model, concurrency group, and one-time prerequisite comment. **M** — Covers FR-025, FR-026, FR-027, AC-022, AC-023, AC-024, NFR-006.

- [ ] T-054: **Update version drift checker** — modify `packages/version/scripts/gather-version-sources.ts` to scan `docs/manual/src/pages/index.mdx` instead of `docs/manual/index.md`; remove `docs/manual/_config.yml` source; update corresponding tests. **M** — Covers FR-031, FR-032.

## Group 6: Verification and Acceptance

Final verification that all acceptance criteria are met.

- [ ] T-055: **Delete Jekyll artifacts** — remove `docs/manual/_config.yml`, `docs/manual/_layouts/default.html`, `docs/manual/assets/` directory. Verify no references to deleted files remain in tracked files. **S** — Covers cleanup.

- [ ] T-056: **Add `docs/manual` to pnpm workspace** — add `"docs/manual"` to `pnpm-workspace.yaml` packages list so `pnpm install` resolves the workspace dependencies. **S** — Supporting task.

- [ ] T-057: **Full build verification** — run `pnpm install && pnpm build` from repo root (or `pnpm --filter @europa/manual build`); confirm `docs/manual/dist/` contains all 14 HTML pages; verify `design.css` is in the output. **S** — Covers AC-025.

- [ ] T-058: **Browser rendering verification** — open 3+ rendered pages in a browser; confirm `<europa-*>` components render as styled elements (not raw tags); confirm footer shows version; confirm body has dark background. **M** — Covers AC-026.

- [ ] T-059: **No-JS degradation check** — load a rendered page with JavaScript disabled; confirm all prose, tables, and links are readable; confirm no error messages in console. **S** — Covers AC-027, US5.

- [ ] T-060: **Control-reference audit** — run spec 007 SC-001 audit against migrated `controls.mdx`; confirm zero drift (every row matches `DEFAULT_INPUT_MAPPING` and HUD behavior). **M** — Covers AC-028, US3.

- [ ] T-061: **Numbers-appendix audit** — run spec 007 SC-002 audit against migrated `numbers.mdx`; confirm zero drift (every value matches `ENGINE_CONSTANTS`). **M** — Covers AC-029, US3.

- [ ] T-062: **Link verification** — grep all MDX files for internal links; verify each resolves to an existing page in the built output. **S** — Covers AC-030.

- [ ] T-063: **No duplicate paragraphs** — grep all MDX files for repeated content; confirm the `quick-start.mdx` duplicate (FR-019) is resolved. **S** — Covers AC-031.

- [ ] T-064: **Purpose statements** — verify every page has an opening paragraph stating its purpose (FR-034). **S** — Covers AC-032.

- [ ] T-065: **Terminology consistency** — verify no "units", "soldiers", or "conduits" appear; all references use "troops", "pipes", etc. **S** — Covers AC-033.

- [ ] T-066: **Sequential readability** — read pages in index order (index → quick-start → objective → the-board → ...); confirm logical flow without information gaps or repetitions. **M** — Covers AC-034.

- [ ] T-067: **Version drift check** — run `pnpm version:check`; confirm the new path `docs/manual/src/pages/index.mdx` is scanned and passes. **S** — Covers FR-031, FR-032.

- [ ] T-068: **Workflow dry-run verification** — verify the updated workflow YAML is valid (parse with `actionlint` or manual review); confirm SHA pins are correct; confirm path filters are correct. **S** — Covers FR-025, FR-027, NFR-006.

## User Story Coverage

All 6 user stories are verified through their associated acceptance criteria:

| US | Verified via ACs | Tasks |
|----|-----------------|-------|
| US1 (Live components) | AC-026 | T-037, T-058 |
| US2 (Auto-deploy) | AC-022, AC-023, AC-024 | T-053, T-068 |
| US3 (Content accuracy) | AC-028, AC-029 | T-060, T-061 |
| US4 (Local build) | AC-025 | T-007, T-023, T-037, T-057 |
| US5 (No-JS degradation) | AC-027 | T-059 |
| US6 (Content rewrite) | AC-031, AC-032, AC-033, AC-034 | T-038–T-052, T-063–T-066 |

## FR Coverage Matrix

| FR | Task(s) |
|----|---------|
| FR-001 (Astro structure) | T-001, T-002, T-005 |
| FR-002 (site/base config) | T-002 |
| FR-003 (static output) | T-002 |
| FR-004 (rehype plugin) | T-002, T-004 |
| FR-005 (layout shell) | T-005 |
| FR-006 (vendored CSS) | T-005, T-006 |
| FR-007 (MDX format) | T-008–T-021 |
| FR-008 (remove table annotations) | T-022 |
| FR-009 (card component) | T-024 |
| FR-010 (badge for chips) | T-025 |
| FR-011 (typography for footer) | T-024 |
| FR-012 (numbers components) | T-026 |
| FR-013 (pipe slope components) | T-027 |
| FR-014 (troop chips in combat) | T-028 |
| FR-015 (special weapons components) | T-029 |
| FR-016 (reserve indicators) | T-030 |
| FR-017 (reading-screen badges) | T-025 |
| FR-018 (index components) | T-024 |
| FR-019 (quick-start plates + dedup) | T-009, T-031 |
| FR-020 (fog overlay demo) | T-032 |
| FR-021 (elevation swatches) | T-033 |
| FR-022 (objective badges) | T-034 |
| FR-023 (controls badges) | T-035 |
| FR-024 (chip for saturation) | T-036 |
| FR-025 (workflow update) | T-053 |
| FR-026 (prerequisite comment) | T-053 |
| FR-027 (path filter update) | T-053 |
| FR-028 (content preservation) | T-008–T-021, T-038–T-051 |
| FR-029 (lobby migration) | T-021 |
| FR-030 (link updates) | T-008–T-021 |
| FR-031 (version footer) | T-005, T-054 |
| FR-032 (drift check) | T-054, T-067 |
| FR-033 (prose clarity) | T-038–T-051 |
| FR-034 (purpose statements) | T-038–T-051, T-064 |
| FR-035 (logical flow) | T-038–T-051 |
| FR-036 (terminology) | T-052, T-065 |
| FR-037 (code formatting) | T-048 |

## AC Verification Map

| AC | Verified by Task |
|----|-----------------|
| AC-001 (astro.config.mjs) | T-002, T-007 |
| AC-002 (package.json) | T-001, T-007 |
| AC-003 (ManualLayout.astro) | T-005, T-057 |
| AC-004 (14 MDX pages build) | T-023, T-057 |
| AC-005 (design.css vendored) | T-006, T-057 |
| AC-006 (rehype plugin works) | T-004, T-023 |
| AC-007 (zero table annotations) | T-022 |
| AC-008 (zero europa-chip spans) | T-025 |
| AC-009 (card component) | T-024 |
| AC-010 (typography footer) | T-024 |
| AC-011 (numbers components) | T-026 |
| AC-012 (pipe slope components) | T-027 |
| AC-013 (combat troop chips) | T-028 |
| AC-014 (special weapons components) | T-029 |
| AC-015 (reserve indicators) | T-030 |
| AC-016 (quick-start plates + dedup) | T-009, T-031 |
| AC-017 (fog overlay) | T-032 |
| AC-018 (elevation swatches) | T-033 |
| AC-019 (objective badges) | T-034 |
| AC-020 (controls badges) | T-035 |
| AC-021 (chip for saturation) | T-036 |
| AC-022 (workflow SHA-pinned) | T-053, T-068 |
| AC-023 (path filter) | T-053, T-068 |
| AC-024 (privacy check) | T-053 |
| AC-025 (build produces output) | T-007, T-023, T-037, T-057 |
| AC-026 (components render) | T-037, T-058 |
| AC-027 (no-JS degradation) | T-059 |
| AC-028 (control audit) | T-060 |
| AC-029 (numbers audit) | T-061 |
| AC-030 (links resolve) | T-062 |
| AC-031 (no duplicates) | T-063 |
| AC-032 (purpose statements) | T-064 |
| AC-033 (terminology) | T-065 |
| AC-034 (sequential readability) | T-066 |
