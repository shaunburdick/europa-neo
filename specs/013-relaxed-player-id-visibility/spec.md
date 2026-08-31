# Feature Specification: Relaxed Player-ID Visibility Policy

**Feature Branch**: `013-relaxed-player-id-visibility`
**Created**: 2026-08-30
**Last Updated**: 2026-08-30 (v1.0)
**Version**: 1.0
**Status**: Proposed — awaiting product-owner approval
**Dependencies**: Features 002, 004, 005, 006, 010, and 012
**Input**: Approved product-policy request supplied in this session.

## Problem Statement

The repository currently treats guest identity IDs and gameplay `PlayerId` values
as private data. That policy is unnecessarily restrictive and conflicts with
useful correlation in URLs, wire payloads, logs, diagnostics, and internal state.
This feature establishes the correct distinction: player IDs are ordinary
identity/reference data, while `sessionToken` and `reconnectToken` remain bearer
credentials. Match visibility/existence protections and fog-of-war boundaries
are information-security rules about matches and game state, not player-ID
privacy rules.

## User Stories

### US1 — Correlate a player across system surfaces (P1)

As an operator or client integrator, I want guest identity IDs and gameplay
`PlayerId` values available where identity correlation is useful so that logs,
wire traces, URLs, diagnostics, and state can identify the correct participant.

### US2 — Identify participants in the UI (P1)

As a player, I want the accepted handle shown when one exists so that the match
is readable, while allowing a player ID as a deterministic fallback when no
handle is available.

### US3 — Keep credentials and gameplay privacy protected (P1)

As a player, I want IDs to be shareable without making reconnect credentials or
hidden match/game state shareable.

## Functional Requirements

- **FR-001**: Guest identity IDs and gameplay `PlayerId` values MUST be treated
  as non-secret identity/reference data. They MAY be exposed in URLs, WebSocket
  and other wire payloads, internal state, logs, diagnostics, specifications,
  examples, and developer/operator documentation when useful for correlation.
- **FR-002**: The accepted handle MUST be the preferred participant label in
  user-facing UI whenever it is available. If no accepted handle is available,
  the UI MAY show a generic fallback or the relevant player ID; displaying a
  player ID is not itself a privacy violation.
- **FR-003**: `sessionToken` and `reconnectToken` MUST remain bearer credentials.
  They MUST NOT be exposed in logs, diagnostics, ordinary documentation
  examples, or any URL where URL/log exposure creates a security risk. Existing
  credential validation, expiry, single-seat, and reconnect rules remain
  unchanged.
- **FR-004**: Match visibility protections MUST remain unchanged. Private-match
  IDs/links MAY be used to join a private match, but public listings MUST NOT
  enumerate private matches and unknown/private-match lookup failures MUST NOT
  reveal private-match existence.
- **FR-005**: Fog-of-war protections MUST remain unchanged. A player ID or guest
  identity ID MAY accompany data the recipient is otherwise authorized to
  receive, but an ID MUST NOT authorize, infer, or disclose hidden cells,
  terrain, troops, events, or other fog-filtered game state.
- **FR-006**: Server authority MUST remain unchanged: client-supplied IDs may
  identify or correlate a request but MUST NOT override server-resolved seat,
  identity, role, order authority, or match membership.
- **FR-007**: Wire and internal contracts MUST document which IDs are exposed and
  which fields are credentials. Additive exposure of an existing ID MUST NOT be
  interpreted as a protocol-version or authentication change unless the
  payload shape or compatibility contract actually changes.
- **FR-008**: Applicable user-facing, developer, operator, API, and player-manual
  documentation MUST describe handle-preferred labeling and the distinction
  between shareable IDs and secret bearer credentials. Documentation MAY use
  representative player-ID values, but MUST NOT use live credentials.
- **FR-009**: The feature-010 documentation/privacy acceptance checker MUST be
  revised during implementation to stop rejecting player-ID field names and
  representative non-secret IDs while continuing to reject credential-bearing
  examples and credential-bearing URLs. The checker itself is implementation
  work and is intentionally not changed during this specification phase.

## Non-Functional Requirements

- **NFR-001 (Security boundary)**: No change may weaken credential secrecy,
  private-match existence resistance, authorization, or fog-of-war filtering.
- **NFR-002 (Determinism)**: ID exposure and correlation MUST NOT introduce
  unseeded randomness, wall-clock dependence inside simulation, or
  iteration-order dependence.
- **NFR-003 (Accessibility)**: Participant labels MUST remain accessible text
  and must not rely on color alone; handle and fallback-ID labels must use the
  existing semantic/focus conventions.
- **NFR-004 (Compatibility)**: Existing clients MUST continue to tolerate
  absent optional identity fields, and existing clients/servers MUST retain the
  current protocol-version and credential behavior.

## Acceptance Criteria

- **AC-001**: A contract/documentation review finds no normative prohibition on
  exposing guest identity IDs or gameplay `PlayerId` values in the affected
  feature specs, contract documentation, READMEs, or root README.
- **AC-002**: A representative trace can correlate one participant's guest ID,
  gameplay `PlayerId`, and accepted handle across an allowed URL/wire/log/
  diagnostic surface without exposing a session or reconnect token.
- **AC-003**: UI examples show the accepted handle when present and specify a
  generic or ID fallback when absent.
- **AC-004**: Private-match listing/existence scenarios remain unchanged, and a
  500-tick fog audit still reports zero hidden-state leakage.
- **AC-005**: The amended documentation/privacy checker rejects a credential
  value or credential-bearing URL and permits a non-secret player-ID example.
- **AC-006**: No application source, tests, or checker implementation is
  changed in phases 1–3; those changes belong to the approved implementation
  plan for this policy.

## Source-of-Truth Structure and Required Amendments

This is a cross-cutting policy feature, not a new runtime subsystem. Feature
013 is the canonical policy and migration checklist. Existing feature specs
remain the behavioral owners and must be amended in the same policy change:

| Artifact | Amendment responsibility |
| --- | --- |
| Feature 010 | Replace the guest-ID privacy prohibition; retain handle preference, authority, and public/private behavior. |
| Feature 004 and its contract docs | Permit identity IDs in transport/correlation surfaces; keep bearer credentials secret and fog filtering authoritative. |
| Feature 006 and its contract docs | Permit IDs in match/session/seat correlation; retain private-match non-enumeration and generic unknown-ID failures. |
| Feature 002 | State that identity IDs are metadata and do not alter fog-of-war filtering. |
| Feature 012 (3–4 player) | Replace the manual/privacy prohibition with the credential-only restriction; preserve N-player fog and private-match rules. |
| Root/package READMEs | Explain handle-preferred UI and ID-versus-credential distinction. |
| `check-documentation-privacy.mjs` | Implementation-phase checker update required by FR-009; not edited in phases 1–3. |

No new API, data model, package, or player-facing feature is introduced by
013. Plans and tasks must be created only after product-owner approval.

## Out of Scope

- Changing authentication or introducing accounts.
- Making bearer credentials public or changing their lifetime/rotation.
- Relaxing private-match listing/existence protections.
- Relaxing fog-of-war, authorization, or server-authoritative order rules.
- Implementing code, tests, or checker changes before approval and planning.

## Clarifications Applied

### Session 2026-08-30 — Product-owner policy ruling (v1.0)

- Player IDs are not private. This includes opaque guest/player identity IDs and
  gameplay `PlayerId` values.
- IDs may appear in URLs, wire transfers, internal state, logs, diagnostics,
  documentation, and examples when useful for correlation.
- Accepted handles are preferred in UI; a generic fallback or player ID is
  acceptable when no handle exists.
- `sessionToken` and `reconnectToken` remain security-sensitive bearer
  credentials and must not be exposed where URL/log exposure is risky.
- Private-match visibility/existence protections and fog-of-war boundaries are
  preserved and are separate from identity privacy.
- This ruling amends existing behavioral specs and contract documentation;
  feature 013 is the cross-cutting policy source of truth rather than a new
  runtime feature.
