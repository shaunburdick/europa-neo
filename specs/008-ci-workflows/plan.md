# Plan: CI Workflow Hardening

**Feature**: 008-ci-workflows
**GitHub Issue**: #3

## Technical Context

- **Repository**: Europa Neo monorepo (pnpm workspaces)
- **CI Platform**: GitHub Actions
- **Current State**: 7 workflow files, all SHA-pinned but with stale versions and one incorrect path trigger
- **Branch**: `issue-3-ci-workflows`

## Architecture Decisions

### AD-001: Conservative major version policy

**Decision**: Stay within current major version lines for all action updates.
**Rationale**: Major version bumps (e.g., checkout v4→v7) may introduce breaking changes in input/output schemas. Staying within v4/v6 keeps the upgrade path safe and reviewable. Major bumps warrant their own PRs with careful testing.

### AD-002: Concurrency group design

**Decision**: Use `${{ github.workflow }}-${{ github.head_ref || github.run_id }}` with `cancel-in-progress: true`.
**Rationale**: For PRs, `github.head_ref` is the branch name — pushing again cancels the previous run on the same branch. For push-to-main runs, `github.run_id` is unique — never cancels production pushes. This matches the pages-deploy pattern (which uses `cancel-in-progress: false` because deployments must serialize, not cancel).

### AD-003: Dependabot grouping

**Decision**: Group all GitHub Actions updates into a single PR.
**Rationale**: Without grouping, Dependabot opens one PR per action update — noisy for a repo with 8+ actions. A single grouped PR is easier to review and merge.

### AD-004: No composite action (yet)

**Decision**: Defer DRY-ing shared setup steps to a separate issue.
**Rationale**: Introducing a composite action changes the `uses:` references in every job of every workflow. That's a larger refactor with its own testing requirements. This PR focuses on correctness (path triggers) and hardening (concurrency/dispatch/dependabot).

## Files to Modify

| File | Change |
|------|--------|
| `.github/workflows/matchmaking-ci.yml` | Remove `packages/fog/**` from paths; add `workflow_dispatch`; add `concurrency`; update action SHAs |
| `.github/workflows/engine-ci.yml` | Add `workflow_dispatch`; add `concurrency`; update action SHAs |
| `.github/workflows/terrain-ci.yml` | Add `workflow_dispatch`; add `concurrency`; update action SHAs |
| `.github/workflows/fog-ci.yml` | Add `workflow_dispatch`; add `concurrency`; update action SHAs |
| `.github/workflows/network-ci.yml` | Add `workflow_dispatch`; add `concurrency`; update action SHAs |
| `.github/workflows/client-ci.yml` | Add `workflow_dispatch`; add `concurrency`; update action SHAs |
| `.github/dependabot.yml` | New file — configure `github-actions` ecosystem with weekly schedule and grouping |

## Action SHA Updates

| Action | Current | Updated To |
|--------|---------|------------|
| `actions/checkout` | `11bd71901bbe5b1630ceea73d27597364c9af683` (v4.2.2) | Latest v4 SHA |
| `actions/setup-node` | `2028fbc5c25fe9cf00d9f06a71cc4710d4507903` (v6.0.0) | Latest v6 SHA |
| `pnpm/action-setup` | `fc06bc1257f339d1d5d8b3a19a8cae5388b55320` (v4.4.0) | Latest v6 SHA |
| `actions/upload-artifact` | `5d5d22a31266ced268874388b861e4b58bb5c2f3` (v4.3.1) | Latest v4 SHA |
| `actions/configure-pages` | `45bfe0192ca1faeb007ade9deae92b16b8254a0d` (v6.0.0) | Already latest |
| `actions/jekyll-build-pages` | `44a6e6beabd48582f863aeeb6cb2151cc1716697` (v1.0.13) | Already latest |
| `actions/upload-pages-artifact` | `fc324d3547104276b827a68afc52ff2a11cc49c9` (v5.0.0) | Already latest |
| `actions/deploy-pages` | `cd2ce8fcbc39b97be8ca5fce6e763baed58fa128` (v5.0.0) | Already latest |

## Validation

- YAML syntax validation: `python3 -c "import yaml; yaml.safe_load(open('file.yml'))"` for each modified workflow
- Dependabot schema validation: verify the file matches the documented schema
- No functional changes to job definitions — only trigger metadata and action versions change
