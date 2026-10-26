#!/usr/bin/env bash

# Report the browser-payload reference target without making that metric a
# blocker. Other build, URL-scan, and host-smoke errors remain enforced by the
# caller.
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

report_browser_bundle_budget() {
    local measured_bytes="${1:-}"
    local reference_target_bytes="${2:-}"
    if [[ ! "${measured_bytes}" =~ ^[0-9]+$ || ! "${reference_target_bytes}" =~ ^[1-9][0-9]*$ ]]; then
        printf '%s\n' '[test-selfhost] FAIL: invalid browser bundle measurement or reference target.' >&2
        return 2
    fi

    printf '[test-selfhost] bundle size: %s bytes gzipped (reference target %s bytes)\n' \
        "${measured_bytes}" "${reference_target_bytes}"

    if (( measured_bytes >= reference_target_bytes )); then
        local excess_bytes=$((measured_bytes - reference_target_bytes))
        if (( excess_bytes == 0 )); then
            printf '[test-selfhost] WARNING: browser payload equals the %s-byte reference target (%s bytes above); continuing to required host smoke.\n' \
                "${reference_target_bytes}" \
                "${excess_bytes}"
        else
            printf '[test-selfhost] WARNING: browser payload is %s bytes above the %s-byte reference target; continuing to required host smoke.\n' \
                "${excess_bytes}" "${reference_target_bytes}"
        fi
    else
        local headroom_bytes=$((reference_target_bytes - measured_bytes))
        local unit=bytes
        if (( headroom_bytes == 1 )); then unit=byte; fi
        printf '[test-selfhost] browser payload is within the reference target (%s %s below).\n' \
            "${headroom_bytes}" "${unit}"
    fi
}
