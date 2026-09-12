# Orchestration Log: Issue #74 Universal PlayerId Migration

## Planned state

- **Phase**: 4–5 complete; Phase 6 not started.
- **Coordination anchor**: Feature 010 existing directory, nested planning bundle.
- **Branch**: `issue-74-numeric-playerid`.
- **Task count**: 45, T001–T045.
- **Implementation**: explicitly not performed by this planning session.

## Waves

1. Baseline and forbidden-pattern inventory.
2. Core branded identity and CSPRNG generator.
3. Engine registry/public model.
4. Engine serialization/replay.
5. Terrain/fog boundaries.
6. Matchmaking lifecycle.
7. Networking breaking wire migration.
8. Console and mounted router migration.
9. Cross-feature security, documentation, and final verification.

The numbered task file is authoritative for dependencies and `[P]` safety. PMs
should dispatch only disjoint package ownership in parallel and should require
the Wave 7 security/replay/router checkpoint before final gates.

## Review checkpoint requirements

- No numeric public identity or numeric wire compatibility remains.
- No `localeCompare` in an authoritative ordering path.
- No generated/temporary IDs in replay or serialization.
- Terrain output is independent of IDs.
- IDs never replace session/reconnect proof.
- Mounted router handoffs are verified on the real browser path.
- Closed PR #113 findings are covered by tests, not merely comments.
