# Implementation Plan: Player-ID Visibility Policy Correction

**Branch**: `013-relaxed-player-id-visibility`
**Spec**: [spec.md](./spec.md) (existing Feature 010, approved v1.7)
**Correction scope**: Existing Feature 010 source-of-truth amendment, cross-referenced by Features 002, 004, 006, 011, and 012. No Feature 013 specification or runtime subsystem.

## Summary

Correct the remaining implementation and acceptance harnesses that still treat
guest identity IDs or gameplay `PlayerId` values as secrets. IDs become ordinary,
non-secret correlation data wherever an existing surface already carries identity
references. Accepted handles remain the preferred UI label. `sessionToken` and
`reconnectToken` remain bearer credentials; private-match existence, server
authority, and fog-of-war boundaries are unchanged.

This is a documentation, contract-comment, checker, and test-harness correction.
It does not add an API, change wire versioning, change match behavior, or alter
the simulation. At the Phase 4–5 gate, the planned change set contained only
planning artifacts; the subsequent Phase 6 implementation is tracked by
C-001–C-010 in `tasks.md`.

## Technical context

- pnpm TypeScript monorepo, Node 22, strict TypeScript, Biome 2, Vitest 4,
  Playwright, existing `ws` networking transport.
- No new runtime dependency, database, account system, timer-driven simulation,
  or cloud service. No new package and no Feature 013 directory.
- Existing branded IDs remain distinct types. The correction changes exposure
  policy and assertions, not identity allocation, validation, or authority.
- Existing 2-player end-to-end behavior and the 2–4 player engine contract remain
  unchanged.

## Constitution alignment

| Principle | Plan decision |
| --- | --- |
| I — Type safety | Preserve branded ID types and mirrored contracts; update prose/JSDoc without weakening strict typechecking or adding suppressions. |
| II — Authoritative/deterministic | IDs are correlation metadata only; server-resolved seat, authorization, and fog filtering remain authoritative. No tick logic changes. |
| III — Tested logic | Replace false ID-secrecy assertions with positive correlation coverage and retain credential/private-match/fog regression coverage. Existing ≥80% gates remain. |
| IV — Specs/docs | Feature 010 remains the normative owner; update affected contract mirrors, comments, READMEs, manual guidance, and checker semantics together. |
| V — Simplicity | Change only stale policy assertions and their tests; do not introduce a privacy abstraction or new transport. |
| VI — Accessibility | Handle-first labels remain accessible; an ID fallback is text and must not rely on color or obscure bearer-credential warnings. |
| VII — Self-hosting | Existing self-hosted URLs/log diagnostics may correlate IDs, but must not expose bearer credentials. |

## Architecture and migration boundaries

### 1. Existing identity and lobby surfaces (no runtime redesign)

The already-shipped identity registry, lobby facade, match records, and seat
records remain unchanged at runtime. Their comments/contracts must describe
`GuestPlayerId` as non-secret correlation data rather than "internal-only" or
"never rendered" data. The server still resolves identity and seat associations;
client-supplied IDs remain advisory and never become authority.

Expected implementation areas:

```
packages/matchmaking/src/
  contracts/lobby-types.ts
  contracts/lobby-api.ts
  internal/guestPlayerIdentity.ts
  internal/identityRegistry.ts
  lobby-service.ts
  lobby-events.ts
```

Identity allocation is server-side and opaque but non-secret. The client may
present a stored identity claim, but the server accepts it only when it matches
its registry; otherwise it creates a fresh identity. Handle changes update the
registry and future projections, while existing reconnect credentials continue to
point to the same identity.

### 2. Existing contracts and transport

No message family is added. Update the Feature 010 contract prose and the
networking mirror comments to permit IDs on existing wire/diagnostic surfaces
where useful. The server continues to resolve identity from connection/session
state, and bearer tokens remain absent from unsafe URLs, logs, diagnostics, and
documentation examples.

The server emits a complete safe lobby snapshot after
mutations and a monotonic revisioned update for create/fill/start/collect.
One connection has at most one lobby or match presence; match joins transition
to the existing networking handshake/session path. Spectator attachment uses
the existing read-only spectator path and never creates a seat.

The message handler resolves identity from server session state, never from
client-supplied seat/guest-ID fields. Gameplay `order` handling remains gated
by the resolved network seat. Lobby actions are serialized by the Node event
loop and each mutation rechecks current state immediately before assignment.

### 3. Existing console and host surfaces

Introduce a lobby state machine beside the existing console match store:
`identitySetup → lobby → waiting → joining/spectating → match → lobby` plus
recoverable `error`/`disconnected` substates. Keep the current live console
mounted for the match state; use semantic paths as the host entry paths. The
legacy query-selected live entry is retired rather than preserved as a
compatibility route. Normal host output contains no match ID, seat, token, or
identity in the URL.
Create a reusable lobby UI with an identity form, create form, status-filtered
public match rows, empty/loading/error states, and accessible transitions. Handle
first labels remain the UX rule; if absent, a generic label or non-secret
guest/player ID is valid. Match IDs and guest/player IDs are correlation data,
not credentials; bearer tokens never appear in URLs, logs, diagnostics, or docs.

### 4. Documentation/privacy checker

Revise `specs/010-public-lobby-match-browser/check-documentation-privacy.mjs` so
it rejects credential values and credential-bearing URLs, while allowing
representative non-secret player/guest IDs and ID field names on implementation,
contract, README, and approved manual surfaces. Keep explicit checks for required
handle guidance and the private-match/fog credential boundary. Add a small
fixture/test seam if needed so both allow and deny cases are executable without
placing live credentials in repository docs.

### 5. Documentation and cross-feature comments

Update only contradictory wording in `packages/{matchmaking,networking,console}`
comments/READMEs, root README, applicable `docs/manual` guidance, and the
Feature 002/004/006/011/012 cross-references. Documentation should use
representative IDs where correlation is useful, never live bearer values. Keep
private-match non-enumeration and fog-of-war wording explicit.

## Compatibility and migration

- Do not change `NETWORK_API_VERSION`, payload shapes, or application behavior.
- Preserve `HelloAck`, `JoinAck`, snapshot/tick, order ack, fog, terminal, and
  reconnect semantics; ID exposure is not authentication or a version change.
- Do not introduce private-match discovery, invitations, accounts, persistence,
  chat, ratings, history, or gameplay mechanics.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| IDs mistaken for authority | Preserve server-side identity/seat resolution; test forged ID/handle/seat claims and unchanged world state. |
| Bearer credential regression | Add checker fixtures and runtime/log assertions proving tokens never enter risky URLs, logs, diagnostics, or docs examples. |
| Private/fog boundary regression | Re-run private-match existence and 500-tick fog audits; IDs may accompany only already-authorized data. |
| Contradictory assertions remain | Run repository-wide targeted search plus contract/readme/manual checker and review the residual list in tasks. |

## Planned file surface

See [tasks.md](./tasks.md) for the ordered executable list. The planned Phase 6
surface is limited to the checker, stale source comments, contract mirrors/docs,
README/manual wording, and focused test/harness assertions. `specs/013-*` must
not be created. No application source or tests are changed during phases 4–5.
