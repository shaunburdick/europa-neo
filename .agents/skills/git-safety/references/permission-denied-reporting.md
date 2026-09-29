# Git Safety: Permission-Denied Reporting and Escalation

Loaded from the `git-safety` SKILL.md — this section moved here to keep the
skill under the 500-line guidance. **Agents MUST read this file whenever a git
operation is denied or a secret/encrypted-file boundary is in play.**

When a git operation is denied by permissions, tool configuration, or
server-side policy, the agent MUST follow these rules without exception.

## Permission-Denied Reporting

When a permission-denied error is returned, report ALL of the following:

1. **Exact operation denied**: Name the full command that was blocked (e.g.,
   `git push origin 001-feature-name`).
2. **Denial source**: Identify whether the denial came from the platform
   permission matcher, a server-side hook, or a repository policy.
3. **Failure evidence**: Preserve the exact error message, exit code, and
   any stderr output. Do not paraphrase or truncate the evidence.
4. **Context**: Report the branch, remote, and any flags that were in use.

- **Valid case**: Agent receives a permission error and reports: "Operation
  `git push origin 001-feature-name` denied by platform permission matcher.
  Exit code: 128. Stderr: `remote: error: GH006: Protected branch update failed
  for refs/heads/main.` Evidence preserved." **Escalate to user.**
- **Failure case**: Agent receives a permission error and silently retries the
  same operation, or reports "push failed" without naming the command or
  preserving evidence. **Stop** — this hides the root cause.
- **Next action**: Present the exact operation, denial source, and evidence to
  the user with a recommended escalation path (e.g., "Request branch protection
  exception from the repository admin" or "Use an authorized remote").

## Prohibition on Bypasses

Agents MUST NOT attempt to circumvent a permission denial. The following
actions are explicitly prohibited when a permission error has occurred:

- ❌ **NEVER** use `--no-verify` to skip client-side hooks that enforced the
  denial.
- ❌ **NEVER** use `--force` or `--force-with-lease` to override a push
  rejection.
- ❌ **NEVER** use `git -c core.hooksPath=/dev/null` or any equivalent to
  disable hooks.
- ❌ **NEVER** use `GIT_TERMINAL_PROMPT=0` or other environment overrides to
  bypass authentication prompts.
- ❌ **NEVER** reconfigure the remote URL to bypass SSH or HTTPS policy.
- ❌ **NEVER** copy, move, or rename files to circumvent `.gitattributes`
  filters or git-crypt boundaries.

- **Valid case**: Agent receives `git push --no-verify` rejected. Agent
  reports the denial, does not retry with `-n`, and escalates to the user.
  **Escalate.**
- **Failure case**: Agent receives a denial and attempts `git push -n` as a
  workaround. **Stop** — this is a policy violation and MUST NOT occur.
- **Next action**: If the user explicitly requests a bypass after being informed
  of the risk, the user MUST provide informed consent documenting the specific
  bypass and its justification. The agent MUST record this consent in the
  session or handoff before proceeding.

## User Approval and Escalation Path

For any denied operation, follow this escalation sequence:

1. **Report** the denial with full evidence (see Permission-Denied Reporting).
2. **Recommend** a safe alternative (e.g., push to a non-protected branch,
   request a merge via PR, ask the repo admin for an exception).
3. **Request** explicit user approval for the recommended alternative. Do not
   proceed without a clear affirmative response.
4. **Record** the user's decision (approve, reject, or alternative) in the
   session or orchestration handoff for traceability.
5. **If the user rejects all alternatives**, stop the workflow and document
   the blocker. Do not invent workarounds.

- **Valid case**: Push to `main` is denied. Agent reports: "Push to `main`
  denied (protected branch). Recommended: push to `001-feature-name` and
  create a PR." User approves the PR path. Agent proceeds. **Continue.**
- **Failure case**: Push to `main` is denied. Agent silently pushes to a
  different branch without user approval, or attempts to force-push.
  **Stop** — this bypasses the escalation path.
- **Next action**: Present the recommendation, await user approval, and record
  the decision before any subsequent action.

## Secret and Encrypted-File Boundary

Agents MUST NOT access, expose, or modify secrets or encrypted content
during git operations. Specifically:

- ❌ **NEVER** read, print, or display the contents of `.gitconfig.secret`,
  `.gnupg/`, or any file with `filter=git-crypt` in `.gitattributes`.
- ❌ **NEVER** run `git show`, `git diff`, `git log -p`, or `cat` on these
  files.
- ❌ **NEVER** rewrite, relocate, or decrypt these files — even if requested
  by the user as part of a "cleanup" or "migration."
- ❌ **NEVER** include secret contents in orchestration handoffs, verification
  reports, or session transcripts.
- ✅ **ALWAYS** check `.gitattributes` for `git-crypt` entries before reading
  any file that might be encrypted.
- ✅ **ALWAYS** treat `git-crypt` encrypted files as opaque — reference them
  by path only, never by content.

- **Valid case**: Agent needs to verify `.gitattributes` entries. Agent runs
  `grep git-crypt .gitattributes` and reports the file paths that are
  encrypted, without reading or displaying their contents. **Continue.**
- **Failure case**: Agent runs `git show HEAD:.gitconfig.secret` to "verify
  the configuration" and prints the contents in a response or handoff.
  **Stop** — this is a security violation.
- **Next action**: If secret content is needed for a task, escalate to the
  user with the specific file path and purpose. The user must unlock and
  verify the content themselves; the agent MUST NOT handle it directly.
