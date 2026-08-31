# Orchestration Log: Player-ID Visibility Policy Correction

## Status
- **Current Wave**: Wave 4 — integration verification in progress (C-009 complete)
- **Branch**: `013-relaxed-player-id-visibility`
- **Last Updated**: 2026-08-31

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

### Wave 4 — Integration verification — ⏳ In progress
- C-008 — ✅ complete
- C-009 — ✅ complete; final validation is recorded in `quickstart.md`
- C-010 — ⏳ pending

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

## C-008 residual sweep (2026-08-31)

- The tracked repository-wide sweep found no active normative prohibition on
  non-secret guest/player IDs. Remaining matches are either the approved
  handle-first/private-existence/fog boundaries, protected bearer-token rules,
  or explicitly labelled historical inventory text. The one stale test comment
  naming a “no-ID rendering scan” was corrected to describe handle preference
  and safe identity correlation; no test assertion or runtime source changed.
- The approved local `pnpm host` tokenized-URL exception remains documented as
  a narrow operator convenience. Those URLs remain bearer secrets and are not
  generalized to public app URLs, logs, diagnostics, or documentation.
- Documentation/privacy checker: PASS (4 player-facing and 9
  implementation/spec surfaces). Executable checker harness: PASS (4 forbidden
  examples rejected).
- Matchmaking lobby conformance: PASS (6 tests); targeted matchmaking
  authority/identity/conformance: PASS (58 tests); networking contract/lobby
  conformance: PASS (32 tests); console conformance: PASS (9 tests) plus strict
  typecheck. Matchmaking and networking package typechecks also pass.
- The broader matchmaking `typecheck:conformance` remains a known unrelated
  baseline failure: its existing settings-mirror witness reports terrain
  `GenerationSettings` mirror drift at `tests/lobby-conformance.test.ts:305-306`
  (the current branch adds no runtime or C-008 contract change). It is recorded
  rather than altered under C-008's scope.

## C-009 validation (2026-08-31)

- All requested C-009 gates passed. The first E2E invocation was blocked by a
  stale Vite process from another worktree occupying port 5173; that process was
  terminated and the complete 17-test E2E suite passed on a clean retry.
- The console lobby preset now includes the existing server default
  `terrainSmoothing: 4`, required by the restored strict contract mirror. This
  is a type/conformance correction only; it does not change the effective
  matchmaking default or gameplay behavior.
- See the detailed command-by-command results in `quickstart.md`.
