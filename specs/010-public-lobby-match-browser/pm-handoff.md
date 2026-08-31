# PM Handoff: Public Lobby & Match Browser (Issue #16 / Feature 010)

**Date**: 2026-08-26
**Branch**: `issue-16-public-lobby` (worktree, based on current `main`)
**Status**: Historical Phase 6 handoff snapshot — implementation complete; superseded by the current branch's policy correction

> **Historical-policy notice:** This handoff was written for the original Feature 010 implementation. Its old ID-visibility statements are not normative. Current policy permits non-secret ID correlation, prefers handles in UI, and keeps bearer credentials, authority, private-match existence, and fog-of-war protected.

## Feature summary

Replace the hardcoded single-match startup flow with a public landing page:
ephemeral guest identity (browser-backed, opaque ID in localStorage), unique
server-side handles (trimmed, case-insensitive comparison, renamable), public
match list (waiting + in-progress), create/join/spectate, clean lobby⇄console
transitions with reconnect grace. In-memory only; no accounts/auth/persistence/
chat/ratings/history. Private matches explicitly deferred.

## Artifact paths (all exist, verified)

- Spec (v1.6, Implemented): `specs/010-public-lobby-match-browser/spec.md`
- Plan (approved v1.6): `specs/010-public-lobby-match-browser/plan.md`
- Research: `specs/010-public-lobby-match-browser/research.md`
- Data model: `specs/010-public-lobby-match-browser/data-model.md`
- Contracts: `specs/010-public-lobby-match-browser/contracts/`
- Tasks (25, T-001→T-025): `specs/010-public-lobby-match-browser/tasks.md`
- Quickstart: `specs/010-public-lobby-match-browser/quickstart.md`
- Orchestration log: `specs/010-public-lobby-match-browser/orchestration.md`
- Privacy validator: `specs/010-public-lobby-match-browser/check-documentation-privacy.mjs`

## Key architecture decisions (from plan.md)

1. Extend `@europa/matchmaking` with an identity registry + lobby facade;
   new contracts under `packages/matchmaking/src/contracts/` (dir does not
   exist yet — T-001 creates it). Existing `lobby.ts` is feature-006's
   filling-only projection; feature 010 generalizes it (adds in-progress
   listing for spectate).
2. Additive lobby wire messages to BOTH canonical networking contract copies
   under `packages/networking/src/contracts/` (network-types.ts,
   network-api.ts, matchmaking-to-networking.ts); byte-identity enforced by
   existing conformance suites. Gameplay payloads unchanged.
3. Browser lobby client over WebSocket beside the existing MatchClient path;
   match gameplay continues through the unchanged fog-filtered protocol.
4. `pnpm host` refactored: boots idle stack, serves lobby at `/`, explicit
   create action instead of `prepareMatch()` auto-fill.
5. No new runtime dependencies; localStorage holds only the opaque identity
   reference (not auth). **Superseded:** the original “IDs never appear in URLs
   or logs” wording. IDs are non-secret correlation data; bearer credentials
   remain protected. The temporary/local `pnpm host` operator flow is the narrow
   documented exception for printing tokenized join URLs, which must be treated
   as secrets and is not a general public-app URL pattern.

## Governing docs

- `AGENTS.md` (repo root) — working charter; binding decisions 1–6
- `.specify/memory/constitution.md` — ≥80% coverage merge gate on new logic,
  strict TS, no suppressions, specs-stay-truthful (manual updates in same
  change set per FR-012)

## Environment notes (hard-won)

- Subagents may silently die on long tasks — chunk into single-artifact
  micro-tasks, give exact verified paths, verify landings on disk.
- Tests are excluded from every package tsconfig by design; CI compensates
  with dedicated strict programs. Do not "fix" casually.
- Terrain placement requires default 32 board for generated matches.

## Final verification results (2026-08-26)

- **Tests**: matchmaking 375 · networking 281 · console 468 (unit) + 63 (component) + 28 (a11y) · lobby-integration 9/9 · E2E 15/15 · keepalive 2/2
- **Gates**: typecheck ✅ · lint ✅ · format ✅ · version:check ✅ · build ✅ · coverage ≥80% all metrics ✅ · privacy validator ✅
- **Bundle**: 94,316 bytes gzipped < 150KB budget ✅
- **Self-host**: test-selfhost.sh PASS (no remote URLs, bundle within budget) ✅
- **Spec status**: Implemented (2026-08-26) ✅
- **Tasks**: T-001..T-024 checked, T-025 complete (this review)
