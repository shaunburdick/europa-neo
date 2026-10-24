# Tasks: Dynamic control mapping (issue #201)

**Input:** approved PRE-M1 plan `issue-201-plan.md`; spec 005 v1.20 planning
amendment; research `issue-201-research.md`; project `AGENTS.md` and
`.specify/memory/constitution.md`.
**Scope:** PRE-M1 planning publication, then future M1–M3 implementation tasks.
**Current status:** PRE-M1 PR #210 is remotely confirmed. M1–M3 implementation
and the full repository gate are complete locally on the source manifest
recorded below. A later bounded documentation-only readiness delta has its own
focused checks but is not a full-gate rerun. Physical standard-controller smoke
is unavailable and hardware validation is not claimed.

## PRE-M1 — publish approved planning package

- [x] P201-001 Amend `specs/005-client-console/spec.md` with the #201 planning
  requirements and truthful unimplemented status; retain spec 005 ownership.
- [x] P201-002 Add bounded #201 research, plan, and task artifacts without
  rewriting completed historical `plan.md` or `tasks.md`.
- [x] P201-003 Review the four-file planning diff; run `git diff --check` and
  the repository's full `pnpm verify` gate. Record exact outcomes and any
  generated artifacts. Do not amend unrelated files or weaken/bypass failures.
- [x] P201-004 Confirm clean task scope, required branch/signature/hooks, and
  push preflights; commit only the assigned docs with a conventional signed
  commit and Generated-By trailer.
- [x] P201-005 After the approved `git push -u origin
  005-dynamic-control-mapping-201`, confirm the published commit/signature and
  create one DRAFT PR against `main` using the approved title/body. Read back
  PR number, URL, head SHA, draft status, actor, and body; link the PR. Do not
  mark ready, merge, or replace the final PR body.
- [x] P201-006 Confirm the draft planning PR remotely and return its URL/head/
  checks to `aliza-agent`; only then continue with the already-authorized M1–M3
  sequence. If PRE-M1 fails, stop instead of starting implementation.

## M1 — runtime mapping foundation (authorized after PRE-M1; no UI/Gamepad)

- [x] I201-M1-001 Inventory all shipped keyboard, pointer, selection, camera,
  help, and targeting actions; record the action-to-wire parity baseline and
  identify runtime/embedding entry points.
- [x] I201-M1-002 Define a typed source/action binding model with multiple
  bindings per action and Primary/Secondary aliases. Preserve the public
  `InputMapping` through an additive compatibility adapter; represent `key`
  versus `code` semantics explicitly if both are supported. Review the exact
  public diff against the existing API-versioning contract without assuming a
  breaking change.
- [x] I201-M1-003 Add pure mapping validation and atomic replace/reset
  operations. Reject unsupported and context-overlapping conflicting
  assignments without partial application; allow distinct modifier chords.
- [x] I201-M1-004 Wire the mapping into production and embedding runtime paths;
  update it without remounting controllers; flush held/repeat state on
  replacement, blur, disconnection, and teardown. Keep mappings isolated per
  runtime, in memory only, and active through route/rematch reuse.
- [x] I201-M1-005 Derive active help labels from the mapping and preserve all
  current defaults, action behavior, targeting/preflight, focus/modal/offline/
  spectator guards, and wire orders. Do not add Controls UI, Gamepad polling,
  persistence, or device-data networking in M1.
- [x] I201-M1-006 Add tests for default parity, legacy adapter compatibility,
  remapping without remount, invalid/conflicting atomic updates, aliases,
  per-runtime isolation, lifecycle flush, action-to-wire parity, and unsupported
  sources. Run applicable console tests, typecheck, conformance, lint, coverage,
  and `pnpm verify:changed`; update this spec if accepted behavior changes.

## M2 — Controls dialog and standard Gamepad (authorized after M1)

- [x] I201-M2-001 Build the design-system Controls dialog with accessible
  action rows, Primary/Secondary capture, additional bindings, clear/reset/
  cancel, and conflict feedback. Capture must not dispatch gameplay actions;
  preserve exclusive modal state and focus restoration.
- [x] I201-M2-002 Add feature-detected standard-mapped Gamepad API input for
  buttons and signed axes through an injected polling seam. Implement
  deadzone/hysteresis, rising-edge order actions, bounded selection repeat,
  concurrent keyboard/pointer use, and listener/polling cleanup. Default
  directional bindings move selection only; custom supported discrete d-pad
  buttons and signed-axis activations may bind existing compatible actions
  through the same guarded bridge, without adding action types or bypassing
  action validation. Do not implement analog camera control.
- [x] I201-M2-003 Test keyboard-only accessibility, modal behavior, capture
  safety, simultaneous sources, held-button non-repeat, neutral/disconnect/
  hidden/blur cleanup, bounds, unsupported API fallback, and hot-plug behavior.
  Update help/manual claims only when shipped behavior changes.
- [ ] I201-M2-004 Record a physical standard-controller smoke result before
  making a hardware validation claim. Do not implement controller-only weapon
  aiming or analog camera control.

  **Environment limitation:** no physical standard-mapped controller was
  available for this local run. No hardware smoke or hardware validation claim
  is recorded; the task remains open for a person with hardware.

## M3 — Original, MMO/WASD, and Custom keyboard profiles (authorized after M2)

- [x] I201-M3-001 Implement concrete Original and MMO/WASD keyboard binding
  tables plus editable Custom mapping; WASD changes selection movement only.
- [x] I201-M3-002 Apply profiles atomically with conflict checks and accurate
  active labels; preserve non-conflicting actions and controller bindings;
  reset reload to Original without persisted settings.
- [x] I201-M3-003 Add preset/custom regression and accessibility coverage; update
  `docs/manual/` under spec 007 FR-012; run console checks and the full
  repository gate before publication.

## Owner-approved Q-P03 payload budget amendment (2026-10-22)

Approval source: shaunburdick's [PR #210 owner-decision comment
6348411040](https://github.com/shaunburdick/europa-neo/pull/210#issuecomment-6348411040),
created `2026-10-22T18:38:13Z`. The approved limit is strictly `< 155,648 bytes`
(152 KiB), up 2,048 bytes from the former 153,600-byte limit and 108 bytes over
the measured 155,540-byte payload. The check continues to count every gzip
asset under `dist/assets` and fails at `>= 155,648`; no URL scan, asset scope,
severity, test exclusion, or verifier gate is changed.

- [x] I201-M3-004 Amend the self-host test default/fixture and current spec 005
  Q-P03, spec 013 FR-030/AC-016, spec 012 G-08/NFR-005, and directly affected
  current guidance to the owner-approved 155,648-byte limit. Preserve older
  threshold measurements as historical evidence.
- [x] I201-M3-005 Run `pnpm verify` against the amended source tree and record the
  exact final manifest, full-gate outcome, and artifacts before publication.

  **Run record:** `pnpm verify` (`bash scripts/verify.sh`) passed all 13 phases,
  exit 0, 2026-10-22 19:33:10Z–19:38:47Z, against manifest
  `611a34068b036a4b43fcf0853df5e39320d5a5d7a6831911e910e0189fb4741a`.
  `test:selfhost` measured 155,540/155,648 bytes; run log and metadata:
  `/tmp/opencode/issue-201-budget-fullverify-20261022.log` and
  `/tmp/opencode/issue-201-budget-fullverify-20261022.meta`. This completed run
  is not GitHub CI evidence. Subsequent status/readiness-only edits in six
  documentation paths are not included in that manifest; their targeted
  documentation/spec guards and diff/format outcomes are reported separately.
  Run a fresh full gate before any future code publication.

## Cross-milestone non-goals

No accounts, server/protocol/engine changes, persistence/storage, raw device
data on the wire, touch support, vendor SDKs, arbitrary device/browser support
claims, edits to `europa-source/`, a new troop-movement action, Gamepad-only
weapon aiming, analog camera control, or controller presets. Default directional
Gamepad input selects only; custom supported discrete controls may invoke
existing compatible actions through the guarded bridge. Any newly required
scope or product decision returns to the manager for authorization; settled
approved choices are not re-opened.

---

Generated-By: algo-enforcers (model: azure/gpt-6-luna)
