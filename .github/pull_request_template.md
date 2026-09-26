## Summary

<!-- 
Write 1-2 sentences describing what this PR does, not why.
Good: "Adds a PR template with AI disclosure checklist."
Bad: "We need better PR hygiene." (that's motivation, not summary)
-->

## Motivation

<!-- 
Why does this change need to happen? What problem does it solve or what
feature does it enable? Reference the GitHub issue it closes.
If there's no issue, explain the context that led to this change.
-->

Closes #

## Changes

<!-- 
Bullet the key changes. Group by area if the PR touches multiple systems.
Focus on what changed, not how it was implemented (that's in the code).
Example:
- Added AI usage policy section to CONTRIBUTING.md
- Created .husky/prepare-commit-msg hook for attribution
-->

-

## Test plan

<!-- 
How can reviewers verify this change works? Be specific.
Include commands to run, routes to visit, or manual steps to perform.
The first checkbox is almost always checked — run `pnpm verify` before pushing.
-->

- [ ] Tests pass (`pnpm verify`)
- [ ] Manual verification: <!-- e.g., "visited /lobby, created match, verified join flow" -->

## AI Disclosure

<!--
Check ONE of the following. This helps reviewers understand the PR's origin.
If you're an agent, you MUST check one of the last two options.
If you're a human writing code yourself, check "Human-only".
-->

- [ ] Human-only — no AI involvement
- [ ] AI-assisted — human-authored, AI helped with edits/refinement
- [ ] AI-generated — AI created the content, human reviewed

<!--
If you checked "AI-assisted" or "AI-generated", append this footer
to the bottom of the PR body (after the last section):

  Generated-By: <agent-name> (model: <model-id>)

Use your actual agent name and model ID. Example:
  Generated-By: modern-architect-engineer (model: opencode-go/mimo-v2.5)

This is required for EU AI Act Article 50 compliance. See AI_DISCLOSURE.md.
-->
