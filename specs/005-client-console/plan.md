# Implementation Plan: Console review cleanup — issues #153 + #127 (spec 005 **v1.12**, spec 010 **v1.15**)

**Branch**: `fix/console-review-cleanup` (base `main` tip `c184d54`) | **Date**: 2026-10-12
**Specs**: [`specs/005-client-console/spec.md`](./spec.md) v1.12 (approved — Gates 1–3 PASS) · `specs/010-public-lobby-match-browser/spec.md` v1.15 (approved — Gates 1–3 PASS; renumbered from v1.14 on merge)
**Phase**: 4 (Plan) complete, approved at Gate 2; `tasks.md` produced at Phase 5 and approved at Gate 3; Phase 6 implementation shipped. This document is the approved plan of record.

**Superseded content**: this file previously held the original console plan plus the issue #76 amendment and the v1.10 "Active camera policy". The full superseded copy is recoverable from git history:

```bash
git show c184d54:specs/005-client-console/plan.md
```

Nothing in that document is re-decided here; the v1.10 camera policy remains normative via spec FR-017/FR-019/FR-027 and `data-model.md` §4, which this plan does not amend.

---

## 1. Scope

Two P1 review issues, both console-only:

| Issue | Findings | Spec surface |
|---|---|---|
| **#153** — seat-token hand-off, roster ordering, state purity/perf | `F-CON-ST-001` … `F-CON-ST-010` (evidence C-026/C-027/C-057) | spec 005 FR-045, FR-046(a)(b)(c), FR-047; spec 010 v1.15 (`023-FR-007` clarification + seat-token guard); `data-model.md` §4 (unchanged) |
| **#127** — accessibility focus + HUD/lobby UI state | `F-CON-RD-003/006/012/014`, `F-CON-UI-002/003/004/005/007/009/010` (evidence C-029/C-059/C-060) | spec 005 FR-009 (amended), FR-039(a)–(d), FR-040, FR-041, FR-042, FR-043, FR-044 |

Out of scope by construction: matchmaking server code (already compliant via `buildSortedRosterEntries`), spec 006 (PR-2's), `europa-source/`, `docs/manual/` (verdict below), `CONSOLE_API_VERSION` (see §9).

### PM rulings carried into this plan (binding)

**From the Phase-4 dispatch:**

1. **Base on `main`, resolve conflicts at rebase.** PR #189 (`security-sweep`) is **not** merged into this branch. Per-file conflict rules are in §8.
2. **FR-042 precedence**: later-opened modal closes the others; **game-over is terminal and never preempted**; exactly one `aria-modal` surface at a time. This resolves the Help `aria-modal` vs `018-FR-009` ("non-modal") tension in favour of a single modal at a time.
3. **FR-043 scope: every raw `<button>` element in `packages/console`** — see the census correction in §6 (the "27" figure counts 4 JSDoc mentions; **23 elements** are the real scope). **This ruling also mandates the static `no-raw-buttons` guard**: test N18 is **required**, not optional (§7.4, §12.5).
4. **F-CON-ST-009: delete** the never-dispatched `lobbyRosterDelta` path and the write-only `roster.revision`; the ~5 test blocks covering them go with it (§7.2).
5. **Order bar: implement roving tabindex** (FR-039(d)); **exactly two** existing a11y tests change, each as an inversion to the new contract (§7.3 — that census is authoritative).
6. **ST-004 split**: the map-view rebuild remainder is **deferred** (§10). The **wire half** of the heartbeat AC is already met on `main` and is a regression guard; the **`reduce()`-level** same-reference guarantee is **new in v1.12 and in scope in W2** (§3 ST-004, §5.2).
7. **No shared modal shell** (I-18) — FR-042 is single-value state only. **No `CONSOLE_API_VERSION` bump. No `docs/manual/` changes.**
8. **Comment budget**: net ≤ 0 discretionary source comments in `packages/`; **exactly six** exempt sites (§11).

**Gate 1 + Gate 2 resolutions (binding, 2026-10-12). These replace the Phase-4 draft's open-question list — §13 now records only that no open question remains, and nothing in this plan awaits a decision:**

- **FR-039(b) semantics** (draft Q1): focus continues **in the direction of travel**, one cell at a time, to the first rendered cell; at the board edge with none in that direction it does not move. Spec FR-039(b) was amended **in place** to say exactly that (§5.7 implements it).
- **FR-045 scope** (draft M1): the same-reference requirement covers the **heartbeat/pong echo only** — issue #153's AC is literally "A heartbeat no-op returns the same state reference". Other no-op arms keep allocating (`socketClosed` while `status === 'game_over'`, `reducer.ts:630-632`, is a named example), and the pong short-circuit defers `reduce`'s lazy feedback prune to the next state-changing dispatch. FR-045, `data-model.md` §7/§17 and the contract doc all say so.
- **Heartbeat disposition** (draft H1): wire half already fixed on `main` (`envelope-to-event.ts:109-111`, `ws-lobby-client.ts:1007-1008`); **no production path dispatches `pong`**, so the guarantee that did not hold is the `reduce()`-level one, which is new in v1.12 (W2). Spec bullet, `data-model.md` §17, §3 and the contract doc agree.
- **Design enabler approved** (draft Q2): `EuropaButtonProps` + `RefAttributes<HTMLButtonElement>` (`packages/design/src/components/generic/button.tsx:30`) is in scope; the rejected-fallback branch is removed from §5.10.2.
- **No spec-012 companion note** (draft Q3): PR-3's spec surface is exactly spec 005 v1.12 + spec 010 v1.15; the `ref` addition is an implementation-level change (§6).
- **Census = 23 elements** (draft Q4): confirmed — §6 stands.
- **Static guard required** (draft Q6): confirmed — see ruling 3.
- **Two tab-walk tests, not three** (draft Q5): confirmed — §7.3's census stands.
- **Spectator handoff mechanism** (draft Q7): the §5.5 #3 approach (suppress LobbyRoot's bootstrap leg while the canonical spectate navigation is pending) is approved as written; no alternative mechanism.

---

## 2. Constitution check

| Principle | Verdict | Evidence |
|---|---|---|
| I — TypeScript strict, no `any`, no suppressions | ✅ | All changes are typed refactors; the only type-level addition is `ReduceOptions.correlation?` (§5.2). Zero suppressions. |
| II — Server-authoritative deterministic simulation | ✅ | Console stays a leaf consumer. The only new algorithm is a **deterministic UTF-16 comparator** (`compareUtf16` on case-folded handles — `localeCompare` is forbidden), mirroring the server's `buildSortedRosterEntries` (`packages/matchmaking/src/internal/lobbyService.ts:531-537`). |
| III — ≥80% coverage on game logic | ✅ | Every new branch lands in a coverage-included path (`vitest.config.ts` include list; merged session `vitest.config.coverage.ts:24-52`, thresholds 80/80/80/80). New tests named per branch in §7. |
| IV — Specs as documentation | ✅ | Behaviour changes ship with the v1.12 / v1.15 spec drafts in the same change set. |
| V — Simplicity over cleverness | ✅ | No shared modal shell, no new library, no shared route *framework* — one prop-driven shell (§5.6). |
| VI — Accessibility-minded UI | ✅ | FR-039(a)–(d), FR-009 focus restore, FR-041 spectator help, FR-044 `<bdi>`. |
| VII — Self-hostable | ✅ | No new dependency; `@europa/design` and `@europa/engine` are already workspace deps of `packages/console`. |

---

## 3. Finding-by-finding disposition (all anchors re-verified this session against `c184d54`)

### Issue #153

| Finding | Disposition | Verified evidence | FR / wave |
|---|---|---|---|
| **ST-001** roster re-sort after delta | **OPEN** | Client merge is transport-side: `packages/console/src/net/ws-lobby-client.ts:1214-1240` (`applyRosterDelta` at `:1214`, appends unseen entries in arrival order via `next.push(change)` at `:1231`, `rosterEntries = next` at `:1234`) — **no `sort()` anywhere in `src/`** (verified: `grep -rn "sort(" src/ui/lobby-roster-card.tsx src/state/lobby-reducer.ts src/net/ws-lobby-client.ts` → no matches). Server snapshots ARE sorted: `lobbyService.ts:531` (`buildSortedRosterEntries`), `:536` (`compareUtf16(a.handle.toLowerCase(), b.handle.toLowerCase())`), `:549` (sorted snapshots). Store-side reducer case `lobby-reducer.ts:289-308` is dead (see ST-009). Downstream flow: transport `onRoster` → `lobby-controller.ts:242-246` dispatches `lobbyRosterSnapshot` → card renders array order (`lobby-roster-card.tsx:202`). | spec 010 v1.15 / **W1** |
| **ST-002** create-flow seat token | **ALREADY FIXED ON MAIN — pin as regression guard** | Fixed by #159 (`1ac83dd`): `packages/console/src/state/lobby-controller.ts:326` `runSeatCommand`, `:338` `transport.lastSeatSessionToken()`, `:349` dispatches `lobbyEnteredMatch` **with** the token, `:394` create path passes `null` matchId. **Guarding test**: `tests/unit/state/lobby-controller.test.ts:486-503` ("create success records the creator seat token so its leg claims its OWN seat"; assertions `:494-502`), companion `:505-514` (no-token case). Not re-implemented. | spec 005 FR-046(a) |
| **ST-003** module-scope correlation state | **OPEN (reducer/store half)**; transport half owned by PR #189 | `packages/console/src/state/reducer.ts:63` (`let lastActionId = 0`), `:74` (`const pendingOrders = new Map`), `:77` (`PENDING_ORDERS_CAP`), `:83-96` (`stampOrder`), `:101-105` (`takePendingOrder`), `:121-124` (`allocateActionId`). Consumers: `src/runtime.ts:54` (import), `:326` (host-order allocation). **Not public**: JSDoc `reducer.ts:81` "Module-internal; not part of the public surface"; `allocateActionId` is absent from `src/index.ts` (barrel exports at `:51` are `appendFeedback, appendRejection, INITIAL_CONSOLE_STATE, reduce`). Transport half (`ws-lobby-client.ts:390,849,1035,1403` `lastCapturedSeatSessionToken`) is specified by PR #189's v1.11 FR-033 — **do not duplicate**. | FR-045 / **W2** |
| **ST-004** per-dispatch rebuilds / heartbeat | **SPLIT (ruling 6): wire half fixed on `main` → guard; `reduce()`-level half OPEN; map-view churn deferred** | **No production path dispatches `pong`**: `src/net/envelope-to-event.ts:109-111` returns `null`, `src/net/ws-lobby-client.ts:1007-1008` returns bare, and `kind: 'pong'` occurs only in the type (`contracts/console-state.ts:145`), the reducer's exhaustiveness union/discriminant set and its `case` (`reducer.ts:234-245, 248-260, 604`) and the fixture (`tests/unit/state/reducer.test.ts:399`). The wire half is guarded by `tests/unit/net/net.test.ts:92-101`. **What does not hold is the `reduce()`-level guarantee**: `reduce()` at `reducer.ts:294-310` always allocates (`baseState` `:294-297`, `nextState` `:304-307`), so `reduce(state, pong, …)` returns a *new* reference today even though the `pong` arm (`:604-606`) returns its input unchanged — W2 adds the short-circuit FR-045 requires. Map-view churn (`render/App.tsx:301-317`) is **deferred** (ruling 6). | FR-045 / **W2** |
| **ST-005** `ZoomPanController.attach` non-idempotent | **OPEN** | `src/qol/zoom.ts:223` shared `private readonly listeners`, `attach()` `:238-324` has no re-entry guard, pushes listeners at `:311-314`, disposer `:315-323` clears the array (`:320`). Second attach double-registers `wheel` (`:309`) and `pointerdown` (`:310`) → one notch = two zoom steps. Sole caller attaches once per effect (`render/App.tsx:444`), so the risk is latent. | FR-047 / **W3** |
| **ST-006** pan clamp | **ALREADY FIXED ON MAIN — pin as regression guard** | Fixed by #184 (`c184d54`): `src/qol/zoom.ts:122-135` (`clampCamera`; `maxX = max(0, width/2 − 0.5) * zoom` at `:125-126`, pan clamp at `:131-132`) = corner-cell-centre reachability. Requirement already normative: `specs/005-client-console/data-model.md:264-266` ("Pan is constrained by corner-center reachability, not by a full-board-only clamp"). **Guarding tests**: `tests/unit/qol/zoom.test.ts:93` ("pan is clamped to corner-center reachability"), `:100`; `tests/unit/qol/zoom-math.test.ts:29-38` (`describe('clampCamera')`), `:94` (all four corner-cell centres), `:111` (fitting and overflowing axes). No spec text change. | `data-model.md` §4 (unchanged) |
| **ST-007** adaptive route swallows boot failure | **OPEN** | `src/internal/match-adaptive-route.tsx:93` `onRouteFailure={() => {}}` (a literal no-op; the `MatchLegHost` block is `:72-103`). The failure *is* emitted by the legs: `lobby-runtime.tsx:643` (`if (generation === bootGeneration) args.onRouteFailure()`) and `:998` (spectator leg). Join/spectate instead navigate silently: `match-join-route.tsx:76-78`, `match-spectate-route.tsx:76-78`. The correct surface already exists: LobbyRoot sets `setNoticeKind('shortcut-failure')` (`lobby-runtime.tsx:524`) → `RouteNotice` rendered at `:466-490` (retry epoch pattern at `:467-474`); `RouteNotice` props (`src/ui/route-notice.tsx:8-21`) provide `kind/title/message/onRetry?/onReturnToLobby/focusKey`, and the rendered panel takes `tabIndex={-1}` + `role="alert"` (`:51-52`) and focuses itself on change (`:42-44`). | FR-046(c); spec 010 FR-018 (`specs/010-public-lobby-match-browser/spec.md:151`), FR-033 (`…/spec.md:166`) / **W4** |
| **ST-008** lobby-initiated spectator builds the leg twice | **OPEN** | Sequence: command flips `viewMode` → LobbyRoot renders `MatchLegHost` (`lobby-runtime.tsx:493-530`, `onRouteFailure` at `:524`) → `SpectatorMatchLeg` builds a leg in render phase (`:1047-1050`) and boots it (`:1052-1057`) → the pending-navigation effect (`:413-437`) navigates to `/match/<id>/spectate` → the route remounts `MatchLegHost` (keyed `:511`) and builds a **second** leg; the first is disposed mid-boot by `:1054-1056`. Create/join usually show plates first (player leg is gated on `matchStarted`, `:777`), so spectate is the visible case. | FR-046(b) / **W4** |
| **ST-009** dead `lobbyRosterDelta` + `roster.revision` | **OPEN — DELETE (ruling 4)** | Never dispatched in `src/` (`grep -rn "lobbyRosterDelta" src/` → only `state/lobby-state.ts:375` type + `state/lobby-reducer.ts:289` case). `roster.revision` declared at `lobby-state.ts:168`, written at `lobby-reducer.ts:284` and `:304`, **never read** (`grep -rn "\.revision" src/` returns only writes + unrelated `ws-lobby-client` revisions); real revision gating lives upstream at `ws-lobby-client.ts:1191-1198, 1216-1223`. | no new FR / **W1** |
| **ST-010** three near-identical match-route components | **OPEN (refactor)** | `match-adaptive-route.tsx` (111 L), `match-join-route.tsx` (94 L), `match-spectate-route.tsx` (94 L): identical `MatchLegHost` prop blocks (join/spectate `:54-88`, adaptive `:72-103`) differing only in `matchRole`, `displayName` fallback (`'Player'` vs `'Spectator'`), and `onRouteFailure`. | FR-046(b)(c) / **W4** |

### Issue #127

| Finding | Disposition | Verified evidence | FR / wave |
|---|---|---|---|
| **RD-003** roving focus rests on fog cell | **OPEN** | `src/render/grid-overlay.tsx:155` sets `aria-activedescendant={focusedCoord === null ? undefined : cellElementId(focusedCoord)}` with **no visibility check**; fog cells emit no node (`:7` "Cells outside the visibility horizon emit no node at all"), rows built only from `mapView.cells` (`:109`). `src/a11y/keyboard.ts:58-66` `moveFocus` clamps to board bounds only; initial focus is the board centre (`:72-74`), which can be fog. `focusedCoord` state lives in `grid-overlay.tsx:86`, `moveRovingFocus` at `:102-105`, blur clears at `:167`. | FR-039(b) / **W5** |
| **RD-006** surrender focus not restored | **OPEN** | `src/render/SurrenderModal.tsx:51-56` focuses Cancel on open; **nothing restores on close** (`App.tsx:679-690` just flips `surrenderOpen`). Header comment `SurrenderModal.tsx:21-25` claims focus "returns to the previously-focused element on close (caller's responsibility…)" — **no caller does** (verified: `grep setSurrenderOpen` → only `App.tsx:485,648,683,686`). No test asserts restore; `tests/a11y/wcag-assertions.test.ts:536-565` asserts the trap only. Contrast: Help already restores (`App.tsx:713-716` → `helpButtonRef.current?.focus()`). | FR-009 (amended) / **W5** |
| **RD-014** skip link does not move focus | **OPEN** | Skip links: `render/App.tsx:556`, `internal/lobby-runtime.tsx:792`, `ui/lobby-landing.tsx:179` — all `href="#main"`. **Ten** `<main>` elements exist, **none** with `tabIndex`: `main.tsx:205`, `render/App.tsx:567`, `internal/lobby-runtime.tsx:179`, `:847`, `internal/match-layout.tsx:277`, `routing/match-validation.tsx:121`, `ui/route-notice.tsx:47`, `ui/deep-link-interstitial.tsx:103`, `ui/lobby-landing.tsx:200` (nine carry `id="main"`), plus `ui/welcome-screen.tsx:53` (no id, no skip link). `tabIndex` census: the only `tabIndex={0}` sites are `grid-overlay.tsx:148` and `order-bar.tsx:83`. | FR-039(a) / **W5** |
| **UI-002** live region fires on first snapshot | **OPEN** | `ui/lobby-roster-card.tsx:99` `prevHandlesRef = useRef<ReadonlySet<string>>(new Set<string>())` starts empty; effect `:133-162` treats every first-snapshot handle as joined (`:141-157` → `"… joined the lobby."` at `:157`) and the empty-prior baseline can fire a leave (`:158-160`). | FR-040 / **W6** |
| **UI-003** help unavailable to spectators | **OPEN** | Overlay gated on `store !== undefined`: `render/App.tsx:709-732` (spectators have no store, FR-021). Help button is *not* gated on `interactive`: `ui/sidebar.tsx:300-308` `disabled={!inputEnabled}` only, whereas zoom/surrender use `disabled={!interactive || …}` (`:253,262,271,288`); `interactive={store !== undefined}` is passed at `App.tsx:654`. A live spectator therefore gets an **enabled-but-inert** Help control. | FR-041 (+ `018-FR-001`, carried at `spec.md:437`) / **W6** |
| **UI-004** dangling `aria-describedby` | **OPEN** | `ui/profile-view.tsx:85` `const statusId = useId()`; referenced at `:228` and `:290` (`… : statusId`); `grep -n "id={statusId}"` → **no match** in the file (`errorId` is attached at `:233`, `:294`). | FR-039(c) / **W5** |
| **UI-005** order-bar keyboard contract | **RULING 5: implement roving tabindex** | Arrow/Home/End roving exists (`ui/order-bar.tsx:51-80`) but the group is **three** Tab stops: section `tabIndex={0}` at `:83` plus both buttons (implicit 0) at `:94`, `:106`. Header comment `:11` claims "the container is one Tab stop" — false today. | FR-039(d) / **W8** |
| **UI-007 / RD-012** raw buttons | **OPEN — all sites (ruling 3)** | Census in §6. `EuropaButton` already used in `lobby-match-list`, `lobby-create-form`, `profile-view` and one sidebar site (`ui/sidebar.tsx:168-177`). | FR-043 / **W8** |
| **UI-009** handles not in `<bdi>` | **OPEN (2 sites)** | Wrapped: `ui/participants.tsx:72`, `ui/lobby-roster-card.tsx:237`, `ui/profile-view.tsx:254`, `internal/lobby-runtime.tsx:1120`, `ui/deep-link-interstitial.tsx:118`. **Not wrapped**: lobby identity name `ui/lobby-landing.tsx:276-278`; game-over winner title `render/GameOverModal.tsx:66` (`resultTitle` win branch) rendered at `:130-132`. | FR-044 / **W7** |
| **UI-010** modal state can stack | **OPEN — ruling 2** | Three independent states: `surrenderOpen` (`App.tsx:482`), `helpOpen` (`App.tsx:495`), game-over derived (`App.tsx:697-706`). Three `aria-modal="true"` surfaces: `SurrenderModal.tsx:93`, `GameOverModal.tsx:124`, Help via `EuropaModal` (`ui/help-overlay.tsx:5-11`, imported `:27`). Any two can mount together today. | FR-042 / **W6** |

---

## 4. Architecture overview

```
 W1 roster order ─┐
 W2 state purity ─┤
 W3 zoom idempotence ─┤         all console-internal; no wire,
 W4 handoff integrity ─┼──►     engine, or routing-contract change
 W5 focus/ARIA      ─┤
 W6 lobby/help/modal ─┤
 W7 <bdi>           ─┤
 W8 buttons + roving tabindex ─┘
```

Data-flow invariants preserved: server-authoritative `PlayerView` → reducer → store → React; the console never simulates. W1 changes only the **ordering of a transport-local array**; W2 changes only **where mutable correlation state lives**; W4 changes only **which component owns a single match-leg boot**.

---

## 5. Technical decisions

### 5.1 W1 — roster order after a delta (FR: spec 010 v1.15 `023-FR-007`)

**Decision**: sort inside `applyRosterDelta` (`ws-lobby-client.ts:1214-1240`) immediately before `rosterEntries = next` (`:1234`), with `compareUtf16` imported from `@europa/engine` (`packages/engine/src/index.ts:114`, impl `packages/engine/src/playerRegistry.ts:81`) applied to `a.handle.toLowerCase()` / `b.handle.toLowerCase()` — byte-identical to the server comparator at `lobbyService.ts:536`.

- `localeCompare` is forbidden (constitution II + the concurrent v1.13 comparator ruling).
- The **snapshot** path (`applyRosterSnapshot`, `:1189-1206`) keeps adopting the server's order as-is: `023-FR-007` binds the server there, and the v1.15 clarification binds the console's *merge*.
- The store-level merge is **deleted** (§5.3), so the transport is the single fix point; `lobby-controller.ts:242-246` then forwards an already-ordered array.
- Result: `['Z']` + delta `A` → `['A','Z']`; `['Z']` + delta `a` → `['a','Z']` (case-folded).
- The pre-existing comment at `ws-lobby-client.ts:178` ("Current roster entries in deterministic order") becomes **true**; no comment edit needed (§11, exempt item 5).

### 5.2 W2 — reducer purity / store-scoped correlation (FR-045)

**Decision: per-store correlation bag passed through `ReduceOptions`.**

`ReduceOptions` (`packages/console/src/contracts/console-state.ts:216-225`) gains:

```ts
/** Per-store pending-order correlation + ActionId counter (spec 005 FR-045). */
readonly correlation?: ReducerCorrelation;
```

where `ReducerCorrelation` is a small mutable record `{ lastActionId: number; pendingOrders: Map<ActionId, Order> }` created by `createConsoleStore` (`src/state/store.ts:52`) and threaded into every `reduce(...)` call the store makes (`store.ts:62-71`, `reduce` at `:67`).

- `stampOrder` (`reducer.ts:83-96`), `takePendingOrder` (`:101-105`) and `allocateActionId` (`:121-124`) stop reading module scope; they read the bag from `options`.
- Module-level `lastActionId` (`:63`), `pendingOrders` (`:74`) and their doc comments (`:57-77`) are **deleted** (§11 exempt item 1).
- `runtime.ts:54,326` obtains the allocator from the store instead of the module import.
- **No-op short-circuit, scoped to the heartbeat echo**: for `pong` only, `reduce()` returns `{ state, effects: [] }` *before* building `baseState`. Without it `reducer.ts:294-310` always allocates two new objects, so `reduce(state, pong, …)` returns a new reference today and FR-045's clause would be unmet (verified this session). **Scope is deliberate (PM ruling, §1)**: issue #153's AC is literally "A heartbeat no-op returns the same state reference", so no other arm is short-circuited — `socketClosed` while `status === 'game_over'` (`reducer.ts:630-632`) still returns a freshly built state. **Accepted consequence**: the short-circuit runs before `reduce`'s lazy feedback prune (`:292-297`), so expired feedback is pruned on the next dispatch *that changes state*, not on every dispatch (`data-model.md` §7 says so).
- Ad-hoc `reduce()` callers that need cross-call correlation (tests, hosts not using `createConsoleStore`) pass their own bag; a call without a bag gets an ephemeral one, so **zero module-scope mutable state remains**.

**Why not `ConsoleState`?** `pendingOrders` is deliberately absent from the state shape ("`ConsoleState` deliberately carries no pending-order map (fixed contractual shape)", `reducer.ts:68-69`); adding a field to the exported state type would be a public-shape change.
**Why no `CONSOLE_API_VERSION` bump?** The bump policy is scoped verbatim to "types or functions in `console-types.ts` and `console-api.ts`" (`contracts/console-types.ts:86-88`); `console-state.ts`, `state/reducer.ts`, `state/store.ts` and `state/lobby-state.ts` are outside that surface. **ADR-worthy**: the policy text arguably under-covers `contracts/console-state.ts` — recorded in §12, not changed here.

### 5.3 W1 — delete the dead roster-delta path (F-CON-ST-009, ruling 4)

Delete, as one unit:

| What | Where |
|---|---|
| Action type member | `src/state/lobby-state.ts:375` |
| Reducer case (20 lines) | `src/state/lobby-reducer.ts:289-308` (+ its comment) |
| `roster.revision` field | `src/state/lobby-state.ts:167-168` |
| `revision` writes | `src/state/lobby-reducer.ts:284` (snapshot case), `:304` (delta case) |

No behaviour is lost: `023-FR-007` ordering + revision gating already live in the transport (§5.1), and the store still adopts snapshots wholesale.

### 5.4 W3 — controller lifecycle idempotence (FR-047)

`ZoomPanController` (`src/qol/zoom.ts:218-324`): add an `attached` flag checked at the top of `attach()` (`:238`). A second `attach()` must not register listeners again — it returns the **same** disposer semantics (or a no-op disposer) so `App.tsx:444` keeps working unchanged. `dispose` must remain safe when called repeatedly: the closure at `:315-323` already clears the array (`:320`); keep that, and make it idempotent by guarding on the flag rather than assuming a populated array. Listener removal must cover exactly what was registered (`:312-313`).

Invariant to test: attach → attach → one `wheel` event → **one** `setCamera` dispatch.

### 5.5 W4 — handoff integrity (FR-046(a)(b)(c))

1. **Extract one shared `MatchRouteShell`** into a new `src/internal/match-route-shell.tsx`, exporting exactly one component with one JSDoc block (§11 JSDoc allowance #1). It takes `{ matchRole, displayNameFallback, routeFailure }` plus the props all three routes already pass, and renders the identical `MatchLegHost` block (join/spectate `:54-88`, adaptive `:72-103`). `match-adaptive-route.tsx`, `match-join-route.tsx`, `match-spectate-route.tsx` become thin wrappers that supply only their differences (`matchRole` derivation at adaptive `:68-69`, fallback `'Player'`/`'Spectator'`).
2. **Surface boot failure (FR-046(c))**: the shell owns a local `failed` state; `onRouteFailure={() => setFailed(true)}`. When `failed`, it renders `RouteNotice` (`src/ui/route-notice.tsx:31`, `kind="shortcut-failure"`, `onReturnToLobby` → `navigate({to:'/lobby'})`, `onRetry` → bump a retry epoch that remounts the leg) instead of `MatchLegHost`. This replaces the adaptive no-op (`match-adaptive-route.tsx:93`) and the silent navigations (`match-*-route.tsx:76-78`) with the recoverable path spec 010 FR-018/FR-033 already require.
   - **Nesting check**: `MatchLayout` renders bare `<Outlet />` when resolved (`src/internal/match-layout.tsx:286`) and its own `<main id="main">` only in the pending branch (`:275-283`), so `RouteNotice`'s `<main>` (`route-notice.tsx:47`) never nests. Verified.
3. **Single leg per handoff (FR-046(b))**: make the spectator handoff skip the *bootstrap* leg. Concretely: LobbyRoot's `MatchLegHost` (`lobby-runtime.tsx:493-530`) renders `SpectatorMatchLeg` only while `pendingNavigationRef.current === null` (i.e. no canonical route write is pending — the pending-navigation effect at `:413-437` already clears it at `:436`). When a spectate navigation is pending, render the pre-start plate (the `:846-858` placeholder branch) and let the route's own `MatchLegHost` be the single leg owner. This keeps every mount building exactly one leg and removes the mid-boot dispose at `:1054-1056`.
   - Guard: the existing StrictMode double-boot tests (`tests/component/routing/semantic-route-runtime.test.tsx:75`, `:103`) must stay green, extended with a connect-call count assertion.

### 5.6 W6 — modal exclusivity (FR-042, ruling 2)

Replace `surrenderOpen: boolean` (`App.tsx:482`) and `helpOpen: boolean` (`App.tsx:495`) with one App-local value:

```ts
type ActiveModal = 'surrender' | 'help' | null;
const [activeModal, setActiveModal] = useState<ActiveModal>(null);
```

- Opening surrender (`App.tsx:485`, `:648`) → `setActiveModal('surrender')`; opening help (`:503`, `:651`) → `setActiveModal('help')` (the union closes the other by construction — no shared shell, no effect choreography).
- **Game-over stays derived** (`App.tsx:697-706`) and is *not* a member of the union: it renders when `status === 'game_over' && matchResult !== null && onReturnToLobby !== undefined`, and the render tree yields to it — when terminal, `activeModal` is forced to `null` and the `?`/surrender openers become no-ops, so a terminal modal is never preempted (019-FR-005/008/011).
- Render order in `App.tsx:679-732`: game-over first, then `activeModal === 'surrender'` → `SurrenderModal`, `activeModal === 'help'` → `HelpOverlay`. Exactly one `aria-modal="true"` surface can exist at a time.
- Focus restore: surrender already has a trigger; add restore-on-close (W5). Help keeps its existing restore (`App.tsx:713-716`).

### 5.7 W5 — focus / ARIA (FR-009, FR-039(a)(b)(c))

- **FR-039(a)**: add `tabIndex={-1}` to **every** `<main>` that can be a skip-link target — at minimum the nine `id="main"` sites listed in §3 (RD-014); `welcome-screen.tsx:53` (no id, no skip link) is left alone. `tabIndex={-1}` adds no Tab stop.
- **FR-039(b)**: keep `KeyboardNavigator.moveFocus` (`src/a11y/keyboard.ts:58-66`) board-clamped and untouched (it is publicly exported via `src/index.ts:87` — no signature change). Do the snap in `grid-overlay.tsx`'s `handleKeyDown` (`:126-133`): after `moveFocus` returns `next`, if `mapView.cells` has no entry for `coordKey(next)`, continue one cell at a time **in the same direction** until a rendered cell is found or the board edge is hit; if none, keep the current coordinate (no move, no dangling id). Then `aria-activedescendant` (`:155`) can only ever name a rendered cell, and the ring class (`:190-194`) follows. The direction-of-travel semantics are the PM's ruling (§1) — spec FR-039(b) was amended in place to state them.
- **FR-039(c)**: attach the `statusId` element. `profile-view.tsx:228`/`:290` already *use* it; render the status node carrying `id={statusId}` next to the `errorId` nodes at `:233`/`:294` (the message is a `role="status"`/polite line; keep `errorId`'s `role="alert"` node as-is).
- **FR-009**: in `SurrenderModal`, capture `document.activeElement` when `open` flips true (`:51-56` already focuses Cancel) and restore it on close (Confirm, Cancel, Escape — Escape is handled at `:97`/the `handleKeyDown`). `App.tsx:679-690` stays declarative; restoration lives inside the modal so every caller inherits it. The header comment at `:21-25` is then corrected (§11, exempt item 3).

### 5.8 W6 — announcements, spectator help (FR-040, FR-041)

- **FR-040**: in `lobby-roster-card.tsx:133-162`, make the first observation a baseline: hold `prevHandlesRef` as `ReadonlySet<string> | null` (`:99`), and when it is `null`, assign `currentHandles` and `return` **before** computing joined/left — so no first-snapshot join and no empty-baseline leave fires. Subsequent diffs behave exactly as today.
- **FR-041**: render `HelpOverlay` regardless of `store` — drop the `store !== undefined` gate at `App.tsx:709` (the overlay only needs `resolvedState`, which spectators have: `tick`/`playerName`/`playerColor`/`matchStatus`/`playerCount` are all resolved-state derived, `:717-729`). Then gate the *toggle* consistently: `ui/sidebar.tsx:304` becomes `disabled={!interactive || !inputEnabled}` so it can never be enabled-but-inert, and the `?` key handler (`App.tsx:497-509`) opens the overlay for spectators too. `018-FR-009`'s non-modal promise is satisfied by exclusivity (ruling 2), not by rendering two modals.

### 5.9 W7 — `<bdi>` (FR-044)

Two additions only: `ui/lobby-landing.tsx:276-278` (identity name) and the game-over winner title (`render/GameOverModal.tsx:66` → wrap at render, `:130-132`). Everything else already wraps (§3, UI-009). Because `resultTitle` returns a plain string, wrap the *rendered* title in `<bdi>` at `:130-132` rather than changing `resultTitle`'s signature (keeps `tests/unit/render/GameOverModal.test.ts` string assertions intact — verify before choosing; see §7.4).

### 5.10 W8 — design-system buttons (FR-043) and roving tabindex (FR-039(d))

#### 5.10.1 Census correction (ruling 3)

`grep -rn "<button" packages/console/src` returns **27 hits**, but **4 are JSDoc/comment mentions**, not elements:

- comments: `src/qol/tooltip.tsx:9`, `src/qol/tooltip.tsx:136`, `src/ui/copy-link-button.tsx:20`, `src/ui/copy-link-button.tsx:110`.
- **Elements: 23, across 12 files** (matches the enumerated breakdown in the Phase-4 input exactly). No `<button>` exists outside `src/` in the package (only test fixtures/comments). Test fixtures such as `tests/component/ui/tooltip.test.tsx:62` are out of scope — FR-043 binds console *action controls*.

Plan targets all **23 elements**; the "27" number is a grep artefact, recorded as a citation correction (§1, Gate 1).

#### 5.10.2 Enabler (verified blocker)

`EuropaButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>` (`packages/design/src/components/generic/button.tsx:30`) declares **no `ref`**, and React 19 types reject `ref` on it. Reproduced this session with `tsc` against `@types/react@19.2.18`:

```
__refcheck.tsx(7,26): error TS2322: Property 'ref' does not exist on type 'IntrinsicAttributes & EuropaButtonProps'.
```

Six migration sites need a ref: `SurrenderModal.tsx:108,116`, `GameOverModal.tsx:141`, `sidebar.tsx:301`, `order-bar.tsx:96,108`. **Required enabler**: extend `EuropaButtonProps` with `RefAttributes<HTMLButtonElement>` (one line at `button.tsx:30`), which is additive and lives outside the versioned contract pair (§5.2). `EuropaButton` already spreads unknown props onto the native `<button>` (`button.tsx:60`) and renders light DOM (no shadow) — `data-*`/`aria-*`/`onClick` pass through (verified: same probe compiles clean with `data-europa-submit-handle`, `aria-pressed`, `onClick`). `tests/component/lobby-chrome.test.tsx:326` already pins "EuropaButton renders a native `<button>` (no shadow DOM)".

**Enabler approved (§1, Gate 1)**: this one-line additive change to `packages/design` is in scope — ruling 3's all-sites scope cannot be met without it, and there is no fallback branch (the six ref-needing sites are migrated like the rest).

#### 5.10.3 Migration table (all 23 sites)

Keeping each site's existing `className` on the `EuropaButton` is deliberate: console `index.css` is imported **after** `design.css` (`src/main.tsx:34-35`), so on equal specificity the existing console class still wins for every property it sets, and the variant only supplies what the old class left unset.

| # | File : line(s) | Site | Variant | Ref? | Visual risk | Verification |
|---|---|---|---|---|---|---|
| 1 | `ui/order-bar.tsx:94,106` | Exclusive / Clear | `secondary` | **yes** (roving) | **High** — also carries FR-039(d) | `wcag-assertions.test.ts:248-284`, `:321-343` (rewritten, §7.3); `e2e/lobby.spec.ts:506-508` |
| 2 | `ui/sidebar.tsx:250,259,268` | Zoom `+` / `−` / `100%` | `ghost` | no | **High** — today they carry only `europa-focus-ring`, so `.europa-button` chrome is *new* | `component/ui/sidebar.test.tsx` computed-style assertions (padding/background) + screenshot pass |
| 3 | `ui/sidebar.tsx:285` | Surrender | `secondary` | no | Medium | `component/ui/sidebar.test.tsx`; `e2e/surrender-game-over.spec.ts` |
| 4 | `ui/sidebar.tsx:300` | Help `?` | `ghost` | **yes** (`helpButtonRef`) | Medium | `component/ui/help-overlay.test.tsx`, `a11y/help-overlay.test.ts` |
| 5 | `render/SurrenderModal.tsx:106,114` | Cancel / Confirm | `secondary` / `error` | **yes** ×2 | **High** — focus trap queries `.europa-modal__button` / `--danger` (`wcag-assertions.test.ts:542-545`); keep both classNames | `wcag-assertions.test.ts:536-565` (kept green) |
| 6 | `render/GameOverModal.tsx:139` | Return to Lobby | `primary` | **yes** (`buttonRef`) | Medium — `tests/unit/render/GameOverModal.test.ts` queries by ref/class | `GameOverModal.test.ts` + `e2e/surrender-game-over.spec.ts` |
| 7 | `internal/lobby-runtime.tsx:816` | Leave match | `secondary` | no | Low (`data-europa-leave` passes through) | `component/lobby-chrome.test.tsx` |
| 8 | `ui/route-notice.tsx:66,70` | Try again / Return to lobby | `secondary` / `primary` | no | Low | `component/routing/semantic-route-runtime.test.tsx:164`, `:216` |
| 9 | `routing/match-validation.tsx:139` | Try again | `secondary` | no | Low | `a11y/semantic-route-a11y.test.tsx` |
| 10 | `ui/deep-link-interstitial.tsx:122,131,141` | Play / Spectate / Return | `primary`/`secondary`/`secondary` | no | Low (`data-europa-deep-link-*`) | `component/deep-link-interstitial.test.tsx` |
| 11 | `ui/copy-link-button.tsx:170,201` | Copy link (prominent/subtle) | `primary`/`ghost` | no | Medium — icon-only label + `aria-label` | `tests/unit/copy-link-button.test.ts` |
| 12 | `ui/reserves-panel.tsx:86` (in `DIGITS.map`) | Reserve preset digits | `ghost` | no | Medium — `aria-pressed`, size, 10× | `component/ui/reserves-panel.test.tsx` (`:97-101` Tab order) |
| 13 | `ui/lobby-landing.tsx:188,238` | Retry connection / Acknowledge | `secondary`/`primary` | no | Medium — the Retry sits inside `EuropaBanner` | `component/ui/lobby-landing.test.tsx`; `a11y/lobby-keyboard.test.tsx` |
| 14 | `render/ErrorBoundary.tsx:66` | Reload | `secondary` | no | Low | `component/render/error-boundary.test.tsx` |

**Visual-regression risk, stated plainly**: sites 2, 12, 13 and 5 can change padding/border/background because the old class did not fully specify them. There is **no screenshot baseline suite in this repo** (`grep toHaveScreenshot|toMatchSnapshot` → no matches), so verification is (a) per-surface component assertions on computed style for the properties that must not move (focus ring, disabled look), (b) existing a11y contrast tests (`wcag-assertions.test.ts:335-341`), and (c) a manual `agent-browser` screenshot pass of `/lobby`, `/match/<id>` (player), spectator, surrender dialog and game-over — images to `__screenshots__/` (gitignored), reviewed in the PR description, **not committed** — same evidence discipline as the v1.10 camera repair, recorded in the superseded plan's "Repair sequencing and evidence" section (`git show c184d54:specs/005-client-console/plan.md`).

#### 5.10.4 Roving tabindex (FR-039(d), ruling 5)

Current: section `tabIndex={0}` (`order-bar.tsx:83`) + two implicit-0 buttons (`:94`,`:106`) = 3 stops; header comment `:11` claims 1.

New contract: **the section drops `tabIndex`**; the two buttons get `tabIndex={i === activeIndex ? 0 : -1}`; Arrow/Home/End handlers (`:51-80`) move DOM focus **and** update `activeIndex`; the first enabled button is the default `activeIndex`. When `inputEnabled` flips false, both buttons are disabled (already `:101`,`:112`) and the group legitimately leaves the Tab order. Exactly one command button is in the Tab order at a time, as FR-039(d) requires; the *group* is one Tab stop.

Consequences to update in the same change set:

- `src/a11y/keyboard.ts:91-97` `TAB_ORDER` entry `{ id: 'order-bar', … focusable: true }` — adjust **entry data only** if the stop's identity changes (`label`/`focusable`); the `order-bar` *region* still has exactly one tabbable member, so the comments at `:77-79` (the regions a Tab keypress visits) and `:90` (generic) stay true and are **not edited**. §11 therefore remains exactly the six ruled sites. (`getTabbableRegions` is not called at runtime.)
- `ui/order-bar.tsx:9-23` header comment: "the container is one Tab stop" → "the palette presents as one Tab stop (exactly one command button in the Tab order)"; also the `:21-23` sentence about the region staying a stop becomes false (§11, exempt item 4).

---

## 6. FR-043 scope statement

**23 raw `<button>` elements in `packages/console/src` (12 files)** — enumerated in §5.10.3. The "27" in the ruling equals 23 elements + 4 comment mentions (`tooltip.tsx:9,136`, `copy-link-button.tsx:20,110`). Scope intent ("every raw button site") is satisfied by migrating the 23 elements; the 4 comment mentions are documentation and need no change. Test fixtures with raw buttons are out of scope (they are not console action controls). **Spec 012 needs no amendment**: no spec-012 FR enumerates component props (checked: FR-029/FR-031 list components and variants, not signatures); the design-package `ref` addition is therefore an implementation-level, additive change (confirmed, §1 — no spec-012 companion note).

---

## 7. Test plan

Coverage gates: `vitest.config.ts` (node/happy-dom — includes `src/state/**`, `src/input/**`, `src/net/**`, `src/a11y/**`, `src/qol/zoom.ts`, `src/runtime.ts`, …, thresholds 80/80/80/80) and the merged session `vitest.config.coverage.ts:24-52` (all `src/**` minus `main.tsx` and the router-bound `internal/*` files at `:26-45`). Every new branch below lands in an included path or is named as a documented exclusion.

### 7.1 Regression guards for the two already-fixed-on-main dispositions (do **not** re-implement)

| Finding | Guarding test | Verdict |
|---|---|---|
| ST-002 create-flow seat token | `tests/unit/state/lobby-controller.test.ts:486-503` (+ companion `:505-514`) | keep green; referenced by FR-046(a) |
| ST-006 pan clamp | `tests/unit/qol/zoom.test.ts:93-105`, `tests/unit/qol/zoom-math.test.ts:29-38, 89-115` | keep green; `data-model.md:264-266` is the normative text |
| ST-004 heartbeat, wire half | `tests/unit/net/net.test.ts:92-101` | keep green |

### 7.2 Tests **deleted** with F-CON-ST-009 (ruling 4) — and why they test nothing real

File: `tests/unit/state/lobby-roster-reducer.test.ts` (278 L).

| Block | Lines | Why it goes |
|---|---|---|
| `describe('lobbyRosterDelta')` → 4 `it`s | `:112-186` | They assert the merge semantics of an action that **no production code dispatches** (`grep lobbyRosterDelta src/` → type + case only). After deletion the action cannot exist, so the tests would be driving a fiction. |
| `describe('snapshot replacement after delta merge')` → 1 `it` | `:237-263` | Its premise ("a full snapshot overwrites delta-merged state") only matters if delta merge ever ran. |
| `expect(state.roster.revision).toBeNull()` ×2 | `:203`, `:218` | The field is deleted; these two `it`s stay (players/connected clearing is still real) — only the two lines go. |
| Header bullets | `:8`, `:12`, `:13` | Describe the deleted actions; trimmed with them (deletion, not a new comment — §11). |
| helper `rosterState(...)` | `:38-49` (doc + function; `revision` member at `:46`) | Drop the `revision` parameter and member from its return. |

Kept: `describe('lobbyRosterSnapshot')` `:61-110`, `describe('connection reset clears roster')` `:188-235`, `describe('purity')` `:265-278`.

### 7.3 Existing tests that **change** under FR-039(d) — each an inversion, not a weakening

| Test | Today | After | Why it is an inversion |
|---|---|---|---|
| `tests/a11y/wcag-assertions.test.ts:248-284` ("palette buttons: Tab reaches them…") | 4× Tab then `expect(document.activeElement?.id).toBe('order-bar')` (`:258-262`), then `.focus()` the button manually (`:266`) | 4× Tab lands **on the exclusive button** (`closest('#order-bar')`); the manual `.focus()` becomes redundant | The walk length is unchanged; the assertion moves from *container-is-a-stop* to *one command button is the stop* — exactly FR-039(d). The Enter/Arrow assertions (`:269-282`) are untouched. |
| `tests/a11y/wcag-assertions.test.ts:321-343` (focus-ring contrast) | `for (i<5) Tab` with comment "skip-link → map → debug-toggle → order-bar → button" (`:326-333`) | `for (i<4) Tab`, comment "… → order-bar's command button" | Same target element, one fewer stop because the container stop is gone. The computed-style assertions (`:335-341`) are untouched. |

**Census (authoritative — ruling 5): exactly two** a11y tests pin a 4–5-stop walk, the two rows above. Every other Tab-sensitive test was enumerated this session and is unaffected — all other walks are 2-stop (`:191-192`, `:233-234`, `:296-297`, `:356-357`, `:381-382`, `:402-403`, `:424-425`, `:448-449`; `tests/a11y/waiting-overlay.test.ts:100-107`; `tests/component/ui/reserves-panel.test.tsx:97-101`; `tests/a11y/lobby-keyboard.test.tsx:207-213`) or modal traps (`:553-558`).

### 7.4 New tests (one per new branch)

| # | FR / finding | Test (file + what it asserts) | Suite / coverage path |
|---|---|---|---|
| N1 | spec 010 v1.15 ordering | `tests/unit/net/ws-lobby-client.test.ts` (extend): delta `['Z']` + `A` → `['A','Z']`; `['Z']` + `a` → `['a','Z']`; stale-revision delta still discarded (`:1216-1223` unchanged) | node (`src/net/**` ✓) |
| N2 | ordering, end-to-end | `tests/integration/lobby-transport.test.ts` (extend): after a live join delta the roster card renders sorted handles | node (`src/net/**` ✓) |
| N3 | FR-045 store scope | `tests/unit/state/reducer.test.ts` (new describe): two `ReducerCorrelation` bags → independent counters and pending maps; ack correlation resolves through the **passed** bag | node (`src/state/**` ✓) |
| N4 | FR-045 same reference | `tests/unit/state/reducer.test.ts`: `expect(reduce(state, {kind:'pong',…}, {nowMs, correlation}).state).toBe(state)` — this is issue #153's AC-3 and it **fails against today's `reduce()`** (§3 ST-004) | node (`src/state/**` ✓) |
| N5 | FR-045 allocator | `tests/unit/net/client-role.test.ts:91,102` re-point at the store-supplied allocator; `tests/unit/state/reducer.test.ts:443-451` rewritten to assert per-store monotonicity + cross-store independence | node |
| N6 | FR-047 | `tests/unit/qol/zoom.test.ts` (new): `attach()` twice → one `wheel` event → exactly one `setCamera` dispatch; `dispose()` twice → no throw, listeners removed | node (`src/qol/zoom.ts` ✓) |
| N7 | FR-046(c) | `tests/component/routing/semantic-route-runtime.test.tsx` (extend, follows the existing `:164` notice pattern): a boot failure renders `RouteNotice` with a focusable "Return to lobby", not a blank frame | browser (component) |
| N8 | FR-046(b) | same file (extend `:75`/`:103` StrictMode tests): one handoff ⇒ **one** leg boot (`connectCalls === 1`) across the lobby→`/spectate` navigation | browser |
| N9 | FR-046(a) | *guard only* — no new test (§7.1) | — |
| N10 | FR-039(a) | `tests/a11y/wcag-assertions.test.ts` (new): activate the skip link ⇒ `document.activeElement` is `#main` for the match view; plus a static assertion that each rendered `main#main` reports `tabindex="-1"` in `component/ui/lobby-landing.test.tsx` and `component/routing/semantic-route-runtime.test.tsx` | browser |
| N11 | FR-039(b) | `tests/component/render/grid-overlay.test.tsx` (extend): a `MapView` with a hole at the movement target ⇒ `aria-activedescendant` stays on/lands on a **rendered** cell, ring class present; edge case (no rendered cell in that direction) ⇒ focus does not move | browser |
| N12 | FR-039(c) | `tests/a11y/profile-view.test.tsx` (extend): every `aria-describedby` token on a profile control resolves to an element in the document | browser |
| N13 | FR-009 | new `tests/component/render/modal-exclusivity.test.tsx`: render App with a trigger focused ⇒ open surrender ⇒ close (Cancel / Confirm / Escape) ⇒ focus returns to the trigger | browser |
| N14 | FR-040 | `tests/component/ui/lobby-roster-card.test.tsx` **and** `tests/a11y/lobby-roster-card.test.tsx` (extend): first snapshot ⇒ **no** "joined" announcement; second snapshot with a new handle ⇒ exactly one | browser |
| N15 | FR-041 | `tests/component/render/app-wire-view.test.tsx` (extend): spectator render (`store === undefined`) ⇒ Help button enabled ⇒ clicking/`?` mounts the overlay; and it is never enabled-but-inert | browser |
| N16 | FR-042 | new `tests/component/render/modal-exclusivity.test.tsx` (same file as N13): open help then surrender ⇒ exactly one `[aria-modal="true"]`; with `status === 'game_over'` ⇒ game-over is the only `aria-modal`, `?`/Surrender do not preempt it | browser |
| N17 | FR-043 | per-surface: extend `component/ui/sidebar.test.tsx`, `reserves-panel.test.tsx`, `copy-link-button.test.ts`, `lobby-landing.test.tsx`, `deep-link-interstitial.test.tsx`, `render/error-boundary.test.tsx`, `component/routing/semantic-route-runtime.test.tsx`, `component/lobby-chrome.test.tsx` — each asserts the migrated control is a **native `<button>`** with its original classes, `disabled`/`aria-*` intact | browser/node |
| N18 | FR-043 conformance (**required** — ruling 3, §1) | new `tests/unit/ui/no-raw-buttons.test.ts`: scan `packages/console/src/**` after stripping `/**…*/` and `//` comments; assert zero `<button` occurrences | node — static guard, regex-based |
| N19 | FR-044 | `component/ui/lobby-landing.test.tsx` (identity name wrapped) + `tests/unit/render/GameOverModal.test.ts` (winner title wrapped) | browser / node |
| N20 | FR-039(d) | the two rewritten tests in §7.3 **are** the acceptance tests, plus one new assertion: `#order-bar [tabindex="0"]` count === 1 at all times while enabled | browser |

### 7.5 Suites that must stay green unchanged

`tests/e2e/lobby.spec.ts:506-508` (`.europa-order-bar button` count/disabled — `EuropaButton` still renders a native button, so the selector holds), `tests/a11y/help-overlay.test.ts`, `tests/e2e/surrender-game-over.spec.ts`, `tests/integration/contract-conformance.test.ts` (version pins unchanged), `tests/unit/state/reducer.test.ts:394-405` (the `pong` invariant loop at `:399`).

---

## 8. Rebase / conflict rules for PR #189 (`security-sweep`) and PR #188

**Rule zero**: never merge either PR into this branch; rebase onto `main` and resolve hunk-by-hunk. Both PRs were inspected with `gh pr view/diff` this session (#189 = 81 files; #188 touches our surface only at `specs/010-…/spec.md`).

> **Resolution note (2026-10-13, both conflicts now resolved).** Two merges landed against this branch. First **PR #188** merged, so its `### v1.13` section and header hunk came onto `main`; this branch merged `main` to reconcile (published branch, so a merge rather than a rebase — rebasing would rewrite 19 pushed commits), and the §8.1 rule applied: header kept **ours (highest version)** with Status clauses unioned, tail kept the sections in numeric order. Then **PR #189** merged as **v1.14** (issue #146), colliding directly with our own draft v1.14 — resolved by renumbering **ours to v1.15**, since #189 was already on `main`. Both passes corrected the stale clauses each conflict exposed (the header's "UNAPPROVED" marker, the "three claimants" framing, and the "PR #189 is still open" prediction below). **Rule zero was honored throughout: `main` was merged, never the PR branches.**

### 8.1 Guaranteed textual conflicts

| File | Why | Resolution rule |
|---|---|---|
| `specs/005-client-console/spec.md` header (base lines 1–12) | ours → v1.12, theirs → v1.11; **same hunk range** `@@ -1,12 +1,12 @@` on both sides | Take **ours** for `Last Updated`/`Version` (**1.12 = max**) and **union the `Status` line**: keep their trailing clause `; v1.11 WebSocket-client/transport/debug-surface hardening amendment implemented (2026-10-12, security-sweep branch, issues #152/#129)` **and** our `; v1.12 review-cleanup amendment (issues #153 and #127) implemented 2026-10-12 — PR #191 open` in that order. |
| `specs/005-client-console/spec.md` tail | ours `@@ -528,4 +537,61 @@` deletes the duplicate `FR-027` bullet **and** appends `### v1.12`; theirs `@@ -529,3 +549,22 @@` keeps the bullet and appends `### v1.11` | Delete the duplicate `- **FR-027**:` line (ours); append **`### v1.11` (theirs) first, then `### v1.12` (ours)** — sections in numeric order, header carries the highest version. Do **not** renumber v1.12 → v1.11. |
| `specs/005-client-console/spec.md` middle | theirs rewrites Implementation Note 17 at base `:364-370` (the `CONSOLE_API_VERSION` bump-history correction) | **No conflict** — our draft does not touch that region. Keep theirs verbatim. |
| `specs/010-public-lobby-match-browser/spec.md` header | claimants collide on the same `Version`/`Status` hunk | Take **ours** for `Last Updated`/`Version` **only when ours is the highest**, otherwise **renumber ours to the next free number**; union every `Status` clause so no amendment is erased. This pass: #188 landed as v1.13 and #189 as v1.15, so **ours renumbered to v1.15**. |
| `specs/010-…/spec.md` tail | all change sets append at EOF, so every merge is a two-section conflict | Keep **every** clarification section in numeric order, ours last at its renumbered version. Section bodies are never truncated by either side. Final order shipped: v1.13 (#147), v1.15 (#146), v1.15 (#153). |

### 8.2 Source-file overlap (hunk-level, conceptually disjoint)

| File | #189 does | PR-3 does | Rule |
|---|---|---|---|
| `packages/console/src/net/ws-lobby-client.ts` | +156/−54 (instance-scoping `lastCapturedSeatSessionToken` `:390,849,1035,1403`, validation) | sort inside `applyRosterDelta` `:1214-1240`; keep comment `:178` | Rebase; keep both. Ours touches one function body, theirs the class-level state — if both edit `:176-179`, **keep their comment text and add no new comment** (§11 item 5). |
| `packages/console/src/internal/lobby-runtime.tsx` | +16/−97 | FR-046(b) leg-ownership change at `:413-437`, `:493-530`, `:846-858`, `:1045-1057`; `tabIndex` on `main` `:847`; leave button `:816` | Rebase; ours and theirs are in different regions except possibly the match-view branch — resolve by keeping both edits, then re-run N8. |
| `packages/console/src/main.tsx` | +29/−49 (bootstrap) | `tabIndex={-1}` on `<main>` `:205` | Trivial; keep both (one-line ours). |
| `packages/console/src/runtime.ts` | +46/−7 | allocator re-point `:54`, `:326` (W2) | Rebase; keep both. If their hunk touches `:326`, keep their change and re-apply the store-supplied allocator on the same line. |
| `packages/console/src/internal/match-layout.tsx` | +5/−3 | `tabIndex={-1}` on `<main>` `:277` | Trivial; keep both. |
| `packages/console/src/state/types.ts` | +1/−0 | possible re-export for `ReducerCorrelation` | Only if W2 exports a new type through that barrel; otherwise untouched. If it conflicts, keep both lines (they are independent re-exports). |
| `packages/console/src/net/envelope-to-event.ts` | +11/−0 | **none** (pong→null already correct) | No conflict from us. |
| `AGENTS.md` | docs-table row + `Current state` bullets | only if Phase 6 updates `Current state` | Keep both bullets; merge the `Specs` line by appending our clause rather than replacing theirs. |
| Tests touched by both | `tests/integration/lobby-transport.test.ts` (+15/−6), `tests/component/render/app-wire-view.test.tsx` (+2/−0), `tests/unit/runtime.test.ts`, `tests/integration/contract-conformance.test.ts`, `tests/e2e/{lobby,routing,shareable-links,spectator-sidebar,identity-migration}.spec.ts` | ours: N2, N15, N5, N17 | Prefer **new test files** (N13/N16/N18) to avoid collisions; where we must extend, keep both sides — #189's edits to these files are additive or small deletions in unrelated specs, so a semantic conflict is unlikely (re-run the suite after resolving). |

### 8.3 Conflict exposure by wave

The following PR-3 surfaces are **not** in #189's 81-file list (verified with `gh pr view 189 --json files`): `state/reducer.ts`, `state/store.ts`, `state/lobby-reducer.ts`, `state/lobby-state.ts`, `state/lobby-controller.ts`, `contracts/console-state.ts`, `qol/*`, `render/*` (App / SurrenderModal / GameOverModal / grid-overlay / ErrorBoundary), `ui/*` except `profile-url.ts`, `routing/match-validation.tsx`, the three `match-*-route.tsx`, `packages/design/**`, `tests/a11y/**`, `tests/unit/state/**`, `tests/unit/qol/**`.

| Wave | Overlaps a §8.2 conflict file? |
|---|---|
| W1 roster order + dead-code delete | **Yes — one**: `net/ws-lobby-client.ts` (their instance-scoping vs our `applyRosterDelta` body) |
| W2 state purity | **Yes — two, both trivial**: `runtime.ts` (`:54`, `:326`) and possibly `state/types.ts` (re-export line) |
| W3 zoom idempotence | No |
| W4 handoff integrity | **Yes — two**: `internal/lobby-runtime.tsx`, `internal/match-layout.tsx` |
| W5 focus/ARIA | **Yes — two, both one-liners**: `main.tsx:205`, `match-layout.tsx:277` |
| W6 lobby/help/modal | No |
| W7 `<bdi>` | No |
| W8 buttons + roving tabindex | **Yes — one**: `internal/lobby-runtime.tsx:816` (leave button) |

Expect **no** conflicts in W3, W6, W7; hunk-level, resolvable-by-keeping-both conflicts everywhere else.

---

## 9. Versioning, manual, docs

- **`CONSOLE_API_VERSION`: NO BUMP (ruling 7).** Independently justified: the policy is scoped to "types or functions in `console-types.ts` and `console-api.ts`" (`contracts/console-types.ts:86-88`), and none of PR-3's changes touch those two files. **One public-type narrowing is acknowledged here so the rationale is complete rather than silent**: deleting `lobbyRosterDelta` narrows `LobbyAction` and `LobbyActionKind`, which *are* barrel-exported (`src/index.ts:69-73`) — a compile-time narrowing of an exported union, but one that lives outside the documented bump surface, and the no-bump ruling (§1) stands. PR #189 bumps the version to `0.5.0` **in its own change set** (`contract-conformance.test.ts:352` currently pins `0.4.1`) — do not duplicate, do not inherit during rebase.
- **`docs/manual/`: NO CHANGE (ruling 7).** Gate check against spec 007 FR-012: every documented statement PR-3 touches is *conformed to*, not changed — roster alphabetical order (`docs/manual/src/pages/roster.mdx:27`), direction-safe labels (`reading-the-screen.mdx:40`, `lobby.mdx:66`), failure explanation (`lobby.mdx:96`), coalesced announcements (`roster.mdx:72`), skip link as first Tab stop (`lobby.mdx:100`), surrender dialog wording (`objective.mdx:41-43`, `controls.mdx:96` — focus restoration is not documented). All seven anchors re-read and confirmed this session. Conditional re-check at PR time: if scope changes to alter any of those statements, `docs/manual/` MUST be updated in the same change set.
- **Spec 010 gets no plan of its own** — its v1.15 clarifications are absorbed here (W1 + the seat-token guard).

---

## 10. Out of scope / deferred follow-ups

1. **ST-004 remainder (ruling 6)**: `render/App.tsx:301-317` rebuilds `mapView` on any `resolvedState` change. Deferred as a performance item; **no FR**. Follow-up issue should name the fix (narrow the `useMemo` deps to the fields `buildMapView` reads).
2. **Shared modal shell (I-18)** — explicitly rejected by ruling 7; FR-042 is single-value state only.
3. **Manual additions** for skip-link/spectator-Help — not gate-required, declined under ruling 7 (§1).
4. **Transport instance-scoping** — owned by PR #189 FR-029/FR-033; FR-045 cross-references rather than duplicates.
5. **Screenshot/visual-regression baselines** — none exist repo-wide; introducing one is a separate decision (§12).

---

## 11. Comment budget (hard constraint, ruling 8)

**Target: net ≤ 0 discretionary source comments in `packages/` — gross new discretionary comments: 0.**
Forbidden: issue-number comments (`#153`, `#184`, …), FR-tag comments (`FR-039`, …), changelog/version comments, narration ("now we sort the roster"). Spec/plan prose carries the "why".

**Exempt — pre-existing comments this change makes false; each is *corrected or deleted*, ≤6 sites, reported separately in the PR body:**

| # | Site | What happens |
|---|---|---|
| 1 | `src/state/reducer.ts:57-77` (module-level counter/`pendingOrders`/cap docs) | **deleted** with the module state (W2) |
| 2 | `src/state/lobby-reducer.ts:289-308` delta case + comment | **deleted** with the dead arm (W1) |
| 3 | `src/render/SurrenderModal.tsx:21-25` ("caller's responsibility") | **corrected** once restore is implemented (W5) |
| 4 | `src/ui/order-bar.tsx:9-23` ("the container is one Tab stop" + "the region itself stays [a stop]") | **corrected** to the FR-039(d) wording (W8) |
| 5 | `src/net/ws-lobby-client.ts:176-179` ("deterministic order") | **no edit** — W1 makes it true; reconcile only if #189's rewrite moved it |
| 6 | `src/internal/lobby-runtime.tsx:713-735` and `:772-775` (leg-handoff timing docs) | **corrected only if** W4 changes the described handoff timing (expected: yes for the spectator path) |

**Exempt — JSDoc for newly exported symbols: ≤2** — `MatchRouteShell` (`src/internal/match-route-shell.tsx`) and, if W2 exports it, `ReducerCorrelation`.

Also deleted (counted negative, not a violation): test-file header bullets `tests/unit/state/lobby-roster-reducer.test.ts:8,12,13`.

---

## 12. ADR-worthy items (record, don't decide here)

1. **Reducer correlation via `ReduceOptions.correlation?`** — a mutable bag in an options bag sits awkwardly with "reducer output depends only on `(state, action, options)`". Chosen because the alternatives are worse (`ConsoleState` field = public-shape change; module default = forbidden module scope). Worth a short ADR if the pattern recurs.
2. **Version-bump policy coverage gap**: `contracts/console-state.ts` (which exports `reduce`/`ConsoleState`/`ReduceOptions`) is *outside* the documented bump surface (`console-types.ts:86-88`). PR-3 benefits from that gap; it should still be closed deliberately in a future change.
3. **`EuropaButtonProps` + `RefAttributes`** — a design-package contract addition to serve a console requirement; **no spec-012 companion note** (§1): no spec-012 FR enumerates component props (§6), so this stays an implementation-level change.
4. **New coverage exclusion, only if N7/N8 prove infeasible**: `src/internal/match-route-shell.tsx` would otherwise be measured by the merged session. Preferred: test it (the existing `semantic-route-runtime.test.tsx` already mounts router-bound UI). Fallback: add it to `vitest.config.coverage.ts:25-45` beside its three sibling routes, with the same justification.
5. **Static "no raw `<button>`" test (N18) — REQUIRED by ruling 3 (§1)**: a comment-stripping regex over `src/**` is cheap but brittle; it ships in this PR and its maintenance cost is accepted. Recorded here so the brittleness is a deliberate, documented trade-off rather than an accident.

---

## 13. Open questions

**None.** Every question the Phase-4 draft raised has been answered by a binding PM ruling or a Gate 1/Gate 2 resolution; the answers are folded into §1 ("Gate 1 + Gate 2 resolutions") and reflected in the amended spec text (FR-039(b), FR-045), `data-model.md` §7/§17, `contracts/reducer-correlation.md`, and the sections cited there. The former question list is removed rather than marked closed so no stale blocker text survives for a later reader.
