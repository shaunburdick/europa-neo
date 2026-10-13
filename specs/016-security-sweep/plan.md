# Implementation Plan: 016 Security Sweep (issues #152 / #146 / #129)

**Branch**: `security-sweep` | **Date**: 2026-10-11 | **Spec**: [spec.md](spec.md) (amendment manifest — no standalone FRs)

**Input**: `specs/016-security-sweep/spec.md` (17-row amendment manifest) + the amended owning specs, all uncommitted on this branch: 004 v1.11, 005 v1.11, 006 v1.9, 007 v1.8, 010 v1.14 (+ its `data-model.md`), 013 v1.5, 015 v1.1. Decisions: `clarifications.md` D1–D10. Gates: Gate 1 (rounds 1–2 + F-8 re-check) PASS; Gate 2 (round 2) PASS — `challenge-ledger.md`.

**Status**: **APPROVED PLAN** (Gate 2 PASS, 2026-10-11); tasking approved at Gate 3 the same day and Phase 6 completed on `security-sweep` 2026-10-12 (`tasks.md` all checked, `bash scripts/verify.sh` green).

## Summary

Three P1 security fixes land as ONE PR, written into the owning specs in place (amendment rows A-01…A-17):

1. **#146 — guest-identity bearer path**: a per-identity **resume secret**, minted server-side with CSPRNG entropy, delivered only to the owning connection on the directed `identity` event, stored by the browser beside the id, and required for restore/rename/release. A bare `GuestPlayerId` authorizes nothing anywhere (grace or active); the sole exception is the PO-ruled (D10) same-connection idempotent refresh, where authority is the pre-existing connection binding — the id still confers nothing.
2. **#152 — console WebSocket robustness**: promise-settling sends, bounded seq→actionId correlation (cap 64), mount/teardown race closure, configurable establish timeout with honest status, inbound frame validation (incl. nested `lobbyEvent`), per-instance client state (seat-token isolation), stale-socket guards, allocation-free copy-on-write rehydration, `never`-sink exhaustiveness.
3. **#129 — routing/debug seams**: production bootstrap captures `?ws=` **before** `stripProductionQuery()`; the E2E `history.replaceState` patch stops being load-bearing (and the production monkey-patch wrapper is deleted); `?live`/`?match=`/`?name=`/`?token=` query consumption and the `mountLobbyRuntime` compat export are deleted; one `returnTo` validator; production boots install no `window.__europa*` globals (test sentinel channel); the public barrel drops `@internal` exports with `CONSOLE_API_VERSION` 0.4.1 → **0.5.0** (PO-confirmed, D5 — not reopenable).

Technical approach: no new dependencies; Web Crypto via the existing `packages/matchmaking/src/crypto.ts` seam; all changes are amendments to shipped code paths verified live on 2026-10-11 (D8 corrects the stale issue paths).

## Technical Context

**Language/Version**: TypeScript (strict) · Node >=22 · pnpm monorepo (10 packages, all `private: true`)
**Primary Dependencies**: unchanged — React 19, TanStack Router, Zustand, `@europa/*` internal packages; **zero new dependencies**
**Storage**: matchmaking identities are in-memory only (unchanged); the console's `localStorage` claim record (`europa:lobby:identity:v1`) gains a `resumeSecret` field
**Testing**: Vitest 4 (unit/component/integration), Playwright (E2E), axe-core, agent-browser smoke (D6 depth, owner-ruled)
**Target Platform**: browser console + Node match server (single-port self-host bundle)
**Constraints**: determinism discipline (registry randomness via injected CSPRNG seam, as `randomId` already is); `NETWORK_API_VERSION` **unchanged** (D4, PO-confirmed); `CONSOLE_API_VERSION` 0.4.1 → 0.5.0 (D5, PO-confirmed); tunables in one constants location
**Scale/Scope**: ~20–30 files across 3 packages (`matchmaking`, `networking`, `console`) + 4 E2E specs + 2 spec-text riders (013 polish, 007 manual review) — one PR

## Constitution Check

| Principle | Verdict | Note |
|---|---|---|
| I Type Safety | ✅ | strict TS; optional wire fields use `exactOptionalPropertyTypes` discipline already in the clients; no `any` |
| II Server-authoritative determinism | ✅ | resume secret minted server-side via injected CSPRNG (`IdentityRegistryDeps.randomSecret`, default Web Crypto — same pattern as existing `randomId`/session tokens); never inside tick logic; no wall-clock reads added |
| III Tested game logic ≥80% | ✅ | targeted test per AC (map below); matchmaking registry already covered — new paths add tests, coverage ratchets up |
| IV Specs as documentation | ✅ | amendments already landed in the spec files; implementation carries the named same-change-set obligations (`data-model.md` §4 JSDoc mirror, 007 manual review); this plan resolves the ledger's DEFERRED items |
| V Simplicity | ✅ | no new abstractions beyond two registry accessors (`reactivate`, `resumeSecretOf` — see Complexity Tracking) and one sentinel object; deleted code (`guardReplaceStateUrlArgument`, `mountLobbyRuntime` export, query-param seam) exceeds added complexity |
| VI Accessibility | ✅ | no new UI; honest failed/retrying connect status (FR-031) rides existing FR-008 feedback paths |
| VII Self-hostable | ✅ | no external services; secret minting is in-process Web Crypto |

## Project Structure

### Documentation (this feature)

```text
specs/016-security-sweep/
├── spec.md              # amendment manifest v1.0 (Gate 1 + Gate 2 PASSED — requirement home, not edited by tasking)
├── clarifications.md    # D1–D10 (D4/D5 PO-confirmed; AD-3 sentinel; D9/D10 F-8 carve-out ruling)
├── challenge-ledger.md  # Gate 1 + Gate 2 records (input)
├── plan.md              # this file (approved plan)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (server record, wire fields, client storage)
├── quickstart.md        # verification quickstart
├── contracts/           # Phase 1 output (4 interface contracts)
└── tasks.md             # Phase 5 output (APPROVED — Gate 3 PASS 2026-10-11)
```

### Source Code (repository root)

```text
packages/networking/src/contracts/
├── network-types.ts          # + GuestIdentityClaim.resumeSecret?, IdentityState.resumeSecret? (A-01 mirror 1)
└── (validate.ts)             # tolerate/validate the optional field; never echo into snapshots

packages/matchmaking/src/
├── contracts/lobby-types.ts  # + same two optional fields (A-01 mirror 2)
├── internal/guestPlayerIdentity.ts  # record gains internal `resumeSecret` (never projected)
├── internal/identityRegistry.ts     # mint/verify/rotate; new `reactivate` seam; deps.randomSecret
├── internal/lobbyService.ts         # establishment delivers secret on directed event only;
│                                    # bare-id claims advisory; seat-reconnect uses `reactivate`
└── (crypto.ts)               # unchanged — existing Web Crypto seam supplies entropy

packages/console/src/
├── main.tsx                  # capture query BEFORE strip; sentinel gate for __europaLobby;
│                             # DELETE guardReplaceStateUrlArgument (#129)
├── internal/live-runtime.tsx # DELETE ?live/?match=/?name=/?token= query fallbacks (#129)
├── internal/lobby-runtime.tsx# DELETE dead mountLobbyRuntime EXPORT only; module KEPT —
│                             # MatchLegHost has 4 live importers (route-tree.tsx:33,
│                             # match-adaptive-route.tsx:19, match-join-route.tsx:30,
│                             # match-spectate-route.tsx:30); Gate 2 correction (A4)
├── ui/profile-url.ts         # canonical returnTo validator (single decode) (FR-034)
├── routing/search-params.ts  # delegates to the canonical validator; divergent duplicate deleted
├── index.ts                  # drop @internal re-exports (ConsoleRuntimeContract etc.) (FR-038)
├── contracts/console-types.ts# CONSOLE_API_VERSION '0.5.0'; ESTABLISH_TIMEOUT_MS default
├── net/lobby-storage.ts      # StoredLobbyClaim + resumeSecret; JSDoc mirrors data-model §4 (#146)
├── net/ws-lobby-client.ts    # instance-scoped state (#152); claim/adoption carries secret (#146)
├── net/ws-match-client.ts    # sendEnvelope promise contract; instance-scoped state (#152)
├── net/client.ts             # nextWireSeq instance-scoped; bounded correlation map (#152)
├── net/connection.ts         # establish-timeout seam; never-sink exhaustiveness (#152)
├── net/envelope-to-event.ts  # inbound structural validation incl. nested lobbyEvent (#152)
└── net/rehydrate-wire-views.ts # copy-onWrite, allocation-free no-op path (#152, FR-035)

packages/console/tests/e2e/
├── helpers/                  # consolidated preserve-query init script (fixed to tolerate
│                             # missing URL arg) + sentinel opt-in init script
├── lobby.spec.ts             # sentinel migration + restore-with-secret scenarios
├── identity-migration.spec.ts# SC-017 scripted trials (restore / mint-fresh / secret absence)
├── shareable-links.spec.ts   # sentinel migration
├── spectator-sidebar.spec.ts # sentinel migration
└── routing.spec.ts           # ?ws= correctness with NO replaceState patch (AC-018)

docs/manual/                  # 007 v1.8 review obligation — lobby.mdx / quick-start.mdx
                              # re-reviewed in the #146 change set (expected delta: 0–1 sentence)
```

**Structure Decision**: no new packages, directories, or build entries. All work lands in the three owning packages above; E2E helpers get one shared module exporting both init-script variants (preserve-ws-only ×4 definitions + merge ×2 across five specs — see AD-5; Gate 2 correction, previously undercounted as "triplicated").

## Architecture Decisions (plan-phase; includes the 4 DEFERRED Gate-1 items)

### AD-1 — Resume secret: mint, format, and rotation ordering (DEFERRED item 1 → resolved)

- **Mint**: at identity creation, inside `mintIdentity()` (`identityRegistry.ts`), from a new injectable dep `randomSecret?: () => string` — default `randomUUID()` from `packages/matchmaking/src/crypto.ts` (Web Crypto). Same precedent as `SessionToken` minting (`sessionToken.ts:52`): a UUIDv4 string is 122 bits of CSPRNG entropy, opaque, and format-consistent with every other bearer token in the codebase. Tests inject a deterministic counter sequence.
- **Rotation ordering (the stranding question)**: the pinned order on a successful claim-based restore is **verify → reactivate → rotate (record) → deliver (directed event carrying the successor)**. Consequence if delivery is lost (socket dies before the event flushes): the client holds a now-dead secret; its next claim fails verification and mints fresh — **exactly the accepted D4 degradation, bounded to identity churn, never a lockout** (the record itself lapses via the ordinary grace sweep). The old secret is never re-valid after rotation, so a captured secret stays single-epoch (D3).
- **Verification path**: a drop-mid-restore test at registry level (injected CSPRNG): restore with S1 succeeds and rotates to S2; a subsequent claim with S1 against the now-active identity mints fresh without evicting; a claim with S2 restores. Plus a lobbyService-level test where the event sink throws (delivery failure) followed by a re-claim with S1 → mint-fresh, and with S2 → restore.

### AD-2 — Seat-reconnect reactivation is a server-internal seam, not a claim

`lobbyService.ts:998` currently calls `registry.restoreIdentity({ guestPlayerId: guestId })` from `onSeatReconnected` — a bare-id "claim" that FR-027 would prohibit. Its authority is not the id: it is the **seat credential already verified upstream** (the reconnecting connection presented a valid seat/session token before this handler runs). Plan: add `IdentityRegistry.reactivate(id)` (grace→active, no secret check, returns the record or undefined) used **only** by server-internal paths that have already verified a bearer credential; `restoreIdentity(claim)` becomes the claim-only path and requires the matching secret. Doc-comment on `reactivate` states the authority source, so the id-only prohibition stays legible. Tests pin: `restoreIdentity({guestPlayerId})` without secret never restores; `onSeatReconnected` still reactivates (seat-token path unchanged).

### AD-3 — Test-sentinel naming (clarifications open question 3 → resolved; DEFERRED item 2 → verified)

**Decision: `window.__europaTestOptIn`** — an object set by test infrastructure via Playwright `addInitScript` before page load. The production bootstrap installs `window.__europaLobby` only when `window.__europaTestOptIn?.lobby === true`; otherwise no `__europa*` handle is installed at all.

Justification:
- Matches spec 015 v1.1's normative mechanism word-for-word ("an explicit pre-load opt-in sentinel set by test infrastructure before page load") without mandating a name in the spec (Gate 1 correctly deferred this).
- Keeps the `__europa*` prefix family (discoverable, greppable, and covered by the same static scans as the handles it gates).
- Presence-gated object, not a query flag: nothing in the URL surface (#129's whole point), extensible for future test handles (`{ lobby: true, live?: true, …` ) without new sentinels, and it carries no bearer values (FR-037).
- **Implementability (DEFERRED item 2, verified)**: Playwright's `context.addInitScript` runs on every navigation before any page script — trivially pre-load; the four dependent E2E specs (`lobby`, `identity-migration`, `shareable-links`, `spectator-sidebar`) migrate in the **same change set** by adding one init-script line each and keep reading `window.__europaLobby` unchanged. Verified today: all four consume the handle (`lobby.spec.ts:213`, `identity-migration.spec.ts:198`, `shareable-links.spec.ts:159`, `spectator-sidebar.spec.ts:169`).
- **Test**: component/bootstrap test asserts `window.__europaLobby` is `undefined` after a production boot with no sentinel, and defined with `{ lobby: true }`; AC-020's runtime scan asserts no `__europa*` handle on an unflagged boot.

### AD-4 — FR-028 wording for fire-and-forget void sends (DEFERRED item 3 → resolved)

FR-028 as written demands every send "reject the returned promise", but heartbeats and some lobby actions are `void` and return no promise. Pinned interpretation (carried into the 005 v1.11 section as a one-sentence precision in the implementation change set — v1.11 is unshipped, no version bump):

- **Promise-returning sends** (`sendOrder`, join/leave/spectate submissions, promise-based lobby actions): MUST reject when the transport cannot accept the frame; no synchronous throw may escape into callers.
- **Void sends** (heartbeats, fire-and-forget lobby actions): MUST NOT throw synchronously and MUST log the failure through the existing verbose-logging path (already redaction-gated). No promise is conjured for them.

### AD-5 — `guardReplaceStateUrlArgument`: DELETE (DEFERRED item 4 → resolved)

The production wrapper (`main.tsx:191`) exists solely to compensate for the E2E init script converting a missing URL argument into the string `"undefined"`. Once FR-025 makes the bootstrap capture the query before stripping, production correctness no longer depends on the patch at all (AC-018 proves `?ws=` works with **no** patch installed). Plan:

1. Delete `guardReplaceStateUrlArgument` and its call from `main.tsx`.
2. Fix the init script itself to mirror native semantics (missing/null URL argument → keep the current URL) and consolidate into `tests/e2e/helpers/`. **Gate 2 correction (A1)**: the patch is not three identical copies but **five specs / six definitions in two semantically different variants** — preserve-ws-only (`routing.spec.ts:33`, `lobby.spec.ts:64`, `shareable-links.spec.ts:39`, `spectator-sidebar.spec.ts:55`: REPLACES the target URL's query with the live `?ws=` search) and merge (`routing.spec.ts:57`, `identity-migration.spec.ts:82`: MERGES the live `?ws=` search with the target URL's existing params so `/profile?returnTo=…` redirect round-trips survive). The helper must export **both** variants with their semantics intact; they are not dedupable into one behavior (preserve-only would drop `returnTo`), only de-copied.
3. Per FR-035, the (fixed) patch is installed only by fixtures that still need query preservation; a routing.spec test runs `?ws=` correctness with no init script at all.

Rationale for delete-not-keep: a production monkey-patch of `history.replaceState` that only exists to neutralize test infrastructure is exactly the "test patch leaking correctness responsibility into production" #129 condemns; keeping it would also mask regressions in the new capture-before-strip order.

### AD-6 — `returnTo` validator consolidation (FR-034)

Canonical implementation stays in `packages/console/src/ui/profile-url.ts` (existing exported, tested surface); `routing/search-params.ts`'s divergent double-decoding parser is deleted and its `validateSearch` delegates to the canonical validator. Single URI-decode, relative pathname only, starts with `/`, not `//`, no `://`, no `..`, no embedded query string; unsafe → treated as absent. The open-redirect corpus (AC-019: `//evil.com`, `https://evil.com`, `/%2e%2e/x`, double-encoded, backslash, encoded-slash, embedded query) runs against the one exported validator and against the profile route's search-params integration.

### AD-7 — Per-instance client state (FR-033)

`nextWireSeq` (`client.ts:111`) and `lastCapturedSeatSessionToken` (`ws-lobby-client.ts:390`) move inside their factory closures; the seq→actionId correlation map becomes an instance field bounded at `PENDING_ORDERS_CAP`-consistent **64** (constant next to the existing net-layer constants; documented). Prune on ack, correlation timeout, disconnect, teardown. Two-instance interleaved-lifecycle test pins isolation, including that one lobby instance's captured seat token is unreadable from another. FR-032's inbound validation runs before dispatch; validation failure drops the frame with a diagnostic log and never throws out of `onmessage`.

### AD-8 — Establish timeout (FR-031) — corrected at Gate 2 (A2): the two clients are asymmetric

- **`ws-lobby-client.ts` — already has one.** `startAttempt` arms an epoch-guarded establish timer at `:857–863` via the injected `scheduler.setTimeout`, keyed to the shared `actionTimeoutMs` option (`:248`, default `DEFAULT_ACTION_TIMEOUT_MS = 10_000` at `:111`), failing the attempt with `LobbyTimeoutError`. Delta: surface/document a dedicated `establishTimeoutMs` (default **10_000**, matching today's effective behavior) instead of overloading the per-action knob, and verify the honest failed/retrying status path (FR-008) end-to-end — no new timer machinery.
- **`ws-match-client.ts` — has NEITHER.** No establish timeout anywhere, and no scheduler seam: timers are bare `setInterval`/`clearInterval` (heartbeat at `:203`/`:225`). Delta: introduce the injectable timer seam (mirroring the lobby client's `scheduler`), add the establish timer to `connect()` with the same `ESTABLISH_TIMEOUT_MS = 10_000` default declared in `contracts/console-types.ts` (console's single constants file, documented in the 005 v1.11 section), settle the connect promise failed on expiry, clear on success and teardown, never fire post-establish. This is the client where a half-open server today leaves a permanently blank console — FR-031's core gap.
- The previous text ("reuses the scheduler seam the clients already have") was half-false and is retracted: only the lobby client has the seam.

### AD-9 — Client storage shape (FR-003/FR-042)

`StoredLobbyClaim` becomes `{ guestPlayerId, resumeSecret, handle }` with `resumeSecret: string | null` (`null` pre-delivery). Storage key **stays** `europa:lobby:identity:v1`: the shape guard tolerates a missing `resumeSecret` field by reading it as `null` (old records simply cannot restore — the same mint-fresh degradation as today); a key bump would discard still-valid ids for no benefit. Adoption overwrites the `{ guestPlayerId, resumeSecret }` pair **only when the event actually carries a secret** (single-epoch — a delivered secret always supersedes the stored one); `invalidateClaim` clears both. The secret is registered in the client's redaction choke point (the `knownIdentityClaims` pattern) so it can never appear in verbose logs.

**Gate 2 pin (Q1a) — secret-less identity events never clear a stored secret.** `applyIdentity` (`ws-lobby-client.ts:1066`) runs on *every* directed identity event, and the rename path's event (`lobbyService.ts:1165`) carries the id and handle but **no** secret; the claim rebuild at `:1083–1086` and `adoptServerGuestId` (`:621`) must therefore carry the existing `resumeSecret` forward unchanged when `identity.resumeSecret === undefined`. Only `invalidateClaim` (server-forgot at `:1087–1089`, expiry, explicit reset) clears the secret. Without this pin, a routine rename would null the stored secret and the next reload would churn the identity. Tests: (1) identity event with id+handle and no secret → stored secret unchanged (client unit test); (2) **rename → reload → restore succeeds** (component/E2E — the SC-017 trial-(a) extension); (3) establishment event with a new secret → stored secret overwritten.

### AD-10 — Privacy surfaces (FR-042, spec 006 FR-026)

`check-documentation-privacy.mjs` (spec 010) gains the resume-secret name and a credential-shaped-value pattern to its denylist. Server-side, `projectIdentity`, snapshots, roster events, and `setHandle`'s directed `identity` event are built from projections that structurally cannot carry the secret (the field lives on the internal record only; only the establishment path composes it into the directed event). A unit test asserts the rename-path identity event has `resumeSecret === undefined` while the establishment-path event carries it.

### AD-11 — Identity-event secret semantics + F-8 carve-out (Gate 2 Q1 — pins)

**Server invariant (Q1b delivery half).** The establishment emission at `lobbyService.ts:1115–1122` is composed from `registry.projectIdentity()` (`withOwnerId(projected, activeId)`), which is structurally secret-free — so a naive "fold in `restoreIdentity`'s successor" would deliver secret-less events on every establishment outcome. Pinned instead: **every establishment-path identity event carries the record's current secret** (fresh mint → the new secret; claim-based restore → the rotated successor; F-8 refresh → the current, unchanged secret), composed via a new internal-only registry accessor (`resumeSecretOf(id)`, never exposed through `projectIdentity`). Rename-path emissions (`:1165`) carry no secret. Rotation happens **only** on successful claim-based restores (D3) — an F-8 refresh delivers the same secret it already had, so nothing to rotate and nothing to wipe. Pinned by unit tests on the lobbyService emission for all three outcomes.

**F-8 same-connection refresh is a carved-out no-op, not a claim grant (Q1b authority half).** `establishIdentity`'s F-8 branch (`lobbyService.ts:1084–1093`): an id-only claim where `claimed === connections.get(connectionId)` and the identity is active keeps the binding and mints nothing. Authority is the **existing server-side connection binding** (established at first mint by the connection's own establishment, or at bind time via the resume secret or a session/reconnect credential), not the id: the claim is a consistency guard only, the branch never calls `restoreIdentity`, mutates no identity state, starts no grace, and displaces nothing; any *other* connection claiming the same id gets mint-fresh as usual. Already pinned by `lobby.facade.test.ts:264–278` ("re-establishing the SAME identity starts no spurious grace window"); that test and the F-8 release test (`:245–262`) stay green through the sweep. **RESOLVED by the binding PO ruling D10 (Gate 2 re-entry)**: the carve-out is approved spec text, landed as dated 2026-10-11 entries under 004 FR-027 and 006 FR-026 and mirrored by manifest rows A-02/A-09; this plan's fences match the approved text fence-for-fence (other connection → mint fresh; grace → secret required; rename/leave keep their credentials). The earlier "reported tension" framing is superseded.

## Sequencing and collision map

Owner-ruled: **one PR**. Issues #152 and #129 both touch `packages/console` (both edit `main.tsx` and the net layer's orbit); #146's server side (`packages/matchmaking`, `packages/networking`) is independent, but its client side shares `ws-lobby-client.ts` with #152. Recommended order (single implementer — ordering, not parallelism, is the point):

| Wave | Content | Rationale |
|---|---|---|
| W1 | **#129 console**: `main.tsx` capture-before-strip + sentinel gate + `guardReplaceStateUrlArgument` deletion; `live-runtime.tsx` query deletion; `mountLobbyRuntime` export deletion; `returnTo` consolidation; barrel cleanup + `CONSOLE_API_VERSION` 0.5.0 + conformance pin; E2E init-script fix (shared helper, both variants); **the one-line sentinel migration of the 4 dependent specs** | Smallest blast radius on the net layer; removes `main.tsx` from the collision set before the net rework begins; the gate change and the migration that unbreaks it land **together** (Gate 2 Q2, option ii) |
| W2 | **#152 net/runtime hardening**: instance scoping (client.ts, ws-lobby-client, ws-match-client), send promise contract, correlation map, establish timeout (match-client seam + lobby rekey per AD-8), inbound validation, stale-socket guards, rehydration, `never` sink | Reworks `ws-lobby-client.ts` structurally — do it before #146 layers the secret onto the same file, or the secret work gets rebased twice |
| W3 | **#146 server** (`[P]`-safe vs W1/W2 in principle, but land after W2 in one branch): networking + matchmaking contract mirrors, registry mint/verify/rotate/reactivate + `resumeSecretOf`, lobbyService establishment delivery (secret on establishment events only, AD-11) + advisory claims, privacy check; flip the existing id-only-grace-restore test (`lobby.facade.test.ts:201`) to mint-fresh, keep the F-8 tests green | Independent package-wise; sequenced after W2 only because the PR is single-branch — task-level [P] marks will reflect the package split for whoever parallelizes |
| W4 | **#146 client**: `lobby-storage.ts` (+JSDoc mirror), `ws-lobby-client` claim/adoption/redaction incl. the AD-9 secret-preservation pin | Layers cleanly onto W2's instance-scoped client; real-client E2E reload flows keep passing because the client stores/presents the secret automatically |
| W5 | **New scenarios + smoke**: SC-017 scripted trials (incl. rename→reload→restore), AC-018 no-patch run, agent-browser smoke against `pnpm host`, 007 manual review checkpoint | Depends on all code waves; the sentinel *migration* is NOT here — it rode W1 |

**Green-branch invariant (Gate 2 Q2, option ii adopted).** AGENTS.md rule 6 makes `pnpm verify` / `verify:changed` (which runs Playwright for console changes) a pre-push gate, so every wave boundary must stay green: the sentinel opt-in line lands in W1 **in the same change set as the gate it unbreaks** — no window exists where the four dependent specs (`lobby`, `identity-migration`, `shareable-links`, `spectator-sidebar`) read a handle the bootstrap no longer installs. W2–W5 add or update tests but never remove a passing assertion without a co-landed replacement.

**Gate 3 correction (F3-1) — the client half of this paragraph was incomplete.** The claim "no spec forges id-only claims via localStorage" is true of the Playwright specs but FALSE of the console **integration** suite: `tests/integration/lobby-transport.test.ts`'s `establishNamedClient` (:654–689) forges an id-only claim at the transport level (:683) and asserts restore (:687), and `lobby.spec.ts`'s reload scenario (:705–756) needs the real client to present a secret. Server enforcement checkpointed before client storage would strand both. **Restructured at Gate 3 (tasks.md, option (a))**: the W3 server wave and the W4 client wave are merged into ONE atomic wave (types → registry → enforcement → storage → adoption → test-helper update) under a single checkpoint, mirroring the T003/T004 sentinel pair; the invariant is restated at checkpoint granularity — intermediate commits inside an atomic change set may be red, but no checkpoint and no push occurs until the change set completes (pre-push `verify:changed`, diffing `origin/main`, mechanically enforces this).

## FR → implementation → targeted test map (D6 depth)

| Requirement | Implementation site | Targeted test (fails pre-fix) |
|---|---|---|
| 004 FR-026 wire fields | `network-types.ts`, `lobby-types.ts`, both validators, console mirrors | contract test: optional field round-trips; absent-tolerant both directions; `NETWORK_API_VERSION` literal unchanged |
| 004 FR-027 / 006 FR-026 / 010 FR-040…043 | `identityRegistry.ts`, `lobbyService.ts` | registry: id-only claim never restores (grace or active); matching secret restores; rotation per D3; drop-mid-restore (AD-1); supersession only with matching secret; `reactivate` only via seat path (AD-2); rename/leave reject id-only without ID-existence disclosure; establishment emission carries the record's current secret in all three outcomes (mint / restore-successor / F-8 refresh) and rename emission carries none (AD-11); existing id-only grace-restore test (`lobby.facade.test.ts:201`) flips to mint-fresh while the F-8 tests (`:245`, `:264`) stay green |
| 006 FR-016 conformance record | spec-only (already amended) | — |
| 005 FR-028 | both `sendEnvelope`/send paths | send-while-CLOSING/CONNECTING/torn-down rejects; no sync throw escapes; void send logs, never throws (AD-4) |
| 005 FR-029 | correlation map | flat growth across N acks; late/duplicate ack no re-correlate; prune on disconnect/teardown |
| 005 FR-030 | `create-console`/runtime mount | mount-after-teardown throws synchronously; teardown racing handshake leaves zero roots/listeners/timers |
| 005 FR-031 | `ws-match-client.ts` (new seam + timer), `ws-lobby-client.ts` (rekey `establishTimer` off `actionTimeoutMs`, `:857–863`) | match client: fake-timer expiry settles connect promise failed, timer cleared on success/teardown, never fires post-establish (fails pre-fix — no timeout exists today); lobby client: documented `establishTimeoutMs` default 10_000 + honest failed/retrying status |
| 005 FR-032 | `envelope-to-event.ts` | malformed nested `lobbyEvent` dropped + logged, no throw, no sever |
| 005 FR-033 | factory closures | two-instance interleaved lifecycle; seat-token isolation |
| 005 FR-034 | handler guards | stale `onopen`/`onmessage` ignored post-reconnect/teardown |
| 005 FR-035 | `rehydrate-wire-views.ts` | no-op path returns the input envelope by reference (identity equality), zero new allocations; repair copies only the changed spine; payload never mutated |
| 005 FR-036 | `connection.ts` | unknown state throws via `never` sink (compile + runtime) |
| 005 FR-037 / 015 FR-019 | `main.tsx` sentinel gate | production boot + no sentinel → no `__europa*` handle; sentinel → handle present, no bearer values |
| 005 FR-038 / 005 Note 17 | `index.ts`, `console-types.ts` | barrel type-surface test: `ConsoleRuntimeContract` (and other `@internal`) unimportable from the barrel; conformance pin `'0.5.0'` (`contract-conformance.test.ts:352`) |
| 013 FR-025 / AC-018 | `main.tsx` capture order | bootstrap unit test: `?ws=` honored with zero `history.replaceState` patching; agent-browser smoke with bad override fail-softs |
| 013 FR-034 / AC-019 | `profile-url.ts` | open-redirect corpus against the single exported validator |
| 013 FR-035 / AC-020 / AC-014 | `live-runtime.tsx`, `main.tsx`, E2E helpers | query-form direct-match boot does nothing; `window.__europaTestMatch` fixtures green; runtime scan: no `__europa*` on unflagged boot |
| 015 FR-020 | E2E helpers (shared init-script module), `main.tsx` (wrapper deletion) | Behaviour is incidentally exercised by the 013 AC-018 row (routing specs pass with the patch scoped/absent) — pinned here in its own right: routing/lobby/shareable specs pass with the fixed patch installed only where needed, AND a bootstrap test asserts production performs zero `history.replaceState` wrapping after `guardReplaceStateUrlArgument`'s deletion; no production assertion depends on the patch |
| 010 FR-003 / SC-017 | `lobby-storage.ts`, `ws-lobby-client.ts` | SC-017 scripted trials (a/b/c) as component + E2E scenarios — trial (a) extended to **rename → reload → restore succeeds** (the AD-9/Q1a regression SC-017 plain reload would miss); storage guard tolerates legacy v1 records; client unit: secret-less identity event leaves stored secret unchanged, establishment event with secret overwrites (single-epoch) |
| 007 FR-004a | `docs/manual/lobby.mdx`, `quick-start.mdx` | review checkpoint (below) — manual pages stay free of secrets and bare-ID-restore claims |

## Spec-text riders in the implementation change set (constitution IV)

1. **007 v1.8 manual review obligation (mandatory)**: re-review `docs/manual/lobby.mdx` (identity card, "This session moved somewhere else" notice, reconnect/grace paragraph, resume-credential warning) and `quick-start.mdx` (refresh-within-60s reclaim, browser-storage sentence) in the #146 change set. Phase-3 survey (2026-10-11) found the wording compatible; expected delta **zero or one sentence** clarifying that the stored resume credential is required for restore. The review itself is a task, not an assumption — record its outcome in the PR body.
2. **005 FR-028 precision** (AD-4): one sentence added to the unshipped v1.11 section covering void sends. No version bump (v1.11 unshipped).
3. **Polish note 1** (Gate 2 round 2): enrich the 013 v1.5 changelog row to name the AC-014 amendment and Route Contract preamble scoping. Cosmetic; rides the #129 change set while v1.5 is unshipped.
4. **Polish note 2** (Gate 2 round 2): one-word supersession marker on 013 Clarifications row 3 (v1.1 session table, seam "preserved") to mirror notes at lines 261/127. Same change set.
5. **Polish notes 3–4**: note 3 is done (D5 recorded as PO-confirmed in `clarifications.md` this phase); note 4 is the four DEFERRED items, resolved above as AD-1 (rotation), AD-3 (sentinel), AD-4 (void sends), AD-5 (replaceState wrapper).

## Verification plan (D6 — owner-ruled depth)

1. **Targeted unit/component test per AC** per the map above — each written to fail pre-fix (TDD where the fix is a behavior change).
2. **`pnpm verify`** (or `bash scripts/verify.sh`) green across all packages — the single CI-equivalent gate (AGENTS.md rule 6); `pnpm verify:changed` during iteration.
3. **E2E** (`pnpm test:e2e`): the 4 migrated specs + routing AC-018 no-patch run.
4. **agent-browser smoke against `pnpm host`** (checklist in `quickstart.md`): lobby connect; bad `?ws=` fail-soft (config-error page, no identity-bearing connection); reload within grace restores identity/handle (secret path exercised end-to-end); match entry; lobby recovery; zero page-console errors; a spot check that no `resumeSecret` value appears in the browser console/network log surfaces the app itself prints.
5. **Privacy check**: `check-documentation-privacy.mjs` extended and green; grep-level assertion that no log line formats the secret.

## Risks

| Risk | Mitigation |
|---|---|
| Single-branch collision in `ws-lobby-client.ts` (W2 vs W4) | Strict wave order; W4 layers on W2's instance state rather than reworking it |
| Red branch between the sentinel gate (W1) and the E2E migration | **Eliminated by design (Gate 2 Q2, option ii)**: the one-line-per-spec migration rides W1 with the gate; the green-branch invariant after the wave table makes "every wave boundary passes `verify:changed`" an explicit plan requirement |
| E2E flake from sentinel/init-script migration | One consolidated helper module with BOTH variants preserved; AC-018 runs a deliberately patch-free test so a regression in capture order can't hide behind the patch |
| Silent identity churn for old clients (D4 accepted) | Documented in 004 "Version compatibility"; no deployed third-party client population (self-host bundle ships client+server together) |
| Secret leaking via verbose logging | Redaction choke-point registration (AD-9) + privacy-check denylist (AD-10) + smoke spot-check |
| F-8 carve-out vs the literal "mint a fresh identity" sentences in 004 FR-027 / 006 FR-026 | **RESOLVED by binding PO ruling D10** (Gate 2 re-entry): carve-out approved and landed in 004 FR-027 / 006 FR-026 dated 2026-10-11 entries, mirrored by manifest A-02/A-09; implementation preserves the existing pin (`lobby.facade.test.ts:264`) unchanged — no contingency remains |
| Scope creep | FR-035 is in scope by PO ruling — implement as specified (reference-identity no-op test), no further perf work |

## Complexity Tracking

No constitution violations to justify. Two new registry accessors (`reactivate` — internal server-authoritative transition; `resumeSecretOf` — internal-only secret read for the establishment emission, never projected) and one sentinel object are the only additions to the abstraction budget; the change set is net-negative in code (deleted query seam, deleted production monkey-patch, deleted compat export, deleted divergent validator).
