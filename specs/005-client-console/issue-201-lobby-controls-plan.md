# Issue #201 follow-on — Lobby and pre-entry Controls plan

**Feature:** 005 — Client Console  
**Related routing contract:** 013 — Semantic URL Routing  
**Date:** 2026-10-23  
**Status:** User-approved implementation plan. The runtime-owner foundation, lobby/pre-join/embedding-host UI, and manual updates are implemented, and final acceptance is reconciled in [`issue-201-lobby-controls-tasks.md`](issue-201-lobby-controls-tasks.md). Independent read-only reviews, Playwright (62/62), corrected full `pnpm verify` (13/13 phases), and final self-host HTTP/WS smoke passed. Q-P03 remains advisory at 155,648 bytes; the final measured 156,686 bytes (+1,038) produced a warning and smoke passed. The earlier strict-budget failure and skipped smoke remain historical. Separate rematch-specific E2E and physical Gamepad hardware smoke were not performed and are not claimed.
**Approval source:** Saved plan `1792769828093-issue-201-configure-controls-in-the-lobby-before-play.md`, knowledge id `cc595ad9-b84f-4b8a-9020-6f28cee9bcfd`; the user explicitly approved implementation as described and both choices A and B.  
**Baseline:** `005-dynamic-control-mapping-201`, HEAD `816bcd487dce253985808c4320e164ddb3eb53f4`, clean before this follow-on. The pre-edit source fingerprints below match the approved plan's inspected files.

## Goal

Move access to the existing Controls editor to the lobby so players can choose
their controls before creating or joining a match. Keep the existing match
start behavior immediate. The first live input after configuration must use
the already-applied mapping. Configuration is optional; the Original profile
continues to work without opening the editor.

This is a follow-on to the completed issue #201 M1–M3 mapping, editor, Gamepad,
and profile work. It changes ownership and entry location only; it does not
rebuild the action registry, mapping validation, profiles, or editor.

## Approved choices and authority

- **A — direct links:** Yes. Reuse the existing editor on the existing deep-link
  pre-join screen, before Play. Do not add a route or change route resolution,
  Play semantics, or entry timing.
- **B — embedded `ConsoleRuntime`:** Yes. Keep editor access in the embedding
  host shell, outside the production active-match sidebar. Do not remove the
  embedding's current editing capability.
- The user approved the spec amendment and this plan/task sequence. Do not
  re-ask these settled choices or invent an additional person-specific gate.
  Existing repository verification, review, and publication rules continue to
  apply independently.

## Scope and design

### Runtime owner foundation — this bounded phase

1. Reuse the production `ControlMappingSession` created before
   `RouterProvider`; keep it alive across the lobby, route handoffs, and
   rematches. Each demo runtime, direct-match test runtime, isolated App
   fallback, and `ConsoleRuntime` embedding instance has its own mapping and
   Gamepad input owner.
2. Make the existing `GamepadController` the single per-runtime Gamepad owner.
   It may poll and capture without an attached `ConsoleStore`. Dispatch must be
   impossible until a store is explicitly attached; when attached, actions use
   the existing semantic translator, guards, preflight, and order bridge.
3. The App attaches its current store to the runtime owner and detaches that
   exact store on teardown. Do not construct another poller in App. Keep the
   owner above production route changes; do not reset or recreate the applied
   mapping on mount, unmount, React StrictMode effect replay, or a lazy match
   handshake.
4. Capture start/end, store attach/detach, map replacement, blur, hidden page,
   disconnect/reconnect, and disposal flush held, repeat, and aim state. Inputs
   already held at a boundary stay suppressed until neutral; capture cannot
   turn into a live order after closing or attaching the match store.
5. Preserve the current per-binding rising edges, selection repeat timing,
   logical-key behavior, wire orders, Original/MMO-WASD/Custom profiles,
   multiple aliases, Original-on-reload behavior, spectator/offline/modal
   guards, and keyboard/pointer App ownership.

### Entry surfaces — completed bounded UI implementation phase (final acceptance recorded)

- Host the existing editor, mapping session, capture handler, open state, and
  focus-return behavior in the persistent production lobby shell. Add the
  design-system “Configure controls…” entry on `/lobby` before Create/Join and
  public-match actions. Remove the production active-match sidebar launcher
  while retaining Help, Surrender/modal exclusivity, targeting, and input guards.
- Offer the same editor on the current deep-link pre-join screen before Play.
  Route shapes, authoritative eligibility checks, and immediate entry behavior
  stay unchanged.
- Keep an editor launcher in the `ConsoleRuntime` embedding host shell, outside
  the production match sidebar. Reuse the runtime's same owner; do not add a
  public API unless exact-diff contract review demonstrates it is required.
- Preserve design-system components, keyboard-only operation, focus
  containment/restoration, live announcements/errors, safe capture, staged
  edits, Primary/Secondary/additional bindings, and atomic Apply/Cancel/Reset.
- Update `docs/manual/src/pages/controls.mdx` and `lobby.mdx` in the UI phase
  under spec 007 FR-012. Do not claim hardware validation without physical
  standard-controller smoke evidence.

## Acceptance criteria

### Foundation phase

1. At most one Gamepad poller exists per runtime, and the production session and
   owner are created before the router. The same owner is attached to the match
   store rather than replaced when App mounts.
2. Storeless Gamepad capture can report a supported binding and cannot dispatch
   a gameplay action. Storeless input outside capture cannot dispatch either.
3. Inputs held during capture, at store attachment/detachment, or across
   mapping/focus/visibility/disconnect/disposal boundaries do not dispatch
   until released. A subsequent fresh input uses the unchanged applied mapping
   through the existing semantic translator.
4. StrictMode setup/cleanup leaves one live polling loop and one listener set;
   it neither loses the mapping nor leaks frames/listeners. Embedded runtimes
   retain independent owners and mappings.
5. Default keyboard/pointer/Gamepad behavior, semantic action IDs, existing
   order translation, and wire payloads remain unchanged. Unsupported Gamepad
   APIs do not disable keyboard or pointer controls.

### UI implementation — complete; final acceptance reconciled

6. The lobby editor is optional and available before create/join/public match;
   the production active-match sidebar no longer owns its launcher.
7. The same editor is available before Play on the existing deep-link screen,
   and `ConsoleRuntime` embeds preserve a host-shell launcher.
8. Create/Join/Play still enters immediately under current matchmaking behavior.
   The first live custom input acts as configured; the replaced binding no
   longer does; existing wire payloads are unchanged.
9. Mappings survive same-runtime lobby/match navigation and rematches, reset to
   Original on reload, and remain isolated across tabs and embeddings.
10. Controls/lobby manual claims, accessibility, input guards, help/surrender
    exclusivity, spectator safety, and two-player end-to-end evidence match the
    shipped UI. No physical hardware claim is made without hardware smoke.

## Invariants and explicit non-goals

- Keep 155,648 bytes (152 KiB) as the advisory browser-payload reference. Count
  every shipped JS/CSS asset; at/above target, report the exact total/excess
  and continue to the required host smoke. Do not exclude assets or soften
  build, URL-scan/tooling, asset, or host-smoke failures, and do not change the
  numeric target.
- No engine, server, network, match-lifecycle, protocol, identity, or route-shape
  changes; no storage/accounts, raw-device wire data, new actions, controller-
  only aiming, analog camera, controller presets, or broad refactor.
- Do not add a countdown, configuration gate, wait phase, or delay to game
  entry. Do not modify `europa-source/`.
- Preserve `InputMapping` compatibility, per-binding edge/repeat semantics,
  legacy logical-key behavior, multiple aliases, profiles, reload reset,
  route/rematch memory, embedding isolation, and all existing guards.
- No commit, push, PR-body/comment change, ready/merge, hook/auth/signing/global
  config/firewall mutation, or live installation/synchronization is authorized
  by this phase.

## Verification strategy and final evidence

The owner foundation's focused results and initial 156,282-byte strict Q-P03
failure, plus the UI checkpoint's 156,654-byte strict failure and skipped
HTTP/WS smoke, remain historical phase evidence in the task record. The approved
spec 005 v1.23 policy keeps 155,648 bytes unchanged as an advisory reference.
Final acceptance measured 156,686 bytes (+1,038), warned, and completed the
HTTP/WS smoke. Corrected `pnpm verify` passed all 13 phases; Playwright passed
62/62, and independent read-only reviews found no issues. The final acceptance
execution record, exact manifest/log paths, targeted check counts, environment
setup failure and correction, and limitations are in
[`issue-201-lobby-controls-tasks.md`](issue-201-lobby-controls-tasks.md).

Separate rematch-specific E2E and physical Gamepad hardware smoke were not
performed; runtime/store-handoff evidence exists, but neither is represented as
a performed E2E/hardware check. The earlier strict-budget failures and initial
Phase 5b environment setup failure remain historical, not source-failure claims.
Builds and verification may write ignored outputs; the self-host smoke's
temporary host is terminated by its cleanup trap. This documentation-only
reconciliation does not rerun implementation or the full suite.

## Source freshness and initial inspection

Before editing, this phase confirmed the clean baseline at HEAD
`816bcd487dce253985808c4320e164ddb3eb53f4` and verified these SHA-256 values
against the approved plan's prior inspected-file evidence:

| Path | SHA-256 |
|---|---|
| `packages/console/src/main.tsx` | `96adcf7f5641de5529ffd414cefb37590b66011259082424a808baf28f85e72c` |
| `packages/console/src/input/control-mapping-context.tsx` | `3af67a3e81b2ad54b1b7f14255940595d145bfe1970ab92857dd6b055714bcbd` |
| `packages/console/src/input/gamepad-controller.ts` | `1e9dcfa85dafd61294c12e053e3ecc68e7f21495fcd5ca9456749d15eb9b08d1` |
| `packages/console/src/ui/controls-overlay.tsx` | `a2e1f32ffdf941f9fefce128d9a10a783798d02eaea1458627d5ca63245a0341` |

The root `AGENTS.md`, `.specify/memory/constitution.md`,
`CONTRIBUTING.md`, spec 005, spec 013, and spec 005's `contracts/input-mapping.md`
govern this work. The original `issue-201-plan.md` and `issue-201-tasks.md`
remain the completed M1–M3 record and are not replaced.

---

Generated-By: algo-enforcers (model: azure/gpt-6-luna)
