# Tasks: Public Lobby & Match Browser

Tasks are Phase 6 implementation work only. They are dependency ordered; `[P]`
means the task is safe to perform in parallel with other tasks in its block.

## Identity-visibility correction tasks (planned on `013-relaxed-player-id-visibility`)

These tasks correct stale privacy assertions only. They do not create a Feature
013 specification, add runtime behavior, or change protocol versions.

- [x] C-001: [P] Audit tracked specs, contracts, READMEs, source comments, manual pages, orchestration notes, and tests against the approved policy; produce a path-by-path residual list classifying ID correlation, handle preference, bearer credential, private-match, and fog assertions.
- [x] C-002: [P] Update Feature 010 contract/data-model prose and affected Feature 002/004/006/011/012 cross-references to distinguish non-secret IDs from bearer credentials while preserving protocol shapes, authority, private-match existence, and fog semantics.
- [x] C-003: [P] Correct contradictory matchmaking/networking source JSDoc/comments, including identity, session, seat, lobby projection, and public-entry descriptions; state that client claims remain advisory and server authority is unchanged.
- [x] C-004: Amend `check-documentation-privacy.mjs` to allow ID names and representative non-secret ID values on approved surfaces while rejecting credential values and credential-bearing URLs/logs/docs examples; retain handle/lifecycle checks.
- [x] C-005: Add checker fixtures or an equivalent focused harness proving non-secret guest/player IDs pass and `sessionToken`/`reconnectToken` values plus credential-bearing URLs fail, without tracking live credentials.
- [x] C-006: [P] Replace old matchmaking/networking test assertions that equate ID presence with a leak with positive correlation assertions; retain forged identity/seat/order, cross-connection, private-match, fog, and bearer-credential negative coverage.
- [x] C-007: [P] Update root/package READMEs and applicable manual/operator/API wording for handle-first labels, generic/ID fallback, non-secret correlation, and the credential boundary; preserve private-match and fog guidance.
- [x] C-008: Run the targeted residual sweep and contract/conformance checks; relabel historical old-policy notes rather than leaving normative contradictions. **Complete on 2026-08-31** — see `quickstart.md` “C-008 residual sweep” and `orchestration.md`.
- [x] C-009: Run checker/security suites, existing private-match scenarios, and the 500-tick fog audit, then `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, relevant tests, build, and docs checks; record results in `quickstart.md`. **Complete on 2026-08-31** — see the C-009 validation record.
- [x] C-010: Review against Feature 010 FR-002/003/020/021/023/024/026/027 and NFR-003/004, constitution, and AGENTS.md; confirm the Phase 4–5 diff contains planning artifacts only and commit conventionally. **Complete on 2026-08-31** — final review and command results are recorded in `quickstart.md` and `orchestration.md`.

## Contracts and foundations

- [x] T-001: Add typed identity, public projection, error, and lobby event contracts in `packages/matchmaking/src/contracts/`, preserving branded-ID and readonly conventions; add compile-time contract witnesses.
- [x] T-002: Add the additive lobby wire message contracts to both canonical networking contract copies, document version/unknown-message behavior, and extend networking conformance fixtures without changing gameplay payloads.
- [x] T-003: [P] Add the feature-010 server API/event contract artifacts to the package barrels and verify exports with strict typecheck programs.
- [x] T-004: [P] Add focused test fixtures/builders for identities, handles, lobby snapshots, and fake matchmaker/network bridges; do not weaken existing test tsconfig policy.

## Server identity and matchmaking integration

- [x] T-005: Implement Unicode-aware handle validation/normalization and an in-memory identity registry with atomic create, rename, claim, disconnect, grace release, and close behavior; unit-test all validation and duplicate races.
- [x] T-006: Extend matchmaking records/associations so the authoritative identity and accepted handle follow `PlayerSession`, `SeatRecord`, waiting/start/terminal/reconnect transitions without exposing the opaque ID.
- [x] T-007: Implement the server lobby facade for identity setup, subscribe, public projection, create, join, spectate, leave, and recoverable error mapping; delegate settings/capacity/start/cleanup to feature 006.
- [x] T-008: [P] Add matchmaker lifecycle bridge publication for create, fill, start, collect, disconnect, reconnect, and expiry; assert monotonic revisions and no stale/finished lobby entries.
- [x] T-009: Add server-authority tests proving forged identity/handle/seat/order claims cannot reassign authority, including 100 orders and at least 10 concurrent conflicting handle/final-seat requests.

## Networking transport and browser client

- [x] T-010: Extend the networking server state machine/dispatcher with lobby identity, handle, subscription, create, join, spectate, leave, and lobby-event messages; preserve heartbeat, reconnect, spectator, and gameplay behavior.
- [x] T-011: Add lobby protocol validation/error tests, old gameplay-client compatibility tests, malformed/unknown message tests, revision ordering tests, and reconnect credential mismatch tests.
- [x] T-012: Implement the browser lobby transport client with local-storage claim/handle persistence, snapshot revision handling, action correlation, disconnect/retry behavior, and no identity leakage in URLs or logs.
- [x] T-013: [P] Add transport integration tests for create/join/spectate transitions, stale action races, full/unavailable matches, server restart, and spectator zero-order behavior.

## Console and host flow

- [x] T-014: Add lobby reducer/store/effects and semantic route transitions beside the existing match store, with explicit loading/error/retry/return states; keep the `?e2e` harness separate from production routing and treat the retired live query as a recovery case.
- [x] T-015: Build the accessible landing UI: identity/rename form, create settings form, public match rows, Join/Spectate actions, occupancy/status/settings labels, empty state, focus management, and live-region announcements.
- [x] T-016: Wire authoritative handles into waiting/live seat labels and ensure player/spectator UI and client diagnostics treat IDs as non-secret correlation data while preserving credential, order, and fog visibility rules.
- [x] T-017: Refactor `pnpm host` to serve the lobby by default without `prepareMatch()`, retain explicit create flow, `/version`, security headers, configurable ports, graceful shutdown, and self-host diagnostics.
- [x] T-018: [P] Add console unit/component/a11y tests for identity persistence, validation, rows, transitions, failures, focus, announcements, keyboard-only use, handle-preference, and safe identity correlation.
- [x] T-019: Add real two-browser E2E coverage for create→join→first tick, lobby updates, waiting→running action changes, spectator read-only entry, return-to-lobby, reconnect, and server restart recovery.

## Documentation and operational checks

- [x] T-020: [P] Update README and developer/operator/self-hosting/API guidance for the lobby default, guest identity/handle contract, authoritative association, reconnect/order/view behavior, and in-memory reset boundary; distinguish non-secret IDs from bearer credentials.
- [x] T-021: [P] Update the player manual (index/quick-start/reading-the-screen plus a lobby page if needed) for handle setup, rename/validation, create/join/spectate, participant labels, reconnect, and failure states; update Pages path gates only when necessary.
- [x] T-022: Add documentation and privacy-boundary validation (grep/checklist or test) proving required surfaces describe handles and do not expose bearer credentials or hidden match/game state; non-secret opaque guest IDs remain permitted for correlation; update specs/implementation notes if behavior clarifies an existing contract.

## Wave 1 review remediation (code-quality-reviewer, 2026-08-25)

- [x] R-001: Correct `LobbyActionId` normative ownership comments in `packages/matchmaking/src/contracts/lobby-types.ts` and `tests/fixtures/lobbySnapshots.ts` to client-generated/server-echoed (review F-1); also fix the fixture JSDoc `undefined`-override recipe that fails under `exactOptionalPropertyTypes` (review F-5).
- [x] R-002: Add mutual-assignability pins `LobbyMatchSettings ≡ MatchSettings` and `LobbyTerrainSettings ≡ GenerationSettings` to matchmaking's conformance program (review F-2).
- [x] R-003: Add optional `detail` to the wire `error` LobbyEvent variant in BOTH canonical networking contract copies (byte-identical) + conformance coverage; amend `specs/010…/contracts/lobby-wire.md` and spec.md Clarifications in the same change set — required by US3 AC-4 field-specific feedback (review F-3; PM ruling 2026-08-25).

## Discovered during Wave 2b

- [x] R-005 (W2 review, blocking): matchmaking core seams — (a) implement filling-phase `leaveMatch` seat release in `matchmaker.ts` (feature-006 US3 AC-3 debt; the stub throws today, so facade `leave()` crashes — amend spec 006 Implementation Notes same change set); (b) additive `registerLifecycleListener` on the real matchmaker (exists only in the test fake); (c) expose a composition seam for lobby wiring (status-bus subscription + store match lookup accessor); (d) re-scoped R-004: additive optional `guestPlayerId`/`acceptedHandle` on `CreateMatchRequest`/`JoinMatchRequest` + session-creation pass-through so identity actually reaches records (FR-019); (e) per-field settings-rejection `detail` enrichment (US3 AC-4 chain). Spec 006 amendments in same change set.
- [x] R-006 (W2 review, after R-005): facade recomposition — single projection path (absorb/compose `createLobbyPublication`: ONE revision counter, ONE ledger; reap ghost waiting rows via terminal events), new `connectionClosed(connectionId)` teardown API (unbind + unsubscribe + registry disconnect/grace + spectator presence release), pass identity through create/join delegations, wire rename → `propagateHandleRename`, release prior identity on re-establishment overwrites, drop redundant brand cast (`lobbyService.ts:532`), fix stale composition JSDoc, spectate() ledger-trust comment, real-matchmaker integration tests (leave, lifecycle fan-out fill→finish clears presence/drops row).
- [x] R-007 (W2 review, parallel-safe): handle-validation hardening + mirror pin — reject bidi controls (U+202A–U+202E, U+2066–U+2069) and lone surrogates in `handleValidation.ts`; update fixture corpora/tests; spec 010 Clarifications v1.5 same change set; add missing `detail?` to local `LobbyEvent` error variant in `src/contracts/lobby-types.ts` (match networking's canonical copy per v1.3) + cross-package witness pinning matchmaking LobbyEvent/IdentityState/PublicLobbyEntry ↔ networking wire declarations.
- [x] R-008 (W2 review, blocking gate item): narrow matchmaking `vitest.config.ts` coverage exclusion of `src/internal/**` to pure record-shape files so validation/registry/facade/publication count toward the ≥80% constitution gate.
- [x] T-024 note: wire `tests/lobby-conformance.test.ts` runtime witnesses into a script/CI step (build lib → targeted vitest run, console precedent). Verified manually during Wave 1; retained as a known CI follow-up outside this feature's documentation scope.

## Final verification

- [x] T-023: Run focused package coverage and ensure all new game/lifecycle logic meets ≥80% statements, branches, functions, and lines without lint/type suppressions. (All three packages pass coverage thresholds: matchmaking 375 tests, networking 281 tests, console 468 tests — all ≥80% on all metrics)
- [x] T-024: Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, complete package tests, E2E, build, bundle/self-host smoke, 50-cycle cleanup soak, 10 reconnect/spectator trials, and record results in the feature quickstart/implementation notes. (All gates green: typecheck ✅, lint ✅, format ✅, matchmaking 375/375, networking 281/281, console 468/468, E2E 15/15, selfhost PASS, bundle 94KB gz < 150KB)
- [x] T-025: Review the diff against FR-001..FR-027, NFR-001..NFR-005, SC-001..SC-011, out-of-scope exclusions, constitution, and AGENTS.md; verify no application implementation begins before this plan/tasks approval gate. (All requirements satisfied; spec status Implemented 2026-08-26; zero suppressions/any; constitution/AGENTS.md aligned)

## Discovered during Wave 3a

- [x] R-009 (W3a, PM ruling — claim-provenance gap): the wire contract has NO server→client channel carrying the server-minted `guestPlayerId` (`IdentityState` = `{handle, hasIdentity}` only), so FR-002 (server assigns) + FR-003 (browser stores for reload-restore) are mutually unsatisfiable end-to-end. Fix: additive optional `guestPlayerId` on `IdentityState` in BOTH canonical contract copies (byte-identical, cmp-verified); facade/registry populates it on establish/setHandle projections; update compile-time privacy witnesses (identity-state now MAY carry the owner's id as a directed-to-owner channel; entries/snapshots/targets still MUST NOT); networking conformance transcription + fixtures updated; console client prefers server-delivered id and re-persists (local mint stays bootstrap-only), redact() covers the new field; matchmaking privacy scans adjusted (identity event legitimately carries it to the actor only — directed-delivery pinned by test); spec 010 Clarifications v1.6 (+ spec 004 note if its text claims identity-state never carries ids). Fold in: two remaining stale JSDoc comments in matchmaker.ts (~286 registerLifecycleListener doc, ~313–315 getMatch doc citing deleted lobbyPublication module).
- [x] R-010 (W3 review): wire `test:lobby-integration` into client-ci.yml (keepalive-precedent step; suite caught both W3 defects). Commit 5f8af91.
- [x] R-011 (W3 review): stale close()-defect comment in lobby-transport.test.ts corrected post-7c3e8cd. Commit 5e9cd75.
- [x] R-012 (W3 review, PM ruling): lobby-frame exemption from greeted-state gate documented normatively in lobby-wire.md (no security impact; bootstrap-before-hello is by design; joinMatch stays gated). Commit 8f7e75c.

## Discovered during Wave 4

- [x] R-013 (W4b/T-016 blocker): `EngineSessionInit.displayNames` exists in both server contracts but NO runtime code populates it — matchmaking autoStart registers matches without seat handles and networking's joinAck sends engine-world `"Player N"` placeholders, so live seat labels cannot show authoritative handles (FR-020/SC-008 gap; waiting-room labels are correct). Fix: thread `SeatRecord` handle snapshots into match registration so joinAck (and any resync player list) carries accepted handles; overlaying at the networking/registration layer (engine untouched). Also fix `scripts/test-selfhost.sh` remote-URL scan tripping on benign `'http://'` literals in dist (tokenize URLs + allowlist bare schemes). Commit 302cd80 (registration overlay seam: RegisterMatchRequest.displayNames optional + autoStart seat-order mapping + MatchChannel.joinAckPlayers() overlay at both joinAck sites; selfhost scan fixed).
- [x] R-014 (W4b/R-013 finding): 4 T-016 test files failing repo-wide `pnpm lint` — biome safe-fixes only, zero logic changes. Commit ceb48b7.
- [x] R-015 (W4c/T-018 defect): `LobbyRoot` in `src/internal/lobby-runtime.tsx` creates `liveHostRef` + `useState<LiveRegionAnnouncer>` but never renders a `<div ref={liveHostRef} />` — announcer is always null, all live-region announcements silently no-ops. Fix: add `<div ref={liveHostRef} style={{position:'absolute',width:0,height:0,overflow:'hidden'}}/>` as a sibling to LobbyLanding/MatchLegHost (mirror App.tsx's correct pattern). Commit a2656b5.
- [x] R-016 (W4 review security blocker): reject malformed, credential-bearing, and cross-host `?ws=` test/operator overrides before lobby identity setup; preserve same-host/loopback validation for the explicit override, with focused no-send tests. Commit b37b1bc.
- [x] R-017 (W4 review correctness blocker): distinguish pre-baseline lobby loading from a loaded-empty lobby with accessible `aria-busy` status and focused loading/empty transition tests. Commit 294f912.
