# Orchestration Log: Public Lobby & Match Browser (Feature 010 / Issue #16)

## Status
- **Current Wave**: Complete — PR ready
- **Branch**: `issue-16-public-lobby`
- **Last Updated**: 2026-08-26

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

### Wave 2 — Server identity & matchmaking integration — ✅ Complete
- T-005 identity registry + handle validation/normalization — ✅ (8b31ee8; 37 tests; normalization ruling → spec Clarifications v1.4)
- T-006 records/associations carry identity through lifecycle transitions — ✅ (85a7ca9; 21 tests)
- T-007 server lobby facade — ✅ (92002a7; 44 tests; barrel: createLobbyService/createIdentityRegistry/IDENTITY_GRACE_MS_DEFAULT + 5 types)
- T-008 [P] matchmaker lifecycle bridge publication — ✅ (a220a2e; 21 tests; monotonic revisions, no stale entries, privacy leak scan)
- T-009 server-authority adversarial tests — ✅ (f687f0b; 26 tests; 100-action storm, ≥10 concurrent handle/seat races)
- R-005..R-008 review remediation — ✅ (227d97f, 2dc2f42, 5595ff6, fcdb5e2: ABSORB lobbyPublication, single projection path, connectionClosed API, handle hardening, coverage gate)
- Post-W2: matchmaking 365/365 (45 files), coverage gate green on all internal modules

### Wave 3 — Networking transport & browser client — ✅ Complete (2026-08-26)
- 3a: T-010 d03e111 ∥ T-012 e733a4f ∥ micro d30b0ae. R-009 claim-provenance ruling (a625d64+b224cb7+34a4332): optional guestPlayerId on IdentityState both copies = FR-003 delivery channel via directed identity event; witnesses updated; spec v1.6.
- 3b: T-011 2665866 (43 tests; TS2313 helper fixed) ∥ T-013 71ffbe3 (9 real-stack integration tests + test:lobby-integration script).
- Defects found by T-013, both FIXED: setHandle never settles → client settles on directed identity event alone (1b3fcb7); Server.close() left lobby-only sockets open → drains ALL with 1001 (7c3e8cd).
- Review: code-quality PASS-with-notes + security PASS-with-notes. Remediated: R-010 CI wiring (5f8af91), R-011 stale comment (5e9cd75), R-012 greeted-gate exemption documented (8f7e75c, PM ruling: document don't gate).
- Final state: matchmaking 370 · networking 275 · console unit 350 · lobby-integration 9/9 · all typechecks clean.

### Wave 4 — Console & host flow — ✅ Complete
- T-014 8566f31: headless lobby state layer (reducer/store/controller/view) + 59 tests
- T-015 7b41486: accessible landing UI (identity/rename, create, match rows, Join/Spectate, empty/loading/error/superseded states, focus/live-region, `<bdi>`)
- T-016 8a5de54: authoritative seat labels (waiting own-handle/occupancy, deriveSeatLabels, ParticipantStrip, spectator full-visibility read-only path)
- T-017 eda642d: `pnpm host` defaults to empty lobby, `--create` retains quick flow, `/version`, security headers, sanitization
- T-018 18801e9 + R-015 a2656b5: focus/keyboard/a11y tests (9 new), announcer host div mounted
- T-019 b65f70c: 6 real-stack Playwright scenarios (create/join/tick, lobby updates, spectator read-only, return, reconnect, restart) + privacy/`<bdi>`/direct-route assertions
- R-013 302cd80: registration overlay for authoritative handles (RegisterMatchRequest.displayNames, autoStart seat-order mapping, MatchChannel.joinAckPlayers)
- R-014 ceb48b7: Biome safe-fixes on 4 T-016 test files
- R-016 b37b1bc: same-host/loopback `?ws=` override policy (rejects cross-host, credential-bearing, malformed)
- R-017 294f912: pre-baseline loading UI with `aria-busy`/polite status, empty only after real snapshot
- Post-W4: matchmaking 375 · networking 281 · console 463 unit / 63 component / 28 a11y · lobby-integration 9/9 · E2E 15/15

### Wave 5 — Documentation — ✅ Complete
- T-020: README + operator/API guidance (root, console, matchmaking, networking)
- T-021: player manual updates (index, quick-start, reading-the-screen, new lobby.md)
- T-022: privacy-boundary validator (check-documentation-privacy.mjs) + spec status → Implemented (2026-08-26), plan.md v1.6, quickstart validation command

### Wave 6 — Final verification — ✅ Complete
- T-023: coverage gates — all three packages ≥80% on all metrics (matchmaking 375, networking 281, console 468 tests)
- T-024: full gate run — typecheck ✅, lint ✅, format ✅, version:check ✅, build ✅, bundle 94KB gz < 150KB, selfhost PASS, E2E 15/15
- T-025: spec-diff review — all FR-001..FR-027, NFR-001..NFR-005, SC-001..SC-011 satisfied; constitution/AGENTS.md aligned; no suppressions/any

## Decisions & Rationale
- 2026-08-25: T-003 moved after T-001/T-002 despite `[P]` marker — barrel exports reference types created by T-001/T-002; file-overlap rule overrides.
- 2026-08-25: Security-auditor dispatched at Wave 2 and Wave 3 checkpoints (forged claims, handle races, identity leakage are security-sensitive).
- 2026-08-25: R-006 ABSORB chosen over compose — single diff-gated recomputeAndPublish, one revision counter, one ledger, one stream.
- 2026-08-25: R-009 claim-provenance gap resolved by directed identity event carrying guestPlayerId (server-minted, client-adopted) — wire contract amended v1.6.
- 2026-08-26: R-013 registration overlay chosen over engine mutation — authoritative handles at networking boundary, engine determinism untouched.
- 2026-08-26: R-016 same-host `?ws=` policy — security boundary without breaking local dev/ephemeral ports.

## Blockers & Escalations
- (none — all resolved in-wave)

## New Tasks Discovered
- R-005..R-008 (W2 review): matchmaking core seams, facade recomposition, handle hardening, coverage-exclusion narrowing — all remediated.
- R-009 (W3a): claim-provenance gap — resolved via directed identity event + guestPlayerId on IdentityState.
- R-010..R-012 (W3 review): CI wiring, stale comment, greeted-gate exemption — all remediated.
- R-013..R-017 (W4): registration overlay, Biome fixes, announcer mount, ws-origin security, loading state — all remediated.

## Review Findings
- Wave 1: PASS-with-notes → R-001/R-002/R-003 all remediated.
- Wave 2: code-quality-reviewer **HOLD** + security-auditor **PASS-with-notes** → ALL findings remediated via R-005/R-007/R-008/R-006.
- Wave 3: code-quality PASS-with-notes + security PASS-with-notes → R-010/R-011/R-012 remediated.
- Wave 4: code-quality HOLD (docs absent, spec Draft, loading state) + security HIGH (arbitrary `?ws=`) → T-020/T-021/T-022, R-016, R-017 remediated.
- All review blockers resolved in code.

## Final Verification Summary
- **Tests**: matchmaking 375 · networking 281 · console 468 (unit) + 63 (component) + 28 (a11y) · lobby-integration 9/9 · E2E 15/15 · keepalive 2/2
- **Gates**: typecheck ✅ · lint ✅ · format ✅ · version:check ✅ · build ✅ · coverage ≥80% all metrics ✅ · privacy validator ✅
- **Bundle**: 94,316 bytes gzipped < 150KB budget ✅
- **Self-host**: test-selfhost.sh PASS (no remote URLs, bundle within budget) ✅
- **Spec status**: Implemented (2026-08-26) ✅
- **Tasks**: T-001..T-024 checked, T-025 in progress (this review)
