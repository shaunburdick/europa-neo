# AI Attribution — PR Template

A ready-to-use PR template that includes an AI disclosure field. Copy this
file to `.github/pull_request_template.md` in any repo.

```markdown
## Summary

<!-- What does this PR do? -->

## Test plan

<!-- How can reviewers verify this change? -->

## AI Disclosure

<!-- If an AI agent contributed to this PR, select one: -->

- [ ] No AI involvement — this PR was written entirely by humans
- [ ] AI-assisted — human-authored, AI helped with edits/refinement
- [ ] AI-generated — AI created the content, human reviewed

**If AI-generated or AI-assisted**, include the attribution footer in the
PR body:

~~~
Generated-By: <agent-name> (model: <model-name>)
~~~

See the `ai-attribution` skill for format details.
```

## Setup

1. Copy the template to `.github/pull_request_template.md`
2. Customize the checklist as needed
3. Commit and push

## How It Works

- When a contributor opens a PR, GitHub pre-fills the body with the template
- The AI Disclosure section prompts agents (or humans) to declare AI involvement
- The `Generated-By:` footer provides machine-readable attribution

## Notes

- This template is additive — it doesn't replace your existing PR template
- For repos with existing templates, merge the AI Disclosure section into yours
- The template works for both human and agent PRs
