---
name: spec-driven-development
description: Structured spec-driven development workflow. Load this skill whenever starting a new feature, building a system from scratch, requirements are unclear, or a user asks to "plan", "spec out", "design", or "architect" something — even if they don't use the word "spec". Guides the agent through six phases, constitution → specification → clarification → plan → tasks → implement. Never skip phases. Always review existing specs before creating new ones — amend existing specs when work falls within their domain.
license: MIT
metadata:
  author: shaunburdick
  version: "2.2.0"
---

# Spec-Driven Development

A disciplined, phase-gated approach to software development based on the [SDD philosophy](https://github.com/github/spec-kit/blob/main/spec-driven.md): **specifications are the source of truth — code serves specifications, not the other way around**.

The most common failure mode of AI-assisted coding is jumping straight to implementation before the problem is understood. This workflow prevents that.

## Tooling: spec-kit

This workflow is powered by the [spec-kit CLI](https://github.com/github/spec-kit). For installation, initialization, slash commands, and project state detection, load the **`spec-kit` skill**.

Quick reference for the impatient — initialize a project with `uvx` (no install required):

```bash
# New project
uvx --from git+https://github.com/github/spec-kit.git specify init <project-name> --integration opencode

# Existing project
uvx --from git+https://github.com/github/spec-kit.git specify init . --here --integration opencode
```

Supported `--integration` values include `opencode`, `claude`, `copilot`, `cursor-agent`, `codex`, `gemini`, and many others — run `specify integration list` from an initialized project for the full catalog.

## Directory Structure

```
project/
├── .specify/
│   ├── memory/
│   │   └── constitution.md          # Project principles — scaffolded at init, refined FIRST
│   └── scripts/bash/                # spec-kit helper scripts
└── specs/                           # One directory per feature, at the repo root
    ├── 001-feature-name/
    │   ├── spec.md                  # Feature specification (/speckit.specify)
    │   ├── plan.md                  # Created during planning phase
    │   ├── research.md
    │   ├── data-model.md
    │   ├── contracts/
    │   ├── quickstart.md
    │   └── tasks.md
    └── 002-feature-name/
        └── ...
```

> For full CLI setup, slash commands, and state detection, see the **`spec-kit` skill**.

## Phases Overview

| #   | Phase         | Owner     | Output                                     | Gate                                 |
| --- | ------------- | --------- | ------------------------------------------ | ------------------------------------ |
| 1   | Constitution  | Planner   | `.specify/memory/constitution.md`          | User approves                        |
| 2   | Specification | Planner   | `specs/###-name/spec.md`                   | User approves                        |
| 3   | Clarification | Planner   | Updated specs, zero ambiguities            | Zero `[NEEDS CLARIFICATION]` markers |
| 4   | Plan          | Architect | `specs/###-name/plan.md` + supporting docs | User approves                        |
| 5   | Tasks         | Architect | `specs/###-name/tasks.md`                  | User approves                        |
| 6   | Implement     | Architect | Working, tested code                       | All acceptance criteria met          |

**Never skip a phase.** Each gate exists to catch misunderstandings when they're cheap to fix.

---

## Phase 1: Constitution

Create `.specify/memory/constitution.md` **before anything else**. This is the north star for all decisions.

Include:

- **Core principles** (5–7 max — more dilutes them)
- **Technical decisions** (stack, deployment, storage) with rationale for each
- **Quality standards** (test coverage target, linting, type safety)
- **Anti-patterns to avoid** with examples
- **Success metrics** (product, technical, operational)

The constitution must be approved before writing any feature specs. All subsequent decisions must reference it. If a requirement conflicts with the constitution, resolve the conflict explicitly — don't silently ignore either.

---

## Phase 2: Specification

### Triage: Existing Specs First

Before creating any new spec, **scan all existing specs** to determine whether this work belongs to an existing spec. See [references/spec-triage-guide.md](references/spec-triage-guide.md) for the full decision matrix and examples.

**Process:**

1. Run `ls specs/` to list all existing spec directories.
2. For each spec, read the title, problem statement, and functional requirements (first ~30 lines of `spec.md`).
3. Ask: "Does this work modify, extend, or fix something described in an existing spec?"
4. **If yes** → amend the existing spec (bump version, add FRs, update ACs, add change log entry). Skip to the "Key sections" section below to update the spec in place.
5. **If no** → create a new spec as described below.
6. **If ambiguous** → ask the user before proceeding.

**Common mistake to avoid:** "Improve combat" is not a new feature — it's an amendment to the combat spec. "Add inventory system" is a new feature. When in doubt, check.

### Create the Spec

Create `specs/###-feature-name/spec.md` for each feature (the `/speckit.specify` command scaffolds this via the helper scripts). See [references/feature-spec-template.md](references/feature-spec-template.md) for the full template.

Key sections:

- **Problem Statement** — one paragraph, what and why
- **User Stories** — `As a <role>, I want <action> so that <benefit>`
- **Functional Requirements** — `FR-001`, `FR-002`, … (WHAT, not HOW)
- **Non-Functional Requirements** — performance, security, compatibility
- **Acceptance Criteria** — specific, measurable, binary pass/fail
- **Out of Scope** — explicitly named exclusions
- **Edge Cases** — documented with expected behavior

**What makes a requirement "executable":**

- Concrete, not abstract: "respond within 500ms" not "respond quickly"
- Measurable: "≥80% test coverage" not "good test coverage"
- Explicit error handling: document 404, 500, timeout, empty state behavior
- Example inputs/outputs for all user-facing elements

---

## Phase 3: Clarification

Before handing off to planning, eliminate every ambiguity.

**Process:**

1. Ask 3–5 targeted questions at a time (not a wall of 20)
2. For each question, explain _why_ the answer matters
3. Give an example of what a complete answer looks like
4. Document every answer as a new concrete requirement (`FR-007a`, `FR-007b`, etc.)
5. Update the spec version (`v1.0` → `v1.1`) and add a "Clarifications Applied" section

**Exit criteria:** Zero `[NEEDS CLARIFICATION]` markers remain. Every question has been answered and documented as a requirement. A developer could implement from this spec without asking further questions.

---

## Phase 4: Plan

Create a feature branch and run the planning setup:

```bash
git checkout -b 001-feature-name   # see git-safety skill for branch rules
.specify/scripts/bash/setup-plan.sh --json
```

Produce the following files in `specs/###-feature-name/`:

**`plan.md`** — Technical context, constitution alignment check, concrete project structure (no "Option A / Option B"), architecture overview, key decisions with rationale.

**`research.md`** — Technology choices with specific versions, rationale, and alternatives considered and rejected.

**`data-model.md`** — Complete entity definitions: fields with types and constraints, relationships, validation rules, state transitions. See [references/data-model-guide.md](references/data-model-guide.md).

**`contracts/`** — API/event schemas (OpenAPI, GraphQL, or event definitions).

**`quickstart.md`** — Setup instructions, how to run tests, key flows to validate manually, expected outputs.

After planning, agent context files are managed by the integrations system — if you changed agents or upgraded spec-kit, refresh with `specify integration upgrade`.

**Gate:** Present the plan. Do not proceed until approved.

---

## Phase 5: Tasks

Create `specs/###-feature-name/tasks.md`:

```markdown
# Tasks: <Feature Name>

- [ ] T-001: Set up project scaffold and install dependencies
- [ ] T-002: Implement data model / database schema
- [ ] T-003: [P] Write unit tests for core logic
- [ ] T-004: Implement core business logic
- [ ] T-005: Implement API layer
- [ ] T-006: Integration tests
- [ ] T-007: Update documentation
```

Rules:

- Each task completable in one sitting
- Mark parallel-safe tasks with `[P]`
- Order by dependency — foundational tasks first
- Test tasks sit alongside (not after) implementation tasks

**Gate:** Present tasks. Do not proceed until approved.

---

## Phase 6: Implement

Execute tasks in order, following the approved plan and referencing the constitution for quality standards.

For all code quality rules, lint suppression policy, type safety requirements, and the pre-commit verification protocol, load and follow the **`code-quality` skill**.

Key reminders:
- ✅ TDD preferred — write tests before or alongside implementation
- ✅ Every public function/method must have a doc comment
- ✅ Check off tasks in `tasks.md` as you complete them
- ❌ No lint suppressions of any kind — fix the code instead

---

## References

- [references/feature-spec-template.md](references/feature-spec-template.md) — Full spec template to copy
- [references/constitution-template.md](references/constitution-template.md) — Constitution template
- [references/data-model-guide.md](references/data-model-guide.md) — Data model authoring guide
- [references/spec-triage-guide.md](references/spec-triage-guide.md) — When to amend existing specs vs. create new ones
- **`spec-kit` skill** — CLI installation, slash commands, project state detection
- [SDD philosophy](https://github.com/github/spec-kit/blob/main/spec-driven.md) — The full spec-driven development manifesto
- [spec-kit repo](https://github.com/github/spec-kit) — Tooling source and docs
