# Issue #201 follow-on — Lobby and pre-entry Controls tasks

**Input:** Approved v1.22 spec 005 amendment, spec 013 v1.7 pre-entry
clarification, `issue-201-lobby-controls-plan.md`, the saved user-approved plan
`1792769828093-issue-201-configure-controls-in-the-lobby-before-play.md`, and
the existing `contracts/input-mapping.md`.
**Baseline:** `005-dynamic-control-mapping-201` at
`816bcd487dce253985808c4320e164ddb3eb53f4`.  
**Current scope:** Runtime-owner foundation and the authorized lobby/pre-entry
UI/manual implementation are complete. Final acceptance is recorded below:
LC-015 and LC-017 are complete; Playwright, corrected full `pnpm verify`, and
self-host HTTP/WS smoke passed on the historical implementation worktree. The
155,648-byte Q-P03 value is an advisory reference, not a blocker. Other
verification obligations follow their specific contracts; do not infer
blockers from a generic “gate” label. A separate rematch-specific E2E and
physical Gamepad hardware smoke were not performed and are not claimed.

**Approval:** The user approved choices A and B and implementation as
described; do not reopen those choices or invent an additional Shaun-only gate.

## Phase 0 — materialize the approved foundation before code

- [x] LC-001 Amend existing spec 005 in place: add FR-056/FR-057, clarify
  FR-051/FR-053, record approved A/B choices, and state that only the runtime
  foundation is in this phase; retain existing M1–M3 plan/tasks unchanged.
- [x] LC-002 Amend existing spec 013 with the pre-join-before-Play clarification
  and AC-021; explicitly preserve all route shapes, route resolution, identity,
  and immediate entry timing.
- [x] LC-003 Create this follow-on plan and task list with foundation/UI phase
  boundaries, all approved compatibility/non-goal/verification constraints, and
  truthful pending UI/manual statuses before implementation.
- [x] LC-004 Update the input-mapping contract to specify one runtime Gamepad
  owner, pre-store capture with dispatch impossible, store reuse, and safe
  lifecycle suppression.

## Phase 1 — runtime-owner foundation (completed bounded phase)

- [x] LC-005 Add behavior-first regressions proving storeless capture cannot
  dispatch, capture/held input stays suppressed through store attachment, the
  first fresh attached-store input still translates through the active mapping,
  controller attachment does not create duplicate pollers, and disconnect /
  reconnect / disabled-input guards remain safe.
- [x] LC-006 Refactor the existing `GamepadController` into the single
  per-runtime owner/poller: allow construction without a store, explicit
  guarded store attach/detach, capture while storeless, and no dispatch branch
  without a store. Preserve the existing translator, order preflight, action
  identifiers, wire payloads, edge/repeat logic, and unsupported-API behavior.
- [x] LC-007 Create/reuse one owner in production before `RouterProvider`, and
  one isolated owner for demo, direct-match test runtime, and each
  `ConsoleRuntime` embedding. Provider lifecycle must be StrictMode-safe and
  must not reset mapping on route handoff, mount, lazy handshake, or effect
  replay.
- [x] LC-008 Make the minimal App change: attach its current store to the
  runtime owner and detach only that store on cleanup; reuse the owner for
  capture and pointer aim. Do not move or add any lobby/pre-join/embedding UI in
  this phase.
- [x] LC-009 Add/extend isolation, owner reuse, lifecycle, and StrictMode
  behavior tests. Verify no duplicate poller/listeners, no cross-runtime
  dispatch, and no stale mapping replacement.
- [x] LC-010 Run focused red/green tests and applicable console component,
  typecheck, conformance, lint, format, and build checks. Record source hash,
  commands, exit codes, artifacts, and any measured payload-budget effect.

**Execution record (2026-10-23):** Before implementation,
`pnpm --filter @europa/console exec vitest run --config vitest.config.ts tests/unit/input/gamepad-controller.test.ts`
exited 1 with the 3 new storeless-capture/handoff tests failing. After the owner
change, the following passed:

- `pnpm --filter @europa/console exec vitest run --config vitest.config.ts tests/unit/input/gamepad-controller.test.ts tests/unit/runtime.test.ts tests/unit/input/control-mapping.test.ts tests/unit/qol/hotkeys.test.ts` — exit 0, 4 files / 61 tests.
- `pnpm --filter @europa/console exec vitest run --config vitest.config.browser.ts tests/component/input/control-mapping-context.test.tsx tests/component/render/app-wire-view.test.tsx tests/component/render/modal-exclusivity.test.tsx` — exit 0, 3 files / 14 tests.
- `pnpm --filter @europa/console typecheck`, `pnpm --filter @europa/console typecheck:conformance`, `pnpm --filter @europa/console lint`, and `pnpm --filter @europa/console format:check` — each exit 0.
- `pnpm --filter @europa/console build` — completed successfully; generated ignored `packages/console/dist/` assets and TypeScript outputs.
- `pnpm guard:specs` and `git diff --check` — each exit 0.

`pnpm --filter @europa/console test:selfhost` exited 1 at its Q-P03 budget gate:
156,282 bytes gzipped against the unchanged 155,648-byte limit (634 bytes over;
742 bytes above the previously recorded 155,540-byte baseline). Its host smoke
did not run after that failure. No budget/checker adjustment was made. A fresh
full `pnpm verify` was not run in this phase. One earlier failing browser test
run emitted ignored screenshot
`packages/console/tests/component/input/__screenshots__/control-mapping-context.test.tsx/runtime-Gamepad-owner-context-StrictMode-effect-replay-leaves-one-poller-and-preserves-the-applied-mapping-1.png`;
the subsequent focused component suite passed.

At the foundation-phase working tree based on HEAD
`816bcd487dce253985808c4320e164ddb3eb53f4`, the implementation source/test
manifest (11 files under `packages/console/src` and
`packages/console/tests`) has SHA-256
`122266735b19dfe0b0f60b05939c659dcf88e3ea941088e9cde327301fe20ec8`. The saved
user-approved plan's coarse Step 2 is checked following manager reconciliation
of the foundation phase. The runtime-owner foundation is accepted functionally;
full acceptance remains pending because Q-P03 is not green.

## Phase 2 — lobby and entry surfaces (UI implementation and final acceptance complete)

- [x] LC-011 Host the existing editor and Configure controls entry in the
  persistent production lobby shell. Place the optional action before
  Create/Join/public-match actions; preserve focus, keyboard operation,
  announcements, atomic Apply/Cancel/Reset, profiles, and multiple bindings.
- [x] LC-012 Add the same editor to the existing deep-link pre-join screen
  before Play. Do not add route shapes, change route timing, or delay the match.
- [x] LC-013 Preserve `ConsoleRuntime` editor access through an embedding host
  shell launcher outside the production match sidebar; do not create a second
  mapping, editor, or poller.
- [x] LC-014 Remove the production active-match Controls launcher/modal
  ownership only when the lobby and selected compatibility surfaces are ready;
  preserve Help, Surrender/modal exclusivity, targeting, existing input guards,
  and spectators' read-only behavior.
- [x] LC-015 Add lobby/pre-join/embedding regressions and verify Create/Join/Play
  remain optional and immediate; prove both players' first live custom input
  uses the mapping applied before entry and the replaced binding no longer
  dispatches. Final Playwright E2E passed 62/62; runtime/store-handoff evidence
  supports rematch mapping continuity. A separate rematch-specific E2E was not
  run; see the final acceptance record for exact scope and caveats. Preserve
  wire payloads and mapping memory/isolation behavior.
- [x] LC-016 Update `docs/manual/src/pages/controls.mdx` and `lobby.mdx` under
  spec 007 FR-012. Keep claims truthful; do not claim physical Gamepad smoke
  without hardware evidence.
- [x] LC-017 Run focused accessibility, component, routing, E2E, and applicable
  two-player checks, independent review, bundle-budget verification, and a
  fresh `pnpm verify` against the final implementation tree. Final acceptance
  evidence, generated artifacts, failures, and freshness are recorded below; no
  publication or merge was performed.

**UI phase execution record (2026-10-23; repository-root working directory:**
`/home/openchamber/.local/share/opencode/worktree/5aec40325b8f83d8729dec58cf3711194ad68133/issue-201-control-mapping`):

The current 21-file `packages/console/src` + `packages/console/tests` manifest
(excluding ignored screenshots) hashes to
`3f083e57262f6e75ed1fffcc451bfecb568c3975907e577d9b478fe356bc1a88`. This is
the current uncommitted worktree source/test state based on HEAD
`816bcd487dce253985808c4320e164ddb3eb53f4`, not a commit or a clean-tree claim.

- `pnpm --filter @europa/console exec vitest run --config vitest.config.ts tests/unit/input/gamepad-controller.test.ts tests/unit/runtime.test.ts tests/unit/input/control-mapping.test.ts tests/unit/qol/hotkeys.test.ts` — exit 0; 4 files / 61 tests.
- `pnpm --filter @europa/console exec vitest run --config vitest.config.browser.ts tests/component/input/control-mapping-context.test.tsx tests/component/render/app-wire-view.test.tsx tests/component/render/modal-exclusivity.test.tsx tests/component/ui/lobby-landing.test.tsx tests/component/deep-link-interstitial.test.tsx tests/component/ui/controls-overlay.test.tsx tests/component/ui/sidebar.test.tsx` — exit 0; 7 files / 69 tests.
- `pnpm --filter @europa/console exec vitest run --config vitest.config.browser.ts tests/a11y/controls-overlay.test.tsx tests/a11y/lobby-keyboard.test.tsx` — exit 0; 2 files / 7 tests.
- `pnpm --filter @europa/console typecheck` and `pnpm --filter @europa/console typecheck:conformance` — each exit 0.
- `pnpm --filter @europa/console lint`, `pnpm --filter @europa/console format:check`, `pnpm guard:specs`, and `git diff --check` — each exit 0. Biome reported 25 informational diagnostics in existing unrelated files; no errors were reported.
- `pnpm --filter @europa/manual build` — exit 0; 15 pages built, generating ignored `docs/manual/dist/` output.
- `pnpm --filter @europa/console test:selfhost` — exit 1 after the internal console build succeeded and the remote-URL scan passed. It measured 156,654 bytes gzipped against the strict 155,648-byte Q-P03 budget (1,006 bytes over); the HTTP/WS host smoke did not run because the script exits at the budget gate. The build generated ignored `packages/console/dist/` outputs. No budget/checker change or asset exclusion was made.
- A prior foundation-phase measurement remains historical: 156,282 bytes (634 over, 742 above the previously recorded 155,540-byte result). The current UI-phase measurement supersedes it for current bundle status; neither failure changes authorization to implement the already-approved UI.
- A fresh full `pnpm verify`, actual two-player first-live-order E2E, physical Gamepad smoke, and independent review were not run. The focused profile-inheritance regression confirms the applied runtime mapping reaches the first post-editor App input, but is not a two-player network-order proof.

## Q-P03 authority clarification (2026-10-23)

The codeowner comment on PR #210
([comment 6348411040](https://github.com/shaunburdick/europa-neo/pull/210#issuecomment-6348411040))
says: “Yep! I think payload size checks are there just as a gate vs a hard
limit.” The user clarified that the approved 155,648-byte value is a guideline
for checking, not a strict line, and explicitly authorized changing only this
numeric metric's behavior: report the measured total and excess as a warning,
then continue the HTTP/WS smoke. This does not authorize raising the number,
excluding assets, or softening build, URL-scan/tooling, asset, or host-smoke
failures. The previous 156,654-byte failure and skipped smoke remain historical
evidence for the pre-v1.23 script.

## Constraints carried through every phase

- Keep Original behavior and `InputMapping` compatibility; preserve all
  existing actions, aliases, validation, profiles, repeat/edge behavior,
  logical-key semantics, keyboard/pointer guards, semantic translator,
  preflight, wire parity, per-runtime isolation, and reload-to-Original.
- No match-start delay/countdown/configuration gate/wait phase, route-shape or
  identity change, engine/server/network/protocol/lifecycle change, new action,
  storage/account setting, raw device wire data, controller-only aim, analog
  camera, controller preset, archived-source edit, or broad refactor.
- Preserve 155,648 bytes as the advisory browser-payload reference and count
  every shipped JS/CSS asset. At/above target, warn with actual total/excess
  and continue the host smoke. Do not exclude assets, alter the numeric target,
  or weaken non-budget checks.
- No commits, pushes, PR-body/comments, ready/merge, auth/signing/hook/global
  configuration/firewall mutations, or live installation/synchronization are
  part of this bounded execution.

## Final acceptance execution record (2026-10-23; manager-reconciled)

This record supersedes the pending-status statements above and the Phase 2
checkpoint's then-current results. It does not replace the dated historical
phase records or change any approved scope, constraint, or non-goal.

- **Historical local verification:** the implementation worktree was based on
  `816bcd487dce253985808c4320e164ddb3eb53f4`; it was not a committed or clean
  46-file snapshot. The corrected local `pnpm verify` passed all 13 phases
  with host bindings unset and `EUROPA_E2E_PORT=5174`. Playwright passed 62/62;
  the focused selfhost-budget suite passed 1 file / 13 tests and browser
  mapping/modal passed 2 files / 14 tests. Targeted Biome, `git diff --check`,
  and `bash -n` checks passed. The final self-host measure was 156,686 bytes
  gzipped against the 155,648-byte advisory reference (+1,038); it warned and
  completed HTTP/WS smoke successfully. The local logs and source manifest were
  temporary and are not retained, so this is historical summarized evidence,
  not independently reproducible or current-head evidence.
- **Last completed PR-head CI:** GitHub Actions [Client CI run
  41665457096](https://github.com/shaunburdick/europa-neo/actions/runs/41665457096)
  passed on PR #210 head `584a17fc1b11aea41963818f463c2b62c2880814`, including
  console lint/typecheck, Node and browser/E2E suites, and coverage. The E2E
  workflow includes the self-host scan and HTTP/WS smoke. This exact-head CI
  result is not a claim that full `pnpm verify` ran on that commit; it predates
  the current base-merge and documentation updates, which need fresh CI.
- **Historical failure and limits:** the first local `pnpm verify` attempt
  failed only Phase 5b because explicit `127.0.0.1` host bindings did not match
  the test's `http://localhost`; the corrected run above passed. Earlier strict
  Q-P03 failures (156,282 and 156,654 bytes, with the then-current script
  stopping before smoke) remain historical. No separate rematch-specific E2E
  or physical Gamepad hardware smoke was performed, and neither is claimed.

---

Generated-By: algo-enforcers (model: azure/gpt-6-luna)
