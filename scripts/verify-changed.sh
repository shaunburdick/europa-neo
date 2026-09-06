#!/usr/bin/env bash
# scripts/verify-changed.sh — Targeted verification for changed packages.
#
# Usage:
#   pnpm verify:changed                  # auto-detect changed packages
#   pnpm verify:changed --scope <pkg>    # verify one package explicitly
#   pnpm verify:changed --full           # force the full verify.sh suite
#
# Why this exists:
#   `pnpm verify` runs all 10 phases across every package. When iterating on
#   a single library (e.g. the engine), that means waiting through console
#   browser tests, Playwright E2E, and selfhost checks that cannot have
#   regressed. This script computes the minimal relevant subset:
#
#     Tier A (always):        build + lint + format:check + typecheck
#     Tier B (changed libs):  per-package test suites
#     Tier C (lib changed):   console node-mode integration tests
#     Tier D (console):       console browser/E2E/perf/selfhost + design guards
#     Tier E (docs):          docs build + link tests
#
#   The console package consumes every library package (engine, terrain, fog,
#   networking, matchmaking, version, design), so a change to any library
#   triggers the console's node-mode integration tests (Tier C) but NOT the
#   slow browser/E2E/selfhost tiers (Tier D only runs when the console itself
#   changed). Any change outside packages/ and docs/manual/ (root config,
#   scripts/, specs/, .github/, .agents/) is treated as "everything" —
#   conservative, because those files can affect any package.
#
#   Override the diff base with VERIFY_BASE (default origin/main):
#     VERIFY_BASE=HEAD~3 pnpm verify:changed
set -euo pipefail

cd "$(dirname "$0")/.."

MODE="auto"
SCOPE=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --scope)
            MODE="scope"
            SCOPE="${2:-}"
            if [[ -z "$SCOPE" ]]; then
                echo "error: --scope requires a package name" >&2
                exit 2
            fi
            shift 2
            ;;
        --full)
            MODE="full"
            shift
            ;;
        *)
            echo "error: unknown argument: $1" >&2
            exit 2
            ;;
    esac
done

BASE_REF="${VERIFY_BASE:-origin/main}"

# --- Determine changed packages ------------------------------------------

# Collect changed files from three sources: commits since the merge-base with
# the base ref, staged+unstaged working-tree changes, and untracked files.
changed_files() {
    local base="$1"
    if git rev-parse --verify -q "$base" >/dev/null 2>&1; then
        local mb
        mb="$(git merge-base "$base" HEAD 2>/dev/null || echo "$base")"
        git diff --name-only "$mb" HEAD 2>/dev/null || true
    fi
    git diff --name-only HEAD 2>/dev/null || true
    git ls-files --others --exclude-standard 2>/dev/null || true
}

map_file_to_pkg() {
    local f="$1"
    case "$f" in
        packages/engine/*)      echo "engine" ;;
        packages/terrain/*)     echo "terrain" ;;
        packages/fog/*)         echo "fog" ;;
        packages/networking/*)  echo "networking" ;;
        packages/matchmaking/*) echo "matchmaking" ;;
        packages/version/*)     echo "version" ;;
        packages/design/*)      echo "design" ;;
        packages/console/*)     echo "console" ;;
        docs/manual/*)          echo "docs" ;;
        *)                      echo "ambiguous" ;;
    esac
}

VALID_SCOPES="engine terrain fog networking matchmaking version design console docs"

declare -A SEEN
CHANGED_PKGS=()
AMBIGUOUS=false

if [[ "$MODE" == "scope" ]]; then
    case " $VALID_SCOPES " in
        *" $SCOPE "*)
            CHANGED_PKGS=("$SCOPE")
            ;;
        *)
            echo "error: unknown scope '$SCOPE' (valid: $VALID_SCOPES)" >&2
            exit 2
            ;;
    esac
elif [[ "$MODE" == "full" ]]; then
    AMBIGUOUS=true
else
    while IFS= read -r f; do
        [[ -z "$f" ]] && continue
        pkg="$(map_file_to_pkg "$f")"
        if [[ "$pkg" == "ambiguous" ]]; then
            AMBIGUOUS=true
        elif [[ -z "${SEEN[$pkg]:-}" ]]; then
            SEEN[$pkg]=1
            CHANGED_PKGS+=("$pkg")
        fi
    done < <(changed_files "$BASE_REF")
fi

# Classify changed packages into tiers.
HAS_CONSOLE=false
HAS_LIB=false
HAS_DOCS=false
for p in "${CHANGED_PKGS[@]}"; do
    case "$p" in
        console) HAS_CONSOLE=true ;;
        docs) HAS_DOCS=true ;;
        *) HAS_LIB=true ;;
    esac
done

if [[ "$AMBIGUOUS" == true ]]; then
    echo "=== verify-changed: ambiguous changes detected — running full suite ==="
    exec bash scripts/verify.sh
fi

echo "=== Europa Neo — Targeted Verification ==="
echo "Changed packages: ${CHANGED_PKGS[*]:-none}"
echo "Tiers: A(always) B(lib tests) C(console node) D(console browser) E(docs)"
echo ""

# Tier A: Build + lint + typecheck (always — cheap and foundational).
echo "--- Tier A: Build + Lint + Typecheck ---"
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
echo ""

# Tier B: Per-package tests for changed library packages.
if [[ "$HAS_LIB" == true || "$HAS_CONSOLE" == true ]]; then
    echo "--- Tier B: Changed package tests ---"
    for p in "${CHANGED_PKGS[@]}"; do
        case "$p" in
            console | docs) continue ;; # covered by Tiers C/D/E
            *) pnpm --filter "@europa/$p" test ;;
        esac
    done
    echo ""
fi

# Tier C: Console node-mode integration tests — the console consumes every
# library, so a lib change can regress the integration without breaking the
# lib's own suite. These are fast (node-mode) and catch that class of break.
if [[ "$HAS_LIB" == true ]]; then
    echo "--- Tier C: Console node-mode integration tests ---"
    pnpm --filter @europa/console test:unit
    pnpm --filter @europa/console test:determinism
    pnpm --filter @europa/console test:parity
    pnpm --filter @europa/console test:keepalive
    pnpm --filter @europa/console test:lobby-integration
    echo ""
fi

# Tier D: Full console suite — only when the console itself changed.
if [[ "$HAS_CONSOLE" == true ]]; then
    echo "--- Tier D: Console library emit + conformance ---"
    pnpm --filter @europa/console run clean
    pnpm --filter @europa/console build:lib
    pnpm --filter @europa/console build:assets
    pnpm --filter @europa/console typecheck:conformance
    echo ""

    echo "--- Tier D: Design system guards ---"
    pnpm --filter @europa/design check:vendor-identity
    pnpm --filter @europa/design check:no-literals
    pnpm --filter @europa/design check:component-catalog
    pnpm --filter @europa/design check:bundle-size
    echo ""

    echo "--- Tier D: Console browser-mode tests ---"
    pnpm --filter @europa/console test:component
    pnpm --filter @europa/console test:a11y
    echo ""

    echo "--- Tier D: Console browser-mode tests (coverage mode) ---"
    pnpm --filter @europa/console exec vitest run \
        --config vitest.config.coverage.ts \
        --project browser \
        --reporter verbose
    echo ""

    echo "--- Tier D: Console E2E tests (Playwright) ---"
    pnpm --filter @europa/console test:e2e
    echo ""

    echo "--- Tier D: Console perf budgets ---"
    pnpm --filter @europa/console test:perf
    echo ""

    echo "--- Tier D: Selfhost verification ---"
    pnpm --filter @europa/console test:selfhost
    echo ""
fi

# Tier E: Docs build + link tests — only when docs changed.
if [[ "$HAS_DOCS" == true ]]; then
    echo "--- Tier E: Docs build + link tests ---"
    pnpm --filter @europa/manual build
    pnpm --filter @europa/manual test:links
    echo ""
fi

echo "=== All targeted verification checks passed ==="