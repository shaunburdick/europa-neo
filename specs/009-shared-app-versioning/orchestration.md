# Orchestration Log: 009-shared-app-versioning

## Status
- **Current Wave**: 1 (of 5)
- **Branch**: `009-shared-app-versioning` (off `main` @ f760f3b)
- **Last Updated**: 2026-08-25
- **Mode**: PM-driven orchestration; PO granted full delegation through PR-ready ("Dispatch and finish it up, let me know when a PR is ready") — NO per-wave user gates; single checkpoint at PR-open. Push + `gh pr create` authorized at that point; merging stays PO's decision.

## Plan Summary
Private zero-dep `@europa/version` workspace package exporting `APP_VERSION`; additive optional `appVersion` on server→client `HelloAckPayload`; unauthenticated `GET /version` on host static surface; HUD footer renders bundled constant; README header + manual index footer; CI drift check across all version surfaces; lockstep bump to **0.0.1** in this change set (**0.1.0 deferred to release issue #4**, PO ruling Clarifications v1.1). App version ≠ NETWORK_API_VERSION (independence test-pinned).

## Task Wave Progress

### Wave 1 — Foundation — 🔄 In Progress
- [ ] T-001 scaffold `@europa/version` — 🔄 dispatched
- [ ] T-002 pure drift-checker fn + unit tests — ⏳ pending (after T-001)

### Wave 2 — Consumers — ⏳ Pending
- [ ] T-003 wire field (BOTH HelloAckPayload contract copies, ONE commit)
- [ ] [P] T-004 /version endpoint · [P] T-005 HUD footer · [P] T-006 docs + AGENTS.md #6 scrub

### Wave 3 — Enforcement & companion specs — ⏳ Pending
- [ ] T-007 drift CLI + root script + SC-001 integration tests
- [ ] [P] T-008 logging taps · [P] T-009 companion spec amendments 004/005/007

### Wave 4 — Lockstep bump + CI gate — ⏳ Pending
- [ ] T-010 bump everything → 0.0.1 (single commit, incl. doc lines)
- [ ] [P] T-011 `.github/workflows/version-drift.yml`

### Wave 5 — Verification & state — ⏳ Pending
- [ ] T-012 repo-wide gates + AGENTS.md Current-state entry + spec status flip

## Decisions & Rationale
- (2026-08-25) Doc surfaces land at v0.0.0 (T-006) and flip with everything else at T-010 so the tree never fails its own checker mid-series.
- (2026-08-25) Reviewer strategy: code-quality-reviewer checkpoint after W2 and W5 (final); security-auditor once at final review (unauth `/version` already ruled acceptable by Clarifications v1.0 #1).
- (2026-08-25) Environment mitigation active: micro-task dispatches with exact paths; verify disk landings (`git log`, file existence) after every dispatch before proceeding.

## Blockers & Escalations
- None yet.

## New Tasks Discovered
- None yet.

## Review Findings
- (none yet)
