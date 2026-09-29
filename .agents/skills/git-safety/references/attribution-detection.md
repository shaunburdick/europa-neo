# Attribution Detection Reference

Supporting detail for the **AI Commit Attribution** section of
`../SKILL.md`. Agents should load this file when they need the full
per-harness signal matrix, the OpenCode v2 environment reality, mixed
environment behavior, or the parsing commands.

## Detection Signal Matrix

The hook treats the session as AI when **any** of these env vars is set to a
non-empty value (not just `1`):

| Harness | Detection env var(s) | Notes |
|---|---|---|
| Standard (emerging) | `AI_AGENT` | `CI=true`-style convention (agentsmd/agents.md#136); `opencode` is the canonical claim; other non-boolean values are the **agent name** (see Agent Name and Model Resolution) |
| Legacy `AGENT` | `AGENT` | Any non-empty value matches; non-boolean values become the agent name |
| Goose / Amp | `AGENT=goose` / `AGENT=amp` | Adopted the `AGENT` convention with non-`1` values |
| Claude Code | `CLAUDE_CODE`, `CLAUDE_CODE_ENTRYPOINT` | Set in subprocesses spawned by Claude Code |
| Cursor | `CURSOR_AGENT` | |
| Gemini CLI | `GEMINI_CLI` | |
| Codex CLI | `CODEX_SANDBOX` | |
| Augment | `AUGMENT_AGENT` | |
| Cline | `CLINE_ACTIVE` | |
| OpenCode v1 (Vercel) | `OPENCODE_CLIENT` | v1 repo archived; continued as Crush |
| OpenCode v2 | **none — claim explicitly** | See next section |
| Legacy `OPENCODE` | `OPENCODE` | Historical |
| Explicit claim | `OPENCODE_AGENT` / `OPENCODE_MODEL` | Either var alone is a sufficient claim signal |

Detection libraries that maintain similar matrices: `@vercel/detect-agent`,
Bun's `isAIAgent()`.

## OpenCode v2 Environment Reality

OpenCode v2 (`anomalyco/opencode`) sets exactly one env var on every spawned
process — `OPENCODE_TERMINAL=1` — unconditionally, on agent tool shells AND
the human's interactive TUI terminal. It never sets `OPENCODE`, `AGENT`,
`OPENCODE_AGENT`, or `OPENCODE_MODEL`. Two consequences:

- `OPENCODE_TERMINAL` is **not** an AI signal. The hook never attributes from
  it alone, so human commits in the TUI terminal are never misattributed.
- Agent commits must carry an explicit claim, because each bash tool call
  spawns a **fresh login shell** — env vars exported at session start do
  **not** persist to a later `git commit` call.

### Why session-start exports don't work on v2

Each `bash` tool invocation runs as a new login shell (`bash -lc "..."`), so
the process environment is rebuilt from the server's env plus `TERM` and
`OPENCODE_TERMINAL`. An `export` performed by one tool call is gone by the
next. The claim must therefore ride on the same command line as the commit.

### OpenCode v2 claim convention

```bash
git-agent-commit -m "feat: add widget"              # Generated-By: opencode
OPENCODE_AGENT="my-agent" OPENCODE_MODEL="my-model" \
  git-agent-commit -m "feat: add widget"            # Generated-By: my-agent (model: my-model)
# identical inline form:
AI_AGENT=opencode OPENCODE_AGENT="my-agent" OPENCODE_MODEL="my-model" \
  git commit -m "feat: add widget"
```

Trailer defaults: no `OPENCODE_AGENT` → harness name (`opencode` for the
canonical claim); `OPENCODE_AGENT` only → the agent name; both set →
`<agent> (model: <model>)`. Full cross-harness resolution: next section.

### Unclaimed OpenCode sessions

When `OPENCODE_TERMINAL=1` is present with no claim (an agent that forgot, or
a human committing inside the TUI terminal), the hook prints a stderr warning
and appends **nothing**. The commit always succeeds. Humans inside the
OpenCode TUI terminal see the warning too — that is deliberate: it is the
price of making agent silent-failure impossible, and no trailer is ever
falsely added.

## Agent Name and Model Resolution

Beyond harness detection, the hook resolves an **agent name** and a **model**
for the trailer (amendment A2, FR-009/FR-010).

Agent name precedence (first match wins):

1. `OPENCODE_AGENT` — only when the harness is `opencode`; a stale value left
   over from another harness's session is ignored.
2. The `AI_AGENT` / `AGENT` **value itself** — per agents.md#136 the value is
   the agent name (`goose`, `amp`, `custom-architect`, ...). Exceptions:
   boolean markers (`1`, `true`) and the canonical claim value `opencode`,
   which mean "harness only".
3. Fallback: the harness name.

Model resolution is harness-scoped; nothing is fabricated:

| Harness | Model var | Evidence |
|---|---|---|
| `opencode` | `OPENCODE_MODEL` | claim var set by the wrapper or inline |
| `claude-code` | `ANTHROPIC_MODEL` | confirmed present in Claude Code's bash-tool env (claude-code#27754 showed `ANTHROPIC_MODEL=global.anthropic.claude-opus-4-6-v1`); emitted as-is — `[1m]` extension suffixes and `global.` / `us.` provider prefixes are preserved |
| all others | none | no model var confirmed exported to tool subprocesses; `OPENAI_MODEL` / `GEMINI_MODEL` are SDK config vars, not harness exports |

A model var alone **never** triggers attribution — detection requires a
harness marker first — so a human whose shell happens to export
`ANTHROPIC_MODEL` is never attributed (AC-5b).

Trailer forms, in precedence order:

- `<agent> (model: <model>)` — both known
- `<harness> (model: <model>)` — agent unknown, model known (e.g.
  claude-code exporting `ANTHROPIC_MODEL`)
- `<agent>` — agent known, no model
- `<harness>` — neither known

## Mixed Environments (AI + Human Commits)

| Scenario | Detection | Hook behavior |
|---|---|---|
| Agent on a harness with a marker (Claude Code, Cursor, Goose, Amp, ...) | harness env var | appends trailer; agent name from claim value (harness fallback), model when the harness exports one |
| Agent on OpenCode v2, claimed | `AI_AGENT` via `git-agent-commit` | appends default or rich attribution |
| Agent on OpenCode v2, forgot to claim | `OPENCODE_TERMINAL` only | stderr warning; **no** trailer |
| Human terminal (outside OpenCode) | no vars | exits silently, no trailer |
| Human inside OpenCode TUI terminal | `OPENCODE_TERMINAL` only | stderr warning; **no** trailer |

## Parsing Attribution

Find all AI-generated commits:

```bash
git log --trailer=Generated-By --oneline
```

Extract unique agents/models:

```bash
git log --format='%(trailers:valueonly,separator=%x2C,unfold,separator=%x2Ckey=Generated-By)' | sort | uniq -c | sort -rn
```

## Ecosystem Status

- `AI_AGENT` standard: proposed in
  [agentsmd/agents.md#136](https://github.com/agentsmd/agents.md/issues/136)
  (Jan 2026) — a `CI=true`-style convention for agent-runtime detection.
- OpenCode v2 does not yet set an AI marker on tool-executed ptys; an
  upstream feature request is the long-term fix (tracked separately).
- The detection matrix here is maintained in sync with `scripts/prepare-commit-msg`.

### Plugin Automation Spike (Sep 2026)

Question: can an OpenCode v2 plugin make claiming fully automatic by injecting
attribution env into the shell tool?

**Verdict: yes on v2.0.15 (current release), no on dev — so not shippable
today; the claim convention remains the supported path.**

Findings (source: anomalyco/opencode source at tag `v2.0.15` vs `dev`):

- **v2.0.15 — clean path exists.** The plugin context exposes
  `ctx.shell.hook("create.before", fn)` (`packages/plugin/src/effect/shell.ts`):
  the callback receives a mutable `ShellCreateBefore` record
  `{ command, cwd, timeout, shell, env }`. The core Shell service builds
  `invocation.env = { ...(sessionEnvironment ?? process.env) }`, triggers the
  hooks, then spawns with the mutated `env` (`packages/core/src/shell.ts`).
  Tool shell calls flow through this path (`shell.create`), so the hook fires
  for agent tool shells, per-call and race-free. A plugin could set
  `AI_AGENT=opencode` (plus `OPENCODE_AGENT`/`OPENCODE_MODEL` when derivable)
  on `invocation.env` and restore after — no `process.env` mutation, no
  cross-session races.
- **Not via `ctx.tool.transform`.** The v2.0.15/bash tool input schema is
  `{ command, workdir, timeout }` — there is no `env` input field to inject
  through, and wrapping the executor to mutate `process.env` would be global
  mutable server state with cross-session races. The transform API is the
  wrong mechanism for this.
- **dev (unreleased) — path removed.** The bash tool was rewritten: input is
  `{ command, workdir, timeout }`, execution goes through
  `ChildProcess.make(...)` with no env option and no hook trigger
  (`packages/core/src/tool/bash.ts`). Upstream TODO: *"Add plugin shell.env
  environment augmentation once V2 plugin hooks exist."* — i.e., the
  `create.before` hook is a v2.0.15-era API dropped on dev pending a new
  V2 plugin hooks design.

Impact: a plugin would work only on v2.0.15 and break on the next release, so
the skill ships the claim convention (wrapper/inline env) as the
version-stable mechanism. Revisit when upstream lands the new V2 plugin hooks.