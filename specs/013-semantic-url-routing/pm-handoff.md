# PM Handoff: Console Router Upgrade (TanStack Router Migration)

## Context
- **Spec**: specs/013-semantic-url-routing/spec.md (v1.1)
- **Plan**: specs/013-semantic-url-routing/plan.md
- **Tasks**: specs/013-semantic-url-routing/tasks.md
- **Research**: specs/013-semantic-url-routing/research.md
- **Constitution**: .specify/memory/constitution.md
- **Branch**: issue-75-console-router

## Current State
- **Phase**: 6 (Implementation)
- **Completed**: Phases 1–5 (spec v1.1 amended, plan + tasks approved)
- **In Progress**: Wave 0 dispatch
- **Blocked**: none

## Key Decisions
- Full replacement of `parseRoute`/`adaptRoute`/`executeRouteEntry` types and functions (no compatibility layer)
- SWR deferred (no new caching dependency; TanStack built-in loader handling)
- `?ws=` stays untyped escape hatch outside the router
- 8 entry kinds (corrected from issue's "7")
- Bundle budget: ~81 KB + ~14 KB = ~95 KB gz (under 150 KB)

## Next Steps
- Dispatch Wave 0 (T101–T102): dependency + baseline
- Then Waves 1–6 per tasks.md
- Final: `pnpm verify`, PR creation

## User Preferences
- Only surface with PR or Problem (no per-wave checkins)
