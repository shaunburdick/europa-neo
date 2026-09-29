# AI Attribution — Source Code Disclosure

Optional source-level attribution using project-defined SPDX-style tags. These
tags are a convention for documenting provenance, not an official SPDX
standard or a guarantee of regulatory compliance.

## Format

Add these tags to the top of file headers:

```python
# SPDX-AI-Disclosure: ai-generated
# SPDX-AI-Model: claude-opus-4-6
# SPDX-AI-Provider: Anthropic
# SPDX-AI-Scope: authentication module
# SPDX-AI-Date: 2026-09-18
```

```javascript
// SPDX-AI-Disclosure: ai-generated
// SPDX-AI-Model: claude-opus-4-6
// SPDX-AI-Provider: Anthropic
```

```go
// SPDX-AI-Disclosure: ai-generated
// SPDX-AI-Model: claude-opus-4-6
```

## Disclosure Levels

| Value           | Meaning                                      |
| --------------- | -------------------------------------------- |
| `none`              | No AI involvement — positive human assertion |
| `ai-assisted`       | Human-authored, AI edited/refined            |
| `ai-generated`      | AI-generated with human prompting/review     |
| `autonomous`        | AI-generated without meaningful oversight    |

## Fields

| Field                | Required | Description                          |
| -------------------- | -------- | ------------------------------------ |
| `SPDX-AI-Disclosure:`    | Yes      | One of the four disclosure levels    |
| `SPDX-AI-Model:`         | No       | Model identifier                     |
| `SPDX-AI-Provider:`      | No       | Provider name                        |
| `SPDX-AI-Scope:`         | No       | What the AI did                      |
| `SPDX-AI-Date:`          | No       | ISO date of last AI involvement      |

## When to Use

- **Open source projects**: When you want consumers to know AI was involved
- **Compliance-sensitive projects**: When EU AI Act Article 50 applies
- **Not for most projects**: Git commit attribution is usually sufficient

## Repo-Level Disclosure

For repo-wide AI disclosure, add `AI_DISCLOSURE.md` to the root:

```yaml
---
disclosure-default: ai-assisted
models-used:
  - claude-opus-4-6
  - gpt-5
providers:
  - Anthropic
  - OpenAI
scope: |
  Application code is AI-assisted with manual review.
  Tests may be ai-generated.
  Documentation is human-written.
last-updated: 2026-09-18
---

# AI Disclosure

This repository uses AI coding assistants. See the tags in source files
for file-level attribution.
```
