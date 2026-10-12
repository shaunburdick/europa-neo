# Security Sweep — Amendment Manifest (not a standalone feature spec)

**Feature Branch**: `security-sweep`
**Dependencies**: Feature 004 (multiplayer networking), Feature 005 (client console), Feature 006 (match lifecycle & matchmaking), Feature 007 (player manual), Feature 010 (public lobby & match browser), Feature 013 (semantic URL routing), Feature 015 (developer debugging tools)

**Created**: 2026-10-11
**Last Updated**: 2026-10-11 (v1.0; amendment manifest for issues #152/#146/#129)
**Version**: 1.0
**Status**: Phases 1–4 complete (Gate 1 spec PASS incl. F-8 re-check; Gate 2 plan PASS); Phase 5 tasking drafted (`tasks.md`, pending Gate 3). No amendment in this manifest is yet implemented.

**Input**: Three P1 `security`-labeled issues from the 2026-09-10 code review — #152 (console WebSocket client robustness), #146 (guest-identity bearer path), #129 (`?ws=` override dead; routing/debug seams) — to be fixed together in ONE pull request.

## What this directory is

Per the binding product decision for this effort: **there is no new standalone feature spec and no new FRs live here.** Every requirement change is written into the existing spec file that owns it (amendment in place, version bump + dated changelog entry per each file's own convention). `specs/016-security-sweep/` exists only as the phase-artifact home for this work: this manifest, `clarifications.md`, and (in later phases, not created here) `plan.md`/`tasks.md`.

## Spec-consistency ruling (the heart of #146)

The specs consistently said — spec 006 FR-013/FR-016, spec 010 FR-024/FR-038 and v1.11, spec 004 v1.4 — that a `GuestPlayerId` is **non-secret correlation data** that grants **no** authority, and that every privileged action requires server-bound bearer proof. As of the 2026-10-11 amendment, the shipped implementation nevertheless restored a grace-window identity from a bare id claim (`restoreIdentity` in `packages/matchmaking/src/internal/identityRegistry.ts`, called from `packages/matchmaking/src/internal/lobbyService.ts`), and handle rename/seat release then rode that restored binding — the pre-sweep state this manifest records.

**Verdict at amendment time (2026-10-11; historical record of the pre-sweep state): the implementation was wrong, not the prose intent.** The id stays non-secret and authority-free; the specs' own restore requirement (spec 010 FR-003/US1 AC-3) was simply missing the proof object it implicitly assumed — a browser reloading has no session token yet. The fix supplies that proof object: a per-identity **guest resume secret**, delivered only to the owning connection on the directed identity event, stored by the browser beside the id, and required for restore/rename/release. The prose at every previously contradictory site was made precise in the same change set ("non-secret" classifies the id only); no site was weakened to match the buggy implementation.

## Amendment manifest

| # | Requirement(s) | Owning spec (new version) | Delta | Issue |
|---|---|---|---|---|
| A-01 | FR-026 (new) | `004-multiplayer-networking` v1.11 | Wire surface: additive optional `resumeSecret` on `GuestIdentityClaim` (client→server) and directed-`identity` `IdentityState` (server→client), both contract mirrors + conformance pins; CSPRNG entropy; owner-only directed delivery; absent-tolerant; no `NETWORK_API_VERSION` bump | #146 |
| A-02 | FR-027 (new; 2026-10-11 Gate 2 carve-out) | `004-multiplayer-networking` v1.11 | A `GuestPlayerId` alone authorizes nothing (restore, rename, seat ops, eviction, forfeit); id-only claims are advisory → mint fresh. Sole exception (D10): same-connection idempotent refresh on an active identity — authority is the pre-existing connection binding, never the id; all other connections and all grace-window claims still mint fresh | #146 |
| A-03 | v1.3 clarification bullet (was line 131) | `004-multiplayer-networking` v1.11 | Precision: "non-secret" classifies the correlation id only; restore/rename/leave authority is the v1.11 resume secret or the connection's existing server-bound session/seat bearer credential (spec 010 FR-043) — never the id | #146 |
| A-04 | FR-028…FR-036 (new) | `005-client-console` v1.11 | Issue #152 findings: promise-settling sends (C-022), bounded/pruned seq→actionId correlation (C-023), mount/teardown race re-check (C-024), configurable establish timeout with honest status (C-025), inbound frame validation incl. nested `lobbyEvent` (C-055), per-instance client state incl. seat-token isolation (C-055), stale-socket guards on all handlers, allocation-free copy-on-write rehydration, `never`-sink exhaustiveness | #152 |
| A-05 | FR-037 (new) | `005-client-console` v1.11 | Production bootstrap installs no `window.__europa*` debug globals; test-only boot modes or explicit sentinel only; handles never expose bearer values (policy home: spec 015 FR-019) | #129 |
| A-06 | FR-038 (new) | `005-client-console` v1.11 | Public barrel exports no `@internal` declaration — specifically the `ConsoleRuntime` **interface** re-exported as `ConsoleRuntimeContract` (the `ConsoleRuntime` **class** embedding export is expressly retained); removal is a breaking public-surface change → `CONSOLE_API_VERSION` bump required in the same change set | #129 |
| A-07 | Implementation Note 17 | `005-client-console` v1.11 | Corrects the note to shipped truth at amendment time — `CONSOLE_API_VERSION` **0.4.1**, `minCellPx` **32** (the old "0.2.0 / 12→16" text marked historical) — and, because the same change set bumps the literal to **0.5.0** per A-06/FR-038, updates Note 17's shipped-literal clause to 0.5.0 via a dated v1.11 sub-entry so the note stays truthful post-merge (Gate 3 Q2, constitution IV) | #129 |
| A-08 | v1.11 verification standard | `005-client-console` v1.11 | Every FR ships a targeted test that fails pre-fix; `pnpm verify` green; agent-browser smoke against `pnpm host` (connect, fail-soft on bad `?ws=`, lobby recovery, no console errors) | #152/#129 |
| A-09 | FR-018 (new; 2026-10-11 Gate 2 carve-out) + FR-016 conformance record | `006-match-lifecycle-matchmaking` v1.8 | Matchmaking mints/delivers/requires the resume secret for grace-restore/rename/release; active holder superseded only by matching secret (supersession = secret rotation + immediate lobby-binding/spectator-subscription eviction, per the 2026-10-12 sub-entry — socket severing stays the match-server's single-seat re-claim semantic); bare-id claims mutate nothing (recorded as the fix for the shipped FR-016 non-conformance); secret regenerated per successful restore. Same-connection idempotent refresh excepted (D10, mirrors A-02): binding authority, not id authority; other connections and grace unaffected | #146 |
| A-10 | FR-013, v1.2, v1.6 bullets | `006-match-lifecycle-matchmaking` v1.8 | Precision: non-secret covers ids only; resume secret joins session/reconnect/seat tokens as bearer credentials | #146 |
| A-11 | FR-004a, 012-FR-014 + v1.8 review obligation | `007-player-manual` v1.8 | Credential-boundary list gains the resume secret; mandatory same-change-set review of `lobby.mdx`/`quick-start.mdx` resume wording (surveyed 2026-10-11: wording compatible; edits conditional on implemented behavior) | #146 |
| A-12 | FR-003 (amended) | `010-public-lobby-match-browser` v1.13 | Browser stores the resume secret beside the id and presents it as restore proof; secret never displayed/URLed/logged | #146 |
| A-13 | FR-040…FR-043 (new) + SC-017 (new, in the Success Criteria list) | `010-public-lobby-match-browser` v1.13 | Mint at establishment; owner-only directed-event delivery; required for restore/rename/release; bare-id advisory in every state incl. grace; active supersession only with matching secret; rename/leave reject id-only credentials without ID-existence disclosure; documentation/privacy check rejects the secret like any credential; `data-model.md` §4 updated to `{ guestPlayerIdClaim, resumeSecret, handle }` with the `lobby-storage.ts` JSDoc named as a same-change-set implementation obligation | #146 |
| A-14 | Edge case (was 121), NFR-003, FR-024, v1.6/v1.7/v1.11 bullets, entity + implementation notes | `010-public-lobby-match-browser` v1.13 | Precision sweep: every "non-secret id" statement scoped to the id; resume secret named as the owner-only counter-example; v1.6 delivery channel extended to carry the secret | #146 |
| A-15 | FR-025 (rewritten) | `013-semantic-url-routing` v1.5 | `?ws=` honored in production boots: bootstrap captures the query BEFORE `stripProductionQuery()`; correctness must not depend on the `history.replaceState` test patch; direct-match seam narrows to `window.__europaTestMatch`; `?live`/`?match=`/`?name=`/`?token=` query consumption in `live-runtime.tsx` deleted (bearer-in-URL prohibited by FR-016); `mountLobbyRuntime` compat export deleted | #129 |
| A-16 | FR-034, FR-035 (new), AC-018…AC-020 (new), Change Log row | `013-semantic-url-routing` v1.5 | One exported `returnTo` validator (single decode; divergent duplicate removed); test-patch scoping (patches live in the fixtures that need them, never load-bearing for production); acceptance criteria for both | #129 |
| A-17 | FR-019, FR-020 (new) + AC rows + v1.1 clarifications | `015-developer-debugging` v1.1 | Policy home for console debug/test globals and test-patch scoping (enforced by spec 005 FR-037 and spec 013 FR-035/AC-020); player-facing seed Debug section untouched | #129 |

## Cross-cutting decisions recorded in the amendments

1. **Both credentials are required, not either/or** (spec 010 v1.13 rationale): the seat token does not exist before a seat is claimed, so it cannot cover pre-seat lobby-identity restore; the resume secret covers identity lifecycle, and session/reconnect/seat tokens keep covering their existing surfaces.
2. **Additive wire change, no `NETWORK_API_VERSION` bump** (spec 004 v1.11): same ruling pattern as the `detail` (v1.3) and `guestPlayerId` (v1.6) additions. Old clients sending id-only claims degrade gracefully to mint-fresh (establishment never fails).
3. **Honest conformance record** (spec 006 v1.8): the spec records that the shipped restore path violated its own FR-016 rather than pretending the prose always matched the code.
4. **One policy, three enforcement points** for debug globals (spec 015 v1.1): policy in 015, implementation duty in 005 FR-037, routing-surface enforcement in 013 AC-020.

## Verification standard (applies to the whole sweep)

- `pnpm verify` (or `bash scripts/verify.sh`) green across all packages — the single CI-equivalent local gate (AGENTS.md rule 6).
- A targeted unit/component test per acceptance criterion in the amended FRs (listed in spec 005 v1.11's verification standard; specs 010 SC-017, 013 AC-018…AC-020, 015 AC rows).
- An `agent-browser` smoke of the console against `pnpm host`: lobby connect, `?ws=` fail-soft on a bad override, match entry, lobby recovery, zero page-console errors.

## Out of scope for this effort

- Accounts, authentication, persistence, secret rotation UX, cross-device identity (spec 010 FR-015/Out of Scope unchanged).
- Any wire-breaking protocol change or `NETWORK_API_VERSION` bump.
- Changes under `europa-source/` (SOS license; reference only — untouched).
- Player-manual content edits in this phase: spec 007 v1.8 records the mandatory review obligation; the implementation change set owns any page edits (FR-012).
- Planning/tasking artifacts: `plan.md` (Phase 4) and `tasks.md` (Phase 5) now exist in this directory as phase artifacts; this manifest remains the requirement home and defines zero FRs.

## Change Log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-11 | Initial amendment manifest for issues #152/#146/#129 (security-sweep). Amends specs 004 (v1.11), 005 (v1.11), 006 (v1.8), 007 (v1.8), 010 (v1.13), 013 (v1.5), 015 (v1.1) in place; no standalone FRs. Includes the #146 spec-consistency ruling and the shared verification standard. |
