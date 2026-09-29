#!/usr/bin/env bash
# check-hook.sh — verify the installed prepare-commit-msg hook is current.
#
# The installed hook's "AI Commit Attribution" block must byte-match the
# block in the shipped script (scripts/prepare-commit-msg). That block is
# the single source of truth for attribution logic and is extractable via
# its sed markers, so this check covers BOTH install modes:
#   (1) full copy of the shipped script, and
#   (2) the block appended into a pre-existing hook.
# Comparison is a content hash (git hash-object), not a version string, so
# ANY drift in the block is caught without remembering to bump a version.
#
# A third gate rejects HYBRID installs: attribution CODE left outside the
# markers (typically an older full copy of this hook with the current
# block appended behind it) runs before the current block, writes its own
# less-complete trailer first, and wins — the current block's dedupe check
# then skips. Only non-comment lines outside the block trigger it, so a
# pre-existing hook that merely mentions Generated-By in prose is fine.
#
# Usage:
#   check-hook.sh [HOOK_PATH]   # default: resolve via core.hooksPath
#
# Exit codes:
#   0  hook installed, executable, attribution block current
#   1  hook missing, not executable, or attribution block differs
#
# Requires: bash 3.2+, git, sed. No other dependencies.

set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHIPPED="$HERE/prepare-commit-msg"

BLOCK_START='^# --- AI Commit Attribution'
BLOCK_END='^# --- end AI Commit Attribution'

# Resolve the hook path the same way the SKILL.md setup steps do.
resolve_hook_path() {
  local dir
  dir="$(git config core.hooksPath 2>/dev/null || true)"
  dir="${dir:-.git/hooks}"
  printf '%s\n' "${dir%/}/prepare-commit-msg"
}

if [[ $# -gt 0 ]]; then
  HOOK_PATH="$1"
else
  HOOK_PATH="$(resolve_hook_path)"
fi

extract_block() { # extract_block <file>
  sed -n "/${BLOCK_START}/,/${BLOCK_END}/p" "$1"
}

hash_block() { # hash_block <file>
  extract_block "$1" | git hash-object --stdin
}

# 1. Existence
if [[ ! -f "$HOOK_PATH" ]]; then
  printf 'OUTDATED — hook missing at %s\n' "$HOOK_PATH"
  printf '  Install it (fresh install):\n'
  printf '    cp "%s" "%s"\n' "$SHIPPED" "$HOOK_PATH"
  printf '    chmod +x "%s"\n' "$HOOK_PATH"
  exit 1
fi

# 2. Executable
if [[ ! -x "$HOOK_PATH" ]]; then
  printf 'OUTDATED — hook exists but is not executable at %s\n' "$HOOK_PATH"
  printf '    chmod +x "%s"\n' "$HOOK_PATH"
  exit 1
fi

# 3. Block presence
if ! grep -q "$BLOCK_START" "$HOOK_PATH"; then
  printf 'OUTDATED — no AI Commit Attribution block found in %s\n' "$HOOK_PATH"
  printf '  Append the block from the shipped script (appended install):\n'
  printf "    sed -n '/^# --- AI Commit Attribution/,/^# --- end AI Commit Attribution/p' \"%s\" >> \"%s\"\n" "$SHIPPED" "$HOOK_PATH"
  exit 1
fi

# 4. Currency — content hash of the installed block vs the shipped block
if [[ "$(hash_block "$HOOK_PATH")" != "$(hash_block "$SHIPPED")" ]]; then
  printf 'OUTDATED — attribution block in %s differs from the shipped script\n' "$HOOK_PATH"
  printf '\nUpdate options:\n'
  printf '  (A) Full-copy install (replaces the entire hook):\n'
  printf '      cp "%s" "%s"\n' "$SHIPPED" "$HOOK_PATH"
  printf '      chmod +x "%s"\n' "$HOOK_PATH"
  printf '  (B) Appended install (preserves pre-existing hook logic;\n'
  printf '      preferred when the hook predates this skill):\n'
  printf '      # strip the old block — macOS / BSD sed:\n'
  printf "      sed -i '' '/^# --- AI Commit Attribution/,/^# --- end AI Commit Attribution/d' \"%s\"\n" "$HOOK_PATH"
  printf '      # strip the old block — Linux / GNU sed:\n'
  printf "      sed -i '/^# --- AI Commit Attribution/,/^# --- end AI Commit Attribution/d' \"%s\"\n" "$HOOK_PATH"
  printf '      # append the current block:\n'
  printf "      sed -n '/^# --- AI Commit Attribution/,/^# --- end AI Commit Attribution/p' \"%s\" >> \"%s\"\n" "$SHIPPED" "$HOOK_PATH"
  printf '      bash -n "%s" && echo "hook syntax OK"\n' "$HOOK_PATH"
  exit 1
fi

# 4b. Hybrid detection — attribution code outside the marker block
outside_code="$(
  {
    sed -n "1,/${BLOCK_START}/p" "$HOOK_PATH"
    sed -n "/${BLOCK_END}/,\$p" "$HOOK_PATH"
  } | grep -v '^[[:space:]]*#' | grep 'Generated-By' || true
)"
if [[ -n "$outside_code" ]]; then
  printf 'OUTDATED — %s carries stale attribution logic outside the AI Commit Attribution block\n' "$HOOK_PATH"
  printf '  A stale copy (e.g. an older full hook with the current block appended behind\n'
  printf '  it) runs before the current block, writes its own trailer first, and the\n'
  printf '  current block then skips — silently dropping the agent/model details.\n'
  printf '  First offending line:\n'
  printf '    %s\n' "$(printf '%s\n' "$outside_code" | head -n 1)"
  printf '  Re-install fresh (the shipped script is self-contained):\n'
  printf '    cp "%s" "%s"\n' "$SHIPPED" "$HOOK_PATH"
  printf '    chmod +x "%s"\n' "$HOOK_PATH"
  exit 1
fi

# 5. Syntax of the installed block (guards against hand-edits)
if ! extract_block "$HOOK_PATH" | bash -n >/dev/null 2>&1; then
  printf 'OUTDATED — attribution block in %s has a syntax error; re-install it\n' "$HOOK_PATH"
  exit 1
fi

printf 'CURRENT — %s matches the shipped attribution block\n' "$HOOK_PATH"
exit 0