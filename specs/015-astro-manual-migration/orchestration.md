# Orchestration Log: Astro Migration for Player Manual

## Status
- **Current Wave**: Wave 1 — Astro Scaffolding
- **Branch**: `issue-32-new-player-manual`
- **Last Updated**: 2026-09-01

## Plan Summary

Migrate the player manual from Jekyll (13 Markdown pages + index + lobby) to Astro (MDX + `.astro` layout). Add `<europa-*>` web components from `@europa/design` inline in pages. Rewrite prose for clarity. Deploy to GitHub Pages via `withastro/action@v6`. 68 tasks across 6 groups.

## Task Wave Progress

### Wave 1 — Astro Scaffolding (T-001–T-007) — ✅ Complete
- T-001: Create `docs/manual/package.json` — ✅
- T-002: Create `docs/manual/astro.config.mjs` — ✅
- T-003: Create `docs/manual/tsconfig.json` — ✅
- T-004: Create `docs/manual/rehype-europa-tables.mjs` — ✅
- T-005: Create `docs/manual/src/layouts/ManualLayout.astro` — ✅
- T-006: Move `docs/manual/assets/design.css` to `docs/manual/public/design.css` — ✅
- T-007: Verify Astro scaffolding builds — ✅ (0 pages built in 456ms, clean)

### Wave 2 — Page Migration (T-008–T-023) — ✅ Complete
- T-008: index.mdx — ✅
- T-009: quick-start.mdx — ✅
- T-010: objective.mdx — ✅
- T-011: the-board.mdx — ✅
- T-012: cities-and-troops.mdx — ✅
- T-013: pipes.mdx — ✅
- T-014: combat.mdx — ✅
- T-015: special-weapons.mdx — ✅
- T-016: reserves.mdx — ✅
- T-017: fog-of-war.mdx — ✅
- T-018: controls.mdx — ✅
- T-019: reading-the-screen.mdx — ✅
- T-020: numbers.mdx — ✅
- T-021: lobby.mdx — ✅
- T-022: Verify zero annotations — ✅ (zero Kramdown remain)
- T-023: Verify build — ✅ (14 HTML files, layout path fix applied)
- **Note**: 13 pages had wrong layout path (`../../` vs `../`), fixed in T-023 commit

### Wave 3 — Component Integration (T-024–T-037) — ✅ Complete
- T-024: index.mdx — ✅ (card + typography)
- T-025: reading-the-screen.mdx — ✅ (8 badges)
- T-026: numbers.mdx — ✅ (troop-chip, pipe-slope, reserve-indicator, player-badge, chip)
- T-027: pipes.mdx — ✅ (8 pipe-slope)
- T-028: combat.mdx — ✅ (6 troop-chip)
- T-029: special-weapons.mdx — ✅ (4 troop-chip + banner)
- T-030: reserves.mdx — ✅ (4 reserve-indicator)
- T-031: quick-start.mdx — ✅ (4 plate)
- T-032: fog-of-war.mdx — ✅ (fog-overlay)
- T-033: the-board.mdx — ✅ (4 elevation-swatch)
- T-034: objective.mdx — ✅ (4 badge)
- T-035: controls.mdx — ✅ (18 badge)
- T-036: cities-and-troops.mdx — ✅ (2 chip)
- T-037: Verify build — ✅ (14/14 pages, 0 errors)

### Wave 4 — Content Rewrite (T-038–T-052) — ✅ Complete
- T-038: index.mdx — ✅ (purpose statement, security disclaimer moved, prose tightened)
- T-039: quick-start.mdx — ✅ (purpose statement, duplicate paragraph fixed, steps clarified)
- T-040: objective.mdx — ✅ (purpose statement, factual error fixed — 4 outcomes not 3)
- T-041: the-board.mdx — ✅ (purpose statement, grid section restructured)
- T-042: cities-and-troops.mdx — ✅ (purpose statement, opening rewritten)
- T-043: pipes.mdx — ✅ (purpose statement, uphill trap extracted, flow tightened)
- T-044: combat.mdx — ✅ (purpose statement, attrition math clarified)
- T-045: special-weapons.mdx — ✅ (purpose statement, 2:1 rate emphasized)
- T-046: reserves.mdx — ✅ (purpose statement, digit mapping clarified)
- T-047: fog-of-war.mdx — ✅ (purpose statement, opening rewritten)
- T-048: controls.mdx — ✅ (purpose statement, keyboard tables split, badges added)
- T-049: reading-the-screen.mdx — ✅ (purpose statement, status descriptions rewritten)
- T-050: numbers.mdx — ✅ (purpose statement, intensity labels shortened)
- T-051: lobby.mdx — ✅ (purpose statement, handle section tightened)
- T-052: Terminology audit — ✅ (no violations found, already consistent)

### Wave 5 — CI Workflow Update (T-053–T-054) — ✅ Complete
- T-053: Rewrite pages-deploy.yml — ✅ (Jekyll → Astro build chain, all SHA pins preserved)
- T-054: Update version drift checker — ✅ (paths updated, docs-config removed, tests updated)

### Wave 6 — Verification & Acceptance (T-055–T-068) — ✅ Complete
- T-055: Delete Jekyll artifacts — ✅ (_config.yml, _layouts/, assets/ removed)
- T-056: Add docs/manual to workspace — ✅ (done in Wave 1)
- T-057: Full build verification — ✅ (14/14 pages, 911ms)
- T-058: Browser rendering — ✅ (manual verification — components render as styled elements)
- T-059: No-JS degradation — ✅ (content readable without JS, no errors)
- T-060: Control-reference audit — ✅ (zero drift vs DEFAULT_INPUT_MAPPING)
- T-061: Numbers-appendix audit — ✅ (2 drift items fixed: triangle size coefficients)
- T-062: Link verification — ✅ (64 links, 0 broken)
- T-063: No duplicate paragraphs — ✅ (quick-start bug fixed)
- T-064: Purpose statements — ✅ (14/14 pages have purpose statements)
- T-065: Terminology consistency — ✅ (zero forbidden terms)
- T-066: Sequential readability — ✅ (pages flow logically)
- T-067: Version drift check — ✅ (pnpm version:check exits 0)
- T-068: Workflow dry-run — ✅ (all SHA pins, paths, permissions correct)

## Status: READY FOR PR

### Wave 2 — Page Migration (T-008–T-023) — ⏳ Pending
### Wave 3 — Component Integration (T-024–T-037) — ⏳ Pending
### Wave 4 — Content Rewrite (T-038–T-052) — ⏳ Pending
### Wave 5 — CI Workflow Update (T-053–T-054) — ⏳ Pending
### Wave 6 — Verification & Acceptance (T-055–T-068) — ⏳ Pending

## Decisions & Rationale
- 2026-09-01: Astro 7.x chosen over Jekyll+esbuild (PO preference for full rewrite)
- 2026-09-01: Content rewrite interleaved with migration (avoids touching files twice)
- 2026-09-01: `base: '/europa-neo'` matches repo name for GitHub Pages

## Blockers & Escalations
(none yet)

## New Tasks Discovered
(none yet)
