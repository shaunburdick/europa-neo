# Orchestration Log: Player-ID Visibility Policy Correction

## Status
- **Current Wave**: Wave 2 — policy and harness corrections complete
- **Branch**: `013-relaxed-player-id-visibility`
- **Last Updated**: 2026-08-30

## Plan Summary
Correct stale claims that player IDs are private. IDs are non-secret correlation
data and may appear on existing wire, URL, state, logging, diagnostics, and
documentation surfaces. Handles remain preferred UI labels, while bearer
session/reconnect credentials, private-match existence, server authority, and
fog-of-war boundaries remain protected.

## Task Wave Progress

### Wave 1 — Residual audit — ✅ Complete
- C-001: residual assertion audit — ✅ complete; path-by-path inventory is in
  `quickstart.md` under “C-001 residual audit”. No application source or test
  files were changed.

### Wave 2 — Policy and harness corrections — ✅ Complete
- C-002, C-003, C-004, C-007 — ✅ complete

### Wave 3 — Focused test corrections — ✅ Complete
- C-005, C-006 — ✅ complete

### Wave 4 — Integration verification — ⏳ Pending
- C-008, C-009, C-010

## Decisions & Rationale
- 2026-08-30: Treat this as a correction to existing Feature 010 and
  cross-references, not a new feature specification.
- 2026-08-30: Player IDs are non-secret identifiers; bearer credentials remain
  security-sensitive.

## Blockers & Escalations
- None.

## New Tasks Discovered
- None.

## Review Findings *(historical snapshots unless marked current)*
- C-001 found stale ID-secrecy assertions in networking/matchmaking contracts,
  console comments, and negative tests; mixed private-match wording in the
  012 cross-reference; and one historical PM handoff note. Aligned surfaces
  already distinguish ID correlation, handle preference, bearer credentials,
  private-match existence, and fog boundaries.
- **Superseded snapshot:** Wave 2 integration reported checker, typecheck, lint,
  and format checks passed and listed C-005/C-006/C-008–C-010 as pending. The
  current task intentionally does not change checker implementation or tests;
  current verification status is recorded separately in the final delivery
  report.
- Review HOLD items were remediated: Feature 004 mirrors synchronized, MatchId
  admission wording clarified, stale console comments corrected, checker
  allow/deny harness added, and ID security assertions updated. Commits
  `4df2eb3`, `b747764`, `6727836`, and `ffdba6c` landed.
