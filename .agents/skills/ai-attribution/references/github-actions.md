# AI Attribution — GitHub Actions Workflow

A ready-to-use GitHub Actions workflow that auto-labels PRs containing the
`Generated-By` footer. Copy this file to `.github/workflows/ai-attribution-label.yml`
in any repo.

```yaml
name: AI Attribution Label

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  label:
    runs-on: ubuntu-latest
    timeout-minutes: 2
    steps:
      - name: Detect AI attribution in PR body
        uses: actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3  # v9.0.0
        with:
          script: |
            const body = context.payload.pull_request.body || '';
            const hasAttribution = /^Generated-By:\s+.+$/m.test(body);

            if (hasAttribution) {
              await github.rest.issues.addLabels({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                labels: ['ai-generated']
              });
              console.log('Applied ai-generated label');
            } else {
              console.log('No AI attribution found — skipping');
            }
```

## Setup

1. Copy the workflow to `.github/workflows/ai-attribution-label.yml`
2. Create the `ai-generated` label in your repo (Settings → Labels):
   - Name: `ai-generated`
   - Color: `5319e7` (purple)
   - Description: "PR was created or substantially written by an AI agent"
3. Commit and push

## How It Works

- On PR open/sync, the workflow checks the PR body for `Generated-By:`
- If found, it applies the `ai-generated` label
- If not found, it does nothing (human-authored PRs are unaffected)

## Customization

To also check commit messages for attribution trailers:

```yaml
- name: Check out repository
  uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v5.0.0

- name: Check commit messages
  run: |
    BASE=${{ github.event.pull_request.base.sha }}
    HEAD=${{ github.event.pull_request.head.sha }}
    if git log "$BASE..HEAD" --format='%B' | grep -q '^Generated-By:'; then
      echo "Found Generated-By in commits"
      # Apply label via gh CLI
      gh pr edit ${{ github.event.pull_request.number }} --add-label ai-generated
    fi
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The action references above are pinned to immutable commit SHAs. Update both
the SHA and its version comment together when upgrading them; see the
`github-actions` skill for the repository's workflow hardening rules.
