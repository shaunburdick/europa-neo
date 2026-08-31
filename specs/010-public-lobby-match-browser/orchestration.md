# Orchestration Log: Player-ID Visibility Policy Correction

## Status
- **Current Wave**: Wave 1 — residual audit
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

### Wave 2 — Policy and harness corrections — ⏳ Pending
- C-002, C-003, C-004, C-007

### Wave 3 — Focused test corrections — ⏳ Pending
- C-005, C-006

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

## Review Findings
- C-001 found stale ID-secrecy assertions in networking/matchmaking contracts,
  console comments, and negative tests; mixed private-match wording in the
  012 cross-reference; and one historical PM handoff note. Aligned surfaces
  already distinguish ID correlation, handle preference, bearer credentials,
  private-match existence, and fog boundaries. C-002–C-010 remain pending.
