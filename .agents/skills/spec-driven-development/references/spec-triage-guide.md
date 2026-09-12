# Spec Triage Guide

Before creating a new spec, **always** scan existing specs to determine whether the work belongs to an existing spec. Spec sprawl — where "improve combat" becomes a new spec instead of updating the combat spec — undermines the entire workflow.

## Triage Process

When a new piece of work is requested:

1. **List all existing specs** — read `specs/` and review each `spec.md` title, problem statement, and functional requirements.
2. **Score relevance** — for each existing spec, ask: "Does this work change, extend, or fix something described in this spec?"
3. **Decide** — apply the decision matrix below.
4. **Document the decision** — regardless of outcome, record what you found and why you made the choice.

## Decision Matrix

| Condition | Action | Example |
|-----------|--------|---------|
| Work modifies existing FRs or ACs | **Amend existing spec** | "Improve combat damage calculation" → update FR-003 in the combat spec |
| Work adds new FRs to an existing domain | **Amend existing spec** | "Add ranged weapons to combat" → add FR-010 to the combat spec |
| Work fixes bugs in existing spec's scope | **Amend existing spec** | "Fix combat hit detection" → update ACs in the combat spec |
| Work is a genuinely new, unrelated feature | **Create new spec** | "Add inventory system" → new spec (first time this domain appears) |
| Work spans multiple existing specs | **Create new spec** with explicit references | "Crafting system that uses inventory + combat" → new spec that cites both |
| Work is ambiguous — could go either way | **Ask the user** before proceeding | "Better NPC behavior" — is this combat AI or dialogue? |

## How to Amend an Existing Spec

When triage determines work belongs to an existing spec:

1. **Open the existing spec** and bump the version (`v1.0` → `v1.1`).
2. **Add new FRs** in sequence (`FR-010`, `FR-011`, …) — never renumber existing ones.
3. **Update Acceptance Criteria** — add new ACs, modify existing ones if the behavior changes.
4. **Update the Problem Statement** if the scope has shifted materially.
5. **Add a "Change Log" section** at the bottom of the spec:

```markdown
## Change Log

| Version | Date | Change | Reason |
|---------|------|--------|--------|
| v1.1 | 2025-01-15 | Added FR-010, FR-011; updated AC-003 | Improve combat per user request |
| v1.0 | 2025-01-01 | Initial spec | — |
```

6. **Re-run triage** on the amended spec to confirm no further splitting is needed.
7. Proceed to Phase 3 (Clarification) or Phase 4 (Plan) as appropriate — **do not** create a new spec directory.

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|---|---|---|
| "Improve X" as a new spec | Fragments related work, creates orphaned specs | Amend the X spec |
| "Add feature Y to Z" as a new spec | The Z spec already owns this domain | Add FRs to Z's spec |
| "Fix bug in X" as a new spec | Bugs are part of the spec's scope | Update ACs in X's spec |
| Never amending specs | Specs become stale snapshots, not living documents | Bump version and add change log |
| Amending without versioning | Impossible to track what changed and when | Always bump version + add change log |

## Examples

### Example 1: Combat Improvement (Your Reported Case)

**Request:** "Improve the combat system"

**Wrong:** Create `specs/005-improve-combat/spec.md`
**Right:** Open the existing combat spec, add new FRs for the improvements, bump version, add change log entry.

### Example 2: New Weapon Type

**Request:** "Add ranged weapons to the game"

**Wrong:** Create `specs/006-ranged-weapons/spec.md`
**Right:** Amend the combat spec with new FRs for ranged mechanics, or if weapons are a separate domain, create a new spec that explicitly references the combat spec.

### Example 3: Bug Fix

**Request:** "Fix the dodge mechanic not working"

**Wrong:** Create `specs/007-fix-dodge/spec.md`
**Right:** Update the combat spec's ACs to include the dodge behavior, bump version.

### Example 4: Genuinely New Feature

**Request:** "Add an inventory system"

**Right:** Create `specs/005-inventory-system/spec.md` — this is a new domain not covered by any existing spec.

## What "Scanning Existing Specs" Means in Practice

The agent should:

1. Run `ls specs/` to list all spec directories.
2. For each directory, read the **title**, **problem statement**, and **functional requirements** (first ~30 lines of `spec.md` is usually enough).
3. Check if the requested work overlaps with any existing FRs or falls within any spec's domain.
4. If overlap exists, apply the decision matrix above.
5. Only create a new spec if no existing spec covers the domain.
