# Input mapping contract (spec 005 v1.23, issue #201)

**Status:** M1–M3, the shared runtime-owner foundation, and the approved
lobby/pre-join/embedding-host UI are implemented in the current worktree.
Current LC015/LC017 acceptance, independent-review, and verification evidence
is recorded in `issue-201-lobby-controls-tasks.md`. Q-P03 retains the
155,648-byte reference target with warning-only numeric excess per spec 005
v1.23. No physical controller smoke has been performed, and no
hardware-validation claim is made.

## Source of truth

Public data types are declared in
`packages/console/src/contracts/console-types.ts` and re-exported through
`@europa/console`. Runtime adaptation and validation live in
`packages/console/src/input/control-mapping.ts`.

## Data shape and compatibility

- `ControlMapping` maps each stable `ControlActionId` to an ordered list of
  `ControlBinding`s. The list is unbounded by a Primary/Secondary ceiling;
  future UI aliases name the first two slots, while remaining bindings continue
  to invoke the same action.
- `ConsoleConfig.inputMapping` remains the legacy initialization shape. A
  compatibility adapter converts it to action binding lists without changing
  original keyboard, pointer, or resulting `PlayerAction` semantics.
- Shipped keyboard bindings use `KeyboardEvent.key`. Physical
  `KeyboardEvent.code` bindings are not currently supported. The public binding
  type records its event semantics explicitly so a future extension cannot
  silently reinterpret existing values.
- Legacy Original single-character keys remain case-folded for parity. Custom
  logical-key bindings carry an explicit case-sensitivity flag, so a captured
  modified character is not silently normalized into the Original binding.
- Ctrl/Meta keyboard chords remain reserved for browser commands and are
  rejected by M1 mapping validation. Distinct supported Alt/Shift chords remain
  independently bindable.
- M1–M3 are implemented: M1 routes keyboard and pointer defaults through the
  mapping seam, M2 accepts feature-detected standard-mapped Gamepad button and
  signed-axis bindings, and M3 provides keyboard profiles. Default Gamepad
  bindings move selection only; unsupported Gamepad APIs disable Gamepad input
  and capture without disabling keyboard or pointer controls. FR-053/055/057 in
  spec 005 govern the supported mappings and lifecycle. No physical controller
  smoke has been performed; hardware validation is not claimed.
- In the composed app the middle pointer button is owned by the zoom/pan
  controller and is not a M1 pipe binding. Default pipe pointer behavior stays
  primary/left toggle, secondary/right exclusive, and Alt+left exclusive.

## Update, validation, and isolation

- Each application runtime owns one `ControlMappingSession` and one Gamepad
  input owner. Production's page-lifetime provider shares both across route
  changes and rematches; each `ConsoleRuntime` embedding instance, demo runtime,
  and direct-match runtime owns a separate pair. Isolated `App` renders use
  private fallback instances.
- A valid replacement updates the session snapshot and notifies consumers;
  input controllers read the new snapshot without remounting. `reset()` returns
  to that session's initial mapping. Mapping state is in memory only and is not
  added to `ConsoleState`, browser storage, a network message, or an order.
- Validation rejects missing/unknown actions, malformed or unsupported sources,
  incompatible source/action pairs, duplicate bindings, and conflicting
  bindings in overlapping input contexts. More-specific modifier chords may
  coexist with subset bindings and win deterministically. A rejected update
  leaves the current snapshot unchanged.
- Existing keyboard focus/repeat guards, live-input and bounds checks,
  pointer hit-testing, subcell targeting, local order preflight, and the
  store-to-order bridge remain the dispatch path. Mapping never creates a new
  `PlayerAction` or changes a wire order. Keyboard and pointer controllers
  remain App/store-owned; only the Gamepad owner is available before a match
  store attaches.
- Replacing a mapping clears a remembered cursor aim. Blur, offline transition,
  and controller disposal clear the same transient sample; pointer movement
  while offline cannot repopulate it. A spectator without a live store attaches
  no order-producing keyboard/pointer controller or Gamepad store bridge. The
  Gamepad owner may remain available to its runtime, but without an attached
  store it cannot dispatch; the UI-only mapped Help toggle remains available as
  required by FR-041.
- The Help overlay lists active keyboard bindings per semantic action, so
  additional bindings remain associated with their own action rather than
  being flattened across direction/action rows.
- The Controls dialog uses the design-system modal/buttons, stages edits, and
  applies only a fully validated mapping. Keyboard capture consumes the event
  before gameplay dispatch; Ctrl/Meta remain reserved. Cancel drops staged
  edits, reset stages the runtime's Original keyboard table, and Apply updates
  without remounting input controllers.
- The editor exposes Original, MMO/WASD selection, and Custom profiles. MMO
  replaces selection movement keyboard bindings with W/A/S/D only. Applying a
  keyboard profile preserves active pointer and Gamepad bindings; a collision
  rejects the complete preset. Profile selection and edits remain in memory;
  reload creates a new Original session.
- One runtime-owned Gamepad poller is feature-detected and reads only the first
  connected `mapping === 'standard'` pad. Default D-pad buttons 12–15 and
  signed left-stick axes move selection only. A press threshold of 0.55 and
  release threshold of 0.35 provide hysteresis; directional selection repeats
  after 400 ms and then at most once per 140 ms poll interval. Non-directional
  actions activate on a rising edge. Missing/unsupported APIs, non-standard
  pads, disconnect, blur, hidden documents, modal capture, mapping replacement,
  and teardown do not create raw-device network data or bypass the existing
  action translator/preflight. The same poller can capture before a
  `ConsoleStore` attaches; capture and every store/capture/mapping/focus/
  visibility/connection/disposal handoff flush held and repeated state and
  suppress held controls until neutral. With no store, the dispatch branch is
  unavailable by construction.
- Gamepad validation rejects pointer-gesture, camera UI, and Help UI actions;
  compatible discrete button/axis bindings route through the existing semantic
  action translator. Pointer subcell weapon aiming remains available.

## Verification

The focused M1 mapping suite is
`pnpm --filter @europa/console exec vitest run --config vitest.config.ts
tests/unit/input/control-mapping.test.ts`; hotkey and pointer conformance is
covered by `tests/unit/qol/hotkeys.test.ts`,
`tests/unit/input/region-select.test.ts`, `tests/unit/input/order-draft.test.ts`,
and the package conformance program.
