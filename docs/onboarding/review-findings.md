# Documentation and verification discrepancies

Snapshot: 2026-09-09, commit `90a9b4c`. [Notes index](README.md).

These findings record static evidence discovered while onboarding. They have
not been filed as GitHub issues, and runtime behavior has not been exercised.
Line numbers refer to the reviewed commit.

## 1. Player manual contradicts current troop conservation

**Evidence:** `docs/manual/src/pages/pipes.mdx:33` says that flow never drains
the source. Engine spec 001 clarifications v1.6–v1.8 and the merged PR #103
establish source decrement and conservation. The same manual page still teaches
the old uphill stall threshold of 7 and inflow-based decay exemption.

**Current source:** `packages/core/src/flow-rate.ts:148–162` implements uphill
flow as `ceil(flowBase * (flowUphillCap - delta) / flowUphillCap)` below cap 80,
then zero at delta >=80. `packages/engine/src/tick.ts:198–258` computes decay
exemption from same-owner incoming-pipe topology, rather than positive inflow.

**Follow-up:** Reconcile the manual's pipes, numbers, and related explanations
with the agreed flow model, including PR #109 if it lands. Spec 007 FR-012
requires gameplay changes and player documentation to travel together.

## 2. Flow specifications disagree with each other and source

**Evidence:** Spec 001 FR-007 still names `flowSlopeStep` and the older linear
uphill penalty. Spec 024 FR-051 introduces directional fields but gives
`max(0, flowBase - flowUphillStep * min(delta, flowUphillCap))` and cap 73,
claiming that this stalls at 80. With its stated base/step values, that written
formula instead reaches zero at delta 7. Current core uses cap 80 and the
scaled/ceiling formula described above. Spec 024 FR-052 also says `delta >80`,
whereas source stalls at `delta >=80`.

**Follow-up:** Obtain a single approved formula and boundary convention, then
align specs, constants, console slope classification, terrain checks, tests,
and manual. Do not infer current mechanics from a feature's title or old notes.

## 3. Charter history and contributor summaries lag current structure

Examples grounded in this checkout:

- `AGENTS.md` retains old pending-release work and two-player-only descriptions.
  GitHub's current open-issue inventory is the nine entries in these notes;
  application version is 0.2.0 and N-player E2E source is present.
- The charter's old Shadow DOM/custom-element advice predates the documented
  React migration. Current design source exports React components.
- `README.md` refers to seven test packages, while `packages/` has ten code packages.
  Historical test counts are not measurements of the current checkout.
- `CONTRIBUTING.md` and spec 007 describe plain-Markdown/Jekyll authoring.
  Current pages are `docs/manual/src/pages/*.mdx` and Pages builds Astro.
- `packages/engine/README.md:97–101` still describes `flowSlopeStep` and an uphill
  stall threshold of 7, rather than the current shared core formula.

**Follow-up:** Keep historical delivery records clearly dated; use current
manifests, source paths, and GitHub state for onboarding instructions.

## 4. Full/targeted verification descriptions overstate current coverage

**Evidence from scripts, not a test run:**

- `scripts/verify.sh:78–86` explicitly tests engine, terrain, fog, networking,
  matchmaking, version, and design, but does not explicitly run core or logging tests.
  Its earlier recursive build/typecheck/lint phases do include those packages.
- The script does not invoke root `pnpm coverage`, `pnpm version:check`, the
  manual build, or manual link tests. Its browser phase is described as coverage
  mode and selects the coverage config, but does not pass `--coverage` itself;
  no conclusion about actual instrumentation was established in this review.
- `scripts/verify-changed.sh:76–92` has no core/logging scope mapping. Those paths
  fall into the ambiguous branch, whose explicit package list omits them.
- `verify-changed.sh` handles `--full` by setting `AMBIGUOUS=true`; that branch
  then disables the slow browser tier and manual tier. It does not dispatch to
  `verify.sh`, despite the usage comment describing a full-suite option.

**Follow-up:** Inspect and reconcile the scripts with their documented guarantees
before treating one command as proof that every CI gate was exercised. Preserve
the repository's required pre-push process while addressing any confirmed gaps.

## 5. Open issue descriptions need current-code context

- #48 refers to the old inline identity editor; current named-profile behavior
  intentionally hides the setup form. Expected rename behavior needs clarification.
- #83 describes only a hardcoded two-player E2E, although
  `full-stack-n-players.spec.ts` now supplies 3/4-player coverage.
- #82 conflates the console self-host budget with the design bundle guard and
  assumes a console tsup build; current console uses Vite plus TypeScript emission.
- #39's motivation references a prior runtime-minimization proposal. The current
  Docker runtime instead retains the packages tree and development toolchain.

See the [issue review](open-issues.md) for scope and starting points.

## Validation record

This documentation was checked against local source/manifests and live GitHub
metadata. Relative navigation links and referenced primary paths were inspected.
Git whitespace/diff checks were used for the documentation changes. No local
application build, test result, runtime reproduction, or coverage measurement
is claimed by this review.
