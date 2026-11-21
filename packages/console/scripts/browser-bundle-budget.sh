#!/usr/bin/env bash

# Confirm that the browser build contains at least one deliverable JS/CSS asset.
# Bundle summing and advisory reporting live in the importable selfhost-budget.ts module.
require_browser_assets() {
    local asset_directory="${1:-}"
    local asset_list="${2:-}"
    if [[ ! -d "${asset_directory}" ]]; then
        printf '[test-selfhost] FAIL: browser asset directory is missing: %s\n' "${asset_directory}" >&2
        return 1
    fi
    if [[ -z "${asset_list}" ]]; then
        printf '[test-selfhost] FAIL: no browser JS/CSS assets found under %s.\n' "${asset_directory}" >&2
        return 1
    fi
    return 0
}
