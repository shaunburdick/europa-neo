# Repository onboarding notes

Reviewed **2026-09-09** against `main` commit
`90a9b4c3acdc822bb76731feeae2e56da3fdfb17` from
[shaunburdick/europa-neo](https://github.com/shaunburdick/europa-neo).
Local documentation branch: `000-repository-onboarding`.

These are working orientation notes from a source and GitHub review. They are
dated observations, not new feature specifications or implementation approvals.
The constitution and approved feature specifications govern subsequent work.

## Reading map

- [Architecture and development workflow](architecture.md): package boundaries,
  runtime flow, source entry points, and verification commands.
- [Open issues and active PR](open-issues.md): all nine open issues, their current
  relevance, and useful starting points.
- [Documentation and verification discrepancies](review-findings.md): concrete
  differences between current code, historical notes, and published guidance.
- [Issue #39 security assessment](issue-39-security-assessment.md): Docker
  runtime hardening assessment, with a separate [interactive HTML review](issue-39-security-assessment.html).

## Initial understanding

Europa Neo is an MIT-licensed, self-hosted TypeScript reimplementation of a
real-time strategy game. Cities produce nanobots; directional pipes move them;
combat, supply, reserves, and troop-derived fog determine the outcome. The
simulation is server-authoritative and deterministic. The current product
supports 2–4 players, public/private matches, spectators, reconnects, and rematches.
Accounts, ratings, and chat remain future features.

The checkout declares application version **0.2.0**. It contains ten code
packages under `packages/`, plus the Astro player-manual workspace. Current
source uses React 19, Zustand, TanStack Router, and a single-port HTTP/WebSocket
host. Several older summaries still describe earlier architectures.

## Review scope and evidence

- Cloned the repository directly into the current working directory (`./`).
- Read the repository charter and constitution; skimmed specs 001–007 and
  inspected relevant newer specifications, source, manifests, and scripts.
- Consulted the original archived rules and controls as reference material.
- Read all open issue bodies and comments through GitHub CLI; inspected the
  open PR's description, changed-file list, and reported checks.
- Created these notes and a charter entry locally. Application code is untouched.
- Dependencies were not installed; builds, tests, Docker, and browser sessions
  were not run. Runtime defects mentioned here are issue reports or explicitly
  identified static observations, not newly reproduced failures.

## Continuing from this snapshot

1. Check local status and refresh the GitHub issue/PR state before selecting work.
2. Read the relevant full specification, including later clarifications and
   companion specifications. Use full directory names: numeric prefixes such as
   `012` and `015` are reused for different features.
3. Resolve recorded specification conflicts before implementing affected behavior.
4. Follow the approved spec → clarification → plan → tasks → implementation flow.
5. Keep file reads and writes within `./`, per the user's scope for this checkout.

The most immediate coordination point is [PR #109](https://github.com/shaunburdick/europa-neo/pull/109),
which already addresses flow-balancing issue #50. Its behavior and documentation
need to be considered together before starting related work.
