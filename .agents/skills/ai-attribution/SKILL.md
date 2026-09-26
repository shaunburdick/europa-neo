---
name: ai-attribution
description: "Load when creating commits, PRs, issues, or comments that need AI attribution. Standardizes the Generated-By trailer format across all surfaces — commits, PRs, issues, comments, and source code — for transparency and EU AI Act Article 50 compliance. Use whenever an agent creates or modifies content that will appear under a human account."
license: MIT
metadata:
  author: shaunburdick
  version: "1.1.0"
---

# AI Attribution

A consistent attribution convention for AI-generated content across all
surfaces: git commits, pull requests, issues, comments, and source code.
One format, multiple surfaces.

## When to Load

Load this skill when any of the following apply:

- Creating or amending git commits
- Creating or updating pull requests via `gh pr create` or equivalent
- Responding to PR review comments
- Creating or updating issues on GitHub, Linear, or other trackers

## Core Principle

When an agent acts on behalf of a human, the output must include a
`Generated-By` trailer that identifies the agent and model. This provides
transparency to collaborators, auditors, and compliance frameworks.

The `Author:` field (or equivalent) always contains the human operator.
The `Generated-By:` trailer is for the AI agent only.

## Format

```
Generated-By: <agent-name> (model: <model-name>)
```

Use your actual agent name and model ID from your system prompt. Example:

```
Generated-By: my-agent (model: my-model)
```

This format aligns with the Apache Software Foundation's `Generated-by`
convention and is parseable via `git log --trailer=Generated-By`.

## Surface-Specific Instructions

### Git Commits

If your environment provides the `prepare-commit-msg` hook from the
git-safety skill, it detects AI sessions via a cross-harness signal matrix
(`AI_AGENT`, `AGENT`, `CLAUDE_CODE`, `CURSOR_AGENT`, `CODEX_SANDBOX`,
`GEMINI_CLI`, `AUGMENT_AGENT`, `CLINE_ACTIVE`, ...) and appends the trailer
automatically — no manual action needed. On harnesses that set no AI marker
(OpenCode v2), claim the commit by running it through `git-agent-commit` or
with inline `AI_AGENT=opencode ...` env (see the git-safety skill for the
full matrix).

Otherwise, append the `Generated-By` trailer to the commit message body:

```bash
git commit -m "feat: add feature

---
Generated-By: my-agent (model: my-model)"
```

### Pull Requests

When creating a PR via `gh pr create` or equivalent, include the
`Generated-By` footer at the bottom of the PR body.

**Format for PR body**:

```markdown
## Summary

<description of changes>

## Test plan

<how to verify>

---

Generated-By: <agent-name> (model: <model-name>)
```

**Agent action**: Append the footer to the PR body before creation.

**Implementation**: Include the footer in the `--body` argument:

```bash
gh pr create --title "feat: add feature" --body "## Summary

Add new feature.

---

Generated-By: my-agent (model: my-model)"
```

Or write the body to a file and use `--body-file` to avoid shell escaping
issues.

### PR Comments

When responding to PR comments or review feedback, include the footer at
the bottom of the comment.

**Format for PR comment**:

```markdown
<response to review comment>

---
Generated-By: <agent-name> (model: <model-name>)
```

**Agent action**: Append the footer to every PR comment.

### GitHub Issues

When creating or updating issues, include the footer in the issue body.

**Format for issue body**:

```markdown
<issue description>

---
Generated-By: <agent-name> (model: <model-name>)
```

**Agent action**: Append the footer to the issue body.

### Other Issue Trackers (Linear, Jira, etc.)

When creating or updating issues on non-GitHub trackers, include the
footer in the issue description or comment using the same format.

**Agent action**: Append the footer to every issue description or comment.

### Source Code (Optional)

For projects requiring source-level disclosure, add SPDX-style tags to
file headers. This is optional and follows the W3C AI Content Disclosure
vocabulary.

**Format for source file header**:

```python
# SPDX-AI-Disclosure: ai-generated
# SPDX-AI-Model: claude-opus-4-6
# SPDX-AI-Provider: Anthropic
# SPDX-AI-Scope: authentication module
```

Or for languages without `#` comments:

```javascript
// SPDX-AI-Disclosure: ai-generated
// SPDX-AI-Model: claude-opus-4-6
// SPDX-AI-Provider: Anthropic
```

**Agent action**: Only add when the project explicitly requires source-level
attribution. Do not add to every file.

## Disclosure Levels

Use the appropriate level based on the agent's role:

| Level            | Description                           | When to use                          |
| ---------------- | ------------------------------------- | ------------------------------------ |
| `ai-generated`       | AI generated, human reviewed          | Most agent-created content           |
| `ai-assisted`        | Human authored, AI edited/refined     | Agent made minor edits to human code |
| `none`               | Fully human authored                  | When you want to assert human work   |

For most agent activities, `ai-generated` is the correct level.

## EU AI Act Article 50 Compliance

This convention supports compliance with EU AI Act Article 50 transparency
obligations (enforceable August 2, 2026):

- **Article 50(2)**: Machine-readable marking — the `Generated-By:` trailer
  is parseable by tools (`git log --trailer=Generated-By`)
- **Article 50(5)**: Clear and distinguishable — the footer is visible in
  PR bodies, comments, and issue descriptions

The Code of Practice on Transparency of AI-Generated Content (published
June 10, 2026) provides a voluntary compliance framework. This convention
aligns with its principles.

## When NOT to Attribute

- **Human commits**: Never add `Generated-By:` to commits made by humans
- **Human-authored PRs**: Never add the footer to PRs written by humans
- **Bot actions**: Dependabot, GitHub Actions, and other bots have their
  own attribution mechanisms

## Repo-Specific Enhancements

This skill provides the portable layer. Repos can add:

- **GitHub Actions workflow**: Auto-apply `ai-generated` label to PRs
- **PR template**: Include AI disclosure field in `.github/pull_request_template.md`
- **Branch naming**: Convention like `ai/feature-name` for agent branches
- **CI checks**: Validate that agent-generated PRs include the footer

These are optional and repo-specific. The skill ensures consistency
regardless of repo-level tooling.

## Related Skills and References

- **[git-safety](../git-safety/)**: Installs an optional commit hook and
  defines safe branch, push, and history-rewrite practices.
- **[github-actions](../github-actions/)**: Use alongside the workflow
  reference below when adding CI automation.
- **[GitHub Actions workflow](references/github-actions.md)**: Optional
  auto-labeling workflow; read before copying it into a repository.
- **[PR template](references/pr-template.md)**: Optional human-facing
  disclosure prompt.
- **[Source disclosure](references/source-disclosure.md)**: Optional
  file-level convention; use only when the project requires it.

The commit-hook details intentionally live in `git-safety`; use this skill for
surfaces beyond commits rather than loading both sections into context.

> Attribution conventions are transparency aids, not legal advice or a
> guarantee of regulatory compliance. Confirm applicable requirements with
> the project's legal or compliance owner.

## Verification

To find all AI-generated content across surfaces:

```bash
# Git commits
git log --trailer=Generated-By --oneline

# PRs with attribution (requires gh CLI)
gh pr list --json body --jq '.[] | select(.body | contains("Generated-By"))'

# Issues with attribution
gh issue list --json body --jq '.[] | select(.body | contains("Generated-By"))'
```
