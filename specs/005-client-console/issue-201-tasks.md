# Tasks: Dynamic control mapping (issue #201)

**Input:** approved PRE-M1 plan `issue-201-plan.md`; spec 005 v1.13 planning
amendment; research `issue-201-research.md`; project `AGENTS.md` and
`.specify/memory/constitution.md`.
**Scope:** PRE-M1 planning publication, then future M1–M3 implementation tasks.
**Current status:** planning verification complete; publication pending; M1–M3
are authorized after remote confirmation of the draft planning PR; no
implementation task has started.

## PRE-M1 — publish approved planning package

- [x] P201-001 Amend `specs/005-client-console/spec.md` with the #201 planning
  requirements and truthful unimplemented status; retain spec 005 ownership.
- [x] P201-002 Add bounded #201 research, plan, and task artifacts without
  rewriting completed historical `plan.md` or `tasks.md`.
- [x] P201-003 Review the four-file planning diff; run `git diff --check` and
  the repository's full `pnpm verify` gate. Record exact outcomes and any
  generated artifacts. Do not amend unrelated files or weaken/bypass failures.
- [ ] P201-004 Confirm clean task scope, required branch/signature/hooks, and
  push preflights; commit only the assigned docs with a conventional signed
  commit and Generated-By trailer.
- [ ] P201-005 After the approved `git push -u origin
  005-dynamic-control-mapping-201`, confirm the published commit/signature and
  create one DRAFT PR against `main` using the approved title/body. Read back
  PR number, URL, head SHA, draft status, actor, and body; link the PR. Do not
  mark ready, merge, or replace the final PR body.
- [ ] P201-006 Confirm the draft planning PR remotely and return its URL/head/
  checks to `aliza-agent`; only then continue with the already-authorized M1–M3
  sequence. If PRE-M1 fails, stop instead of starting implementation.

## M1 — runtime mapping foundation (authorized after PRE-M1; no UI/Gamepad)

- [ ] I201-M1-001 Inventory all shipped keyboard, pointer, selection, camera,
  help, and targeting actions; record the action-to-wire parity baseline and
  identify runtime/embedding entry points.
- [ ] I201-M1-002 Define a typed source/action binding model with multiple
  bindings per action and Primary/Secondary aliases. Preserve the public
  `InputMapping` through an additive compatibility adapter; represent `key`
  versus `code` semantics explicitly if both are supported. Review the exact
  public diff against the existing API-versioning contract without assuming a
  breaking change.
- [ ] I201-M1-003 Add pure mapping validation and atomic replace/reset
  operations. Reject unsupported and context-overlapping conflicting
  assignments without partial application; allow distinct modifier chords.
- [ ] I201-M1-004 Wire the mapping into production and embedding runtime paths;
  update it without remounting controllers; flush held/repeat state on
  replacement, blur, disconnection, and teardown. Keep mappings isolated per
  runtime, in memory only, and active through route/rematch reuse.
- [ ] I201-M1-005 Derive active help labels from the mapping and preserve all
  current defaults, action behavior, targeting/preflight, focus/modal/offline/
  spectator guards, and wire orders. Do not add Controls UI, Gamepad polling,
  persistence, or device-data networking in M1.
- [ ] I201-M1-006 Add tests for default parity, legacy adapter compatibility,
  remapping without remount, invalid/conflicting atomic updates, aliases,
  per-runtime isolation, lifecycle flush, action-to-wire parity, and unsupported
  sources. Run applicable console tests, typecheck, conformance, lint, coverage,
  and `pnpm verify:changed`; update this spec if accepted behavior changes.

## M2 — Controls dialog and standard Gamepad (authorized after M1)

- [ ] I201-M2-001 Build the design-system Controls dialog with accessible
  action rows, Primary/Secondary capture, additional bindings, clear/reset/
  cancel, and conflict feedback. Capture must not dispatch gameplay actions;
  preserve exclusive modal state and focus restoration.
- [ ] I201-M2-002 Add feature-detected standard-mapped Gamepad API input for
  buttons and signed axes through an injected polling seam. Implement
  deadzone/hysteresis, rising-edge order actions, bounded selection repeat,
  concurrent keyboard/pointer use, and listener/polling cleanup. Default
  directional bindings move selection only; custom supported discrete d-pad
  buttons and signed-axis activations may bind existing compatible actions
  through the same guarded bridge, without adding action types or bypassing
  action validation. Do not implement analog camera control.
- [ ] I201-M2-003 Test keyboard-only accessibility, modal behavior, capture
  safety, simultaneous sources, held-button non-repeat, neutral/disconnect/
  hidden/blur cleanup, bounds, unsupported API fallback, and hot-plug behavior.
  Update help/manual claims only when shipped behavior changes.
- [ ] I201-M2-004 Record a physical standard-controller smoke result before
  making a hardware validation claim. Do not implement controller-only weapon
  aiming or analog camera control.

## M3 — Original, MMO/WASD, and Custom keyboard profiles (authorized after M2)

- [ ] I201-M3-001 Implement concrete Original and MMO/WASD keyboard binding
  tables plus editable Custom mapping; WASD changes selection movement only.
- [ ] I201-M3-002 Apply profiles atomically with conflict checks and accurate
  active labels; preserve non-conflicting actions and controller bindings;
  reset reload to Original without persisted settings.
- [ ] I201-M3-003 Add preset/custom regression and accessibility coverage; update
  `docs/manual/` under spec 007 FR-012; run console checks and the full
  repository gate before publication.

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
