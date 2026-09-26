---
name: git-safety
description: Enforces safe git practices for AI coding agents. Defines branch protection rules, commit policies, amend rules, and force-push boundaries. Load this skill at the start of any session where the agent may run git commands — especially before committing, branching, pushing, or resetting. Prevents accidental commits to protected branches (main, master, develop), history rewrites, and other irreversible operations.
license: MIT
metadata:
  author: shaunburdick
  version: "1.2.0"
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


## PR and Commit Preflights

Run the seven preflight gates before any commit, push, sync, or PR creation.
Each is a binary continue/stop check; a stopped check blocks the operation
until resolved or escalated. **MUST READ**:
[references/preflight-checks.md](references/preflight-checks.md) — read it
before the first git mutation of a session.

Quick reference:

1. `git status --porcelain` — clean, or staged changes only
2. `git branch --show-current` — not `main`/`master`/`develop`
3. `git rev-parse --verify HEAD` + `git ls-remote --heads origin <branch>`
4. `git rev-list --left-right --count HEAD...@{upstream}` — never behind
5. `git merge-base --is-ancestor main HEAD` — ≥ 1 commit past base
6. Unpublished branch → no `gh pr create` until user-approved push
7. No commits past base → no `gh pr create`

Stopped preflights are recorded in the Preflight Result Format (see the
reference) and preserved in handoffs for traceability.

## Permission Denials, Escalation, and Secrets

When a git operation is denied, report the exact operation, denial source,
failure evidence, and context; recommend a safe alternative; request explicit
approval; record the decision; escalate rather than work around.
**MUST READ**: [references/permission-denied-reporting.md](
references/permission-denied-reporting.md) — the full rules, valid/failure
examples, the Prohibition on Bypasses, and the Secret and Encrypted-File
Boundary.

Non-negotiables (full detail in the reference):
- ❌ NEVER bypass a denial: no `--no-verify`, no `--force-with-lease`, no
  `git -c core.hooksPath=/dev/null`, no env overrides to dodge auth prompts,
  no remote-URL rewrites, no git-crypt boundary crossings
- ❌ NEVER read, print, or decrypt `.gitconfig.secret`, `.gnupg/`, or any
  `filter=git-crypt` file — reference them by path only
- ✅ ALWAYS check `.gitattributes` for `git-crypt` entries before reading files

## AI Commit Attribution

All commits made by AI agents MUST include a `Generated-By` trailer to
transparently attribute AI-generated code. This follows the Apache Software
Foundation's `Generated-by` convention and aligns with EU AI Act Article 50
disclosure requirements. For attribution on PRs, comments, and issues, see
the [ai-attribution](../ai-attribution/) skill.

### Format

```
Generated-By: <agent-name> (model: <model-name>)
```

Use the exact agent name and model ID from your system prompt. The `Author:`
field contains the human operator — the `Generated-By:` trailer is for the
AI agent only.

### How It Works

A `prepare-commit-msg` hook appends the trailer when the commit environment
identifies an AI session. Detection is layered — auto-detect, explicit claim,
visible silence:

1. **Auto-detect** — harnesses that set an environment marker on their
   subprocesses are recognized from the signal matrix below.
2. **Explicit claim** — OpenCode v2 sets no marker; its agents claim the
   commit via `git-agent-commit` or inline `AI_AGENT=opencode git commit ...`.
3. **Visible silence** — an OpenCode session with no claim (agent forgot, or
   a human in the TUI terminal) is never misattributed; the hook prints a
   stderr warning instead of failing silently.

**Richer attribution** is resolved cross-harness (details:
[references/attribution-detection.md](references/attribution-detection.md)):

- **Agent name** — `OPENCODE_AGENT` (opencode) or the `AI_AGENT`/`AGENT`
  value itself (per agents.md#136 the value is the agent name: `goose`,
  `amp`, `custom-architect`, ...). Boolean markers (`1`/`true`) and the
  canonical `opencode` value fall back to the harness name.
- **Model** — `OPENCODE_MODEL` (opencode) or `ANTHROPIC_MODEL`
  (claude-code, when Claude Code exports it). Other harnesses expose no
  model var today, and a model var alone never triggers attribution.

### Detection (Signal Matrix)

The hook treats the session as AI when **any** of these env vars is set to a
non-empty value (not just `1`):

`AI_AGENT`, `AGENT` (any value — `goose`/`amp` and other names become the
agent name), `OPENCODE`, `OPENCODE_CLIENT`, `CLAUDE_CODE`, `CLAUDE_CODE_ENTRYPOINT`,
`CURSOR_AGENT`, `GEMINI_CLI`, `CODEX_SANDBOX`, `AUGMENT_AGENT`,
`CLINE_ACTIVE`, `OPENCODE_AGENT`, `OPENCODE_MODEL`.

`OPENCODE_TERMINAL` is **never** a detection signal (see below). The full
per-harness table and notes live in
[references/attribution-detection.md](references/attribution-detection.md).

### OpenCode v2: Claim Your Commits

OpenCode v2 (anomalyco/opencode) sets no AI-session marker — only
`OPENCODE_TERMINAL=1`, on agent tool shells AND the human TUI terminal — and
each bash tool call spawns a fresh login shell, so session-start exports do
not persist. Claim each commit explicitly (full reasoning:
[references/attribution-detection.md](references/attribution-detection.md)):

```bash
git-agent-commit -m "feat: add widget"              # Generated-By: opencode
OPENCODE_AGENT="my-agent" OPENCODE_MODEL="my-model" \
  git-agent-commit -m "feat: add widget"            # Generated-By: my-agent (model: my-model)
# identical inline form:
AI_AGENT=opencode OPENCODE_AGENT="my-agent" OPENCODE_MODEL="my-model" \
  git commit -m "feat: add widget"
```

`git-agent-commit` ships in this skill's `scripts/` directory; copy it onto
your PATH once per machine:

```bash
cp .agents/skills/git-safety/scripts/git-agent-commit ~/.local/bin/
chmod +x ~/.local/bin/git-agent-commit
```

Trailer defaults: no agent name → harness name (e.g. `opencode`); agent name
only → agent name; model only → `<harness> (model: <model>)`; both →
`<agent> (model: <model>)`. For other harnesses, `CLAUDE_CODE=1
ANTHROPIC_MODEL=...` yields `Generated-By: claude-code (model: ...)` when
Claude Code exports the model.

### Session Setup

At the start of every session where you may make git commits, perform these
steps **once**. Do not repeat them on every commit.

#### Step 1: Ensure Hook Exists and Is Current

First, resolve the hook directory. Git uses `core.hooksPath` when set (e.g.,
Husky sets it to `.husky/_/`). When unset, it defaults to `.git/hooks/`.

```bash
HOOK_DIR=$(git config core.hooksPath 2>/dev/null || true)
HOOK_DIR="${HOOK_DIR:-.git/hooks}"
HOOK_PATH="${HOOK_DIR}/prepare-commit-msg"
```

> **Note**: Hook directories are not tracked by git. The hook must be
> installed per-repo. If you clone the repo fresh, you'll need to run this
> step again.

Verify the hook is installed **and current** — the bundled checker compares
the installed hook's attribution block byte-for-byte against the shipped
script (content hash, so any drift is caught):

```bash
bash .agents/skills/git-safety/scripts/check-hook.sh
```

Output: `CURRENT` (exit 0) when the installed block matches the shipped
script; `OUTDATED` (exit 1) with exact remediation commands when the hook is
missing, not executable, or its attribution block differs (e.g. after a
skill update). The checker covers both install modes below.

**Common hook managers and their paths:**

| Tool | `core.hooksPath` | Hook directory |
|------|------------------|----------------|
| Git (default) | unset | `.git/hooks/` |
| Husky v9 | `.husky/_/` | `.husky/_/` |
| Lefthook | unset (uses `.git/hooks/`) | `.git/hooks/` |
| simple-git-hooks | respects existing | wherever `core.hooksPath` points |

**If missing**, copy the hook from your agent framework's skill directory:

```bash
# Example path — adjust to your framework's skill location
cp .agents/skills/git-safety/scripts/prepare-commit-msg "$HOOK_PATH"
chmod +x "$HOOK_PATH"
```

**If `check-hook.sh` reports OUTDATED**, update the hook — it prints the
exact commands. The update paths mirror the install modes below (the shipped
script's attribution block is the single source of truth, no copy-paste
divergence):

```bash
sed -n '/^# --- AI Commit Attribution/,/^# --- end AI Commit Attribution/p' \
  .agents/skills/git-safety/scripts/prepare-commit-msg >> "$HOOK_PATH"
```

The extracted block is self-contained: it reads `$1`/`$2` (message file and
commit source), skips merge/squash, applies the detection matrix, and appends
the trailer or emits the unclaimed-session warning. Verify the result:

```bash
bash -n "$HOOK_PATH" && echo "hook syntax OK"
```

### Mixed Environments (AI + Human Commits)

Humans never need to opt out — the hook only attributes when an agent marker
or explicit claim is present, and `OPENCODE_TERMINAL` alone never
misattributes a human commit. Scenario → behavior matrix:
[references/attribution-detection.md](references/attribution-detection.md).

### Verification

After setup, verify the hook is installed:

```bash
# Resolve hook path (same as setup)
HOOK_DIR=$(git config core.hooksPath 2>/dev/null || true)
HOOK_DIR="${HOOK_DIR:-.git/hooks}"
HOOK_PATH="${HOOK_DIR}/prepare-commit-msg"

# Check hook exists and is executable
ls -la "$HOOK_PATH"

# Check hook exists and is current (attribution block hash matches shipped)
bash .agents/skills/git-safety/scripts/check-hook.sh

# Check claim vars are set (in agent session)
echo "AI_AGENT=${AI_AGENT:-unset} OPENCODE_AGENT=${OPENCODE_AGENT:-unset} OPENCODE_MODEL=${OPENCODE_MODEL:-unset}"
```

Run the skill's functional tests (covers AC-1..AC-19, incl. the A2
cross-harness agent/model cases and the A3 currency-check smoke tests, from
the feature spec):

```bash
bash .agents/skills/git-safety/scripts/test-prepare-commit-msg.sh
```

### Uninstall

To remove AI attribution from a repo:

```bash
# Resolve hook path
HOOK_DIR=$(git config core.hooksPath 2>/dev/null || true)
HOOK_DIR="${HOOK_DIR:-.git/hooks}"
HOOK_PATH="${HOOK_DIR}/prepare-commit-msg"

# Remove the hook (only if it was installed by this skill)
rm -f "$HOOK_PATH"
```

If the hook was appended to an existing hook (not installed fresh), you'll
need to manually remove the attribution block between the
`# --- AI Commit Attribution` markers.

### Parsing Attribution

Find AI-generated commits and unique agents/models — commands in
[references/attribution-detection.md](references/attribution-detection.md).
The essentials:

```bash
git log --trailer=Generated-By --oneline
```

## References

- **[references/attribution-detection.md](references/attribution-detection.md)**: Full detection matrix, OpenCode v2 environment reality, and parsing commands.
- **[references/preflight-checks.md](references/preflight-checks.md)**: The seven preflight gates — MUST read before the first git mutation of a session.
- **[references/permission-denied-reporting.md](references/permission-denied-reporting.md)**: Denial reporting, escalation, and the Secret and Encrypted-File Boundary.

## Related Skills

- **[ai-attribution](../ai-attribution/)**: Covers AI attribution footers for PR bodies, comments, and issues — surfaces beyond what this skill's commit hook handles.
