# Clarifications — Security Sweep (spec 016 manifest; issues #152/#146/#129)

Phase 3 record for the security-sweep amendments. Every question raised during specification is listed with its resolution and where the resolution landed in the specs. There are zero unresolved `[NEEDS CLARIFICATION]` items in any artifact of this effort. Three decisions were originally marked **challengeable** for Gate 1; all three are now settled: D4 and D5 by product-owner confirmation at Gate 1 round 2 (challenge ledger), and test-sentinel naming by plan-phase decision AD-3 in `plan.md`.

## Resolved decisions

### D1 — Resume secret AND seat/session tokens (not either/or) — challengeable: no

Issue #146 proposed "a separate resume secret … (or require the seat token for destructive actions)". Resolution: **both**, with disjoint scopes. Rationale: a seat token does not exist before a seat is claimed, so it cannot cover lobby-identity restore from a reload (spec 010 US1 AC-3/FR-003 requires reload-restore). The resume secret covers the identity lifecycle (restore/rename/release — spec 010 FR-040, spec 006 FR-018); session/reconnect/seat tokens keep covering admission, orders, views, and seat reconnect exactly as today. Landing: specs 010 v1.13, 006 v1.8, 004 v1.11.

### D2 — Active-holder supersession semantics

A claim carrying the **matching** resume secret may supersede an active holder (the owner's own reload racing the old socket's close); the superseded connection closes with the existing single-seat re-claim semantics (spec 004 edge case). A bare-id claim never supersedes anything, active or in grace. Rationale: possession of the secret is ownership; closing the stale socket is the desired reload UX and matches the manual's existing "This session moved somewhere else" notice. Landing: spec 010 FR-041, spec 006 FR-018.

### D3 — Regenerate the resume secret on every successful restore

The secret is single-epoch: each successful restore mints the next secret (delivered on the same directed event). Rationale: bounds the replay value of a captured secret to one epoch; cost is one CSPRNG call per restore. Landing: spec 006 FR-018.

### D4 — Wire compatibility posture — challengeable: no (PO-confirmed)

Additive optional fields only; **no `NETWORK_API_VERSION` bump** (same ruling pattern as the `detail` and `guestPlayerId` additions). Old clients sending id-only claims receive a fresh identity on reload instead of a restore — graceful, but a visible identity/handle churn for stale clients. Alternative the PM could prefer: a major wire bump that rejects old clients outright (spec 004 FR-023 precedent). Recommendation: additive; the degradation is exactly what the security fix mandates for unauthenticated claims. Landing: spec 004 v1.11 "Version compatibility", spec 006 v1.8.

### D5 — `CONSOLE_API_VERSION` bump for barrel-export removal — challengeable: no (PO-confirmed)

Removing `@internal` exports (notably `ConsoleRuntime`) from the public `@europa/console` barrel is a breaking public-surface change under the console contract, so the amendment requires a bump in the same change set (0.x minor-line = breaking). **The product owner confirmed 0.4.1 → 0.5.0 on 2026-10-11 (Gate 1 round 2, recorded in the challenge ledger "Binding product-owner decisions" table); the number is settled and MUST NOT be re-opened in the plan or implementation phases.** Landing: spec 005 FR-038.

### D6 — Verification depth

As directed: `pnpm verify` (or `bash scripts/verify.sh`) + a targeted unit test per acceptance criterion + an `agent-browser` smoke of the console against `pnpm host`. Landing: spec 005 v1.11 verification standard; specs 010 SC-017, 013 AC-018…AC-020, 015 AC rows.

### D7 — Player-manual impact (flagged, not edited in this phase)

Surveyed 2026-10-11: `lobby.mdx` and `quick-start.mdx` describe resume as browser-stored guest-session state and warn against copying the resume credential — compatible with the resume-secret model; neither the manual nor the README documents `?ws=`, `?live`/`?token=`, or `window.__europa*` handles, so #152/#129 have no manual impact. The **review obligation** for the #146 change set is mandatory (spec 007 v1.8); edits are conditional on the implemented behavior. Landing: spec 007 v1.8.

### D8 — Evidence-line correction (record, not a requirement)

Issue #146's cited paths/lines are stale (`packages/matchmaking/src/identityRegistry.ts:275-291` → the file now lives at `packages/matchmaking/src/internal/identityRegistry.ts` with `restoreIdentity` at ~328; `lobbyService.ts` is likewise under `internal/` with the bare restore at ~998 and the connection-binding block ~1085-1107). Issue #152's live findings verified today: `sendEnvelope` throw sites at `ws-match-client.ts:292` and `ws-lobby-client.ts:762`; module-global `lastCapturedSeatSessionToken` at `ws-lobby-client.ts:390`. Issue #129's core bug verified live in `packages/console/src/main.tsx` (`stripProductionQuery()` before `resolveLobbyServerUrl(window.location.search, …)`). The amended specs reference finding IDs and file/symbol names rather than line numbers so they do not rot.

### D9 — Identity-event secret semantics + F-8 same-connection carve-out (Gate 2 Q1 — plan-phase decision)

Two pins recorded in `plan.md` AD-9/AD-11 and the contracts, from evidence read at Gate 2:

1. **Server**: every establishment-path directed `identity` event carries the record's current secret (mint → new, claim-restore → rotated successor, F-8 refresh → unchanged current), composed via the internal-only `resumeSecretOf` accessor; rename-path events carry none. Rotation only on successful claim-based restores (D3).
2. **Client**: an identity event WITHOUT a secret never clears a stored secret (`applyIdentity`/`adoptServerGuestId` carry it forward); only `invalidateClaim` clears it. Regression pinned by the rename → reload → restore scenario (SC-017 trial-a extension).
3. **F-8 carve-out**: the same-connection id-only refresh (`lobbyService.ts:1084–1093`) is a no-op governed by the connection binding — it mutates nothing and never reaches `restoreIdentity` — and stays as-is, pinned by existing tests (`lobby.facade.test.ts:245`, `:264`). Its letter-tension with the literal "mint a fresh identity" sentences in 004 FR-027 / 006 FR-018 was **reported to the dispatcher** for a possible one-clause spec precision; no spec text was edited in the plan phase (Gate 2 rules).

### D10 — Same-connection idempotent refresh carve-out (PO ruling, Gate 2 re-entry; 2026-10-11)

Discovered during Gate 2 planning, after this artifact's Phase 1–3 run: the shipped lobby service has an F-8 branch (`lobbyService.ts`, same-connection idempotent refresh) where an id-only claim arrives on the connection already bound to that identity. FR-027 (spec 004 v1.11) and FR-018 (spec 006 v1.8) were written in absolute terms that would force mint-fresh there — issuing a legitimate, already-bound client a NEW identity mid-lobby and destroying its handle. PO ruling (binding): add a carve-out; the security rule is unchanged everywhere else.

- **Authority source**: in the excepted branch, authority is the pre-existing *connection binding* (established at bind time via the resume secret or a session/reconnect credential) — never the id. The claim's id stays advisory and grants nothing; the id-only-confers-no-authority property is untouched.
- **Exact scope**: only a claim on the identity's own already-bound connection, only while the identity is active (not in grace). No mint, no grace start, no mutation, no displacement — behavior the lobby-facade suite already pins ("re-establishing the SAME identity starts no spurious grace window").
- **No loophole**: any *other* connection claiming that id mints fresh, even for an active identity; grace-window restore still requires the resume secret; the carve-out confers no extra authority — rename and voluntary leave keep FR-018/FR-043's credential requirements.
- **Landing**: dated entries under spec 004 v1.11 FR-027 and spec 006 v1.8 FR-018 (same-date in-entry convention, matching spec 004 v1.3's dated continuation bullet — no version bumps, since both amendments are unshipped); manifest rows A-02/A-09 updated.

## Open questions for Gate 1 (PM may override)

1. **D4 compatibility posture** — RESOLVED: additive no-bump, PO-confirmed at Gate 1 round 2 (challenge ledger "Binding product-owner decisions").
2. **D5 version number** — RESOLVED: 0.4.1 → 0.5.0, PO-confirmed at Gate 1 round 2 (see D5 above). Do not re-open.
3. **Test-sentinel naming** — resolved at plan phase: `plan.md` AD-3 pins the sentinel as `window.__europaTestOptIn` (presence-gated opt-in object; mechanism unchanged from the spec text).
