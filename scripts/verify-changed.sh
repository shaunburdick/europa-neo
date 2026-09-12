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
        packages/core/*)       echo "core" ;;
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

VALID_SCOPES="core engine terrain fog networking matchmaking version design console docs"

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

# RUN_TIER_D gates the slow console browser/E2E/perf/selfhost tiers. It is
# true only when the console package itself changed (or --scope console /
# --full). In the ambiguous case we set HAS_CONSOLE=true above purely so Tier
# B runs the console-adjacent libs, but we must NOT run Tier D — CI covers it.
RUN_TIER_D="$HAS_CONSOLE"
if [[ "$AMBIGUOUS" == true ]]; then
    RUN_TIER_D=false
fi

# Ambiguous changes (root config, scripts/, specs/, .github/, .agents/) can
# affect any package, so run the fast tiers across EVERYTHING. We deliberately
# do NOT fall through to the full verify.sh here: the slow console browser /
# E2E / perf / selfhost tiers (Tier D) are covered by CI on the PR, and the
# pre-push hook should be a fast smoke that catches obvious breakage before
# wasting a CI cycle — not a full CI mirror. Tiers A+B+C (build, lint,
# typecheck, all node-mode package tests, console node-mode integration) run
# in well under a minute and catch the overwhelming majority of regressions.
if [[ "$AMBIGUOUS" == true ]]; then
    echo "=== verify-changed: ambiguous changes detected — running fast full-suite (Tiers A+B+C, skipping slow console browser/E2E/selfhost — CI covers those) ==="
    # Treat every package as changed so Tier B covers all of them.
    CHANGED_PKGS=(core engine terrain fog networking matchmaking version design console)
    HAS_LIB=true
    HAS_CONSOLE=true
    HAS_DOCS=false
fi

echo "=== Europa Neo — Targeted Verification ==="
echo "Changed packages: ${CHANGED_PKGS[*]:-none}"
echo "Tiers: A(always) B(lib tests) C(console node) D(console browser) E(docs)"
echo ""

# Tier A: Build + lint + typecheck (always — cheap and foundational).
# Note: we run `pnpm build` once, then the per-package typecheck directly.
# The root `pnpm typecheck` script re-runs `pnpm build` first (it's designed
# to be self-contained), which would double-build here — wasteful.
echo "--- Tier A: Build + Lint + Typecheck ---"
pnpm -r --filter './packages/*' build
pnpm -r --filter './packages/*' typecheck
pnpm lint
pnpm format:check
pnpm --filter @europa/design check:no-literals
# Documentation privacy guard (010 FR-014 / NFR-003): a cheap static scan of
# the manual + approved implementation surfaces. It reads READMEs, specs, and
# manual pages, so it can regress from any change — run it unconditionally.
node specs/010-public-lobby-match-browser/check-documentation-privacy.mjs
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
if [[ "$RUN_TIER_D" == true ]]; then
    # Rebuild the full console dist (vite bundle + lib + assets). The `clean`
    # wipes any stale dist/ so the subsequent build produces a fresh bundle.
    # Without this, `pnpm host` and the selfhost/E2E/perf tests can pick up a
    # stale dist/ from a previous build, silently testing old code.
    echo "--- Tier D: Console dist rebuild + conformance ---"
    pnpm --filter @europa/console run clean
    pnpm --filter @europa/console build
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