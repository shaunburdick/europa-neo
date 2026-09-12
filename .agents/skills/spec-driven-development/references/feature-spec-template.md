# Feature Spec Template

Copy this template to `specs/###-feature-name/spec.md`. Replace all `<placeholder>` values. Never leave `[NEEDS CLARIFICATION]` markers when handing off to planning.

---

```markdown
# Feature ###: <Feature Name>

> Version: 1.0
> Last Updated: <date>
> Status: Draft | In Review | Approved
> Dependencies: Feature 001, Feature 002 (or "None")

## Problem Statement

<One to three paragraphs. What problem are we solving? Who experiences it? Why does it matter now?>

## User Stories

- As a **<role>**, I want to **<action>** so that **<benefit>**.
- As a **<role>**, I want to **<action>** so that **<benefit>**.

## Functional Requirements

- **FR-001**: <Specific, testable requirement — WHAT, not HOW>
- **FR-002**: <Specific, testable requirement>
- **FR-003**: <Specific, testable requirement>

## Non-Functional Requirements

- **Performance**: <Concrete targets — e.g., "p95 latency < 200ms under 100 concurrent users">
- **Security**: <Auth requirements, data sensitivity, threat model>
- **Reliability**: <Uptime target, error handling, retry behavior>
- **Compatibility**: <Browser support, OS, runtime versions>
- **Observability**: <Logging, metrics, tracing requirements>

## Acceptance Criteria

- [ ] **AC-001**: <Verifiable, binary — either it passes or it doesn't>
- [ ] **AC-002**: <Verifiable, binary criterion>
- [ ] **AC-003**: <Verifiable, binary criterion>

## Out of Scope

The following are explicitly **not** part of this feature:

- <Item 1>
- <Item 2>

## Edge Cases

- <Edge case 1>: <Expected behavior>
- <Edge case 2>: <Expected behavior>
- Empty state: <What the user sees when there is no data>
- Error state: <What happens on 4xx/5xx/timeout>

## Examples

<For user-facing features: show example messages, UI states, or API request/response pairs.
The more concrete, the better — architects and implementers should not have to guess.>

## Open Questions

- [ ] <Unresolved question — must be resolved before planning begins>

## Clarifications Applied

> Populated during Phase 3. Each entry documents a question asked and the requirement it produced.

| # | Question | Answer | Requirement Added |
|---|----------|--------|-------------------|
| 1 | <question> | <answer> | FR-007a |
```
