# Tasks: Design Polish

**Input**: Design documents from `/specs/062-design-polish/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

**Tests**: Token/emitter tests (FR-006, FR-045), console suites (no regression), preview-page browser tests (FR-042) are all required by the spec.

**Organization**: Tasks are grouped into implementation waves suitable for parallel sub-agent dispatch. Each task is a **single-artifact micro-task** (one file or one coherent change) per the repo's subagent-reliability guidance. Tasks marked `[P]` can run in parallel (different files, no dependencies).

**Branch**: `issue-62-design-polish` (never commit to `main`).

---

## Wave 1: Foundation Tokens (blocking — no component work until complete)

**Purpose**: Add all new tokens to `packages/design/src/tokens.ts`, extend the emitter with `--emit-json`, add the contrast-notes generator + guard, and verify the build is deterministic. These are the prerequisites for every subsequent wave.

### Token additions

— [x] T-001: Add the three new shadow tokens (`cardHover`, `cardActive`, `hud`) and update `board`/`modal`/`plate` from `none` to real values in `packages/design/src/tokens.ts` (FR-001). Single-file change.
— [x] T-002: Add the seven new motion tokens (`duration`, `transitionFast`, `transitionDefault`, `transitionSlow`, `transitionSpring`, `easingOut`, `easingInOut`) to `packages/design/src/tokens.ts` (FR-002, G1, D3). Single-file change.
— [x] T-003: Add the four new color tokens (`textLink`, `accentActive`, `divider`, `cardHoverBorder`) to `packages/design/src/tokens.ts` (FR-003). Single-file change.
— [x] T-004: Add the five new typography tokens (`heading`, `subheading`, `trackingTight`, `trackingNormal`, `trackingWide`) to `packages/design/src/tokens.ts` (FR-004). Single-file change.
— [x] T-005: Add the two new focus-ring tokens (`darkColor`, `lightColor`) to `packages/design/src/tokens.ts` (FR-005). Single-file change.

### Emitter + JSON + contrast notes

— [x] T-006: Extend `packages/design/scripts/build-css.ts` with a `--emit-json` mode that writes `dist/tokens.json` (one entry per CSS variable with `name`, `group`, `cssVar`, `value`; sorted lexicographically by `cssVar`) (FR-006). Single-file change.
— [x] T-007: Add the `:root` comments for `void-bg` vs `page-bg` to the emitter output (FR-046). Single-file change to `build-css.ts`.
— [x] T-008: Create `packages/design/scripts/generate-contrast-notes.ts` — computes WCAG relative-luminance ratios from the token table and writes `dist/contrast-notes.json` (FR-045, G9). Single new file.
— [x] T-009: Create `packages/design/scripts/check-contrast-notes.ts` — the G-11 guard asserting the documented ratios in DESIGN.md § 3 match the computed values (FR-045, G9). Single new file.
— [x] T-010: Add `check:contrast-notes` script to `packages/design/package.json#scripts` and wire into the build/CI flow. Single-file change.

### Token tests

— [x] T-011: [P] Extend `packages/design/tests/tokens.test.ts` — assert all new tokens exist with correct values; assert the three shadow tokens are no longer `none` (AC-001..005). Single-file change.
— [x] T-012: [P] Create `packages/design/tests/build-css.test.ts` — assert `--emit-json` produces `dist/tokens.json` with all entries; assert byte-identical output on repeated runs (AC-006..008). Single new file.
— [x] T-013: [P] Create `packages/design/tests/contrast-notes.test.ts` — assert the contrast-notes generator computes correct WCAG ratios for the new pairings; assert the G-11 guard passes (AC-045b). Single new file.

**Checkpoint**: Foundation ready — all new tokens present, `dist/design.css` byte-identical, `dist/tokens.json` + `dist/contrast-notes.json` generated, G-11 guard wired.

---

## Wave 2: New Design System Components (FR-017..021, FR-040a)

**Purpose**: Add all new catalog classes to `packages/design/src/styles/catalog.css`. Each is a single coherent change to the catalog file. All marked `[P]` (different class families, no dependencies).

**Note**: These are CSS-only classes — no new web components (spec Out of Scope). All compose only `--europa-*` tokens (no hex/rgb literals).

— [x] T-014: [P] Add `.europa-link` to `packages/design/src/styles/catalog.css` — default/hover/visited/focus-visible states using `--europa-color-text-link` (FR-017, D5). Single-file change.
— [x] T-015: [P] Add `.europa-divider` + `--success/error/warning` variants to `packages/design/src/styles/catalog.css` (FR-018). Single-file change.
— [x] T-016: [P] Add `.europa-tooltip` (CSS-only, `data-tooltip` attribute + `::after`/`::before` pseudo-elements) to `packages/design/src/styles/catalog.css` (FR-019). Single-file change.
— [x] T-017: [P] Add `.europa-badge--success/warning/error/info/accent` status variants to `packages/design/src/styles/catalog.css` (FR-020). Single-file change.
— [x] T-018: [P] Add `.europa-empty-state` + `__icon`/`__title`/`__message` to `packages/design/src/styles/catalog.css` (FR-021). Single-file change.
— [x] T-019: [P] Add typography utility classes (`.europa-heading-1/2/3`, `.europa-subheading`, `.europa-body`, `.europa-body-sm`, `.europa-caption`) to `packages/design/src/styles/catalog.css` (FR-040a, G5). Single-file change.
— [x] T-020: [P] Add `.europa-footer` + `.europa-footer__links` to `packages/design/src/styles/catalog.css` (FR-038). Single-file change.
— [x] T-021: [P] Add layout utility classes (`.europa-layout-centered`, `.europa-layout-sidebar`, `.europa-layout-card-grid`) to `packages/design/src/styles/catalog.css` (FR-039, D4). Single-file change.

**Checkpoint**: All new catalog classes present. Rebuild `dist/design.css` and verify G-04 (no-literals) and G-05 (vendor identity) remain green.

---

## Wave 3: Console CSS Polish (FR-007..016)

**Purpose**: All changes in `packages/console/src/styles/index.css`. Each is a coherent group of related rules. Tasks are ordered by dependency (foundational rules first).

— [x] T-022: Add card elevation + hover lift to `.europa-lobby__card` (box-shadow at rest, transition, `:hover` translateY(-2px) + cardHover shadow, `:active` translateY(0) + cardActive shadow) (FR-007, AC-009). Single-file change.
— [x] T-023: Add match row hover + state modifiers to `.europa-lobby__row` (transition, `:hover` accent border, `--waiting`/`--in-progress`/`--your-match` modifiers) (FR-008, G2, AC-010/010a). Single-file change.
— [x] T-024: Add HUD depth shadow to `.europa-hud` (box-shadow: `--europa-shadows-hud`) (FR-009, AC-011). Single-file change.
— [x] T-025: Add button transitions to `.europa-button` and all variants (background-color/border-color/color/box-shadow transition at `--europa-motion-transition-fast`) (FR-010, AC-012). Single-file change.
— [x] T-026: Add surrender button danger hover/active to `.europa-hud__surrender` (FR-011, AC-013). Single-file change.
— [x] T-027: Add order bar active state + mode active styling (`.europa-order-bar__button[aria-pressed="true"]` transition + `.europa-order-bar__mode--active` accent bg) (FR-012, G3, AC-016a). Single-file change.
— [x] T-028: Add feedback toast slide-in/out animation + variant borders to `.europa-feedback__item` (keyframes `europa-toast-enter`/`europa-toast-exit` from `translateX(-8px)`, `--success`/`--error`/`--info` left-border variants) (FR-013, G4, D1, AC-014/014a). Single-file change.
— [x] T-029: Add modal backdrop blur + enter animation (`.europa-modal-backdrop` backdrop-filter + fade-in, `.europa-modal` scale-in from 0.95) (FR-014, AC-015/016). Single-file change.
— [x] T-030: Add error boundary refinement (`.europa-error-boundary` bg + inset ring, `__reload` transition, `__icon` 4rem, `__details` monospace) (FR-015, G6, AC-017a). Single-file change.
— [x] T-031: Add route notice panel polish (`.europa-route-notice__panel` box-shadow + transition, `__icon` 3rem muted) (FR-016, G7, AC-017b). Single-file change.

**Checkpoint**: All console polish rules present. Existing console suites (unit, component, a11y, e2e) remain green.

---

## Wave 4: Responsive Breakpoints (FR-022..025)

**Purpose**: Media queries in `packages/console/src/styles/index.css`. All marked `[P]` (different selectors, no dependencies).

— [x] T-032: [P] Add lobby grid responsive breakpoints to `.europa-lobby__grid` (single column ≤768px, two-column 769-1199px, unchanged ≥1200px) + `.europa-lobby` padding at ≤480px (FR-022, AC-024/025). Single-file change.
— [x] T-033: [P] Add match view stacking to `.europa-board-layout` (flex-direction: column ≤768px) (FR-023, AC-028). Single-file change.
— [x] T-034: [P] Add HUD horizontal layout to `.europa-hud` (flex-direction: row ≥1200px) (FR-024, AC-026). Single-file change.
— [x] T-035: [P] Add modal responsive width to `.europa-modal`/`.europa-modal__dialog` (max-width: calc(100vw - 2rem) ≤480px) (FR-025, AC-027). Single-file change.

**Checkpoint**: Responsive breakpoints present. Browser tests at 480/768/1200px verify the layout.

---

## Wave 5: Page-Specific Layouts (FR-026..041)

**Purpose**: TSX + CSS changes in `packages/console`. Each is a coherent group of related changes. Tasks are ordered by dependency (TSX changes first, then CSS).

### TSX changes

— [x] T-036: Add `.europa-lobby__hero` section to the lobby landing TSX (logo + title, centered, `padding: var(--europa-spacing-xl) 0`) + `.europa-lobby__logo` max-width ≥768px (FR-026, AC-029). Single-file change.
— [x] T-037: Add `.europa-lobby__card--identity` modifier to the identity card TSX (3px left accent border) (FR-027, AC-030). Single-file change.
— [x] T-038: Refactor `.europa-lobby__empty` to use the new `.europa-empty-state` component classes (FR-029). Single-file change.
— [x] T-039: Add `.europa-error-boundary__icon` + `__details` elements to the error boundary TSX (FR-015, G6). Single-file change.
— [x] T-040: Add `.europa-route-notice__icon` element to the route notice TSX (FR-016, G7). Single-file change.

### CSS changes

— [x] T-041: Add match list visual hierarchy to `.europa-lobby__row-id` (tracking-tight), `__row-meta` (tracking-normal), `__row-badge` (tracking-wide) (FR-028, AC-031). Single-file change.
— [x] T-042: Add create form polish to `.europa-lobby__input` (transition + `:focus` accent border + box-shadow) (FR-030, AC-032). Single-file change.
— [x] T-043: Add board area depth to `.europa-board-area` (box-shadow: `--europa-shadows-board` inset) (FR-031, AC-033). Single-file change.
— [x] T-044: Add HUD information hierarchy to `.europa-hud__section` (top border separator + padding-top) + `.europa-hud__title` (tracking-tight) (FR-032, AC-034). Single-file change.
— [x] T-045: Add order bar mode clarity to `.europa-order-bar__mode` (uppercase + tracking-wide + size-xs) (FR-033, AC-035). Single-file change.
— [x] T-046: Add reserves panel compact layout to `.europa-reserves__digit` (transition on border-color + background-color) (FR-034, AC-036). Single-file change.
— [x] T-047: Add feedback toast positioning to `.europa-feedback` (fixed bottom-left, z-index 800) (FR-035, D2, AC-037). Single-file change.
— [x] T-048: Add waiting overlay blur to `.europa-waiting` (backdrop-filter: blur(2px)) (FR-036, AC-038). Single-file change.
— [x] T-049: Add surrender modal danger emphasis to `.europa-modal__button--danger` (filled error bg, hover/active states, transition) (FR-037, AC-039). Single-file change.
— [x] T-050: Add typography scale refinements to `.europa-typography--heading` (tracking-tight), `--muted` (line-height documented), `--meta` (tracking-wide) (FR-040). Single-file change.

**Checkpoint**: All page-specific layouts present. Existing console suites remain green.

---

## Wave 6: Preview Page (FR-042)

**Purpose**: Standalone design-system preview page in `packages/design/preview/`.

— [x] T-051: Create `packages/design/preview/index.html` — static HTML shell with sticky nav, hero, color swatches, typography scale, token tables, component catalog, a11y pairings, layout patterns, footer (FR-042, AC-041). Single new file.
— [x] T-052: Create `packages/design/preview/main.ts` — builds token tables + swatches from `TOKENS` (no hex literals in the page's own CSS) (FR-042, AC-042). Single new file.
— [x] T-053: Create `packages/design/tests/preview.test.ts` — Playwright browser test loading the preview page and verifying all sections render; asserts no hex literals in the page's own CSS (FR-042, AC-041/042/043). Single new file.
— [x] T-054: Verify the preview page renders correctly at both desktop (1200px+) and mobile (375px) widths (AC-043). Verification task.

**Checkpoint**: Preview page loads and displays all sections; uses only `europa-*` tokens; renders at desktop + mobile.

---

## Wave 7: Documentation & DX (FR-043..047)

**Purpose**: DESIGN.md updates, CSS comments, and documentation guards.

— [x] T-055: Update DESIGN.md § 1 token tables — add rows for all new color tokens (§ 1.1), typography tokens (§ 1.2), shadow tokens (§ 1.6), focus-ring tokens (§ 1.7), motion tokens (§ 1.8) (FR-043, AC-044). Single-file change.
— [x] T-056: Update DESIGN.md § 2 catalog — split into "Component Identity" + "Accessibility Obligations" sub-tables; add entries for all new catalog classes with HTML usage snippets (FR-044, G8/G10, AC-045/045a). Single-file change.
— [x] T-057: Update DESIGN.md § 3 accessibility table — add rows for new pairings (textLink, badge variants, focus-ring darkColor) (FR-045, AC-046). Single-file change.
— [x] T-058: Add line-height documentation per component to DESIGN.md § 2 entries (FR-047, AC-048). Single-file change (may be combined with T-056).
— [x] T-059: Add the interactive state patterns documentation to DESIGN.md § 2 (hover-lift, hover-glow, active-press, focus-ring, focus-glow) (FR-041). Single-file change.

**Checkpoint**: DESIGN.md fully updated; G-01..G-11 drift guards pass.

---

## Wave 8: Final Verification + Spec Status Flip

**Purpose**: Verify all acceptance criteria, coverage, budgets, and guards. Flip the spec status to Implemented.

— [x] T-060: Run `pnpm --filter @europa/design typecheck` — zero errors, strict mode, no `any`, no suppressions.
— [x] T-061: Run `pnpm --filter @europa/design lint` and `pnpm --filter @europa/design format:check` — zero errors.
— [x] T-062: Run `pnpm --filter @europa/design test` (node + happy-dom) and `pnpm --filter @europa/design test:browser` (Playwright) — all green, coverage ≥ 80% on every metric.
— [x] T-063: Run `pnpm --filter @europa/design build` — produces `dist/design.css` (byte-identical), `dist/tokens.json`, `dist/contrast-notes.json`; re-vendors to `docs/manual/assets/design.css`.
— [x] T-064: Run `pnpm --filter @europa/design check:contrast-notes` (G-11) — passes.
— [x] T-065: Run `pnpm --filter @europa/design check:vendor-identity` (G-05) and `check:no-literals` (G-04) — green.
— [x] T-066: Run the console suites (`pnpm --filter @europa/console test:unit`, `test:component`, `test:a11y`, `test:e2e`) — all green (no visual regression).
— [x] T-067: Run the console build (`pnpm --filter @europa/console build`) — browser-payload gzip < 150 KB (G-08).
— [x] T-068: Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm version:check` repo-wide — all green.
— [x] T-069: Run `pnpm verify` (or `bash scripts/verify.sh`) — the single source of truth for CI-equivalent local verification.
— [x] T-070: Flip the spec status to **Implemented** in `specs/062-design-polish/spec.md` (add date). Update AGENTS.md "Current state" section.

**Checkpoint**: All AC-001..AC-048 verified. Feature complete.

---

## Dependencies & Execution Order

### Wave Dependencies

- **Wave 1 (Foundation Tokens)**: No dependencies — can start immediately. BLOCKS all subsequent waves (tokens must exist before catalog classes and console CSS reference them).
- **Wave 2 (New Components)**: Depends on Wave 1 (tokens exist). All 8 class families parallel.
- **Wave 3 (Console CSS Polish)**: Depends on Wave 1 (tokens exist). Tasks ordered by dependency (foundational rules first).
- **Wave 4 (Responsive)**: Depends on Wave 1 (tokens exist). All 4 breakpoints parallel. Can run in parallel with Waves 2–3.
- **Wave 5 (Page-Specific)**: Depends on Wave 1 (tokens exist) + Wave 2 (empty-state component for FR-029). TSX changes first, then CSS.
- **Wave 6 (Preview Page)**: Depends on Wave 1 (tokens exist) + Wave 2 (component catalog to showcase).
- **Wave 7 (Documentation)**: Depends on Waves 1–2 (tokens + components to document).
- **Wave 8 (Final Verification)**: Depends on all prior waves.

### Parallel Opportunities

- Wave 1's token additions (T-001..005): all `[P]`, fully parallel (different token groups).
- Wave 1's test files (T-011..013): all `[P]`, fully parallel.
- Wave 2's 8 class families (T-014..021): all `[P]`, fully parallel.
- Wave 4's 4 breakpoints (T-032..035): all `[P]`, fully parallel (and parallel with Waves 2–3).
- Wave 5's TSX changes (T-036..040): all `[P]`, fully parallel.
- Wave 5's CSS changes (T-041..050): all `[P]`, fully parallel (after TSX changes).
- Wave 8's gate tasks: sequential (each verifies the accumulated state).

### Subagent dispatch guidance

Per the repo's subagent-reliability guidance:
- Dispatch one file per subagent task (each T-0xx is a single artifact).
- Verify each file lands on disk before dispatching the next.
- Pre-create target directories (`packages/design/preview/`, `packages/design/tests/`) before dispatching writers.
- Give exact absolute file paths.

---

## Notes

- [P] tasks = different files, no dependencies.
- Each task is a single-artifact micro-task (one file or one coherent change).
- Commit after each task or logical group with conventional commits (e.g. `feat(design): add shadow tokens`).
- Verify tests fail before implementing (TDD where practical).
- All new CSS must compose only `--europa-*` tokens — no hex/rgb literals (FR-009/FR-010, G-04).
- The `--emit-json` mode (T-006) and contrast-notes generator (T-008) are the only build-pipeline changes.
- PM/PO-notable decisions to surface: (1) the 15 PO rulings in Clarifications v1.1 (D1-D5, G1-G10), (2) the `cubic-bezier(0.16, 1, 0.3, 1)` easing (D3), (3) the toast direction/position change (D1/D2), (4) the DESIGN.md § 2 table split (G8), (5) the machine-readable contrast notes (G9).
