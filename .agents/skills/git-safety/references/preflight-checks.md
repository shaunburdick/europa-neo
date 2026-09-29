# Git Safety: PR and Commit Preflights

Loaded from the `git-safety` SKILL.md — this section moved here to keep the
skill under the 500-line guidance. **Agents MUST read this file before the
first commit, push, sync, or pull-request creation in a session.**

Before any commit, push, synchronization, or pull-request creation, run the
following preflight checks in order. Each check has a binary continue/stop
outcome. If any check stops, do not proceed to the next — resolve or escalate
the blocker first.

## 1. Working-Tree Status Check

Verify the working tree is clean or appropriately staged:

```bash
git status --porcelain
```

- **Valid case**: Output is empty (clean tree) or shows only staged changes
  relevant to the current task. **Continue**.
- **Failure case**: Output shows unstaged or untracked changes unrelated to the
  current task. **Stop** — the working tree is dirty and may include unintended
  modifications.
- **Next action**: Ask the user whether to stash, commit, or discard the
  unrelated changes before proceeding. Never auto-reset or auto-stash without
  explicit user confirmation.

## 2. Protected-Branch Check

Verify the current branch is not a protected branch:

```bash
git branch --show-current
```

- **Valid case**: Output is a feature, fix, or other non-protected branch name
  (e.g., `001-feature-name`). **Continue**.
- **Failure case**: Output is `main`, `master`, or `develop`. **Stop** — do not
  commit, push, or create a PR from a protected branch.
- **Next action**: Create or switch to a feature branch:
  `git checkout -b 001-my-feature`. If the user intended to work on a protected
  branch, escalate for explicit approval.

## 3. Local and Remote Branch Presence Check

Verify the current branch exists both locally and on the remote:

```bash
# Local branch
git rev-parse --verify HEAD

# Remote branch (replace origin with the actual remote)
git ls-remote --heads origin "$(git branch --show-current)"
```

- **Valid case**: Both commands return a commit SHA. The branch exists locally
  and on the remote. **Continue**.
- **Failure case**: `git ls-remote` returns empty — the branch has no remote
  counterpart. **Stop** — the branch is unpublished.
- **Next action**: Inform the user that PR creation requires a published branch.
  Request an explicit user-approved push: `git push -u origin
  $(git branch --show-current)`. Do not push without user confirmation.

## 4. Local-vs-Remote Divergence Check

Verify the local branch is not diverged from its remote tracking branch:

```bash
git rev-list --left-right --count HEAD...@{upstream}
```

- **Valid case**: Output is `0 0` (in sync) or only ahead counts are nonzero
  (local commits not yet pushed). **Continue**.
- **Failure case**: The behind count is nonzero — the remote has commits the
  local branch does not. **Stop** — the branch is diverged and a PR would
  exclude upstream changes or create merge conflicts.
- **Next action**: Advise the user to pull or rebase:
  `git pull --rebase origin $(git branch --show-current)`. If rebase is
  complex or involves conflicts, escalate to the user rather than resolving
  automatically.

## 5. Relative-to-Base Check

Verify the branch has at least one commit relative to its merge base:

```bash
git merge-base --is-ancestor main HEAD && echo "based on main" || echo "not based"
git rev-list --count main..HEAD
```

(Replace `main` with the actual base branch for this repository.)

- **Valid case**: The count is ≥ 1 — the branch has commits beyond the base.
  **Continue**.
- **Failure case**: The count is 0 — the branch has no commits relative to its
  base. **Stop** — there is nothing to include in a PR.
- **Next action**: Inform the user that the branch has no changes relative to
  the base. Either make the intended commits or close the branch.

## 6. Unpublished Branch Stop

A combined gate that stops PR creation when the branch cannot be published:

- **Condition**: No remote branch exists (check 3) OR no commits are visible
  to the remote (the remote branch points to the same commit as the base).
- **Stop**: Do not invoke `gh pr create` or any PR-creation workflow.
- **Next action**: Instruct the agent to obtain user-approved push or publish
  action before retrying PR creation. Record the preflight result with the
  exact missing condition.

## 7. No-Commit Stop

A combined gate that stops PR creation when there is nothing to review:

- **Condition**: Zero commits between the branch and its base (check 5 returns
  0), OR all commits are already merged into the base.
- **Stop**: Do not invoke `gh pr create`.
- **Next action**: Inform the user and either request the intended changes or
  close the branch. Record the preflight result with the commit count.

## Preflight Result Format

When a preflight stops, report the result as:

```
Preflight: [check name]
Status: stop
Branch: [branch name]
Evidence: [command output or observation]
Next action: [specific user-approved action required]
```

This record MUST be preserved in any orchestration handoff or verification
report for traceability.
