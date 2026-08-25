# Europa Neo Constitution

## Core Principles

### I. Type Safety First

TypeScript strict mode everywhere — `strict: true` in tsconfig, no `any` types without explicit documented justification, no lint-rule suppressions (`eslint-disable`, `@ts-ignore`, `@ts-nocheck`). If the compiler or linter complains, fix the code, never silence the tooling.

### II. Server-Authoritative Deterministic Simulation

The server owns all game state; clients render and request actions only. The simulation runs on fixed ticks and must be deterministic: identical inputs in identical order always produce identical game state. No wall-clock reads, floating-point drift, or iteration-order dependence inside tick logic. Determinism enables replays, validation, testing, and future multiplayer trust.

### III. Tested Game Logic (NON-NEGOTIABLE)

Game logic modules maintain ≥80% test coverage. Tests target behavior, not implementation details: happy path plus edge cases (boundary ticks, invalid input, state transitions). Coverage on simulation code is a merge gate, not an aspiration.

### IV. Specs as Documentation

Europa Neo is open source; specifications live in-repo under `specs/` and are treated as first-class documentation. Every feature starts with a spec that a new contributor could read and understand without tribal knowledge. Code comments explain *why*; specs explain *what* and *for whom*. Stale specs are bugs.

### V. Simplicity Over Cleverness

Start simple; apply YAGNI ruthlessly. Clever one-liners, premature abstraction, and speculative generality are rejected in review. Complexity must be justified in writing. The codebase should be readable by a motivated contributor on their first evening.

### VI. Accessibility-Minded UI

The interface targets WCAG 2.2 AA: keyboard navigability, screen-reader semantics, sufficient contrast, visible focus states. A space strategy game should not be playable only by people with perfect vision and a mouse.

### VII. Self-Hostable by Default

Every release must be runnable by an individual on their own hardware with plain instructions (single process, config via environment/files, no required cloud services). If a feature cannot be self-hosted, it does not ship as core.

## Additional Constraints

- **Open-source licensing friendliness**: All dependencies must use permissive licenses (MIT, BSD, Apache-2.0, ISC) or compatible copyleft that permits redistribution. No GPL-incompatible or source-available dependencies in the dependency tree. The project itself ships under an OSI-approved license.
- **No vendor lock-in**: Core functionality must not depend on proprietary APIs, paid SaaS, or single-provider services. External integrations sit behind thin, swappable interfaces so contributors can replace them with local or self-hosted equivalents.

## Development Workflow

- **Spec-driven development**: Features follow the six-phase flow (constitution → specification → clarification → plan → tasks → implement). No implementation without an approved spec and plan.
- **Feature branches only**: All code lands via branches named `NNN-feature-slug`; direct commits to `main` are forbidden.
- **Conventional Commits**: Commit messages follow `type(scope): summary` (e.g., `feat(sim): add tick scheduler`). Types include feat, fix, docs, refactor, test, chore.
- **Verification before commit**: Lint, typecheck, tests, and build must pass locally before every commit. "It should work" is not evidence.

## Governance

This constitution supersedes all other practices and documentation. Amendments require a written proposal, explicit approval, a version bump, and a migration note describing impact on existing code and specs. All pull requests and reviews verify compliance; complexity or exceptions must be justified against these principles in the PR description. Use `AGENTS.md` for runtime agent guidance.

**Version**: 1.0.0 | **Ratified**: 2026-08-21 | **Last Amended**: 2026-08-21
