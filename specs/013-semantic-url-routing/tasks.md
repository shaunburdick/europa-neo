# Tasks: Console Semantic URL Routing

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, and
`contracts/route-contract.md`. Implementation begins only after approval.

## Wave 0 — Baseline and guards

**Status**: Complete after review remediation. The stale-reference assertion remains intentionally
red until the migration waves remove the existing production query references.

- [x] T001 Record branch/status, package commands, and the known root `pnpm test` `@europa/design` no-test-files baseline; add no application code.
- [x] T002 [P] Add route contract tests in `packages/console/tests/unit/routing/` for all supported shapes, `?e2e`, and retired `?live`; depends on T001.
- [x] T003 [P] Add stale production-link/privacy guard coverage for source, generated host links, docs, and fixtures; allow historical notes and `?e2e` only; depends on T001.

### Wave 0 review findings

- The historical `/?live` prose fixture now distinguishes a prose mention (not a query match)
  from an explicit historical query-shaped example, including a URL path prefix.
- Same-line stale/privacy findings are consolidated into one diagnostic with both finding kinds;
  detection remains unchanged.
- Targeted guard verification has one expected failure: the stale-reference assertion detects
  pre-migration `?live`/credential references. No self-failing fixture remains.

## Wave 1 — Pure routing foundation

- [x] T004 Add closed route/rejection types, pure pathname parser, one-segment decode/validation, and semantic URL builders in `packages/console/src/routing/route.ts`; satisfy `data-model.md` security invariants.
- [x] T005 Add unit tests first in `packages/console/tests/unit/routing/route.test.ts` for malformed escapes, encoded slash/backslash, dot/control characters, empty IDs, extra segments, round trips, and deterministic classification; depends on T004.
- [x] T006 [P] Define the route-to-entry adapter seam in `packages/console/src/routing/route-adapter.ts` over existing Feature 010 projections/commands; prohibit implicit downgrade and pre-resolution match sockets. Dedicated adapter tests were added during Wave 1 review remediation in `packages/console/tests/unit/routing/route-adapter.test.ts`.
- [x] T007 [P] Remove retired `hasDirectMatchRoute`/`resolveInitialViewMode` exports and tests in `packages/console/src/state/lobby-view.ts`, preserving same-origin WebSocket validation; depends on T004.

## Wave 2 — Bootstrap, history, accessible recovery

- [x] T008 Implement `packages/console/src/main.tsx` route bootstrap: unchanged `?e2e`, one `/` replace redirect, semantic dispatch, and no query-derived production identity/transport; depends on T004, T006, T007.
- [x] T009 Integrate adaptive, explicit join, and explicit spectate entry with `packages/console/src/internal/lobby-runtime.tsx` and existing storage/session behavior; preserve gameplay flows; depends on T006, T008.
- [x] T010 Implement accessible unknown/unavailable/shortcut-failure notices and focus/live-region recovery in `packages/console/src/ui/`; retry/return must be keyboard operable; depends on T008.
- [x] T011 Add unit/component/a11y tests for navigation, no-connection guarantees, intent, identity conflicts, recovery, focus, announcements, and spectator read-only controls; depends on T008–T010.
- [x] T012 Add `packages/console/tests/e2e/routing.spec.ts` for Back/Forward, refresh, root redirect, route retention through terminal/leave, and no loop; depends on T008–T011.

### Wave 2 review HOLD remediation

- [x] Wire `RouteNotice` through production bootstrap and lobby runtime for unknown, unavailable,
  shortcut, and match transport failures. Recovery preserves the lobby controller/identity and
  exposes keyboard-operable retry and return actions with focus and alert announcements.
- [x] Push one semantic history entry for successful lobby-originated create/join/spectate,
  retain route-originated paths, suppress pushes on failures, and re-evaluate route state on
  `popstate` without changing the `?e2e` harness or starting sockets during classification.
- [x] Add behavior-level component coverage for production unavailable recovery and update the
  routing E2E to assert unknown-route notice recovery. Keep T013's broader fixture migration
  explicitly pending.
- [x] Normalize the routing E2E browser/socket loopback host to `127.0.0.1` in both Playwright
  web-server configuration and the ephemeral WebSocket fixture; retain query-override removal
  assertions.

## Wave 3 — Full-stack and security

- [x] T013 Migrate full-stack, n-player, waiting-overlay, and lobby integration fixtures from `?live` to semantic paths with test-only server seams; leave `?e2e` unchanged; depends on T008–T009.
- [x] T013 remediation: prevent successful lobby-originated entry from replaying its newly retained semantic route; resume an active identity on direct/reloaded adaptive/player routes and update only the affected lobby lifecycle expectations; do not change explicit downgrade rules.
- [ ] T014 Add real-socket semantic create/join/spectate coverage: adaptive states, one tick, one player order, explicit failures, and cross-match rejection; depends on T013.
- [ ] T015 Add security tests for traversal, slash injection, credential leakage, cross-match selection, unauthorized claims, and unsafe IDs never opening a match connection; depends on T004, T008, T013.
- [ ] T016 Run unchanged `?e2e` deterministic and console a11y suites, plus an assertion that `?live` never mounts live runtime; depends on T011–T015.

## Wave 4 — Native host and Docker

- [ ] T017 Refactor `packages/console/scripts/host.ts` to serve SPA entry for safe application paths while preserving `/version`, assets, WS upgrades, traversal guards, headers, and genuine failures; depends on T004.
- [ ] T018 Update host banner/create links and tests to emit only origin plus semantic `/match/<id>` paths, with no handle/token/WS query; depends on T004, T017.
- [ ] T019 Extend self-host/host integration tests and `packages/console/scripts/test-selfhost.sh` for direct/reload canonical paths, one-port `/version`, assets, WS, headers, and recovery; depends on T017–T018.
- [ ] T020 [P] Update Docker smoke/build validation and root Docker documentation; verify `Dockerfile`/Compose inherit single-port SPA fallback with no second listener; depends on T017.

## Wave 5 — Documentation truthfulness

- [ ] T021 [P] Update `README.md` and `packages/console/README.md` launch/route guidance; remove stale production `?live`, retain explicit `?e2e`; depends on T018.
- [ ] T022 [P] Update `docs/manual/index.md`, `quick-start.md`, and applicable lobby/reading-screen guidance to semantic paths, excluding issue #34 share/copy UX; depends on T018.
- [ ] T023 [P] Amend Feature 005, 010, and 011 docs/spec notes and developer/operational comments so compatibility claims are truthful; no unrelated contract changes; depends on T007, T018.
- [ ] T024 Scan tracked source, tests, host output, Docker/docs, and generated assets for stale references/privacy violations; depends on T021–T023.

## Wave 6 — Final gate

- [ ] T025 Run strict `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, targeted console coverage, regressions, and build; fix findings without suppressions; depends on T016, T019–T024.
- [ ] T026 Run self-host, Docker Compose config/build, semantic full-stack E2E, accessibility, and quickstart matrix; record the known design no-test-files root-test issue separately; depends on T025.
- [ ] T027 Review every acceptance criterion, security/privacy invariant, stale `?live` result, and issue #34 boundary; prepare implementation handoff; depends on T026.

## Dependencies

Wave 0 precedes Wave 1; Wave 1 blocks Waves 2–3. Wave 4 can proceed after T004
in parallel with Wave 3. Wave 5 is parallel-safe where marked and T024 waits for
all docs. Wave 6 is serial. `[P]` is used only for distinct files with no shared
implementation dependency. No task changes engine, terrain, combat, fog, wire,
reconnect, matchmaking semantics, or issue #34 UX.
