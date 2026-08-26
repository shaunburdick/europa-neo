# Orchestration Log: Public Lobby & Match Browser (Feature 010 / Issue #16)

## Status
- **Current Wave**: 2 review done (quality HOLD / security PASS-with-notes) → remediation R-005/R-007/R-008 parallel, then R-006; then Wave 3
- **Branch**: `issue-16-public-lobby`
- **Last Updated**: 2026-08-25

## Plan Summary

Extend matchmaking with a server-owned guest-identity registry + lobby facade,
add additive lobby wire messages to the networking contracts, build a browser
lobby client + accessible landing UI in the console package, and refactor
`pnpm host` to serve the lobby by default. Gameplay path (MatchClient, engine,
fog) unchanged. 25 tasks across 6 waves.

## Task Wave Progress

### Wave 1 — Contracts and foundations — ✅ Complete (commits 24fd87d, c74f9fb, 6acff38, 2dfa951 + remediation d432fc3, 61b0c26, 13140e3)
- T-001 matchmaking lobby contracts — ✅
- T-002 networking wire contracts (both copies byte-identical) — ✅
- T-004 test fixtures/builders — ✅
- T-003 barrels + typecheck witnesses — ✅
- R-001/R-002/R-003 review remediation — ✅ (spec 010 → v1.3: wire error `detail` ruling)

### Wave 2 — Server identity & matchmaking integration — 🔄 In Progress
- T-005 identity registry + handle validation/normalization — ✅ (8b31ee8; 37 tests; normalization ruling → spec Clarifications v1.4)
- T-006 records/associations carry identity through lifecycle transitions — ✅ (85a7ca9; 21 tests)
- T-007 server lobby facade — ✅ (92002a7; 44 tests; barrel: createLobbyService/createIdentityRegistry/IDENTITY_GRACE_MS_DEFAULT + 5 types)
- T-008 [P] matchmaker lifecycle bridge publication — ✅ (a220a2e; 21 tests; monotonic revisions, no stale entries, privacy leak scan)
- Integration post-2b: typecheck ✅ · matchmaking 294/294 ✅
- T-009 server-authority adversarial tests — 🔄 dispatched

### Wave 3 — Networking transport & browser client — ⏳ Pending
- T-010 server dispatcher lobby messages
- T-011 protocol validation/error/compat tests
- T-012 browser lobby transport client
- T-013 [P] transport integration tests

### Wave 4 — Console & host flow — ⏳ Pending
- T-014 lobby reducer/store/effects
- T-015 accessible landing UI
- T-016 authoritative handles in seat labels
- T-017 `pnpm host` refactor (independent of console UI files)
- T-018 [P] console unit/component/a11y tests
- T-019 two-browser E2E (last)

### Wave 5 — Documentation — ⏳ Pending
- T-020 [P] README + operator/API guidance
- T-021 [P] player manual updates
- T-022 privacy-boundary validation

### Wave 6 — Final verification — ⏳ Pending
- T-023 coverage gates (≥80% new logic, no suppressions)
- T-024 full gate run + soak/trials, record results in quickstart
- T-025 spec-diff review FR/NFR/SC + constitution/AGENTS.md alignment

## Decisions & Rationale
- 2026-08-25: T-003 moved after T-001/T-002 despite `[P]` marker — barrel
  exports reference types created by T-001/T-002; file-overlap rule overrides.
- 2026-08-25: Security-auditor dispatched at Wave 2 and Wave 3 checkpoints
  (forged claims, handle races, identity leakage are security-sensitive).

## Blockers & Escalations
- (none yet)

## New Tasks Discovered
- R-005..R-008 (W2 review, see tasks.md "Discovered during Wave 2b"): matchmaking core seams (leaveMatch impl, lifecycle listener, composition seam, identity pass-through, settings detail), facade recomposition (single projection path + connectionClosed API), handle hardening (bidi/surrogates + local mirror detail + cross-package witness), coverage-exclusion narrowing. R-006 depends on R-005; R-007/R-008 parallel-safe.

## Review Findings
- Wave 1: PASS-with-notes → R-001/R-002/R-003 all remediated. Outstanding folds: F-4 dispatcher default-arm wording → T-010; latent TS2313 in networking conformance helper → T-011 (use matchmaking's nested-conditional pattern).
- Wave 2: code-quality-reviewer **HOLD** + security-auditor **PASS-with-notes** → ALL findings remediated via R-005 (227d97f), R-007 (2dc2f42), R-008 (5595ff6), R-006 (fcdb5e2, ABSORB: lobbyPublication.ts deleted, single diff-gated recomputeAndPublish, LobbyConnectionTeardown.connectionClosed API shipped). Post-W2: matchmaking 365/365 (45 files), coverage gate green on all internal modules.

### Wave 3 — Transport & browser client — ✅ Complete (2026-08-26)
- 3a: T-010 d03e111 ∥ T-012 e733a4f ∥ micro d30b0ae. R-009 claim-provenance ruling (a625d64+b224cb7+34a4332): optional guestPlayerId on IdentityState both copies = FR-003 delivery channel via directed identity event; witnesses updated; spec v1.6.
- 3b: T-011 2665866 (43 tests; TS2313 helper fixed) ∥ T-013 71ffbe3 (9 real-stack integration tests + test:lobby-integration script).
- Defects found by T-013, both FIXED: setHandle never settles → client settles on directed identity event alone (1b3fcb7); Server.close() left lobby-only sockets open → drains ALL with 1001 (7c3e8cd).
- Review: code-quality PASS-with-notes + security PASS-with-notes. Remediated: R-010 CI wiring (5f8af91), R-011 stale comment (5e9cd75), R-012 greeted-gate exemption documented (8f7e75c, PM ruling: document don't gate).
- Final state: matchmaking 370 · networking 275 · console unit 350 · lobby-integration 9/9 · all typechecks clean.
- Accepted-as-noted: concurrent-rename interim resolution (in-code doc); fan-out amplification O(subs×entries) + lazy GC residency (self-host scale OK); superseded connections discover loss via identity_invalid on next action.

### Wave 4 dispatch invariants (fold into T-014..T-019 prompts)
1. Render-boundary privacy: UI renders handle ONLY — guestPlayerId must never reach DOM/URLs/logs; component test must prove it (mirror raw-bytes scan at render boundary).
2. Handles are hostile-but-valid: render inside `<bdi>` (or unicode-bidi isolate) everywhere participant labels appear (T-015/T-016).
3. Superseded-session UX: a connection whose claim was taken over discovers loss via identity_invalid on next action — surface a sensible "session moved elsewhere" state (T-014/T-015).
4. Any new IdentityState wire-projection site extends the witness set (byte-identity + AssertKeyAbsent + indexed-access pins stay green).
5. FR-026/FR-027 docs obligations ride Wave 5 (no user-facing surface until landing UI ships in W4).
6. Direct live-test routes (?live&ws=&match=&name=) MUST keep working unchanged (compat).

## Wave 3 dispatch invariants (from security audit — fold into T-010/T-011 prompts)
1. Dispatcher MUST call new `connectionClosed(connectionId)` on socket close (R-006 delivers the API).
2. Exactly ONE projection/revision stream reaches the wire (R-006 resolves).
3. Do not ship `lobbyLeave` mapping until leaveMatch works / facade isolates (R-005 fixes root).
4. `ServerDeps.matchmaker` composition MUST include facade bridge handlers via the real lifecycle listener (R-005 exposes).
5. `guestPlayerId` is a bearer secret: input-only; never in logs/URLs/errors/outbound frames except client's own claim field.
6. `LobbyActionId`: client-generated, echoed only on the matching response, never broadcast/persisted server-side.
7. Per-connection rate limiting on lobby messages (esp. lobbyIdentity mint-on-miss, lobbySetHandle O(n)); reuse feature-004 rate-limit + maxPayload cap.
8. Directed `identity` events must reach connections that haven't subscribed (reconcile with network-types wording).
9. Handles are hostile-but-valid: `<bdi>` isolation in UI (T-015/T-016), escape in logs.
10. Upstream error `detail` flows to clients verbatim — must stay credential-free forever.
