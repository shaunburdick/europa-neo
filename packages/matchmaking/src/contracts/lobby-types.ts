/**
 * Lobby Type Contracts — Feature 010 (Public Lobby & Match Browser)
 *
 * Typed identity, public projection, error, and lobby-event contracts
 * for the server-owned lobby facade (plan.md §"Architecture" §1).
 *
 * Source of truth: `specs/010-public-lobby-match-browser/contracts/lobby-types.md`.
 * The TypeScript block in that document is mirrored here shape-for-shape,
 * in declaration order. `LobbyError` (the error PAYLOAD referenced by
 * `lobby-api.md`'s `Result<_, LobbyError>` signatures) is declared here
 * too so the whole error contract stays in one file; it follows the
 * feature-006 `MatchmakerError` convention exactly.
 *
 * Rules for this file:
 *   - All types are readonly outside lobby internals.
 *   - No `any`. Use `unknown` + narrowing where shape is dynamic.
 *   - Integer-only numeric fields (revisions, action ids, capacities).
 *   - Branded primitives prevent confusion with networking's tokens and
 *     matchmaking's session ids.
 *   - IDs are non-secret correlation identifiers, not credentials. They may
 *     appear on safe correlation surfaces; accepted handles remain preferred
 *     for human-facing labels. Bearer session/reconnect tokens stay protected.
 *     Client claims are advisory input only; server-resolved identity, session,
 *     and seat state remains authoritative.
 *
 * Versioning: additive changes keep the wire tolerant (unknown-message
 * and unknown-error-code clients default their branches, mirroring
 * feature 004's `ErrorCode` discipline). Breaking shape changes bump
 * `MATCHMAKING_API_VERSION` and update consumers in the same change set
 * (constitution Principle IV: stale contracts are bugs).
 */

// ----------------------------------------------------------------------------
// Imports
// ----------------------------------------------------------------------------

// `MatchId` is networking-owned (feature 004); matchmaking re-uses the
// single branded type rather than redefining it (same ruling as
// `contracts/match-types.ts`). Type-only import: erased at compile time,
// keeping the package free of runtime upstream dependencies.
import type { MatchId } from '@europa/networking';

// ----------------------------------------------------------------------------
// Branded primitives
// ----------------------------------------------------------------------------

/**
 * Unique, non-semantic identifier of one ephemeral `GuestPlayerIdentity`
 * (spec FR-002/FR-024). Minted server-side and usable as non-secret
 * correlation metadata, including in safe views, traces, or diagnostics.
 * Handles are preferred for display; this identifier is never a bearer
 * credential or a user-selectable identity. Branded so it cannot silently flow
 * into a `string` field meant for display (handles, match ids, tokens).
 */
export type GuestPlayerId = string & { readonly __brand: 'GuestPlayerId' };

/**
 * Monotonic lobby-list revision (spec FR-013). Every create/fill/start/
 * collect mutation bumps the revision; clients apply snapshots in
 * revision order and discard stale ones. Starts at 1. Integer.
 */
export type LobbyRevision = number & { readonly __brand: 'LobbyRevision' };

/**
 * Client-generated correlation id for one lobby action. Stamped on
 * every lobby request; echoed by the `actionAccepted` and `error`
 * lobby events so the initiating browser tab can match a response to
 * its request (and ignore impostor responses). Integer.
 */
export type LobbyActionId = number & { readonly __brand: 'LobbyActionId' };

// ----------------------------------------------------------------------------
// Identity
// ----------------------------------------------------------------------------

/**
 * Lifecycle status of a PUBLIC match as projected into the lobby
 * (spec FR-007). Deliberately coarser than matchmaking's four-state
 * `MatchStatus`: the lobby distinguishes only what a browsing visitor
 * can act on.
 *
 *   - `'waiting'`     → filling; offers Join (FR-007/US2 AC-2).
 *   - `'in_progress'` → running; offers Spectate (FR-012/US4 AC-2).
 *
 * `'finished'`/`'collected'` matches are never projected (FR-014:
 * no history), so no status values exist for them here.
 */
export type LobbyStatus = 'waiting' | 'in_progress';

/**
 * Client-presented resume claim (INPUT only — never projected back).
 * The browser sends a previously stored `guestPlayerId` (+ last known
 * handle) so the server can restore the active identity within the
 * reconnect grace window (spec US1 AC-3).
 *
 * The server accepts the claim ONLY when it matches its registry;
 * otherwise it mintes a fresh identity and ignores the stale claim
 * (plan.md §1: "the server accepts it only when it matches its
 * registry; otherwise it creates a fresh identity"). Both fields are
 * advisory: the server record is the sole authority (spec v1.1
 * amendment; edge case "client-provided … claims are advisory input").
 */
export interface GuestIdentityClaim {
    /**
     * Opaque id previously issued to this browser (absent on first
     * visit). Issued means DELIVERED: the server hands the id to the
     * browser via the directed `identity` event's `guestPlayerId`
     * (see {@linkcode IdentityState} — spec Clarifications v1.6).
     */
    readonly guestPlayerId?: GuestPlayerId;
    /** Last locally-known handle; restored only if the server still holds it. */
    readonly handle?: string;
}

/**
 * Server-resolved identity state returned by `establishIdentity` /
 * `setHandle` and pushed via the `identity` lobby event.
 *
 * `handle` is the ACCEPTED display handle (`null` until the visitor
 * picks one — identity exists before naming, spec US1 AC-1 vs AC-2).
 * `hasIdentity` is the literal `true` (a state of this shape exists
 * only once an identity has been established) so client narrowing can
 * discriminate it from pre-establishment states without a null check.
 *
 * `guestPlayerId` (spec Clarifications v1.6) is delivered on the directed
 * `identity` event so the owning browser can persist it as a resume claim.
 * The ID may also be included on safe correlation surfaces, but it never
 * authorizes an action; handles remain preferred for labels. Session and
 * reconnect tokens are protected bearer credentials and are not interchangeable
 * with identity IDs. Clients MUST tolerate the ID's absence.
 */
export interface IdentityState {
    /** Accepted handle, or `null` while the visitor has not chosen one. */
    readonly handle: string | null;
    /** Literal `true`: this state is only produced for established identities. */
    readonly hasIdentity: true;
    /**
     * Non-secret identity reference for correlation. Present on the directed
     * `identity` event and permitted on other safe correlation surfaces; it is
     * not a credential. Use the accepted handle as the human-facing label.
     */
    readonly guestPlayerId?: GuestPlayerId;
}

// ----------------------------------------------------------------------------
// Public projection
// ----------------------------------------------------------------------------

/**
 * Safe public projection of one lobby-listed match (spec FR-006,
 * "PublicMatch"/"LobbyEntry" key entities). Produced only for matches
 * that are public AND actionable (`'waiting'` or `'in_progress'`);
 * private matches are out of scope for this feature entirely (v1.0
 * clarification) and finished matches are never shown (FR-014).
 *
 * Privacy envelope (NFR-003, FR-024): discovery data only — id,
 * occupancy/capacity, settings summary, lifecycle status. No host
 * name, no participant handles, no seats, no tokens, no seed, no
 * terrain detail beyond the summary numbers, and never the opaque
 * guest player id.
 */
export interface PublicLobbyEntry {
    /** Stable match identifier (networking-owned `MatchId` brand). */
    readonly matchId: MatchId;
    /** Currently occupied seats, `0..capacity`. Updated live (FR-013). */
    readonly seatsFilled: number;
    /**
     * Total seats. Literal `2 | 3 | 4` per the engine's player-count
     * contract (engine FR-019); v1 ships 2 end-to-end.
     */
    readonly capacity: 2 | 3 | 4;
    /** Actionable lifecycle status (Join vs Spectate — FR-007). */
    readonly status: LobbyStatus;
    /** Square board dimension (settings summary, FR-006). */
    readonly boardSize: number;
    /** Tick interval in ms (settings summary, FR-006; engine default 250). */
    readonly tickIntervalMs: number;
}

/**
 * Complete, safe view of the lobby delivered after every mutation and
 * on subscribe (plan.md §2: "The server emits a complete safe lobby
 * snapshot after mutations and a monotonic revisioned update for
 * create/fill/start/collect").
 *
 * Clients replace their local list wholesale (no delta application)
 * and order/discard snapshots by `revision` (stale-revision protection,
 * plan.md §"Risks" → "Stale rows").
 */
export interface LobbySnapshot {
    /** Monotonic list revision; strictly increasing per mutation. */
    readonly revision: LobbyRevision;
    /** Current public entries in stable server order (constitution Principle II). */
    readonly entries: ReadonlyArray<PublicLobbyEntry>;
    /**
     * The receiving identity's active match, if any (spec US4 AC-4:
     * the landing page shows active-match status and prevents a second
     * seat). `null` when the identity is lobby-bound.
     */
    readonly activeMatchId: MatchId | null;
}

// ----------------------------------------------------------------------------
// Errors
// ----------------------------------------------------------------------------

/**
 * Closed union of all lobby error codes (source of truth:
 * `lobby-types.md`). Clients switch on `code` for recoverable-failure
 * UX (FR-018) and default their branch on unknown codes so the union
 * can grow additively without breaking old browsers.
 *
 * Overlap notes: `match_not_found` / `match_full` /
 * `match_not_joinable` mirror matchmaking/networking semantics but are
 * declared separately here — the lobby is its own API surface (same
 * ruling as feature 006's `MatchmakerErrorCode`). `server_restarted`
 * covers the in-memory reset boundary (edge case: restart loses all
 * identities/handles/entries).
 */
export type LobbyErrorCode =
    /** Claim rejected: malformed/stale identity claim could not be restored. */
    | 'identity_invalid'
    /** Handle failed validation (FR-004: 1–24 Unicode chars, trimmed, no controls). */
    | 'handle_invalid'
    /** Normalized handle conflicts with another active session (FR-005). */
    | 'handle_taken'
    /** Match id unknown (or no longer projected). */
    | 'match_not_found'
    /** Last open seat was claimed first (FR-010; US4 AC-3). */
    | 'match_full'
    /** Match is running (join) or filling (spectate) — action unavailable. */
    | 'match_not_joinable'
    /** The identity is already committed to a match (FR-010; US4 AC-4). */
    | 'identity_in_match'
    /** Stored identity claim expired past the reconnect grace window. */
    | 'identity_expired'
    /** Server restarted; all in-memory lobby state was lost (edge case). */
    | 'server_restarted'
    /** Catch-all; logged on the server (mirrors upstream convention). */
    | 'internal_error';

/**
 * Error payload returned by every failing lobby call (the `E` of
 * `Result<_, LobbyError>`) and carried by the `error` lobby event.
 * Never thrown for expected failures — recoverable failures are values
 * (FR-018); thrown errors are invariant violations that crash loudly.
 *
 * Shape mirrors feature 006's `MatchmakerError` field-for-field so
 * clients reuse one rendering strategy across both surfaces.
 */
export interface LobbyError {
    /** Machine-readable code from the closed union above. */
    readonly code: LobbyErrorCode;
    /** Human-readable English; localizable via `code`. */
    readonly message: string;
    /** Optional machine-readable detail (e.g., the rejected handle length). */
    readonly detail?: Readonly<Record<string, string | number | boolean>>;
}

// ----------------------------------------------------------------------------
// Lobby events (server → browser push channel)
// ----------------------------------------------------------------------------

/**
 * One server-pushed lobby event. Discriminated on `kind` (string
 * discriminator, additive-friendly — mirrors networking's envelope
 * ruling). Delivered over the lobby transport (feature 010's additive
 * messages on the existing WebSocket; see plan.md §2).
 *
 * Ordering contract: `snapshot` events arrive in strictly increasing
 * `revision` order per connection; `actionAccepted`/`error` correlate
 * to a client action via `actionId`.
 */
export type LobbyEvent =
    /** Identity resolved/restored/renamed; carries the safe state only. */
    | { readonly kind: 'identity'; readonly identity: IdentityState }
    /** Full lobby replacement at a monotonic revision (see `LobbySnapshot`). */
    | { readonly kind: 'snapshot'; readonly snapshot: LobbySnapshot }
    /**
     * A client action was accepted. `transition` tells the browser which
     * view follows: `'waiting'` (seated in a filling match) or `'match'`
     * (handed off to the live networking path).
     */
    | {
          readonly kind: 'actionAccepted';
          readonly actionId: LobbyActionId;
          readonly transition: 'waiting' | 'match';
      }
    /**
     * Recoverable failure (FR-018). `actionId` is present when the
     * event correlates to a specific client action and absent for
     * unsolicited failures (e.g., `server_restarted` mid-session).
     *
     * Local mirror of networking's canonical wire declaration (spec
     * Clarifications v1.3 made the wire copy authoritative; v1.5 pins
     * the mirror via `tests/lobby-conformance.test.ts`). Field-for-field
     * identical — including the optional `detail` record below, whose
     * absence here went unnoticed because mutual assignability cannot
     * see a missing OPTIONAL field.
     */
    | {
          readonly kind: 'error';
          readonly actionId?: LobbyActionId;
          readonly code: LobbyErrorCode;
          readonly message: string;
          /**
           * Optional machine-readable detail mirroring matchmaking's
           * `LobbyError.detail` (field name → message/value). Lets clients
           * render field-specific, actionable text (e.g., naming the
           * rejected create-form settings fields); absent when the code
           * needs no specifics or an older server sent none.
           */
          readonly detail?: Readonly<Record<string, string | number | boolean>>;
      };
