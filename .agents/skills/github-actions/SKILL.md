---
name: github-actions
description: Author secure, maintainable GitHub Actions workflows and CI/CD pipelines. Use when asked to "create a workflow", "set up CI/CD", "write a GitHub Action", "add a deploy pipeline", "configure Actions", "automate builds/tests/releases", or any GitHub Actions task. Covers SHA pinning for supply-chain security, least-privilege permissions, reusable workflows, composite actions, and Dependabot maintenance. Triggers on any request touching .github/workflows/ or GitHub Actions YAML.
license: MIT
metadata:
  author: shaunburdick
  version: "1.0.0"
---

# GitHub Actions

A secure-by-default approach to writing GitHub Actions workflows, composite actions, and reusable workflows. Follows GitHub's official security hardening guidance, OpenSSF Scorecard recommendations, and lessons learned from real-world supply-chain attacks.

## Non-Negotiable Rules

These rules apply to every workflow you write. No exceptions.

### 1. Pin Every Third-Party Action to a Full Commit SHA

**NEVER** reference an action by a version tag (`@v4`), branch (`@main`), or short SHA. Tags are mutable — the tj-actions/changed-files attack (March 2025) re-tagged 350+ versions to malicious commits, hitting 23,000+ repositories including users who pinned to numbered tags like `@46.0.0`.

**ALWAYS** use the full 40-character commit SHA with a human-readable version comment:

```yaml
# ❌ WRONG — mutable, can be silently retargeted
- uses: actions/checkout@v5
- uses: docker/login-action@v3
- uses: actions/setup-node@main

# ✅ RIGHT — immutable SHA with version comment
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v5.0.0
- uses: docker/login-action@f054a8b539a109f9f41c372932f1ae047eff08c9  # v3.4.0
```

**Why this matters:**
- Version tags can be moved by anyone who compromises the action's repository
- Short SHAs (7-char) are vulnerable to collision attacks — GitHub requires the full 40-char hash
- The version comment preserves readability while the SHA guarantees immutability
- Git tags are bookmarks that can be moved; commit hashes are cryptographic fingerprints that cannot change

**How to find the SHA for a version:**

1. Go to the action's GitHub repository (e.g., `github.com/actions/checkout`)
2. Navigate to the **Releases** page or the **Tags** dropdown
3. Click the version tag you want (e.g., `v5.0.0`)
4. Copy the full 40-character commit SHA from the commit page
5. Verify the commit belongs to the expected repository — not a fork (prevents impostor commit attacks)

**What NOT to pin:**
- **Local actions** (`uses: ./` or `uses: ../`) — they version with the workflow's own commit. Leave them as paths.
- **SLSA Build L3 reusable workflows** — the SLSA verifier requires a signed release tag to validate the workflow. These are the rare exception; document the allowlist explicitly.

### 2. Always Use the Latest Available Version

When writing a new workflow, use the latest published version of each action. Don't settle for an older tag you happen to know. Check the action's releases page and use the most recent stable release's commit SHA.

This ensures you start with current bug fixes, security patches, and features. Dependabot will handle keeping them current over time (see "Ongoing Maintenance" below).

### 3. Set Minimal GITHUB_TOKEN Permissions

The default `GITHUB_TOKEN` has broad write access. Scope it down to exactly what the workflow needs — ideally `contents: read` at the workflow level, with per-job escalation only where write is required:

```yaml
# ✅ RIGHT — default to read-only, escalate per-job
name: CI
on: [push, pull_request]

permissions:
  contents: read       # Workflow-level default: read-only

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v5.0.0
      - run: npm run lint

  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: write   # Only this job needs write
    needs: lint
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v5.0.0
      - run: npm publish
```

**The principle:** A compromised workflow with write access can push malicious code, modify releases, or exfiltrate secrets. Read-only by default limits the blast radius of any supply-chain attack.

### 4. Never Use `pull_request_target` Without Extreme Caution

The `pull_request_target` event runs in the context of the *target* repository — it has full access to your secrets and write permissions. If the workflow checks out untrusted PR code, a malicious pull request can exfiltrate secrets or inject backdoors.

**If you must use it:**
- NEVER check out or execute code from the pull request
- Use it only for read-only operations (labeling, commenting, status checks)
- If you need to build/test PR code, use the `pull_request` trigger instead

## Security Hardening

### Avoid Inline Script Injection

Never interpolate untrusted input directly into shell commands. GitHub Actions context values like `github.event.issue.title` can contain injected commands:

```yaml
# ❌ WRONG — script injection risk
- run: echo "${{ github.event.issue.title }}"

# ✅ RIGHT — use an intermediate environment variable
- run: echo "$TITLE"
  env:
    TITLE: ${{ github.event.issue.title }}
```

### Prefer OIDC Over Static Secrets

For cloud provider authentication (AWS, Azure, GCP), use OpenID Connect instead of storing long-lived credentials as GitHub Secrets:

```yaml
- uses: aws-actions/configure-aws-credentials@e3dd6b429c8426f4600960d5e4c2a8c3c0a98a5f  # v4.1.0
  with:
    role-to-assume: arn:aws:iam::123456789012:role/github-actions
    aws-region: us-east-1
```

OIDC generates short-lived tokens verified through trust relationships — no static credentials to steal or rotate.

### Pin Docker Container Images by Digest

For `runs-on: container` or `uses: docker://...`, pin to a SHA256 digest, not a tag:

```yaml
# ❌ WRONG — mutable image tag
container:
  image: node:22

# ✅ RIGHT — immutable digest
container:
  image: node:22@sha256:a1b2c3d4e5f6...
```

## Workflow Structure

### Naming and Organization

Every workflow must have a `name:` field. The Actions UI falls back to the filename, which is harder to scan:

```yaml
# ✅ RIGHT
name: CI - Lint, Test, Build
```

**File naming guidelines:**
- Use kebab-case: `ci.yml`, `deploy-production.yml`, `nightly-scan.yml`
- Prefix reusable workflows with underscore: `_build-and-push.yml`, `_security-gate.yml` (convention: they're not invoked directly)
- Place reusable workflows in `.github/workflows/`
- Place composite actions in `.github/actions/<action-name>/action.yml`

### Reusable Workflows vs. Composite Actions

Choose the right abstraction for the right context:

| Use a **reusable workflow** when... | Use a **composite action** when... |
|---|---|
| You need entire job(s) on separate runners | You need reusable *steps* within a job |
| Logic needs its own permissions or secrets | Steps share the caller's runner/filesystem |
| Output goes to other jobs as artifacts | You want to publish to GitHub Marketplace |
| You want separate log entries per job | The logic is a "bundle of steps" (setup, lint, install) |

```yaml
# Reusable workflow — called at the job level
jobs:
  test:
    uses: ./.github/workflows/_test.yml@<commit-sha>  # pin to SHA!

# Composite action — called as a step
steps:
  - uses: ./.github/actions/setup-node@<commit-sha>  # pin to SHA!
    with:
      node-version: '22'
```

**Key gotchas:**
- Every `run` step in a composite action MUST declare `shell: bash` — there's no default
- Composite actions cannot access the `secrets` context; pass secrets as `inputs` or use a reusable workflow instead
- Reusable workflows cannot nest more than 10 levels deep (but avoid deep nesting regardless)
- Secrets don't inherit automatically: pass explicitly or use `secrets: inherit` (be deliberate)

### Job Dependencies and Parallelism

Use `needs:` to define explicit dependencies. Jobs without dependencies run in parallel automatically:

```yaml
jobs:
  lint:      # Runs in parallel with unit-test and integration-test
    ...
  unit-test:  # Runs in parallel with lint and integration-test
    ...
  build:      # Waits for all three to complete (fan-in)
    needs: [lint, unit-test, integration-test]
    ...
```

## Ongoing Maintenance

### Dependabot for SHA Updates

SHA-pinned actions go stale. Configure Dependabot to open PRs with updated commit SHAs automatically:

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    groups:
      github-actions:
        patterns:
          - "*"              # Group all action updates into one PR
```

**Renovate alternative** (if you use it instead of Dependabot):

```json5
// renovate.json5
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "helpers:pinGitHubActionDigestsToSemver"  // Auto-pins to SHA with version comment
  ],
  "github-actions": {
    "packageRules": [{
      "matchDepTypes": ["action"],
      "matchUpdateTypes": ["patch", "minor"],
      "groupName": "GitHub Actions",
      "schedule": ["before 4am on monday"]
    }]
  }
}
```

**Important:** Automate *discovery*, not *approval*. Dependabot/Renovate should open PRs, but you review the diff before merging. Never auto-merge action updates without human review.

### OpenSSF Scorecard

Add the Scorecard action to assess and monitor your workflow security posture. It checks for pinned dependencies, token permissions, branch protection, and more:

```yaml
name: Scorecard supply-chain security
on:
  schedule:
    - cron: '30 1 * * 6'    # Weekly on Saturday
  push:
    branches: [main]

permissions: read-all

jobs:
  analysis:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      id-token: write
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v5.0.0
      - uses: ossf/scorecard-action@62b2cac7ed8198b15735ed49ab1e5cf35480ba46  # v2.4.0
        with:
          results_file: results.sarif
          results_format: sarif
          publish_results: true
      - uses: actions/upload-artifact@8c84d97ba2fd042804d8e54c45b69bba43a47c48  # v4.4.0
        with:
          name: SARIF file
          path: results.sarif
      - uses: github/codeql-action/upload-sarif@fd7281a871275f1fd67e33ea2c9efa0ef551a495  # v3.27.0
        with:
          sarif_file: results.sarif
```

## Workflow Checklist

Before committing any workflow file, verify:

- [ ] Every third-party `uses:` reference is pinned to a full 40-character commit SHA with a version comment
- [ ] All actions use the latest stable version (check the Releases page)
- [ ] `permissions:` is declared at the workflow level with `contents: read` minimum
- [ ] Jobs requiring write scope escalate permissions individually
- [ ] No `pull_request_target` without documented justification and safe usage
- [ ] No inline expansion of untrusted context values into shell commands
- [ ] Cloud authentication uses OIDC, not static secrets
- [ ] Docker image references use `@sha256:` digests
- [ ] The workflow has a human-readable `name:` field
- [ ] Dependabot or Renovate is configured for `github-actions` ecosystem
- [ ] Reusable workflows are versioned (not `@main`)
- [ ] Composite action `run` steps all have explicit `shell:` declarations

## Quick Patterns

> **IMPORTANT:** The commit SHAs in these examples are illustrative only. When writing real workflows, you must look up the latest stable version's commit SHA for each action using its GitHub Releases page. Never copy-paste SHAs from these examples — they will be stale.

### Standard CI Pipeline

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v5.0.0
      - uses: actions/setup-node@2028fbc5c25fe9cf00d9f06a71cc4710d4507903  # v6.0.0
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v5.0.0
      - uses: actions/setup-node@2028fbc5c25fe9cf00d9f06a71cc4710d4507903  # v6.0.0
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm test

  build:
    needs: [lint, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v5.0.0
      - uses: actions/setup-node@2028fbc5c25fe9cf00d9f06a71cc4710d4507903  # v6.0.0
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@8c84d97ba2fd042804d8e54c45b69bba43a47c48  # v4.4.0
        with:
          name: dist
          path: dist/
```

### Composite Action Template

```yaml
# .github/actions/setup-node/action.yml
name: 'Setup Node.js'
description: 'Install Node.js, dependencies, and configure caching'
inputs:
  node-version:
    description: 'Node.js version'
    required: false
    default: '22'
  run-install:
    description: 'Run npm ci after setup'
    required: false
    default: 'true'
runs:
  using: 'composite'
  steps:
    - uses: actions/setup-node@2028fbc5c25fe9cf00d9f06a71cc4710d4507903  # v6.0.0
      with:
        node-version: ${{ inputs.node-version }}
        cache: 'npm'
    - if: inputs.run-install == 'true'
      run: npm ci
      shell: bash    # REQUIRED for composite actions
```

### Reusable Workflow Template

```yaml
# .github/workflows/_deploy.yml
name: Reusable Deploy

on:
  workflow_call:
    inputs:
      environment:
        required: true
        type: string
    secrets:
      cloudflare-api-token:
        required: true

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v5.0.0
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.cloudflare-api-token }}
```
