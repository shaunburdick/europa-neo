# Implementation Plan: Engine fixes — serialization terrain round-trip + paratroop attack semantics (spec 001 v1.16)

**Branch**: `bug-sweep` (off `main`) | **Date**: 2026-10-11 | **Specs**: [`001`](./spec.md) v1.16 (FR-013, FR-024..FR-026, AC-16..AC-21)
**Issues**: #136 (review I-10 / T-01), #132 (review I-08 / T-14)
**Status**: APPROVED (Gate 2 PASS; findings 8a–8d folded into `tasks.md`). **Implemented** (Phase 6, 2026-10-11) — see `tasks.md` for completion state.

> This plan replaces the planner's draft `plan-fix-engine-serialization-paratroop.md` (deleted; content refined and corrected here after source verification) and supersedes the previous v1.9 (issue #50) plan, per this directory's convention that `plan.md` carries the current amendment plan (the superseded copy is preserved in git history). Gate-1 ledger findings 6 and 7 are closed in §4.

## 1. Context — verified current state

Everything below was re-verified against the working tree (branch `bug-sweep`, which tracks `main` @ c184d54) on 2026-10-11; line references are current **for the pre-implementation survey** — this is the as-found state the plan was written against. The work it describes is now implemented; `tasks.md` carries the completion record.

Issue #136 (filed 2026-09-10 against pre-#74 code): two of its three evidence items were already fixed by the issue #74 serialization rewrite (commit `1ac83dd`, spec v1.13):

| #136 item | Status on tree | Work remaining |
| --- | --- | --- |
| Hardcoded `importVersion()` `'0.1.0'` | **Fixed** — `readEngineApiVersion()` returns `ENGINE_API_VERSION` (`packages/engine/src/serialize.ts:256-262`, imported at `:99`); constant `'0.2.0'` at `packages/core/src/types.ts:43`; source scan forbidding semver literals exists (`packages/engine/tests/serialization-conformance.test.ts:65-75`); header-bump throw tests exist | Pin as FR-024 + cite AC-16 (done in spec v1.16); keep tests |
| Under-validated decode | **Fixed** — `boardSize ≥ 8` (`serialize.ts:701-704`; `MIN_BOARD_SIZE = 8` at `packages/engine/src/create.ts:41`), `playerCount` 2–4 (`:705-710`), ID-table canonical order (`:746-754`), city coords + duplicates (`:827-841`), owner bytes (`:832-836`, `:854-858`), pipe masks (`:861-865`), reserves (`:866-870`), trailing bytes (`:880-882`) — all `EngineFormatError` | Pin as FR-025 + extend matrix with `terrainFlag > 1` (AC-18) |
| No per-cell terrain round-trip | **Open** — encode writes 8-byte cell records (`serialize.ts:563-571`; `cellsBlockLen = n * 8` at `:498`) and decode fabricates an all-land, elevation-0 board (`serialize.ts:884-898`) | **This is the serialization work** (FR-026, AC-17) |

Issue #132 is fully open: `packages/engine/src/resolution/paratroop.ts:191-199` adds `N` to the target and force-assigns `newOwners[targetIdx] = playerIndex + 1` (clamped to `cellCapacity`) regardless of an enemy garrison; `tests/unit/paratroop.test.ts` and the Q-008 quickstart suite only exercise empty/neutral targets. Product decision (repo owner; do not relitigate): **landing on an enemy-held cell resolves as an attack via the shared combat model; no owner write when the garrison survives.**

## 2. Key decisions

1. **Per-cell terrain in the payload (not a renamed/scoped API).** Callers of `serializeWorld`/`deserializeWorld` today are the engine's own tests, the replay pipeline (`hashWorld`), and the feature 004 boundary contract — none holds a reattachable board out of band, and `MatchConfig` carries no terrain-generation settings (`packages/core/src/types.ts:141-161`, exactly 5 serialized fields). A state-only API would push board reattachment onto every caller (constitution V). Terrain is **not** derivable from elevation: water ties at the threshold elevation are split by sorted-index order (`packages/terrain/src/water.ts:31-42, 65-66`), so both fields are encoded. Elevation is provably a `uint8` (`createWorld` enforces `[0, 255]`, `packages/engine/src/create.ts:106-110`; `MAX_ELEVATION = 255` at `:42`). Cost: 2 bytes/cell (32×32: 8 KiB → 10 KiB payload).
2. **`SERIALIZE_FORMAT_VERSION` 1 → 2 (`serialize.ts:120`); `ENGINE_API_VERSION` stays `'0.2.0'` (`packages/core/src/types.ts:43`).** The public TypeScript surface is unchanged; the payload-layout version exists precisely for layout changes (module's own two-version boundary, `serialize.ts:10-24`). New bytes are **appended per cell record** (`elevation`, `terrainFlag` after `cityOwners`) so the existing 8 fields keep their offsets.
3. **Paratroop landing combat resolves in Phase 2 (inside `resolveParatroop`), via a shared attrition helper extracted from `resolveCombat`'s two-way path.** Deferring landings into the Phase 5 committed-flow tally was rejected: a gun (Phase 3) could destroy the garrison first, leaving committed-only troops that never materialize, and adding landed troops pre-combat would double-count them in the Phase 5 pre-flow snapshot. In-phase resolution keeps sequential same-target landings deterministic and composes with Phase 5 because the pre-flow snapshot is taken after Phase 2/3 (`packages/engine/src/tick.ts:221-226`; combat at `:234-248`).
4. **`CombatEvent` labeling for landings** — reconciled with spec v1.4 (Gate-1 finding 7, see §4): for a landing, the landing player is **both** the logical attacker (role: initiates the sequential attack) **and** the `attacker` field of the emitted event (spec.md:397). Flow combat, by contrast, separates the two concepts: combat *roles* follow "garrison owner is defender" (spec.md:204-206; `combat.ts:189-207`), while the `CombatEvent` payload's `attacker`/`defender` fields are normalized to the lower dense owner byte for payload symmetry (`combat.ts:212-214`, module doc `:36-38`).

## 3. Shared combat model — actual API (read from source)

`packages/engine/src/resolution/combat.ts:86-96`, verbatim:

```ts
export function resolveCombat(
    state: Readonly<WorldState>,
    board: Readonly<Board>,
    constants: EngineConstants,
    tickNumber: number,
    registry: PlayerRegistry,
    inflowTally?: Readonly<Uint32Array>,
    committedFlowTally?: Readonly<Uint32Array>,
    preFlowState?: Readonly<{ troopOwners: Uint8Array; troopCounts: Uint32Array }>,
    scratch?: TickScratchBuffers,
): { state: WorldState; events: TickEvents };
```

The two-way attrition core to extract (the total-force 2-way path, `combat.ts:175-253`): `damage = min(attackerTotal, defenderTotal)` (`:210`); the higher remainder wins with `min(remainder, constants.cellCapacity)` (`:228-240`, FR-011/v1.5 clamping); equal remnants → count 0, owner 0 (tie). Extraction target (new):

```ts
// packages/engine/src/resolution/attrition.ts
export function resolveTwoWayAttrition(input: {
    attackerOwner: number; attackerTotal: number;   // 1-based dense owner bytes
    defenderOwner: number; defenderTotal: number;
    cellCapacity: number;
}): { winnerOwner: number; winnerCount: number; damage: number }; // winnerOwner 0 = tie
```

The helper is roles-agnostic: callers pass their own attacker/defender identification, so the garrison-is-defender logic (flow) and landing-player-is-attacker logic (paratroop) both live at the call site while the math lives in exactly one place.

Relevant constants (single tunables location, `packages/core/src/flow-rate.ts`): `cellCapacity: 30` (`:122`), `paratroopCost: 10` (`:137`; N — source spends 2N = 20, `paratroop.ts:93-94`). Event helper: `pushCombatEvent(events, e)` at `packages/engine/src/events.ts:61`. City transfer for landed occupants is Phase 6 capture (`packages/engine/src/resolution/capture.ts:69-93`; a neutral occupant never captures `:76-78`).

## 4. Gate-1 findings closed

- **Finding 6 (DEFERRED → closed)**: FR-013 (spec.md:127) now states, in one sentence, that a landing which fails to eliminate the garrison is still a successfully executed order and appears in `TickEvents.appliedOrders` (FR-023); only validation rejections appear in `errors`. This matches the existing code path — `tick.ts:214-219` emits staged orders into `appliedOrders` unless their deferred resolution rejected them, and `resolveParatroop` pushes every order that reaches the apply step into `successfulOrderIndices` (`paratroop.ts:200`) regardless of combat outcome. data-model §11 carries the matching row. Test: **P-7** in §7 asserts a losing enemy landing appears in `appliedOrders`.
- **Finding 7 (closed)**: the draft's claim that flow combat uses a "lower owner byte" labelling *convention* as its attacker/defender identification contradicted spec v1.4 ("garrison owner is defender", spec.md:204-206). Reconciled in §2 decision 4 and data-model §6 step 5: the code has **two** distinct concepts — role identification (garrison-is-defender, `combat.ts:189-207`) and event-payload field assignment (lower owner byte, `combat.ts:212-214`). The plan now describes both and defers to the spec's role wording. No behavior change results; the extraction in §5 step 2 preserves both exactly.

## 5. Implementation steps (file by file)

1. **`packages/engine/src/serialize.ts`**
   - `SERIALIZE_FORMAT_VERSION = 2` (`:120`); extend the module-header payload-layout doc (`:31-60`) and the format-version history comment (`:116-119`).
   - Encode: validate `elevation` is an integer in `[0, 255]` and `terrain` is `'land' | 'water'` (throw `EngineSerializationError` otherwise); write 10-byte cell records (`troopCounts`, `troopOwners`, `pipeMasks`, `reservesPct`, `cityOwners`, then `elevation`, `terrainFlag` — `:563-571`); update `cellsBlockLen = n * 10` (`:498`) — the `p !== total` assertion at `:573-575` catches any size slip.
   - Decode: read `elevation` + `terrainFlag` per cell inside the existing cell loop (`:852-878`); reject `terrainFlag > 1` with `EngineFormatError`; build `board.cells` with the real values and **delete** the all-land fabrication block (`:884-898`) and its "board re-fetch is feature 003's responsibility" comment.
2. **`packages/engine/src/resolution/attrition.ts` (new)** — `resolveTwoWayAttrition` per §3, with its own unit tests. Integer-only (`Math.min`, `>>> 0`); allocates nothing beyond the return object (SC-006-friendly).
3. **`packages/engine/src/resolution/combat.ts`** — refactor the total-force 2-way path (`:175-253`) to call the helper (behavior-preserving; `tests/unit/combat.test.ts` is the regression net). No signature change. Keep the event-payload labelling (`:212-214`) and role identification (`:189-207`) as-is.
4. **`packages/engine/src/resolution/paratroop.ts`** — in the apply branch (`:184-200`): branch on the target's state at that moment — empty/neutral and same-owner keep current behavior; enemy-held calls `resolveTwoWayAttrition({ attackerOwner: playerIndex + 1, attackerTotal: N, defenderOwner: targetOwner, defenderTotal: G, cellCapacity: cap })` and writes `newCounts`/`newOwners` only per the data-model §11 transition table (owner write **suppressed** when `G > N` — the garrison survives; `0` on tie (`N = G` → 0/0, NOT a surviving garrison); winner clamped to capacity when `N > G`); pushes a `CombatEvent` (`attacker` = landing player) via `pushCombatEvent`; clears pipes in all resolved outcomes (`:199` — already unconditional). Update the module doc (landing on enemy cells = attack; `events` no longer "currently empty", `:60-61`).
5. **`packages/engine/src/tick.ts`** — merge `paraResult.events.combat` into `events.combat` after Phase 2 (same spread pattern as the combat/capture phases, `:250-253` / `:258-261`). Errors merging (`:175-177`) and the appliedOrders gate (`:214-219`) are already correct — losing landings flow into `appliedOrders` through the existing `successfulParatroopIndices` path with no change.
6. **Contracts (documentation only — no signature change)**: JSDoc in `packages/engine/src/contracts/engine-api.ts` for `serializeWorld`/`deserializeWorld`/`hashWorld` (round-trip + two-version boundary guarantees). The `serialize.ts` module header (step 1) is the wire-format source of truth, mirrored in `specs/001-core-game-engine/contracts/README.md` (already amended; verify wording post-implementation). Note: historical clarifications reference spec-dir contract mirrors (`specs/001-core-game-engine/contracts/*.ts`) that no longer exist on disk — the only contract surface is `packages/engine/src/contracts/` (see `contracts/README.md`); nothing to mirror for v1.16 because no type changes.
7. **Tests** — see §7.
8. **Fixture regeneration**: `packages/engine/tests/fixtures/sample-2p-match.json` pins `finalStateHash: "0aafe88f"` (`:26`); the v2 payload changes `hashWorld` output. Regenerate via the replay update path — `tsx packages/engine/scripts/update.ts packages/engine/tests/fixtures/sample-2p-match.json` (script verified: replays the fixture and rewrites `finalStateHash`; prints `Updated <old> → <new>`). `engineVersion: "0.2.0"` stays (no API bump). Commit the fixture change in the same set. **Correction (Gate-2 finding 8a)**: no test consumes `sample-2p-match.json` — the real determinism net is `packages/engine/tests/replay/replay.test.ts`'s runtime-computed hashes; the fixture pin is sample/doc hygiene. The old-hash audit found exactly three `0aafe88f` occurrences in the tree: the fixture (`sample-2p-match.json:26`, regenerated here), the README example (`packages/engine/README.md:160`, refreshed in the same set), and the quickstart Q-014 expect-line (`specs/001-core-game-engine/quickstart.md:483`, which intentionally names the pre-v2 hash as the "before" side of `Updated <old> → <new>`). No other hash pins exist (everything else is a runtime run-to-run comparison).
9. **Spec-truthfulness (AGENTS.md rule 4)**: spec 001 v1.16, `data-model.md` §6/§10/§11, and `contracts/README.md` are amended in this change set (Phase 1–3 done; §6 step 5 and §11 appliedOrders row refined in this Phase 4). Player manual: `docs/manual/src/pages/special-weapons.mdx` already documents that landing on an enemy-held cell means the troops "immediately fight whatever is there" — the manual describes the attack semantics this fix implements, so no manual change is mandated by contradiction. Post-implementation, re-verify the page's numbers against v1.16 (1:1 attrition, landed force = N, no flip when the garrison survives) and add a one-line numeric clarification only if something is missing. **Update (PR #186 review)**: the reviewer ruled that verifying existing prose does not discharge AGENTS.md rule 4 when the gameplay behavior itself changed, so a short clarification WAS added to `special-weapons.mdx` — survivors keep the cell and any city, an equal-force landing is a mutual annihilation leaving the cell neutral, and a city transfers only after the garrison is eliminated. That supersedes the "no manual change is mandated" reading above.

## 6. Determinism & constitution checks

- **Determinism (AGENTS.md rule 3 / FR-017)**: integer-only math (`Math.min`, `Math.imul`, `>>> 0`); no RNG, no wall-clock; sequential landings keep the engine's existing deterministic sorted order (`tick.ts:133`, `:156-163`). No violation found in any touched file.
- **Tunables**: all values used by the change (`cellCapacity`, `paratroopCost`) live in the single constants location (`packages/core/src/flow-rate.ts`); the new format-version constant belongs beside the existing one in `serialize.ts` (its documented home).
- **Scratch-buffer discipline (FR-03/SC-006)**: untouched — `resolveParatroop` keeps its lazy allocation; the new helper allocates nothing on the hot path; the `tick.ts` change is an event merge (same pattern as existing phases).
- **Coverage gate (SC-003 / constitution III)**: `packages/engine/vitest.config.ts:14-18` enforces 80% lines/functions/branches/statements; the new branches are all test-covered per §7.
- **Licensing**: no `europa-source/` code is referenced; behavior is reimplemented from the spec.

## 7. Test plan and coverage rationale

Suites named below are the ones that carry the ≥80% gate on the touched paths (constitution merge gate). New code lands in exactly three places — the serialize encode/decode terrain branches, the paratroop enemy-landing branch, and the new attrition helper — and every new branch is directly exercised:

| # | Suite (file) | What it guards | Traces to |
| --- | --- | --- | --- |
| P-1 | `tests/unit/serialize.test.ts` (extend) | Board round-trip asserting exact `cells` equality (elevation + terrain, incl. water) after `deserializeWorld(serializeWorld(w))`; hand-built payload helpers extended `64 * 8` → `64 * 10` (`buildPayload` `:235`, `cellsWithFirstCell` `:292-295`); encode-rejection for elevation ∉ `[0,255]` / unknown terrain; decode-rejection `terrainFlag > 1` | AC-17, AC-18, FR-026 |
| P-2 | `tests/unit/serialize.test.ts` (existing tests kept) | Offset-based decode tests stay valid because new bytes are appended; header/format-version mismatch throw tests | AC-16, FR-024 |
| P-3 | `tests/unit/paratroop.test.ts` (extend) | Enemy-held win (`N > G`, occupant clamped to capacity), loss (`G > N`, **owner unchanged**, pipes cleared), tie (`N = G` → count 0, owner 0) — the transition table row by row | AC-19, FR-013 |
| P-4 | `tests/unit/paratroop.test.ts` (extend) | Enemy **city** targets: win transfers the city via the capture phase in the same full tick; loss leaves the city with its owner | AC-20, FR-005 interaction |
| P-5 | `tests/unit/paratroop.test.ts` (extend) | `CombatEvent` field assertions: `attacker` = landing player, `defender` = garrison owner, totals N vs G, losses = `min(N, G)`; `winner: 'tie'` on annihilation | AC-21 |
| P-6 | `tests/unit/paratroop.test.ts` (extend) | Sequential double-landing on one target (second landing resolves against what the first left) | FR-017 |
| P-7 | `tests/unit/paratroop.test.ts` (extend) | **Losing enemy landing appears in `appliedOrders`**, not `errors` (full `tick()` pipeline) — Gate-1 finding 6 regression guard | FR-013 + FR-023 |
| P-8 | `tests/unit/attrition.test.ts` (new) | Helper edges: clamp at capacity boundary (cap−1 / cap / cap+1), tie, zero totals | FR-011, v1.5 |
| P-9 | `tests/unit/combat.test.ts` (existing, must stay green) | Refactor regression: extraction is behavior-preserving for flow combat, including the garrison-is-defender roles and lower-owner-byte event fields | AC-19 (flow side), finding 7 |
| P-10 | `tests/serialization-conformance.test.ts` (existing) | Version boundary: format-version mutation test still targets byte `3 + ENGINE_API_VERSION.length` (`:103`); no-hardcoded-semver scan still passes (`:65-75`) | AC-16, AC-18, FR-024 |
| P-11 | `tests/quickstart/paratroop-gun.test.ts` (extend, Q-008) | Headless enemy-landing scenario end-to-end (cost 2N paid, attrition applied, pipes cleared, event emitted) | US4, AC-5/19/21 |
| P-12 | `tests/replay/replay.test.ts` (runtime-computed hashes — the real determinism net; **no test consumes `sample-2p-match.json`** — Gate-2 finding 8a) + regenerated `fixtures/sample-2p-match.json` + `README.md` hash example (sample/doc hygiene, updated via `scripts/update.ts` in the same change set) | Replay determinism over the v2 payload; the pinned `finalStateHash` stays truthful | SC-001, FR-026 |
| P-13 | `tests/determinism.test.ts` (existing) | SC-001 run-to-run byte-identity stays green over the changed pipeline | SC-001 |

Coverage rationale: P-1/P-8/P-11 cover the new encode/decode and landing branches line-for-line; P-3..P-7 add the only new paratroop branch logic; P-9/P-10/P-12/P-13 are retention guards for the refactored and re-versioned paths (already covered, must not regress). Nothing in the touched code is left unexercised, so the 80% thresholds in `vitest.config.ts` hold without padding the suite. The full gate is `pnpm verify` (AGENTS.md rule 6).

## 8. Risks

- **Hash-dependent fixtures**: `hashWorld` output changes with the payload. **Correction (Gate-2 finding 8a)**: no test consumes `sample-2p-match.json`; `tests/replay/replay.test.ts` computes its hashes at runtime, so the determinism net is unaffected. The three literal `0aafe88f` pins — fixture (`sample-2p-match.json:26`), README example (`packages/engine/README.md:160`), and quickstart Q-014's expect-line (`quickstart.md:483`) — are handled in-set: fixture regenerated, README refreshed, quickstart text already names the old hash only as the "before" side of the regeneration output.
- **Payload consumers of raw bytes**: none exist — no golden serialized-byte fixtures, and the feature 004 boundary consumes via the API, not raw offsets. Old v1 payloads become unloadable by design (`EngineFormatVersionMismatchError`).
- **Behavioral surprise**: paratroops no longer flip occupied cells for free — the intended owner-decided balance change; spec and manual describe it consistently.
- **Refactor risk in `combat.ts`**: the extraction must be behavior-identical; land it as a standalone commit with `combat.test.ts` green before wiring the paratroop branch.
- **Non-blocking ledger item**: optional encode check that `cells[i]` is row-major (type invariant at `packages/core/src/types.ts:133`) — deliberately skipped to keep the change minimal; revisit only if the PM wants it.

## 9. Verification

`pnpm verify` (full CI-equivalent gate) before any push; targeted iteration via `pnpm verify:changed` or the engine package's vitest run. Per this task's constraints, nothing is committed — all changes stay in the working tree until the PM/user approves (Gate 2 → Phase 5 tasks).
