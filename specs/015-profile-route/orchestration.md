# Orchestration Log: Profile Route & Identity Onboarding

## Status
- **Current Wave**: Complete — PR #55 open
- **Branch**: `issue-49-calm-falcon`
- **PR**: https://github.com/shaunburdick/europa-neo/pull/55
- **Last Updated**: 2026-09-02

## Plan Summary

Add a dedicated `/profile` route to the console SPA replacing the inline lobby identity card. Three identity states: unnamed (form), named (welcome card + continue), restoring (indicator). Stateless `returnTo` query parameter for match-join redirects. Lobby landing gains compact identity display with "Manage profile" link. Zero reducer changes, zero new view modes, zero new dependencies.

## Task Wave Progress

### Wave 1 — Routing Foundation (T001-T003) — ✅ Complete
- [x] T001: Add `'profile'` to Route union + parseRoute in route.ts
- [x] T002: Add `'profile'` to RouteEntry in route-adapter.ts
- [x] T003: Add `'profile'` case to bootstrapProductionRoute in main.tsx

### Wave 2 — ProfileView Component (T004-T005) — ✅ Complete
- [x] T004: Implement readReturnTo validation function
- [x] T005: Implement ProfileView component

### Wave 3 — Lobby Integration (T006-T007) — ✅ Complete
- [x] T006: Wire profile view into lobby runtime view gate + match-join redirect
- [x] T007: Replace LobbyIdentityCard with compact identity display in lobby landing

### Wave 4 — Tests (T008-T012) — ✅ Complete
- [x] T008: Route parser + adapter tests
- [x] T009: readReturnTo unit tests
- [x] T010: ProfileView component tests
- [x] T011: LobbyLanding updated tests
- [x] T012: ProfileView a11y tests

### Wave 5 — Verification (T013-T014) — ✅ Complete
- [x] T013: Verify all acceptance criteria (SC-001..SC-006)
- [x] T014: Full verification suite gate

## Decisions & Rationale

- 2026-09-01: Profile as sub-view of lobby (not new viewMode) — avoids reducer changes, keeps lobby context intact
- 2026-09-01: Bootstrap mounts lobby runtime for /profile — same connection/controller infrastructure
- 2026-09-01: Stateless returnTo — URL query param only, no localStorage
- 2026-09-01: Match-join redirect in LobbyRoot after identity resolution — returning players proceed directly

## Blockers & Escalations

(none yet)

## New Tasks Discovered

(none yet)

## Review Findings

- 2026-09-02: Two browser-mode component tests failed in CI (NOT preexisting — introduced by Feature 015 changes):
  1. `lobby-landing.test.tsx:459` — LobbyRoot view gate: `window.location.pathname` was `/profile` in Vitest browser env, causing ProfileView to render instead of LobbyLanding. Fix: reset pathname to `/` before rendering.
  2. `lobby-persistence.test.tsx:246,270` — identity form moved to `/profile` route, tests still looking for "Display name" textbox in lobby. Fix: replaced form interactions with `controller.setHandle()` and updated assertions to match compact lobby identity display.
- All tests now pass locally (134 browser-mode, 677 unit-mode). Spec status flipped to Implemented (2026-09-02). AGENTS.md updated with CI-must-pass rule (rule 7).

## Shadow DOM Conversion — Waves 0–6 (2026-09-02)

After the Feature 015 E2E/component work surfaced the React 19 unmount crash (`removeChild`
NotFoundError — caused by light-DOM `appendChild` reparenting of React-managed children), the
branch pivoted to root-fix the design library. Followed `shadow-dom-conversion-plan.md` (committed
this wave as the historical record of what was followed; its in-file "Status: Plan" header is
historical — completion is tracked HERE).

### Waves, tasks, commits

- **Wave 0 — Foundation** (plan T-001..T-003): `9ae5920` — `build-css.ts` emits the gitignored
  generated module `src/styles/catalog-styles.ts` (catalog class rules only; `:root` token block
  excluded — custom properties inherit through shadow boundaries); `base.ts` gains
  `ensureShadowRoot()` (lazy open shadow root + ONE shared constructed `CSSStyleSheet` adopted via
  `adoptedStyleSheets`).
- **Wave 1 — 6 layout wrappers** (plan T-004..T-009, parallel): `bd5dc9d` — page/card/plate/stack/
  container/badge → shadow root + `<slot>`; tests query through `shadowRoot`; slot-projection
  assertions changed to host-containment + `<slot>` presence.
- **Wave 2 — 5 attribute-driven wrappers** (plan T-010..T-014): `a50065c` — grid/banner/chip/
  typography/waiting (banner role/aria-live moved onto the internal div; typography re-creates its
  semantic element on variant change).
- **Wave 3a — console fallout**: `aadf7c5` — console tests query `europa-*` internals via
  `shadowRoot`.
- **Wave 3b — complex components**: `b0d9cf4` (plan T-015, button: MutationObserver, `_updating`
  guard, `_renderQueued` microtask queue REMOVED; `formAssociated` + `attachInternals()` +
  `requestSubmit()` kept; click handler on the host) and `383ee3c` (plan T-016, modal:
  flattened-tree focus trap — shadow-tree focusables + `slot.assignedElements()` subtrees + nested
  open-shadow internals; deep-active-element resolution for boundary comparisons/restore).
- **Wave 4 — test infrastructure** (plan T-017/T-018): `9cc0c6a` — conformance suite queries through
  `shadowRoot`; axe option handling + canary test `packages/console/tests/a11y/shadow-traversal.test.ts`
  pinning that axe-core ≥ 4 traverses open shadow roots BY DEFAULT (fails loudly if ever lost).
- **Wave 5 — console consumer cleanup**: `2627eab` (reactive pathname gate + shared E2E profile
  helper `tests/e2e/helpers/profile.ts`), `6feefc6` (band-aid revert: ProfileView restoring state
  back to web components, removing the `b8572f0` plain-div workaround), `6391457` (stale
  pre-Shadow-DOM E2E locators → role queries), `7c2551d` (selfhost-scanning URL literal dropped from
  JSDoc), `b4534c1` (formatting).
- **Wave 6 — spec & documentation** (this wave, tasks T-024..T-030): T-024 plan doc committed
  (`00d6265`); T-025 spec 014 amended (FR-009 rewritten to the two-tier DOM model, NEW FR-009a
  forbidding manual reparenting, FR-007 styling-delivery clarification, FR-015 focus-visible
  delivery note, Edge Cases + Assumptions + Out-of-Scope + Constitution-Alignment reconciled,
  Clarifications v1.1 added, contract §3 intro/§4 base-class/§8 out-of-scope updated);
  T-026 DESIGN.md §2 web-components intro rewritten (two-tier DOM model, styling pipeline,
  testing implications); T-027 AGENTS.md (Shadow DOM environment note replacing the light-DOM
  reparenting note, Playwright/axe/happy-dom findings, Current state entries, spec status notes);
  T-028 base.ts JSDoc two-tier fix (bundle verified byte-identical); T-029 selfhost grep flag-order
  fix (`--include` flags were after `--`, becoming file operands); T-030 this section.

### Key decisions

- **Two-tier DOM model** (PO-approved; spec 014 Clarifications v1.1): 13 generic child-projecting
  components = Shadow DOM (open) + `<slot>`; 7 game primitives = Light DOM leaves (no child
  projection, no crash risk; converting them would add complexity with no benefit).
- **Styling**: single authored `src/styles/catalog.css` → `build-css.ts` → `dist/design.css`
  (unchanged global contract) + generated `catalog-styles.ts` adopted into shadow roots; `:root`
  stays only in `design.css`.
- **Manual child reparenting forbidden repo-wide** (FR-009a) — the React 19 interop rule.

### Verification results

- Design: 189/189 node-mode + 13/13 browser-mode. Console: unit 677 · component 134 · a11y 44 ·
  E2E 22/22 (E2E on port 5199 — a foreign process squats 5173 in this environment).
- Repo gates: typecheck / lint / format clean. Design guards green post-T-028: no-literals,
  vendor-identity, component-catalog, bundle-size (15,318 B gz ≤ 15,360 B; raw artifact SHA-256
  byte-identical before/after the JSDoc-only change — comments are stripped from the bundle).
- Selfhost script: `bash -n` clean + fixed grep line verified against a fixture (finds violations
  with file:line context, silent non-match).

### Empirical findings (hard-won; also recorded in AGENTS.md)

- Playwright `getByRole` DOES pierce open shadow roots; `getByText` does NOT resolve
  shadow-internal text; `document.activeElement` reports the HOST when focus is inside an open
  shadow tree — resolve via `host.shadowRoot.activeElement`.
- axe-core ≥ 4 traverses open shadow roots by default (canary-pinned).
- happy-dom (v20.x): structural shadow assertions only — no event retargeting at the boundary, no
  form-owner recomputation on re-parenting.

## Post-implementation defect fix — unnamed deep-link dead-end (2026-09-02)

Live-smoke verification of the built dist reproduced a sticky **"Match unavailable"** dead-end for a
fresh (unnamed) visitor opening a match share-link (`/match/<id>/join`), 4/4 runs; private matches
were unrecoverable (never lobby-listed). A second-order race hit *named* deep-linkers too
(`joinMatch requires a ready lobby connection (got connecting)`).

### Root cause (confirmed by code reading + test)

- The route-resolution effect in `lobby-runtime.tsx` gated only on `state.snapshot !== null` — never
  on identity/connection. Wire ordering inside an establish cycle is identity event → baseline
  snapshot → `'ready'` (the ready flip is dispatched a microtask AFTER the snapshot handlers), so:
  an unnamed visitor's deep link fired `joinMatch` → matchmaking `guardNamed` rejected
  `identity_invalid` → `shortcut-failure` notice; the US3 redirect effect then rewrote the URL to
  `/profile?returnTo=…` — but the `LobbyRoot` view gate checks `noticeKind` BEFORE the profile gate,
  so the notice suppressed the profile form. Sticky. Manual recovery only.
- Named deep-linkers could fire `joinMatch` in the connecting window (ready flips after the
  baseline) → local transport rejection → same notice.

### Fix (minimal — gate the effect, no runtime refactor)

- Route resolution now additionally requires `state.connection === 'ready'` AND
  `state.identityStatus === 'named'`, deferring WITHOUT consuming the attempt (routeAttemptedRef
  untouched) and re-running on the identity/connection deps. Naming on the redirected `/profile`
  therefore resolves the deferred route via FR-010's returnTo round-trip; the ready flip releases
  the connecting-window race. Spectators defer too (the redirect owns every match-route URL while
  unnamed; attaching a spectator leg under a `/profile` URL would be incoherent — spec note records
  that spectate needs no handle, only a resolved posture). A post-naming failure (match filled while
  typing) still surfaces the recovery notice on the match route — legitimate, not suppressed.
- US3 redirect captures `window.location.pathname` ONLY into `returnTo` (FR-005's relative-pathname
  contract; production-identical since bootstrap strips match-route queries before mount). Found via
  the new E2E: with the test ws-override query inside the captured value, `readReturnTo`'s double
  decode (URLSearchParams + decodeURIComponent) produced a `://` sequence and rightly rejected the
  value — silently dead-ending the round-trip. The pathname cannot trip that check.
- View-gate ordering left untouched: with the premature attempt prevented, no notice can coexist
  with the profile form; the remaining notice cases legitimately postdate the profile step.

### Coverage added

- E2E (`routing.spec.ts`): unnamed deep-link round-trip over the REAL stack — host tab creates a
  public 4-player match through the lobby UI (the projection ledger lists ONLY facade-issued
  matches: raw `matchmaker.createMatch` never appears in the snapshot — harness lesson recorded),
  fresh-context visitor deep-links `/match/<id>/join`, asserts the `/profile?returnTo=…` redirect +
  form (and NO "Match unavailable"), names themselves, asserts auto-return to the match URL and the
  pre-start waiting plate at 2/4. Uses a merge-variant ws-preserve init script (the shared one
  would clobber the redirect's `returnTo` param when re-adding `?ws=`). Proven failing pre-fix
  (stash run) and passing post-fix.
- Component (`semantic-route-runtime.test.tsx`): three new gating tests — deferral while identity
  is unresolved (no command, no notice), the unnamed-redirect + naming round-trip through the real
  form, and the ready-flip release after a baseline-while-connecting snapshot. Four existing route
  tests + the transport-recovery test now emit the directed identity event before the baseline
  snapshot (protocol-faithful ordering; previously they exercised an ordering the wire never
  produces).

### Verification

- Console: unit 677 · component 137 · a11y 44 · E2E routing 5 (incl. new) · lobby+full-stack 8 ·
  waiting-overlay/us1/us2/us4/us5/n-players 7 — all green (E2E on port 5199; foreign squatter on
  5173 untouched).
- Repo gates: typecheck · lint · format:check clean; console conformance typecheck clean;
  `@europa/design` 189/189 (untouched, sanity).
- Spec 015 amended same change set: Implementation Notes 1–2 (gating semantics + pathname-only
  returnTo). `packages/design/` untouched.
