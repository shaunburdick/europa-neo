#!/usr/bin/env bash
# test-prepare-commit-msg.sh — functional tests for scripts/prepare-commit-msg.
#
# Covers acceptance criteria AC-1..AC-9 from
# specs/001-agent-attribution-detection/spec.md plus the cross-harness
# agent-name/model extension (FR-009/FR-010, amendment A2):
#   AC-1  AI_AGENT=opencode            → Generated-By: opencode
#   AC-2  AGENT=goose                  → Generated-By: goose
#   AC-3  CLAUDE_CODE=1                → Generated-By: claude-code
#   AC-4  OPENCODE_TERMINAL=1 (no claim) → no trailer + stderr warning
#   AC-5  plain git commit (no vars)   → no trailer, no warning
#   AC-6  existing Generated-By trailer + claim → no duplicate
#   AC-7  merge/squash commit source   → hook skips regardless of env
#   AC-8  AI_AGENT + OPENCODE_AGENT/MODEL → rich attribution
#   AC-9  git-agent-commit wrapper     → byte-identical trailer
# plus (amendment A2):
#   AC-2c AGENT=whatever               → Generated-By: whatever
#   AC-3b CLAUDE_CODE=1 + ANTHROPIC_MODEL → claude-code (model: ...)
#   AC-5b ANTHROPIC_MODEL alone        → no trailer (model var is not a marker)
#   AC-8c AI_AGENT=custom-name         → Generated-By: custom-name
#   AC-8d AI_AGENT=1 (boolean)         → Generated-By: ai-agent (fallback)
#   AC-8e AI_AGENT=opencode + OPENCODE_MODEL → opencode (model: ...)
# plus (amendment A3): AC-18a..d check-hook.sh install-currency smoke tests
#
# Requires: bash 3.2+, git, coreutils. No other dependencies.
#
# Usage: bash skills/git-safety/scripts/test-prepare-commit-msg.sh

set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$HERE/prepare-commit-msg"
WRAPPER="$HERE/git-agent-commit"
CHECK="$HERE/check-hook.sh"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass=0
fail=0

report() { # report <ok|no> <name> <detail>
  if [[ "$1" == "ok" ]]; then
    pass=$((pass + 1))
    printf 'PASS  %s\n' "$2"
  else
    fail=$((fail + 1))
    printf 'FAIL  %s — %s\n' "$2" "$3"
  fi
}

# Deterministic start: clear every detection var from the ambient environment
# (this test may itself run inside an agent session).
UNSET=(
  -u AI_AGENT -u AGENT -u OPENCODE -u OPENCODE_TERMINAL -u OPENCODE_AGENT
  -u OPENCODE_MODEL -u OPENCODE_CLIENT -u CLAUDE_CODE
  -u CLAUDE_CODE_ENTRYPOINT -u CURSOR_AGENT -u GEMINI_CLI -u CODEX_SANDBOX
  -u AUGMENT_AGENT -u CLINE_ACTIVE -u ANTHROPIC_MODEL
)

cd "$TMP" || exit 1
git init -q .
git config user.name "Test"
git config user.email "test@example.com"
# Never GPG-sign in the throwaway repo (the ambient user may have
# commit.gpgsign enabled globally and no signing key available).
git config commit.gpgsign false
mkdir -p .git/hooks
cp "$HOOK" .git/hooks/prepare-commit-msg
chmod +x .git/hooks/prepare-commit-msg

run_case() { # run_case <name> <expected-trailer|-> <expect-warn|0|1> <env...> git commit <args...>
  local name="$1" expected="$2" want_warn="$3"
  shift 3
  local out trailer warned=0 status problems=""
  out="$(env "${UNSET[@]}" "$@" 2>&1)"
  status=$?
  trailer="$(git log -1 --format=%B | grep -m1 '^Generated-By:' || true)"
  grep -q "without an AI attribution claim" <<<"$out" && warned=1

  [[ "$status" -eq 0 ]] || problems="commit exited $status; "
  if [[ "$expected" == "-" ]]; then
    [[ -z "$trailer" ]] || problems+="expected no trailer, got '$trailer'; "
  else
    [[ "$trailer" == "$expected" ]] || problems+="expected '$expected', got '$trailer'; "
  fi
  if [[ "$want_warn" == "1" ]]; then
    [[ "$warned" -eq 1 ]] || problems+="expected warning, none printed; "
  else
    [[ "$warned" -eq 0 ]] || problems+="unexpected warning printed; "
  fi

  if [[ -z "$problems" ]]; then
    report ok "$name"
  else
    report no "$name" "${problems%; }"
  fi
}

# AC-1 .. AC-5, AC-8: detection + attribution matrix
run_case "AC-1  AI_AGENT=opencode"      "Generated-By: opencode"           0 AI_AGENT=opencode git commit --allow-empty -m "test: ac1"
run_case "AC-2  AGENT=goose"            "Generated-By: goose"              0 AGENT=goose git commit --allow-empty -m "test: ac2"
run_case "AC-2b AGENT=amp"              "Generated-By: amp"                0 AGENT=amp git commit --allow-empty -m "test: ac2b"
run_case "AC-2c AGENT=other"            "Generated-By: whatever"           0 AGENT=whatever git commit --allow-empty -m "test: ac2c"
run_case "AC-3  CLAUDE_CODE=1"          "Generated-By: claude-code"        0 CLAUDE_CODE=1 git commit --allow-empty -m "test: ac3"
run_case "AC-4  OPENCODE_TERMINAL only" "-"                                1 OPENCODE_TERMINAL=1 git commit --allow-empty -m "test: ac4"
run_case "AC-5  plain commit"           "-"                                0 git commit --allow-empty -m "test: ac5"
run_case "AC-8  rich attribution"       "Generated-By: my-agent (model: my-model)" 0 \
  AI_AGENT=opencode OPENCODE_AGENT=my-agent OPENCODE_MODEL=my-model git commit --allow-empty -m "test: ac8"
run_case "AC-8b OPENCODE_AGENT alone"   "Generated-By: my-agent"           0 OPENCODE_AGENT=my-agent git commit --allow-empty -m "test: ac8b"

# Amendment A2 — cross-harness agent name + model attribution (FR-009/FR-010)
run_case "AC-3b claude-code + model"    "Generated-By: claude-code (model: claude-opus-4-6)" 0 \
  CLAUDE_CODE=1 ANTHROPIC_MODEL=claude-opus-4-6 git commit --allow-empty -m "test: ac3b"
run_case "AC-3c claude entrypoint+model" "Generated-By: claude-code (model: claude-sonnet-4-6)" 0 \
  CLAUDE_CODE_ENTRYPOINT=cli ANTHROPIC_MODEL=claude-sonnet-4-6 git commit --allow-empty -m "test: ac3c"
run_case "AC-5b bare ANTHROPIC_MODEL"   "-"                                0 ANTHROPIC_MODEL=claude-opus-4-6 git commit --allow-empty -m "test: ac5b"
run_case "AC-2d stale OPENCODE_AGENT"   "Generated-By: claude-code"        0 CLAUDE_CODE=1 OPENCODE_AGENT=stale git commit --allow-empty -m "test: ac2d"
run_case "AC-8c AI_AGENT=custom name"   "Generated-By: custom-architect"   0 AI_AGENT=custom-architect git commit --allow-empty -m "test: ac8c"
run_case "AC-8d AI_AGENT=1 boolean"     "Generated-By: ai-agent"           0 AI_AGENT=1 git commit --allow-empty -m "test: ac8d"
run_case "AC-8e model without agent"    "Generated-By: opencode (model: my-model)" 0 \
  AI_AGENT=opencode OPENCODE_MODEL=my-model git commit --allow-empty -m "test: ac8e"

# AC-6: existing trailer must not be duplicated
run_case "AC-6  dedupe existing trailer" "Generated-By: existing-agent"    0 AI_AGENT=opencode git commit --allow-empty -m "test: ac6

Generated-By: existing-agent"

# AC-7: merge/squash sources are skipped regardless of env
msg_merge="$TMP/msg-merge.txt"
printf 'Merge commit\n' > "$msg_merge"
cp "$msg_merge" "$msg_merge.orig"
env "${UNSET[@]}" AI_AGENT=opencode .git/hooks/prepare-commit-msg "$msg_merge" merge >/dev/null 2>&1
if cmp -s "$msg_merge" "$msg_merge.orig"; then
  report ok "AC-7  merge source skipped"
else
  report no "AC-7  merge source skipped" "hook modified the merge message"
fi
msg_squash="$TMP/msg-squash.txt"
printf 'Squashed commits\n' > "$msg_squash"
cp "$msg_squash" "$msg_squash.orig"
env "${UNSET[@]}" AI_AGENT=opencode .git/hooks/prepare-commit-msg "$msg_squash" squash >/dev/null 2>&1
if cmp -s "$msg_squash" "$msg_squash.orig"; then
  report ok "AC-7b squash source skipped"
else
  report no "AC-7b squash source skipped" "hook modified the squash message"
fi

# AC-9: git-agent-commit wrapper produces the same trailer as the inline form
run_case "AC-9  wrapper parity" "Generated-By: my-agent (model: my-model)" 0 \
  OPENCODE_AGENT=my-agent OPENCODE_MODEL=my-model "$WRAPPER" --allow-empty -m "test: ac9"

# AC-18a..d: check-hook.sh install-currency smoke tests (amendment A3)
# a: full-copy install (as done above) is detected as current
if "$CHECK" "$TMP/.git/hooks/prepare-commit-msg" >/dev/null 2>&1; then
  report ok "AC-18a full-copy install current"
else
  report no "AC-18a full-copy install current" "check-hook.sh rejected a byte-copy install"
fi

# b: a tampered attribution block is flagged OUTDATED (exit 1)
awk 'NR!=45' "$TMP/.git/hooks/prepare-commit-msg" > "$TMP/tampered-hook"
chmod +x "$TMP/tampered-hook"
tamper_out="$("$CHECK" "$TMP/tampered-hook" 2>&1)"
tamper_rc=$?
if [[ $tamper_rc -eq 1 ]] && grep -qi "outdated" <<<"$tamper_out"; then
  report ok "AC-18b tampered block flagged"
else
  report no "AC-18b tampered block flagged" "expected exit 1 + OUTDATED, got exit $tamper_rc"
fi

# c: a missing hook is flagged (exit 1)
if "$CHECK" "$TMP/does-not-exist" >/dev/null 2>&1; then
  report no "AC-18c missing hook flagged" "check-hook.sh exited 0 for a missing hook"
else
  report ok "AC-18c missing hook flagged"
fi

# d: block appended into a pre-existing hook is detected as current
printf '#!/bin/sh\n# pre-existing hook\nexit 0\n' > "$TMP/existing-hook"
sed -n '/^# --- AI Commit Attribution/,/^# --- end AI Commit Attribution/p' "$HOOK" >> "$TMP/existing-hook"
chmod +x "$TMP/existing-hook"
if "$CHECK" "$TMP/existing-hook" >/dev/null 2>&1; then
  report ok "AC-18d appended install current"
else
  report no "AC-18d appended install current" "check-hook.sh rejected an appended-block install"
fi

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[[ "$fail" -eq 0 ]]