# Open issues and active PR

GitHub snapshot: **2026-09-09**. [Notes index](README.md).

All nine open issues were reviewed, including their available comments. None
had an assignee or milestone at review time. Suggested next steps below are
review recommendations, not owner-assigned priorities or approved designs.

## Issue inventory

| Issue | Request | Current context and recommended next step |
| --- | --- | --- |
| [#26](https://github.com/shaunburdick/europa-neo/issues/26) | Reliable 64×64 terrain generation | Current lobby choices and host validation allow 32/48 only. Inspect `packages/terrain/src/generate.ts` and `validate.ts`; reproduce the reported seed failures against current code before choosing a remedy. Acceptance asks for >=95% success across 50 seeds while retaining 32/48 determinism and invariants. Constraint relaxation is only a proposal, requiring spec approval. |
| [#27](https://github.com/shaunburdick/europa-neo/issues/27) | Bot opponents and disconnected-seat takeover | Cross-cutting engine/controller, matchmaking, networking, and console work. Seeded deterministic decision-making and ordinary order validation are central. Difficulty, takeover timing, labeling, and surrender policy remain product questions. The issue's dependency on future 3–4-player support is historical: current code already has N-player E2E coverage. |
| [#39](https://github.com/shaunburdick/europa-neo/issues/39) | Harden/simplify Docker runtime packaging | Still relevant: the current runtime copies the whole packages tree and installs development dependencies to run `tsx` through `pnpm host`. The issue's discussion of generated-JS rewriting describes an earlier proposal, not the present Dockerfile. Define a stable compiled-host/SPA artifact contract and retain single-port route, version, and WebSocket smoke checks. |
| [#44](https://github.com/shaunburdick/europa-neo/issues/44) | Stop reserves-panel layout shifts | Relevant files are `packages/console/src/ui/reserves-panel.tsx` and `src/styles/index.css`. Label text changes with coordinates and percentages; its dedicated CSS sets font weight but no tabular-number styling. The panel now lives in the redesigned sidebar, so reproduce there first. Tabular numerals alone do not equalize strings with different digit counts. |
| [#48](https://github.com/shaunburdick/europa-neo/issues/48) | Change Name form/button disappears after saving | Original report names the former inline lobby identity form. Current `profile-view.tsx` deliberately shows a welcome/continue card for named users, with the input only in the unnamed state. Reconcile desired name-editing behavior with `specs/015-profile-route/spec.md`, then reproduce through `/profile`. Do not infer that the original bug is resolved simply because its component changed. |
| [#50](https://github.com/shaunburdick/europa-neo/issues/50) | Strategic resistance in production/flow | Active implementation exists in PR #109. The issue evolved from speed tuning to branch starvation and flow allocation. Coordinate with that PR; inspect current core formula, engine flow, terrain viability, console slope rendering, and manual together. |
| [#74](https://github.com/shaunburdick/europa-neo/issues/74) | Stable server-generated player IDs | Current definition is in `packages/core/src/types.ts`, not solely engine. Changes extend to compact owner arrays/tallies, order sorting, matchmaking seats, fog, protocol, console, fixtures, and serialization. The issue requests a breaking wire-version change and rejection of old numeric clients. Choose/benchmark the ID format and canonical ordering before implementation; generation belongs outside deterministic tick logic. |
| [#82](https://github.com/shaunburdick/europa-neo/issues/82) | Bundle composition analyzer | Local `pnpm analyze` and standalone self-contained HTML are requested; root currently has no analyzer script. Reconcile the two build targets: console uses Vite plus `tsc`, while design still uses tsup. The console budget is 153,600 gzip bytes in `test-selfhost.sh`; the separate design component budget is 20,480 bytes. Clarify which tsup output should be analyzed before choosing tooling. |
| [#83](https://github.com/shaunburdick/europa-neo/issues/83) | Reusable coordinated multiplayer harness | Existing `full-stack-n-players.spec.ts` already exercises 3/4 players alongside the two-player test, with real server/matchmaker wiring and per-seat assertions. The remaining request is reusable, composable setup/order/view/cleanup APIs. Clarify how the issue's per-seat PM2 wording relates to one shared authoritative match server. Polling for tick N observes wall-clock scheduling; it is not by itself exact controlled advancement to tick N. |

## Active flow work: PR #109

[PR #109 — equal-split pipe flow](https://github.com/shaunburdick/europa-neo/pull/109)
was the only open PR when reviewed:

- Branch: `issue-50-percentage-based-flow`.
- Head: `d2fad565d7a7a2f66daedd225234445d9020f389`.
- State: open, non-draft; GitHub reported `CLEAN` merge state.
- Reported checks: all returned non-skipped checks succeeded; Docker image tag
  publication was skipped. These are remote results, not local verification.
- It declares `Closes #50`.

The PR description proposes an equal-split outflow budget (`flowRate=12`),
scarcity allocation, and per-pipe slope modifiers. This differs from the issue
comment's earlier percentage-of-source proposal, despite the branch name.
It changes core, engine, console, terrain, design comments, and spec 001 artifacts.

Its prerequisite troop-conservation fix, [PR #103](https://github.com/shaunburdick/europa-neo/pull/103),
was merged on 2026-09-08 as `498bbef72359f24e81e3ffc92bfe4765f1a1c4cf`
and is present in this checkout.

### Review points before related work proceeds

1. Reconcile flow behavior with the newer biome/flow requirements in spec 024.
   Current main already uses a different uphill curve from older spec 001 prose.
2. Update the player manual in the gameplay change set. The reviewed PR file
   list contains no `docs/manual/` changes, while spec 007 FR-012 requires them.
3. Review companion console/terrain requirements as well as spec 001; the API
   and visual/terrain consumers all depend on the formula.

The PR implementation diff was not exhaustively audited. These points derive
from its description/file list and comparison with the checked-out main source.

## Suggested follow-up order

1. Coordinate #50/#109 and correct the flow documentation discrepancies.
2. Reproduce the two small UI reports (#44 and #48) against current routes/layout.
3. Scope the terrain (#26) and Docker (#39) work with explicit acceptance evidence.
4. Clarify tooling requests (#82/#83), using the existing test/build infrastructure.
5. Plan the broader identity (#74) and bot (#27) features through product/spec decisions.

This ordering is an initial assessment, not a change to the GitHub backlog.

## Refresh commands

```sh
gh issue list --repo shaunburdick/europa-neo --state open --limit 200 --json number,title,body,comments,labels,assignees,milestone,updatedAt,url
gh pr list --repo shaunburdick/europa-neo --state open --limit 100
gh pr view 109 --repo shaunburdick/europa-neo --json state,body,files,headRefOid,statusCheckRollup
```
