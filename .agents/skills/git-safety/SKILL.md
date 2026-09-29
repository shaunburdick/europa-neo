---
name: git-safety
description: Enforces safe git practices for AI coding agents. Defines branch protection rules, commit policies, amend rules, and force-push boundaries. Load this skill at the start of any session where the agent may run git commands — especially before committing, branching, pushing, or resetting. Prevents accidental commits to protected branches (main, master, develop), history rewrites, and other irreversible operations.
license: MIT
metadata:
  author: shaunburdick
  version: "1.0.0"
---

# Git Safety

A set of non-negotiable rules for safe git operations in AI-assisted development. These rules exist to prevent accidental history rewrites, force-pushes to protected branches, and other irreversible operations.

## Branch Protection Policy

**Protected branches** (never commit, switch to, or merge directly):
- `main`
- `master`
- `develop`

**Allowed branches** (safe to commit on):
- Feature branches: `001-feature-name`, `feature/*`
- Fix branches: `fix/*`, `bugfix/*`
- Any other non-protected branch

## Commit Rules

- ❌ **NEVER** commit to `main`, `master`, or `develop`
- ❌ **NEVER** switch to `main`, `master`, or `develop`
- ❌ **NEVER** run `git push --force` or `git push -f` unless the user explicitly requests it — and warn them if targeting a protected branch
- ❌ **NEVER** run `git rebase -i` or other interactive commands (requires interactive input)
- ❌ **NEVER** run `git reset --hard` without explicit user confirmation
- ❌ **NEVER** skip hooks with `--no-verify` or `--no-gpg-sign` unless the user explicitly requests it
- ✅ **ALWAYS** check the current branch before committing: `git branch --show-current`
- ✅ **OK** to ask the user before committing if you're unsure about the branch
- ✅ **OK** to amend the most recent commit **only when ALL conditions are met**:
  1. User explicitly requested amend, OR the commit succeeded but a pre-commit hook auto-modified files that need including
  2. The HEAD commit was created by you in this conversation (verify: `git log -1 --format='%an %ae'`)
  3. The commit has NOT been pushed to remote (verify: `git status` shows "Your branch is ahead")

## Agent Permission Configuration

If you are authoring an agent definition (e.g., an OpenCode `.md` agent file), add these permissions to the YAML frontmatter to enforce branch protection at the tool level — blocking dangerous commands before they can run:

```yaml
permission:
  bash:
    "git commit *": ask
    "git push": deny
    "git push *": deny
    "git merge": deny
    "git merge *": deny
    "git checkout main": deny
    "git checkout master": deny
    "git checkout develop": deny
    "git switch main": deny
    "git switch master": deny
    "git switch develop": deny
```

> Note: These permissions are set by the human author in the agent definition file — a running agent cannot modify its own permissions. This section is a reference for when you're helping set up or review an agent configuration.

## Pre-Commit Branch Check

Before every commit, run:

```bash
git branch --show-current
```

If the output is `main`, `master`, or `develop` — **stop**. Create or switch to a feature branch first:

```bash
git checkout -b 001-my-feature
```

## Commit Message Convention

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>: <short description>

[optional body]
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`

Examples:
- `feat: add user authentication endpoint`
- `fix: resolve null pointer in payment processor`
- `docs: update API contract for order service`
