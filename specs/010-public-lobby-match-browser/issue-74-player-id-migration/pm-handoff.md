# PM Handoff: Issue #74 Universal PlayerId Migration

**Status**: Phase 4–5 complete; awaiting plan/task approval before Phase 6.
**Branch**: `issue-74-numeric-playerid`.
**Behavioral source of truth**: approved amended specs 001, 002, 003, 004, 005,
006, 010, 013, and 015. No new behavioral spec was created.

## Artifact map

- Plan: `plan.md`
- Research and closed PR #113 findings: `research.md`
- Data model and lifecycle: `data-model.md`
- Contracts: `contracts/identity-contract.md`, `engine-contract.md`,
  `wire-contract.md`, `router-contract.md`
- Validation recipe: `quickstart.md`
- Ordered delivery map: `tasks.md`

## Delivery recommendation

Dispatch Waves 1–3 by package where `[P]` is marked and file ownership does not
overlap. Do not dispatch protocol, matchmaking, or console implementation before
the shared identity and engine contract decisions are landed. Wave 7 is the
security/replay/router cross-feature checkpoint; Wave 8 is the final quality and
documentation gate.

## Product-owner blocker

None known. The router contract uses the already-approved explicit
`/match/<matchId>/spectate` route and the existing Feature 013 mounted-route
contract; no new route decision is requested.
