---
name: code-quality
description: "Enforces non-negotiable code quality standards for AI coding agents. Covers linting rules (no suppressions — ever), type safety (no `any` in TypeScript, no `# type: ignore` in Python), and a mandatory pre-commit verification protocol. Load this skill proactively whenever writing, editing, or reviewing code — don't wait to be asked. Ensures consistent quality gates across all languages and coding agents."
license: MIT
metadata:
  author: shaunburdick
  version: "1.0.0"
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

**Diff review:**
- [ ] No debug code, `console.log`, or `print` statements left behind
- [ ] No commented-out code
- [ ] All changed files are intentional and necessary
- [ ] Can clearly explain what changed and why

> 🚫 If any item above is unchecked — don't commit. Fix it first.
