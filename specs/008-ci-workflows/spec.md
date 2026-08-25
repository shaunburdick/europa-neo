# Spec: CI Workflow Hardening

**Feature**: 008-ci-workflows
**Status**: In Progress
**GitHub Issue**: #3

## Problem Statement

Downstream CI workflows don't accurately reflect upstream package dependencies in their `paths` triggers. Additionally, the workflows lack operational hardening features (concurrency groups, manual triggers, automated dependency updates) that are standard for production CI pipelines.

## User Stories

- **US1**: As a contributor, I want CI to trigger only when relevant code changes so that I don't wait for unrelated pipelines.
- **US2**: As a maintainer, I want automated tool for keeping pinned action SHAs current so that security patches arrive without manual effort.
- **US3**: As a contributor, I want to manually re-trigger CI after transient failures so that I don't need empty commits.
- **US4**: As a maintainer, I want concurrent pushes to not waste runner resources so that CI costs stay reasonable.

## Functional Requirements

- **FR-001**: Each workflow's `paths` filter must include only the package directories that are actual runtime or type dependencies (derived from `package.json`), plus shared root config files.
- **FR-002**: `matchmaking-ci.yml` must NOT watch `packages/fog/**` (matchmaking has no dependency on fog).
- **FR-003**: A `.github/dependabot.yml` must be configured for the `github-actions` ecosystem to automatically propose SHA updates.
- **FR-004**: All CI workflows (except pages-deploy which already has one) must include a `concurrency` group keyed to `${{ github.workflow }}-${{ github.head_ref || github.run_id }}` with `cancel-in-progress: true` for PRs.
- **FR-005**: All CI workflows must include `workflow_dispatch` for manual re-triggering.
- **FR-006**: All third-party action references must be pinned to full 40-character commit SHAs with version comments.

## Non-Functional Requirements

- **NFR-001**: All action pins must use the latest stable version within their current major version line (conservative upgrade path).
- **NFR-002**: Permissions model must remain `contents: read` at workflow level with no escalation.
- **NFR-003**: Existing CI behavior must not change — only triggers and metadata are modified.

## Acceptance Criteria

- [ ] `matchmaking-ci.yml` paths no longer include `packages/fog/**`
- [ ] All 6 CI workflows have `workflow_dispatch` trigger
- [ ] All 6 CI workflows have `concurrency` group
- [ ] `.github/dependabot.yml` exists and is valid
- [ ] All action SHAs are updated to latest within same major
- [ ] No workflow behavior changes (same jobs, same steps, same commands)

## Out of Scope

- Composite action to DRY up shared setup steps (separate issue)
- Major version bumps (checkout v4→v7, setup-node v6→v7) — defer to separate PR
- `pnpm/setup` successor migration (pnpm v11+ path) — separate issue

## Edge Cases

- Dependabot grouping: all action updates should be grouped into a single PR to avoid PR noise.
- Concurrency group key: uses `github.head_ref` for PRs (cancels outdated PR runs) and `github.run_id` for push runs (never cancels push runs).
