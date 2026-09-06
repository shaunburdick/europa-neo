#!/usr/bin/env bash
#
# check-subagent-disk.sh — Verify that a sub-agent's reported file changes
# actually landed on disk.
#
# Usage:
#   bash scripts/check-subagent-disk.sh                       # check if anything changed
#   bash scripts/check-subagent-disk.sh "any"                  # same as above
#   bash scripts/check-subagent-disk.sh "file/a.ts,file/b.ts" # check specific files
#
# When to use:
#   After dispatching a sub-agent (e.g. via OpenChamber or orchestrator),
#   run this BEFORE proceeding to review or verification. Sub-agents can
#   report "8 files changed" when their work was reset, stashed, or never
#   written to disk — this script catches phantom changes early.
#
# Exit codes:
#   0 — all expected changes present (or at least one change when no list given)
#   1 — expected files missing or no changes detected

set -euo pipefail

# ── Collect changed files from both working-tree and staged diffs ────────────

collect_changed_files() {
    local combined=""

    # Working tree changes (unstaged)
    if [ -f .git/index ]; then
        combined="$(git diff --name-only HEAD 2>/dev/null || true)"
    fi

    # Staged changes
    local staged
    staged="$(git diff --cached --name-only 2>/dev/null || true)"

    if [ -n "$combined" ] && [ -n "$staged" ]; then
        printf '%s\n%s' "$combined" "$staged"
    elif [ -n "$combined" ]; then
        printf '%s' "$combined"
    elif [ -n "$staged" ]; then
        printf '%s' "$staged"
    fi
}

# ── Main ────────────────────────────────────────────────────────────────────

main() {
    local expected_arg="${1:-}"
    local expected_csv=""

    if [ -n "$expected_arg" ]; then
        expected_csv="$expected_arg"
    fi

    # Gather the list of changed files
    local changed_files
    changed_files="$(collect_changed_files)"

    # Normalize to sorted unique entries
    local sorted_changed
    sorted_changed="$(printf '%s\n' "$changed_files" | sed '/^$/d' | sort -u)"

    local total_changed
    total_changed="$(printf '%s\n' "$sorted_changed" | grep -c . || true)"

    echo "════════════════════════════════════════════════════════════════"
    echo " Sub-agent disk verification"
    echo "════════════════════════════════════════════════════════════════"
    echo ""

    # ── Mode 1: no file list — just report whether anything changed ─────────
    if [ -z "$expected_csv" ]; then
        echo "Mode: presence check (any file)"
        echo ""

        if [ "$total_changed" -eq 0 ]; then
            echo "FAIL — no file changes detected (working tree or staged)."
            echo "       The sub-agent's work may have been reset, stashed, or never written."
            exit 1
        fi

        echo "PASS — $total_changed file(s) changed:"
        printf '  %s\n' "$sorted_changed"
        echo ""
        exit 0
    fi

    # ── Mode 2: "any" keyword — same as no-arg mode ────────────────────────
    if [ "$expected_csv" = "any" ]; then
        echo "Mode: presence check (any file)"
        echo ""

        if [ "$total_changed" -eq 0 ]; then
            echo "FAIL — no file changes detected."
            exit 1
        fi

        echo "PASS — $total_changed file(s) changed:"
        printf '  %s\n' "$sorted_changed"
        echo ""
        exit 0
    fi

    # ── Mode 3: specific file list ──────────────────────────────────────────
    echo "Mode: file list verification"
    echo ""

    # Split comma-separated list, trimming whitespace
    local expected_files=()
    IFS=',' read -ra expected_files <<< "$expected_csv"

    # Strip leading/trailing whitespace from each entry
    for i in "${!expected_files[@]}"; do
        expected_files[$i]="$(echo "${expected_files[$i]}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    done

    local expected_count=${#expected_files[@]}
    local found=0
    local missing_files=()
    local found_files=()

    echo "Expected $expected_count file(s):"
    echo ""

    for ef in "${expected_files[@]}"; do
        # Check if the expected path is a substring of any changed file
        # This handles renamed paths (e.g. expected "foo.ts" matches "b/foo.ts → a/foo.ts")
        local match
        match="$(printf '%s\n' "$sorted_changed" | grep -F -- "$ef" || true)"

        if [ -n "$match" ]; then
            found=$((found + 1))
            found_files+=("$ef")
            echo "  ✓ $ef"
        else
            missing_files+=("$ef")
            echo "  ✗ $ef  (NOT in diff)"
        fi
    done

    echo ""
    echo "────────────────────────────────────────────────────────────────"
    echo "Changed files on disk ($total_changed):"
    printf '  %s\n' "$sorted_changed"
    echo "────────────────────────────────────────────────────────────────"
    echo ""

    if [ "$found" -eq "$expected_count" ]; then
        echo "PASS — all $expected_count expected file(s) found in diff."
        exit 0
    fi

    echo "FAIL — ${#missing_files[@]} of $expected_count expected file(s) missing from diff."
    echo ""
    echo "Missing:"
    for mf in "${missing_files[@]}"; do
        echo "  ✗ $mf"
    done
    echo ""
    echo "This likely means the sub-agent's changes were reset, stashed, or never written."
    exit 1
}

main "$@"
