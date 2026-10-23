# Implementation Plan: Dynamic control mapping (issue #201)

**Feature:** 005 — Client Console
**Branch:** `005-dynamic-control-mapping-201`
**Date:** 2026-10-21
**Status:** M1–M3 implementation and the required full repository gate are
complete locally. `pnpm verify` passed all 13 phases at exit 0 against source
manifest `611a34068b036a4b43fcf0853df5e39320d5a5d7a6831911e910e0189fb4741a`
on 2026-10-22; the bounded documentation reconciliation below is a later delta
and is not included in that tested manifest. Run a fresh full gate before any
future code publication. Physical standard-controller smoke is unavailable;
no hardware validation claim is made.
**Specification:** [`spec.md`](./spec.md), v1.13 planning amendment
**Research:** [`issue-201-research.md`](./issue-201-research.md)
**Tasks:** [`issue-201-tasks.md`](./issue-201-tasks.md)
**Issue:** [#201](https://github.com/shaunburdick/europa-neo/issues/201)

## 1. Goal and scope

Deliver per-runtime, non-persistent client input mappings that resolve device
input to existing console actions. Preserve the current Original keyboard and
pointer behavior and the existing wire-order semantics. The plan divides the
work into the user-approved milestones: M1 runtime foundation without UI or
Gamepad hardware; M2 accessible Controls dialog and standard-mapped Gamepad;
M3 Original/MMO-WASD/Custom keyboard profiles.

This PRE-M1 package only publishes the spec amendment, research, plan, and task
breakdown. It changes no runtime behavior and completes no M1 task.

## 2. Approved decisions and constraints

- Keep spec 005 as the controlling feature; do not create a competing feature
  spec or overwrite the historical completed `plan.md` / `tasks.md`.
- Preserve the existing `InputMapping` with an additive compatibility adapter.
  Represent action bindings as lists; Primary/Secondary are UI aliases for the
  same action and additional bindings remain allowed.
- Preserve the current `KeyboardEvent.key` behavior for shipped defaults.
  Physical `KeyboardEvent.code` semantics, if added, must be explicit rather
  than silently changing keyboard-layout behavior.
- A complete mapping belongs to one app/tab runtime, remains in memory across
  route changes/rematches that retain that runtime, resets on reload, and is
  isolated from other embedded runtimes. No persistence.
- Validate replacement atomically for conflicts in overlapping gameplay
  contexts. Flush held/repeat state on replacement, blur, disconnection, and
  teardown. Keep existing focus, modal, offline, spectator, and order guards.
- M2 uses the standard-mapped browser Gamepad API with feature detection and
  signed axes. Default directional bindings move selection only. A custom
  mapping may bind supported discrete Gamepad controls, including d-pad buttons
  and signed-axis activations, to existing compatible semantic actions through
  the same guarded bridge as keyboard/pointer input. Keyboard and pointer
  remain usable without Gamepad support.
- M3's MMO/WASD layout changes selection only. The default directional
  controller mapping does not add troop movement or new action types. Custom
  remapping may select existing compatible actions, but does not introduce
  analog camera control or controller-only weapon aiming. Pointer subcell
  aiming stays available; controller presets are deferred.
- No accounts, server/protocol/engine, storage, raw device data on the wire,
  touch, vendor SDK, arbitrary-device compatibility guarantee, or edits under
  `europa-source/`.
- No `NETWORK_API_VERSION` change. Do not speculate about an API breaking
  change or bump `CONSOLE_API_VERSION` in this plan. Inspect the exact eventual
  public diff against the current console version contract before deciding.
- Update `docs/manual/` in the milestone that changes shipped controls, per
  spec 007 FR-012; no manual update is needed for this planning-only package.

## 3. Architecture and milestone sequence

### M1 — runtime foundation (no settings UI or Gamepad hardware)

Inventory all existing remappable gameplay, selection, pointer, camera, and
help actions. Add a typed source/action model and compatibility adapter; keep
legacy callers working. Route the current keyboard and pointer defaults through
the production and embedding runtime paths. Add validated in-memory
replace/reset operations without controller remounts and unify dispatch while
retaining existing targeting and local order validation. Derive active help
labels from the active mapping.

Acceptance: existing defaults produce equivalent actions and wire orders;
supported bindings take effect immediately; unsupported/conflicting mappings
fail clearly and atomically; aliases invoke the same action; separate runtimes
are independent; held/repeat state clears at required lifecycle boundaries;
focus, modal, offline, spectator, and bounds guards remain effective. No
settings UI, Gamepad poller, hardware validation claim, or persistence.

### M2 — accessible Controls dialog and standard Gamepad

Use the design-system dialog and preserve the exclusive modal-state contract.
Provide action rows, accessible Primary/Secondary capture, additional bindings,
clear/reset/cancel, and conflict feedback. Capturing input must not dispatch a
gameplay action. Add an injected polling seam for standard-mapped Gamepad
buttons/axes, with deadzone/hysteresis, rising-edge order activation,
bounded selection repeat, safe feature detection, and cleanup. Keep keyboard,
pointer, and Gamepad active concurrently.

Acceptance: keyboard-only configuration works accessibly; focus restores;
game-over cannot be preempted; button orders do not repeat while held; neutral,
disconnected, hidden, or blurred states cause no phantom actions; lack of the
Gamepad API degrades safely. Hardware validation is not claimed until a
physical standard-controller smoke test is recorded. Full controller-only
weapon targeting and analog camera control remain out of scope. Default
directional bindings select only; custom discrete controls may invoke existing
compatible actions through the guarded bridge.

### Review correction delta

Before publication, advisory review identified that FR-055 could be read as
forbidding custom Gamepad remapping. The v1.13 wording now limits selection-only
behavior to the default directional mapping and explicitly permits supported
discrete d-pad buttons or signed-axis activations to invoke existing compatible
actions through the same guarded bridge. It adds no action types, analog camera
control, controller-only weapon aim, or arbitrary-device guarantee.

### M3 — keyboard profiles and Custom

Implement concrete Original and MMO/WASD keyboard tables plus an editable
Custom profile. Preset application is conflict-safe and atomic; profile
changes do not silently erase controller bindings. Keep all profiles in
memory, show accurate active binding labels, reset reload to Original, update
the player manual, and add regression coverage.

Acceptance: Original is default and preserves shipped aliases; MMO uses WASD
for selection only and leaves other non-conflicting actions unchanged; Custom
works without persistence; controller bindings remain intact; manual claims
match shipped controls.

## 4. Verification and publication gates

- For each implementation milestone, follow the task list's focused red/green
  tests, package typecheck/conformance, lint, and applicable suite. Full
  console test surfaces include `test:unit`, `test:component`, `test:a11y`,
  and `test:e2e`; Gamepad polling/neutral/hot-plug behavior requires adapter
  tests and the M2 physical smoke evidence. Run `pnpm verify:changed` for
  iteration where appropriate.
- Before any authorized planning or implementation branch push, run the project-required
  `pnpm verify` (`bash scripts/verify.sh`) in this worktree. It builds packages,
  runs lint/typecheck/format/conformance and test suites, and may write build,
  coverage, test, browser, or self-host artifacts. Report exact results and
  artifacts; do not bypass failing required gates.
- Commit only the assigned planning documents with the required signed
  conventional commit and current repository hooks/authorized signing identity.
  Stage only those documents. Push the named feature branch with the explicitly
  approved `git push -u origin 005-dynamic-control-mapping-201` after operation
  preflights. Do not alter auth, signing identities/configuration, permissions,
  hooks, or unrelated files to get past a failure.
- Create one draft PR against `main` using the approved title/body, updating
  only the planning-verification sentence to accurately describe observed
  checks. Read back its number, URL, head SHA, draft state, actor, and body.
  Do not merge, mark ready, replace the final PR body, or claim implementation.

## 5. PRE-M1 boundary and handoff

This execution proceeds to M1–M3 only after the published draft planning PR is
remotely confirmed. If PRE-M1 verification or publication fails, stop and
preserve the failure instead of starting implementation. The current user
assignment authorizes all three milestones after that dependency; no additional
human or manager approval is required for the settled scope and plan choices.
Return the PR URL/head/check evidence to `aliza-agent` at the PRE-M1 checkpoint.
Do not mark the PR ready or replace the approved planning body with final PR
text without the separately required human review.

## PRE-M1 verification record

- Source baseline: `3af3007c7876f7e301901a888f7bff4cf14ef2c3`; the #201 code
  change set is empty at this planning stage.
- `git diff --check`: passed.
- `pnpm verify`: passed after the FR-055 default/custom clarification; all
  repository build, lint, typecheck, conformance, test, browser, perf,
  self-host, documentation privacy, and spec-consolidation phases completed.
- The frozen-lockfile dependency install populated this worktree's ignored
  `node_modules`; verification produced ignored build/test artifacts including
  package `dist/` outputs. Tracked changes remain limited to the four planning
  documents at the original PRE-M1 publication point.
- Published planning commit: `6ab9c837e642b6bcc389491d925dca6a1a4a25c4` on
  `005-dynamic-control-mapping-201`; its local SSH signature verified. GitHub's
  commit verification API returned `verified: false`, `reason: unknown_key`;
  no signer, authentication, or repository settings were changed.
- Draft PR #210: <https://github.com/shaunburdick/europa-neo/pull/210>, title
  `docs(console): plan dynamic control mapping (#201)`, base `main`, remote head
  `6ab9c837e642b6bcc389491d925dca6a1a4a25c4`, author `aliza-agent`, state OPEN,
  `isDraft: true`. Its body was read back and matched the approved text with
  only the planning-verification sentence updated to observed checks.
- `gh pr checks 210` at the PRE-M1 readback exited 8 because checks remained
  pending: `changes`, referenced-contract-file check, spec-consolidation check,
  PR-commit/title lint, and the version coverage gate had passed; console
  unit/browser/lint/coverage jobs were pending; path-gated unrelated jobs were
  skipped. This is a status snapshot, not a claim of CI green.

## M1 execution checkpoint (2026-10-22)

- Focused console unit, component, and accessibility suites passed (1,049, 281,
  and 74 tests). The merged console coverage gate passed at 91.45% statements,
  86.31% branches, 90.78% functions, and 91.71% lines; the new mapping module
  measured 92.76%, 91.79%, 92.10%, and 96.75%, respectively.
- `pnpm --filter @europa/console typecheck`, `typecheck:conformance`, `lint`,
  `format:check`, and `pnpm verify:changed` passed. Existing Biome informational
  diagnostics were reported but did not fail lint.
- A fresh independent M1 review after recovery returned no material findings
  (`ses_e9be21341ffe44VXDQyYtk3p9P`). Earlier review findings on malformed
  bindings, stale aims, Ctrl/Meta chords, middle-button camera ownership, and
  action-specific Help labels were resolved and covered by focused tests.
- M1 is locally complete; run the full `pnpm verify` gate on the final M1–M3
  source tree before code publication. This checkpoint is not GitHub CI evidence.

## M2 execution checkpoint (2026-10-22)

- Added the accessible staged Controls dialog with keyboard and standard
  Gamepad capture, Primary/Secondary/additional slots, clear/reset/cancel/apply,
  and atomic conflict feedback. The design-system modal retains modal
  exclusivity and focus restoration.
- Added a feature-detected, injected-polling Gamepad controller for standard
  buttons and signed axes. It has hysteresis, rising-edge order activation,
  bounded selection repeat, modal/lifecycle cleanup, and routes custom discrete
  actions through the existing semantic translator. Default D-pad and left-stick
  directions select only. No physical device identifier or raw input is sent.
- M2 focused unit, component, and accessibility checks passed. A physical
  controller was not connected or available for smoke testing; no hardware
  validation claim is made.

## M3 execution checkpoint (2026-10-22)

- Added Original, MMO/WASD selection-only, and Custom profiles. Profile changes
  are staged and conflict-checked atomically; Original/MMO keyboard changes
  retain active pointer/Gamepad bindings. Custom edits and selected profile are
  runtime memory only; reload initializes Original.
- Updated `docs/manual/src/pages/controls.mdx` under spec 007 FR-012. Profile
  tests cover selection-only mapping, controller preservation, conflict
  rejection, and reset semantics. The subsequent full-repository gate passed
  on the exact source manifest recorded below; later documentation-only
  readiness edits are separately recorded and are not represented as a fresh
  full-gate pass.

## Owner-approved Q-P03 budget amendment (2026-10-22)

- **Authority:** owner shaunburdick approved increasing the payload-size gate in
  [PR #210 comment 6348411040](https://github.com/shaunburdick/europa-neo/pull/210#issuecomment-6348411040)
  at `2026-10-22T18:38:13Z` ("the payload size checks are there just as a gate
  vs a hard limit"). This approves the bounded limit increase only; it does not
  waive the check or authorize changing hooks, signing, or other gates.
- **Exact target:** strictly `< 155,648 bytes` (152 KiB), the next whole-KiB
  ceiling above the measured 155,540-byte browser payload. This is a 2,048-byte
  increase from 153,600 bytes and leaves 108 bytes over the measured payload.
- **Preserved semantics:** retain the full `dist/assets/**/*.{js,css}` per-file
  gzip sum, strict `total_bytes >= budget` failure, remote-URL scan, and normal
  verifier wiring. No assets are excluded and no test is suppressed.
- **Status:** script/test defaults and current normative references have been
  amended. The fresh full-gate outcome and its source-manifest freshness
  boundary are recorded below.

## Full verification and readiness-document delta (2026-10-22)

- `pnpm verify` (which ran `bash scripts/verify.sh`) passed all 13 phases with
  exit 0 from 19:33:10Z to 19:38:47Z on source manifest
  `611a34068b036a4b43fcf0853df5e39320d5a5d7a6831911e910e0189fb4741a`.
  The self-host gate measured 155,540/155,648 bytes; full log and run metadata
  are `/tmp/opencode/issue-201-budget-fullverify-20261022.log` and
  `/tmp/opencode/issue-201-budget-fullverify-20261022.meta`.
- After that run, readiness status was reconciled only in
  `specs/005-client-console/spec.md`, `issue-201-plan.md`, `issue-201-tasks.md`,
  `quickstart.md`, `specs/012-design-system/spec.md`, and
  `specs/013-semantic-url-routing/spec.md`. These documentation edits do not
  change implementation sources; the full gate was not rerun on this later
  document delta. Targeted documentation/spec guards and diff/format checks are
  recorded in the phase handoff. Do not describe the tested manifest as the
  current post-reconciliation manifest or as GitHub CI evidence.
- Before any later code publication, run the fresh project-required full
  `pnpm verify` gate on the then-current tree. Hook/signing/publication gates
  remain separate; no physical-controller smoke or hardware validation is
  claimed.

---

Generated-By: algo-enforcers (model: azure/gpt-6-luna)
