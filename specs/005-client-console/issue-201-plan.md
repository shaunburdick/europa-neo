# Implementation Plan: Dynamic control mapping (issue #201)

**Feature:** 005 — Client Console
**Branch:** `005-dynamic-control-mapping-201`
**Date:** 2026-10-21
**Status:** User-approved M1–M3 scope; PRE-M1 publication is the required
dependency. M1 code has not started and may begin only after the draft planning
PR is remotely confirmed.
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
- Before the planning branch push, run the project-required
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
  documents.

---

Generated-By: algo-enforcers (model: azure/gpt-6-luna)
