---
name: code-quality
description: "Enforces non-negotiable code quality standards for AI coding agents. Covers linting rules (no suppressions — ever), type safety (no `any` in TypeScript, no `# type: ignore` in Python), tooling discipline (choosing edit tools, reading tool errors), and a mandatory pre-commit verification protocol. Load this skill proactively whenever writing, editing, or reviewing code — don't wait to be asked. Ensures consistent quality gates across all languages and coding agents."
license: MIT
metadata:
  author: shaunburdick
  version: "1.1.0"
---

# Code Quality Standards

Non-negotiable rules for writing and committing code. These standards exist to keep codebases maintainable, type-safe, and free from technical debt introduced by suppressed warnings.

## Linting — Zero Tolerance for Suppressions

This applies to **all languages**, not just TypeScript. The principle is the same everywhere: fix the code, don't silence the tool.

| Language   | Never use                                              |
| ---------- | ------------------------------------------------------ |
| TypeScript | `eslint-disable`, `@ts-ignore`, `@ts-nocheck`, `@ts-expect-error` |
| JavaScript | `eslint-disable`, `eslint-disable-next-line`           |
| Python     | `# noqa`, `# type: ignore`, `# pylint: disable`       |
| Rust       | `#[allow(...)]` (except in generated code)             |
| Go         | `//nolint`                                             |

- ❌ **NEVER** suppress a lint or type warning inline in code
- ✅ **ALWAYS** refactor code to comply with the rule's intent
- ✅ If a rule seems genuinely wrong for the project, discuss modifying the **lint config file** with the user — don't suppress it in code

**When you encounter a lint error:**
1. Read and understand what the rule is trying to prevent
2. Refactor your code to comply with the rule's intent
3. If you believe the rule is genuinely incorrect for the project, ask the user about modifying the lint configuration file
4. Document why the pattern you're using is correct and safe

**Wrong vs. Right (TypeScript example):**

```typescript
// ❌ WRONG — suppressing the rule
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function process(data: any) { ... }

// ✅ RIGHT — proper typing
interface ProcessData {
  id: string;
  value: number;
}
function process(data: ProcessData) { ... }
```

**Wrong vs. Right (Python example):**

```python
# ❌ WRONG — suppressing the type checker
def process(data) -> None:  # type: ignore
    ...

# ✅ RIGHT — proper typing
from typing import TypedDict

class ProcessData(TypedDict):
    id: str
    value: int

def process(data: ProcessData) -> None:
    ...
```

## Type Safety

Weak types are deferred bugs. Use the type system fully in whatever language you're working in.

**TypeScript:**
- ❌ No `any` — use proper interfaces, generics, or `unknown` with type guards
- ✅ Create interfaces or type aliases for all data shapes
- ✅ Use generics when the type varies but the structure is consistent
- ✅ Use `unknown` + type narrowing instead of `any` when the type is genuinely unknown

**Python:**
- ❌ No untyped function signatures — annotate all parameters and return types
- ✅ Use `TypedDict`, `dataclass`, or `pydantic` models for structured data
- ✅ Use `Any` from `typing` only as a last resort with a comment explaining why

## Tooling Discipline

The general rule, in every harness: **match the tool to the size and certainty
of the change, and read the whole error before acting on it.**

### Prefer tools whose failure modes are small

An edit tool that verifies your `oldString` still matches will fail when the
file moved underneath you. One that replaces the file wholesale will not.
Choose accordingly:

| Change | Prefer | Because |
| --- | --- | --- |
| Whole file, or most of it | full-file write | No content matching, so nothing to fail on |
| Small, well-understood region | targeted edit | Cheapest and most reviewable |
| Applying a diff you did not author | patch, with care | Verifies context; fails when context is stale |

The last row is the one to watch. A verified-patch tool's dominant failure is
"could not find the expected lines," which means the file changed since you
read it. Re-read the file and re-derive the change rather than retrying the
same patch — the retry costs a call and fails identically.

### Read the error, not the payload

Some harnesses return tool errors as a serialized envelope with a short
message wrapped inside a larger object that may echo your full arguments back.
A single missing argument can produce over a kilobyte of diagnostics.

- Read the **message** field and stop there
- Do not re-send the same call with a guess at a fix
- Do not let an error payload stand in for a re-read of the file — the file you
  saw before the call is not necessarily the file on disk now

### Know what the tool surface actually is

Tool names are versioned and do get renamed. A directive written against an
older name silently does nothing rather than erroring usefully. Before
documenting a tool in a directive or writing one into a script, confirm it
exists in the current version.

<details>
<summary>OpenCode v2 reference (measured 2026-09-27)</summary>

| Retired (v1) | Current (v2) | Notes |
| --- | --- | --- |
| `apply_patch` | `edit`, `write`, `patch` | `edit` 3.1% error rate, `patch` 20.6% |
| `task` | `subagent` | `subagent(agent=, description=, prompt=)`; `description` is required, `prompt` is no longer positional. Adds `sessionID` and `background`. |
| `bash` | `shell` | `bash` still resolves, but `shell` is current |

`edit` was the best-behaved write tool measured (25 errors in 818 calls, 95%
CI [2.1%, 4.5%]). `patch` was 7 in 34, but that interval is [10.3%, 36.8%] —
too wide to call better or worse than v1's `apply_patch`, which sat at 26.8%.

`edit` errors arrive as a JSON envelope that echoes the full argument object
back, including file content. Read `message` only.

</details>

## Task Complete & Pre-Commit Checklist

A task isn't done until it's ready to commit. Run through this once before every commit:

**Code correctness:**
- [ ] Latest stable versions of all dependencies are used
- [ ] All public methods have doc comments
- [ ] Automated tests implemented with adequate coverage (per project constitution)
- [ ] Code passes all linting rules — **zero suppressions in any language**
- [ ] Type safety fully enforced — **no `any` / untyped signatures**
- [ ] All acceptance criteria from spec are met
- [ ] Security best practices followed
- [ ] Code follows the architecture defined in the plan

**Verification:**
- [ ] Full test suite: `npm test` / `pytest` / `go test ./...` / equivalent — all green
- [ ] Linting: `npm run lint` / `ruff check .` / equivalent — zero errors, zero warnings
- [ ] Type checking: `tsc --noEmit` / `mypy` / equivalent — zero errors
- [ ] Build: `npm run build` / `go build` / equivalent — completes successfully
- [ ] The specific change was manually verified end-to-end
- [ ] Edge cases tested
- [ ] Related functionality still works
- [ ] No failed tool call was retried without first re-reading the target file

**Diff review:**
- [ ] No debug code, `console.log`, or `print` statements left behind
- [ ] No commented-out code
- [ ] All changed files are intentional and necessary
- [ ] Can clearly explain what changed and why

> 🚫 If any item above is unchecked — don't commit. Fix it first.
