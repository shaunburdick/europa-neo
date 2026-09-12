---
name: spec-kit
description: "Practical guide for setting up and using the spec-kit CLI on a project. Covers installation, project initialization (--integration flag) for Claude, OpenCode, Copilot, Cursor, Codex and more, the specify slash commands (/speckit.constitution, /speckit.specify, /speckit.clarify, /speckit.plan, /speckit.tasks, /speckit.checklist, /speckit.analyze, /speckit.implement, /speckit.converge), plus workflow/bundle/extension management and detecting current workflow state. Load this skill when a user mentions spec-kit, the specify CLI, .specify/ directory, specs/ directory, speckit commands, or wants to initialize spec-driven development tooling on a project."
license: MIT
metadata:
  author: shaunburdick
  version: "2.0.0"
---

# Spec-Kit

Practical setup and usage guide for the [spec-kit CLI](https://github.com/github/spec-kit) — the tooling layer that scaffolds and drives the spec-driven development workflow.

> **Relationship to `spec-driven-development` skill**: This skill covers the *tooling* (CLI, commands, file structure, state detection). The `spec-driven-development` skill covers the *methodology* (what each phase means, how to write good specs, clarification process, etc.). Use both together for the full picture.

> **Version note**: This skill targets spec-kit **v1.0.0+**. Older guides reference a `--ai` flag and `.specify/features/` directories — both are gone. The agent flag is now `--integration`, and feature specs live in `specs/` at the repo root.

---

## Prerequisites

- Python 3.11+
- Git
- [uv](https://docs.astral.sh/uv/) package manager

---

## Running spec-kit

The preferred approach is to run spec-kit via `uvx` without installing it globally. This keeps your machine clean, makes version pinning explicit, and avoids PATH issues.

### Preferred: `uvx` (no install required)

```bash
# New project — replace vX.Y.Z with the latest release tag
uvx --from git+https://github.com/github/spec-kit.git@vX.Y.Z specify init <PROJECT_NAME> --integration <agent>

# Existing project
uvx --from git+https://github.com/github/spec-kit.git@vX.Y.Z specify init . --here --integration <agent>

# Run any other specify command the same way
uvx --from git+https://github.com/github/spec-kit.git@vX.Y.Z specify <command>
```

Check the [Releases page](https://github.com/github/spec-kit/releases) for the latest tag.

Templates are bundled inside the CLI package, so `init` does not need network access beyond fetching the package itself.

### Alternative: persistent install

Only do this if you run spec-kit frequently and want it available as a bare `specify` command:

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@vX.Y.Z
specify version  # verify

# Upgrade later
uv tool install specify-cli --force --from git+https://github.com/github/spec-kit.git@vX.Y.Z
# or, once installed:
specify self upgrade          # add --dry-run to preview first
```

> If `specify` isn't found after a persistent install, add uv's tool bin to your PATH:
> ```bash
> export PATH="$HOME/.local/bin:$PATH"
> ```

---

## Project Initialization

Run this once per project to scaffold the `.specify/` directory and agent integration files:

```bash
# New project (uvx — preferred)
uvx --from git+https://github.com/github/spec-kit.git specify init <project-name> --integration <agent>

# Existing project (use --force to skip the non-empty confirmation)
uvx --from git+https://github.com/github/spec-kit.git specify init . --here --integration <agent>

# Scripted / CI-friendly init — never prompts, fails instead of hanging
uvx --from git+https://github.com/github/spec-kit.git specify init . --here --force --non-interactive --integration claude
```

### Key `init` options

| Flag | Purpose |
| --- | --- |
| `--integration <key>` | Coding agent to set up (replaces the old `--ai`) |
| `--here` | Initialize in the current directory |
| `--force` | Skip confirmation when directory is non-empty |
| `--non-interactive` | Never prompt; use defaults; required for agent harnesses with a PTY but no arrow-key input |
| `--script sh\|ps\|py` | Script type for helper scripts (default `sh`) |
| `--ignore-agent-tools` | Skip checks that the agent's CLI is installed |
| `--preset <id>` | Install a preset during init |
| `--extension <name\|path\|url>` | Install an extension during init (repeatable) |
| `--trust-extension-urls` | Pre-authorize URL-based extensions (required for non-interactive URL installs) |
| `--integration-options "<opts>"` | Pass options to the integration, e.g. `"--commands"` or `"--commands-dir .myagent/cmds"` |

### Integration layouts

Since v0.16.0, Claude Code and GitHub Copilot install **skills** by default instead of slash commands. Add `--integration-options="--commands"` to get the classic command layout.

| Agent (`--integration` value) | Default layout |
| --- | ------------------------------ |
| `claude` | `.claude/skills/speckit-*/SKILL.md` |
| `copilot` | `.github/skills/speckit-*/SKILL.md` |
| `opencode` | `.opencode/commands/speckit.*.md` |
| `cursor-agent` | `.cursor/rules/` |
| `codex` | `.codex/` |
| `generic` | Bring your own agent via `--integration-options="--commands-dir <dir>"` |

The catalog has 40+ integrations (gemini, qwen, droid, amp, goose, trae, zed, …). Run `specify integration list` from an initialized project to see them all with install status.

### What gets created

```
.specify/
├── memory/
│   └── constitution.md        # Scaffolded at init from template (refine via /speckit.constitution)
├── scripts/bash/              # Helper scripts used by slash commands
│   ├── common.sh
│   ├── check-prerequisites.sh
│   ├── create-new-feature.sh
│   ├── resolve-template.sh
│   ├── setup-plan.sh
│   └── setup-tasks.sh
├── templates/                 # Spec, plan, tasks, checklist, constitution templates
├── workflows/                 # Bundled speckit workflow.yml + registry
├── integrations/              # Per-agent manifests
├── integration.json           # Active integration state
└── init-options.json          # Options captured at init time

.opencode/commands/            # opencode layout (or .claude/skills/speckit-*/ for claude)
├── speckit.constitution.md
├── speckit.specify.md
├── speckit.clarify.md
├── speckit.checklist.md
├── speckit.plan.md
├── speckit.tasks.md
├── speckit.analyze.md
├── speckit.converge.md
├── speckit.taskstoissues.md
└── speckit.implement.md

specs/                         # Created on first /speckit.specify — at REPO ROOT, not under .specify/
└── 001-my-feature/
    ├── spec.md
    ├── plan.md                # After /speckit.plan
    └── tasks.md               # After /speckit.tasks
```

---

## Slash Commands

After `specify init`, these commands (or skills) are available in your agent:

| Command | Purpose |
| --- | --- |
| `/speckit.constitution` | Create or update the project constitution (Phase 1) |
| `/speckit.specify <description>` | Create a feature spec from a description (Phase 2) |
| `/speckit.clarify` | Resolve ambiguities before planning (Phase 3) |
| `/speckit.checklist` | Generate quality checklists to validate requirements (after plan) |
| `/speckit.plan <tech notes>` | Generate implementation plan (Phase 4) |
| `/speckit.tasks` | Break plan into ordered tasks (Phase 5) |
| `/speckit.analyze` | Cross-artifact consistency check (before implement) |
| `/speckit.converge` | Assess codebase against spec/plan/tasks; append unbuilt work as new tasks |
| `/speckit.taskstoissues` | Convert tasks into dependency-ordered GitHub issues |
| `/speckit.implement` | Execute tasks (Phase 6) |

### Example workflow

```
/speckit.constitution Focus on simplicity, test coverage ≥80%, TypeScript strict mode

/speckit.specify A dashboard showing real-time sensor readings with alerting thresholds

/speckit.clarify

/speckit.plan React + Vite frontend, Node.js WebSocket backend, SQLite for alert config

/speckit.tasks

/speckit.implement
```

---

## Detecting Project State

Before diving in, check where you are in the workflow. Note that feature specs live in `specs/` at the **repo root** (legacy projects may still use `.specify/features/`):

```bash
# Is spec-kit initialized?
[ -d ".specify" ] && echo "Initialized" || echo "Run: uvx --from git+https://github.com/github/spec-kit.git specify init . --here --integration opencode"

# Is there a constitution?
[ -f ".specify/memory/constitution.md" ] && echo "Constitution exists" || echo "Run: /speckit.constitution"

# What features exist?
ls specs/ 2>/dev/null || ls .specify/features/ 2>/dev/null || echo "No features yet"

# What's the latest feature's phase?
LATEST=$(ls -d specs/[0-9]* .specify/features/[0-9]* 2>/dev/null | sort -V | tail -1)
if [ -n "$LATEST" ]; then
  echo "Latest feature dir: $LATEST"
  [ -f "$LATEST/plan.md" ]  && echo "  ✅ plan.md"  || echo "  ❌ plan.md (run /speckit.plan)"
  [ -f "$LATEST/tasks.md" ] && echo "  ✅ tasks.md" || echo "  ❌ tasks.md (run /speckit.tasks)"
fi
```

### Current Phase Detection

To determine exactly which phase the latest feature is in:

```bash
FEATURE_DIR=$(ls -d specs/[0-9]* .specify/features/[0-9]* 2>/dev/null | sort -V | tail -1)

if [ ! -f ".specify/memory/constitution.md" ]; then
  echo "Phase: constitution → run /speckit.constitution"
elif [ -z "$FEATURE_DIR" ]; then
  echo "Phase: specify → run /speckit.specify <description>"
elif [ -f "$FEATURE_DIR/spec.md" ] && ! grep -q "## Clarifications" "$FEATURE_DIR/spec.md"; then
  echo "Phase: clarify → run /speckit.clarify"
elif [ ! -f "$FEATURE_DIR/plan.md" ]; then
  echo "Phase: plan → run /speckit.plan"
elif [ ! -f "$FEATURE_DIR/tasks.md" ]; then
  echo "Phase: tasks → run /speckit.tasks"
elif grep -q "\- \[ \]" "$FEATURE_DIR/tasks.md"; then
  echo "Phase: implement → run /speckit.implement"
else
  echo "Phase: complete ✅"
fi
```

You can also ask the CLI what's installed: `specify integration status` reports the active integration without changing files.

---

## Helper Scripts

The scripts in `.specify/scripts/bash/` are called by the slash commands but can also be run directly:

```bash
# Create a new feature branch and spec file, outputs JSON.
# Also exports SPECIFY_FEATURE and SPECIFY_FEATURE_DIRECTORY for subsequent scripts.
.specify/scripts/bash/create-new-feature.sh --json "my-feature-name"
# → {"BRANCH_NAME": "001-my-feature-name", "SPEC_FILE": "...", "FEATURE_NUM": "001"}

# Set up the plan phase for the current feature, outputs JSON
export SPECIFY_FEATURE=001-my-feature-name SPECIFY_FEATURE_DIRECTORY="$PWD/specs/001-my-feature-name"
.specify/scripts/bash/setup-plan.sh --json
# → {"FEATURE_SPEC": "...", "IMPL_PLAN": "...", "SPECS_DIR": "...", "BRANCH": "..."}

# Set up the tasks phase
.specify/scripts/bash/setup-tasks.sh --json
```

Note: the old `update-agent-context.sh` script was removed — agent context files are managed by the integrations system now (`specify integration upgrade` refreshes them).

---

## Beyond Init: Integrations, Workflows, Bundles

spec-kit v1.x grew several subsystems worth knowing about:

### Integrations

```bash
specify integration list      # Available integrations + installed status
specify integration status    # Current project's integration state (read-only)
specify integration install <key>   # Add another agent to an existing project
specify integration switch <key>    # Swap the active integration
specify integration upgrade   # Reinstall with diff-aware file handling
specify integration use <key> # Change default without uninstalling others
```

### Workflows

Automation pipelines defined in YAML (`.specify/workflows/`), with steps that can dispatch prompts or shell commands:

```bash
specify workflow list         # Installed workflows
specify workflow search       # Search catalogs
specify workflow add <name>   # Install from catalog/URL/path
specify workflow run <name>   # Execute (supports pause/resume via `workflow resume`)
specify workflow status       # Inspect a run
```

### Bundles

Curated sets of extensions/presets/workflows installed as one unit:

```bash
specify bundle search         # Discover bundles
specify bundle info <name>    # Show full component set
specify bundle install <name>
specify bundle list           # Installed bundles + versions
```

### Self-management & events

```bash
specify self check            # Read-only: is a newer release available?
specify self upgrade --dry-run
specify event run <command>   # Run an event-driven command (used by hooks)
```

---

## Upgrading spec-kit

With `uvx`, there's nothing to upgrade — just pin a newer tag in your command:

```bash
# Change vX.Y.Z to the new release tag and re-run as normal
uvx --from git+https://github.com/github/spec-kit.git@vX.Y.Z specify init . --here --integration <agent>
```

If you're using the persistent install, upgrade with:

```bash
specify self upgrade
# or
uv tool install specify-cli --force --from git+https://github.com/github/spec-kit.git@vX.Y.Z
specify version
```

After upgrading the CLI, refresh the project files with `specify integration upgrade` (diff-aware; preserves your modifications).

---

## Extensions & Presets

spec-kit supports community extensions (new commands) and presets (template overrides):

```bash
# Browse and install extensions
uvx --from git+https://github.com/github/spec-kit.git specify extension search
uvx --from git+https://github.com/github/spec-kit.git specify extension add <name>

# Browse and install presets
uvx --from git+https://github.com/github/spec-kit.git specify preset search
uvx --from git+https://github.com/github/spec-kit.git specify preset add <name>
```

Extensions can also be installed at init time via `--extension <name|path|url>` (repeatable; use `--trust-extension-urls` for URLs in non-interactive sessions).

See the [community extensions catalog](https://speckit-community.github.io/extensions/) for what's available.

---

## Troubleshooting

**`specify: command not found`** — You're using the persistent install path but uv's tool bin isn't in PATH. Either add it:
```bash
export PATH="$HOME/.local/bin:$PATH"
```
Or switch to `uvx` (the preferred approach) which doesn't require PATH setup.

**`Error: Cannot specify both project name and --here flag`** — Use one or the other: `specify init my-project` or `specify init . --here`.

**Init hangs waiting for input** — Non-interactive shells can't answer the integration picker. Pass `--non-interactive --integration <agent>` explicitly.

**Slash commands not appearing** — Re-run `specify init` via `uvx` to regenerate integration files, or use `specify integration upgrade`:
```bash
uvx --from git+https://github.com/github/spec-kit.git specify init . --here --force --integration <agent>
```

**`--here` prompts for confirmation** — Expected if the directory is non-empty. Confirm to proceed, or pass `--force`.

**Wrong feature directory** — Current versions use `specs/` at the repo root. Legacy projects may use `.specify/features/`. Check which exists before running state-detection scripts.

**Agent tool check blocks init** — If the agent's CLI isn't installed locally, add `--ignore-agent-tools`.
