# Research: Dynamic control mapping (issue #201)

**Feature:** 005 — Client Console
**Research state:** PRE-M1, read-only
**Source state:** `005-dynamic-control-mapping-201` at
`3af3007c7876f7e301901a888f7bff4cf14ef2c3` (same as `main` at inspection)

## Evidence and provenance

This document records the bounded evidence used for the approved issue #201
planning package. Current checkout paths and `InputMapping`/hotkey sources were
read directly at the source SHA above. The broader prior code-path inventory
was reused from the primary research session `ses_ea0a4309bffeoawNCOb4Vs6DEu`
at the same SHA; it was not repeated as a new check. No implementation tests or
builds were run during research.

## Observed current contract and runtime

- `packages/console/src/contracts/console-types.ts` defines the public
  `InputMapping` and `DEFAULT_INPUT_MAPPING`. Existing defaults are I/J/K/L
  for pipes, Alt+I/J/K/L for exclusive pipes, Space to clear pipes, P/H for
  paratroops, G/O for guns, 0–9 for reserves, Escape to cancel, and arrow keys
  for selection. The contract describes key identifiers and uses
  `KeyboardEvent.key` in the keyboard translation path.
- The current `InputMapping` shape has individual action fields (and a list for
  reserve digits), not a general action-to-many-bindings model. The pointer
  contract separately expresses button and modifier bindings.
- `packages/console/src/qol/hotkeys.ts` resolves a complete mapping at
  `HotkeyController` construction and routes keys through
  `translateKey`. `packages/console/src/render/App.tsx` constructs the
  production controller as `new HotkeyController(store)` and the controller
  lifecycle effect is keyed to the store; no runtime mapping-replacement
  method is present in these inspected surfaces.
- The `InputMapping` type is re-exported by the public console API. The
  `CONSOLE_API_VERSION` contract currently says breaking changes to the named
  public contract files require a version increment. The approved planning
  scope therefore preserves compatibility and makes no API-version or network
  version decision before an exact implementation diff exists.
- The existing spec 005 already owns controls, client action translation,
  pointer/keyboard interaction, and the Controls help content. Amending spec
  005 is consistent with project ownership; a parallel feature spec is not
  needed.
- The previous read-only inventory found no production Gamepad implementation
  or dynamic Controls panel. That result is reused evidence at the same source
  SHA, not a new runtime test or hardware check.

## Approved planning decisions

The user-approved plan sets the design boundary: client-only resolution to
existing actions; current Original semantics retained; multiple bindings per
action with Primary/Secondary as aliases; in-memory per-runtime state; an M1
keyboard/pointer runtime seam; an M2 accessible Controls dialog and
standard-mapped Gamepad support; and M3 Original, MMO/WASD-selection, and
Custom keyboard profiles. Gamepad-only weapon aiming and analog camera control
are deferred. There are no account, server, protocol, engine, storage, vendor
SDK, or archived-control changes.

## Unresolved implementation details

No additional product decision is requested by this research. Implementation
must choose concrete data types, dispatch and polling mechanics, conflict
diagnostics, and test seams within the approved boundaries. If the exact public
surface makes a versioning decision necessary, report the exact diff and
existing contract rule to the manager rather than speculating or changing a
version in advance. Standard Gamepad behavior must be validated with a physical
controller before claiming hardware coverage.

## Validation

The research itself was read-only. The planning package is to be checked with
the repository's documented `pnpm verify` / `bash scripts/verify.sh` gate
before publication. Tests, builds, and any generated-artifact effects from that
publication gate are reported separately from this research evidence.

---

Generated-By: algo-enforcers (model: azure/gpt-6-luna)
