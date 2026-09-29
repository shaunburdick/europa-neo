# Git Safety: PR and Commit Preflights

Loaded from the `git-safety` SKILL.md — this section moved here to keep the
skill under the 500-line guidance. **Agents MUST read this file before the
first commit, push, sync, or pull-request creation in a session.**

Before any commit, push, synchronization, or pull-request creation, run the
preflight checks **that apply to the operation you are about to perform**,
in order. Each check has a binary continue/stop outcome. If any check stops,
do not proceed to the next — resolve or escalate the blocker first.

## Which Checks Apply Where

Checks are operation-scoped: several of them reason about state that does
not exist until later in the workflow — a remote counterpart (checks 3, 6),
an upstream to compare against (check 4), or commits beyond the base (checks
5, 7). Before the first push those checks have nothing to measure, and the
one they would measure is exactly the operation in flight. Run the row for
your operation:

| Operation              | Checks                                                  |
| ---------------------- | ------------------------------------------------------- |
| **Commit**             | 1 (tree), 2 (protected branch)                          |
| **Push / sync**        | 1, 2, 3 (branch present), 4 (divergence)                |
| **PR create**          | 1, 2, 3, 4, 5 (relative to base), 6 (published), 7 (has commits) |

Each check below repeats its own scope as an **Applies to** line. That line
is the rule; this table is the index.

The practical consequence: **a first commit on a fresh local branch runs
checks 1 and 2 only.** Never stop that commit because the branch is
unpublished (checks 3, 4, 6) or because `base..HEAD` is still empty (check
5) — both statements are true by definition until you commit and push, so
they are not defects at commit time.

## 1. Working-Tree Status Check

**Applies to:** every operation. (A `sync`/rebase refuses a dirty tree, and
unrelated changes are a hazard before any mutation.)

Verify the working tree is clean or appropriately staged:

```bash
git status --porcelain
```

- **Valid case**: Output is empty (clean tree) or shows only staged changes
  relevant to the current task. **Continue**.
- **Failure case**: Output shows unstaged or untracked changes unrelated to
  the current task. **Stop** — the working tree is dirty and may include
  unintended modifications.
- **Next action**: Ask the user whether to stash, commit, or discard the
  unrelated changes before proceeding. Never auto-reset or auto-stash without
  explicit user confirmation.

## 2. Protected-Branch Check

**Applies to:** every operation. Nothing is committed, pushed, or proposed
for merge from a protected branch.

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

**Applies to:** push, sync, and PR creation only. **Skip before a first
commit on a fresh local branch** — the remote counterpart does not exist yet
by design, and requiring one would block the standard
feature-branch → commit → push workflow.

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
- **Next action**: The branch is not published. For PR creation, tell the user
  a published branch is required. For a push, request an explicit user-approved
  `git push -u origin $(git branch --show-current)`. Never push without user
  confirmation.

## 4. Local-vs-Remote Divergence Check

**Applies to:** push, sync, and PR creation only. **Skip before a first
commit (and before the first push)** — a branch with no upstream yet has
nothing to compare against, so the comparison is undefined rather than
failed.

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

**Applies to:** PR creation only. This check answers "what will the PR
contain?", and that question is not yet defined before the first commit:
`base..HEAD` is `0` for every fresh branch, so running this at commit time
would stop the very commit that satisfies it. A push does not need the count
either — there is nothing to review until a PR is opened.

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

**Applies to:** PR creation only — this gate exists to decide whether to
invoke `gh pr create`.

A combined gate that stops PR creation when the branch cannot be published:

- **Condition**: No remote branch exists (check 3) OR no commits are visible
  to the remote (the remote branch points to the same commit as the base).
- **Stop**: Do not invoke `gh pr create` or any PR-creation workflow.
- **Next action**: Instruct the agent to obtain user-approved push or publish
  action before retrying PR creation. Record the preflight result with the
  exact missing condition.

## 7. No-Commit Stop

**Applies to:** PR creation only.

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
