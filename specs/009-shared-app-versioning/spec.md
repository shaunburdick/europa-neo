# Feature Specification: Shared Application Versioning Across API, UI, and Documentation

**Feature Branch**: `009-shared-app-versioning`

**Created**: 2026-08-25

**Status**: Draft

**GitHub Issue**: #11 (milestone v0.1.0)

**Input**: User description: "One shared application version, visible everywhere it matters, so anyone can answer 'what version is being run?' — in the API, the UI, and the documentation."

## Problem Statement

Today there is no way to answer "what version is being run?" about any part of Europa Neo. The root `package.json` and all six workspace packages sit at `0.0.0` with no mechanism keeping them in step; the wire protocol carries only a *protocol* version (spec 004's compatibility contract), which says nothing about which *release* a server is running; the console HUD, README, and player manual are all version-silent. Operators self-hosting (constitution VII) cannot verify a deploy or file a useful bug report; maintainers cannot cite a version in release notes. This feature establishes a single-source lockstep application version and surfaces it in the API handshake, an HTTP endpoint, the HUD footer, and the documentation — while keeping *app version* (release identity) strictly distinct from *protocol version* (compatibility contract).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operator Asks a Server What Version It Runs (Priority: P1)

As a self-hoster or bug reporter, I want every server to disclose its application version — once in the WebSocket hello handshake and once at a plain `GET /version` HTTP endpoint — so that I can verify a deploy and attach exact version information to bug reports without any tooling beyond `curl`.

**Why this priority**: This is the machine-readable source of truth for "what version is being run?" — the entire point of the feature. Everything else (UI, docs) is a projection of it.

**Independent Test**: Can be fully tested by starting a match server and asserting (a) `curl http://<host>:<port>/version` returns HTTP 200 with JSON `{appVersion, protocolVersion}` and no authentication, and (b) a scripted WebSocket client completing the handshake receives a hello acknowledgment containing the same `appVersion`.

**Acceptance Scenarios**:

1. **Given** a running match server, **When** a client sends `curl http://<host>:<port>/version`, **Then** the response is HTTP 200 with a JSON body of exactly `{ "appVersion": "<semver>", "protocolVersion": "<string>" }` and no auth headers or cookies were required.
2. **Given** a running match server, **When** a scripted WebSocket client completes the hello handshake, **Then** the server's hello acknowledgment contains an `appVersion` field equal to the server's compiled-in `APP_VERSION` constant.
3. **Given** the same server, **When** its logs are inspected after boot and after a seat join, **Then** each log line records the application version alongside the existing boot/join details.

---

### User Story 2 - Maintainer Cannot Accidentally Split the Version (Priority: P2)

As a maintainer, I want CI to fail whenever `APP_VERSION`, the root `package.json` version, and any workspace package version disagree, so that "single source of truth" is enforced by machinery rather than vigilance.

**Why this priority**: The drift check is what makes the single-source claim durable; without it the lockstep invariant rots with the first hurried edit. It is buildable only after the version package exists (Story 1's foundation), hence P2.

**Independent Test**: Can be fully tested by injecting a mismatch (editing one `package.json` version), running the drift check, and asserting a non-zero exit that names the offending file; restoring consistency flips it to zero-exit.

**Acceptance Scenarios**:

1. **Given** all version fields agree, **When** the drift check runs locally or in CI, **Then** it exits 0.
2. **Given** any one of `APP_VERSION`, root `package.json`, or any workspace `package.json` is edited to differ, **When** the drift check runs, **Then** it exits non-zero and its output names every file whose version disagrees.
3. **Given** the README header version line or player-manual index footer disagrees with `APP_VERSION`, **When** the drift check runs, **Then** it exits non-zero and names the stale document.

---

### User Story 3 - Player Sees the Version In Game (Priority: P2)

As a player, I want a subtle version indicator in the console HUD footer, so that when I screenshot or report an issue, the version is visible without opening developer tools.

**Why this priority**: Direct user-visible value and trivially cheap, but it consumes Story 1's constant; the API surfaces come first because they are authoritative.

**Independent Test**: Can be fully tested by mounting the console and asserting the HUD footer renders exactly the `APP_VERSION` string, including an accessibility pass (real DOM text, contrast).

**Acceptance Scenarios**:

1. **Given** a mounted console in any connection state, **When** the HUD renders, **Then** the footer displays the application version string (e.g., `v0.0.1`) as real DOM text.
2. **Given** a screen reader user, **When** the footer renders, **Then** the version is announced as ordinary page content (it is not hidden from assistive technology and does not hijack focus).

---

### User Story 4 - Reader Sees the Version In Documentation (Priority: P3)

As a prospective player or contributor reading the README or the published player manual, I want the documented version stated up front, so that I know which behavior the text describes.

**Why this priority**: Completes "everywhere it matters"; docs ride in the same change set as the code per existing house rules (spec 007 FR-012), so incremental cost is near zero.

**Independent Test**: Can be fully tested by grepping the README header and the manual index footer for the current `APP_VERSION` string (automated as part of the drift check — US2 acceptance scenario 3, SC-005).

**Acceptance Scenarios**:

1. **Given** the repository README, **When** a reader views the header area, **Then** the current application version is displayed near the title.
2. **Given** the published player manual index page, **When** a reader scrolls to the footer, **Then** the version this manual documents is displayed, and GitHub Pages republishes it automatically on merge (existing path-gated workflow).

---

### Edge Cases

- What happens when versions disagree across files? → The CI drift check fails the build and names every offending file (US2); a local `pnpm` script exposes the same check so contributors catch it before pushing.
- What happens when an old server (pre-`appVersion`) receives a new client? → The client MUST tolerate a missing `appVersion` in the hello acknowledgment: the HUD shows no version rather than a wrong one, and nothing crashes.
- What happens when a new server talks to an old client? → The wire validator enforces *required* fields only; an additional `appVersion` field on the server hello acknowledgment is ignored by older clients (additive compatibility verified by test).
- How are app version and protocol version kept independent? → They are separate fields with separate lifecycles: bumping the app release does not touch `NETWORK_API_VERSION`, and changing the wire protocol does not require a release-style app bump. A test asserts the two reported values can differ.
- What happens on a shallow clone or Docker build? → The version comes from the checked-in `package.json` via a plain compile-time constant — never from `git describe` (rejected alternative: non-reproducible, breaks shallow clones).
- What about the browser demo route (`/`) that runs without a server? → The HUD reads the bundled constant, so it still shows a version with no backend present.
- What happens when the manual on GitHub Pages lags the repo? → The Pages workflow already republishes on merge to `main` when `docs/manual/**` changes; the drift check keeps the *source* honest, which is the copy that ships.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The root `package.json` `version` field MUST be the single source of truth for the application version. Every workspace package (`packages/*`) MUST carry the identical version in lockstep.
- **FR-002**: A new **private** workspace package `@europa/version` MUST export the application version as a plain constant `APP_VERSION` (a string). It MUST NOT be published to any registry (`"private": true`), MUST have zero runtime dependencies, and is consumed via pnpm workspace linking (bundled into the browser build, symlink-resolved on Node, carried inside images).
- **FR-003**: The server→client hello acknowledgment (spec 004 `HelloAckPayload`) MUST gain an additive optional `appVersion` field populated with the server's `APP_VERSION`. Clients MUST tolerate its absence. The client→server hello payload is unchanged (its existing optional `clientInfo` already covers client-side identification).
- **FR-004**: The application version and the wire protocol version (`NETWORK_API_VERSION`, spec 004 FR-004) MUST remain distinct values with distinct semantics: protocol version = compatibility contract; app version = release identity. Neither implies the other, and no code path may derive one from the other.
- **FR-005**: The server MUST log the application version at boot and at each seat join.
- **FR-006**: The HTTP surface that serves the console/static assets MUST also serve `GET /version`, returning HTTP 200 with JSON `{ "appVersion": "<semver>", "protocolVersion": "<string>" }`. The endpoint MUST be unauthenticated (see Clarifications). Non-GET methods MUST be rejected without side effects.
- **FR-007**: The console MUST render the application version in a subtle HUD footer as real DOM text (not canvas), visible in all connection states, styled to meet WCAG 2.2 AA contrast (constitution VI), and never intercepting pointer or keyboard interaction.
- **FR-008**: The README header MUST display the current application version, and the player-manual index (`docs/manual/index.md`) MUST display it in a footer. Both updates ride in the same change set as the code that changes them (spec 007 FR-012 discipline).
- **FR-009**: A drift check (CI + local script) MUST assert `APP_VERSION` === root `package.json` version === every workspace `package.json` version === the version strings shown in the README header and manual index footer. On failure it MUST exit non-zero and name every disagreeing file.
- **FR-010**: The first lockstep version value MUST be `0.0.1`, landing in this feature's own change set (see Clarifications v1.1). The `0.1.0` bump is deferred to the release flow: issue #4 applies it as one dedicated `chore(release): v0.1.0` bump-then-tag commit that touches every version location FR-009 guards. Subsequent releases repeat that one-commit-per-release convention.
- **FR-011**: The following companion edits MUST land in the same change set as the implementation (specs stay truthful, constitution IV):
    - Amend spec 004-multiplayer-networking: `HelloAckPayload` gains `appVersion`; note the app-vs-protocol distinction next to FR-004.
    - Amend spec 005-client-console: HUD footer requirement (extends the status-display area around FR-008).
    - Amend spec 007-player-manual: index footer requirement (consistent with FR-012's same-change-set rule).
    - Update README header and AGENTS.md "Next" section (removing the stale "spec-driven feature 008" wording from issue #6's line — feature numbers are minted at spec time, never reserved in tickets).

### Key Entities *(include if feature involves data)*

- **APP_VERSION**: plain string constant exported by `@europa/version`; semver; identical to root `package.json` version; compile-time visible to Node and browser builds alike.
- **VersionInfo**: the `/version` JSON body `{ appVersion, protocolVersion }` — two independent strings, both always present.
- **HelloAckPayload.appVersion**: additive optional wire field (string); presence indicates a server of this feature's generation or later.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Injecting a version mismatch (editing any one guarded file) makes the drift check exit non-zero AND print the offending file path(s); restoring agreement restores exit 0. Verified in both directions by automated test.
- **SC-002**: `curl -s http://<host>:<port>/version` against a running server returns HTTP 200 with a JSON body parseable as exactly `{appVersion: string, protocolVersion: string}`, with no credentials supplied.
- **SC-003**: A scripted WebSocket client completing the handshake receives `appVersion` equal to the server's `APP_VERSION`; a companion test proves `appVersion` and `protocolVersion` are independent (they may hold different values simultaneously).
- **SC-004**: A mounted-console component test asserts the HUD footer's visible text equals the `APP_VERSION` string; the accessibility suite stays green (footer is real text content with AA contrast).
- **SC-005**: Automated assertions find the current `APP_VERSION` string in the README header and the manual index footer (part of the drift check).
- **SC-006**: New testable logic — the drift checker and the `/version` handler — meets ≥80% coverage on every metric (constitution III merge gate).
- **SC-007**: After this feature's change set, the root `package.json`, every workspace `package.json` (the six shipped packages plus the new `@europa/version`), and the exported `APP_VERSION` all report `0.0.1`.

## Assumptions

- No new third-party dependencies: the drift check compares version strings for equality (no semver parsing/ordering needed); `@europa/version` is a zero-dependency constant module. Constitution licensing constraints are trivially satisfied.
- The matchmaker service does not gain a version surface in this feature (not in the approved design); its nodes log through the same server boot path where applicable.
- TLS termination remains a reverse-proxy concern; `/version` sits behind whatever origin serves the console.
- Docker packaging (issue #5) inherits `/version` and the bundled constant automatically; no container work belongs to this feature.
- Version presentation is a `v`-prefixed string (e.g., `v0.0.1`) on all human-facing surfaces; the raw semver string is what the constant, the wire field, and the JSON body carry.

## Out of Scope

- Publishing `@europa/version` or any package to a registry (all packages stay private).
- git-describe-derived versions, changesets tooling, Vite-define-only injection, runtime root-`package.json` reads — all rejected in the approved design (issue #11).
- Release automation (tagging, changelog generation) — issue #4 cuts the v0.1.0 release (bump-then-tag, per Clarifications v1.1) using this machinery; automation beyond the bump-commit convention is not specified here.
- Per-package independent versioning or semantic-import ranges between workspace packages.
- Docker packaging (#5) and 3–4 player support (#6) — separate efforts.

## Same-Change-Set Companion Edits (contract amendment targets)

The implementation change set MUST include the amendments listed in FR-011. Summary of touched contracts:

| Target | Amendment |
| --- | --- |
| `.specify/features/004-multiplayer-networking/spec.md` | `HelloAckPayload.appVersion` + app-vs-protocol note at FR-004 |
| `.specify/features/005-client-console/spec.md` | HUD version footer (status-display area, FR-008 neighborhood) |
| `.specify/features/007-player-manual/spec.md` | Manual index footer requirement |
| `README.md` | Header shows current version |
| `docs/manual/index.md` | Footer shows documented version |
| `AGENTS.md` | "Next" section scrub: drop stale "spec-driven feature 008" wording on the issue #6 line |

## Clarifications

### v1.0 (2026-08-25) — Planner-resolved decisions (no unresolved questions remain)

- 2026-08-25: `/version` is **unauthenticated** (ruled; issue #11 silent on auth). Rationale: the wire hello already discloses `appVersion` to every connecting client before any authentication, so gating the HTTP surface adds no confidentiality; open health/version probes are standard operational practice for self-hostable software and directly serve constitution VII. No constitutional counterargument exists — the disclosure reveals a release string, not secrets, configuration, or user data.
- 2026-08-25: The **initial `0.1.0` bump rides this feature's own change set** (ruled interpretation of issue #11's acceptance criterion "first lockstep bump lands as 0.1.0"). Reading: the criterion is listed as an acceptance criterion *of this feature*, so it must be verifiable at this PR's merge; shipping `v0.1.0` on every surface while files say `0.0.0` would fail the feature's own drift check. The `chore(release): vX.Y.Z` commit convention governs subsequent releases; issue #4 then cuts the tagged v0.1.0 release from this state. Product owner may override by deferring the bump to #4 — a one-line spec edit. **SUPERSEDED by Clarifications v1.1 (2026-08-25): the product owner exercised exactly this override — the initial bump is `0.0.1`; `0.1.0` moves to issue #4's release flow.**
- 2026-08-25: **Drift-check scope includes the two doc surfaces** (README header line, manual index footer) in addition to the issue's minimum (constant + all `package.json` files). Ruled as the technical implementation of "visible everywhere it matters": without it, doc strings go stale silently, violating the spirit of FR-012/constitution IV. Scope extension is additive and cheap (two more equality assertions in the same script).
- 2026-08-25: **`appVersion` placement is server→client only** (hello acknowledgment). The client→server hello already carries optional `clientInfo.version` for client identification; duplicating a top-level client field would add a second telemetry path for no requirement in the approved design. Old-server/new-client tolerance and new-server/old-client tolerance are both pinned by test (Edge Cases).
- 2026-08-25: **Presentation format** ruled as `v`-prefixed display strings on human surfaces (HUD, README, manual) with raw unprefixed semver in the constant, wire field, and JSON body — consistent with common convention and unambiguous to parse.

### v1.1 (2026-08-25) — Product-owner override: initial bump `0.0.1`, `0.1.0` deferred to release (#11)

One-line trail: the product owner overruled Clarifications v1.0 ruling #2 — this feature's change set locks step at **`0.0.1`**; the `0.1.0` bump happens inside release issue #4 (bump-then-tag), not here. FR-010 and SC-007 updated accordingly; the superseded v1.0 bullet is marked in place. No other rulings change.
