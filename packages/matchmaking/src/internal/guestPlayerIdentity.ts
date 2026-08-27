/**
 * GuestPlayerIdentity — server-internal record shape (Feature 010, T-005)
 *
 * Per spec key entity "GuestPlayerIdentity": an ephemeral,
 * non-authenticated, server-recognized guest player identity. Created
 * on the visitor's first landing-page load, held in process memory
 * only, and lost on restart or browser-storage clearing (FR-002/
 * FR-015). The opaque {@linkcode GuestPlayerId} is minted server-side
 * and NEVER leaves the server as a display value (FR-024).
 *
 * Lifecycle: `active` (lobby-bound or in a match) → `grace`
 * (disconnected; handle stays reserved for the reconnect grace window,
 * spec Clarifications v1.0) → either restored to `active` by a
 * matching claim, or released (identity deleted, handle key freed) on
 * grace expiry or explicit release.
 *
 * @internal Exported for testability only; not part of the public
 * surface re-exported through the package barrel.
 *
 * Pure module: no clock reads, no randomness — both arrive via
 * caller-supplied values (constitution Principle II).
 */

import type { GuestPlayerId } from '../contracts/lobby-types';

/** Connection status of one guest identity inside the registry. */
export type GuestIdentityStatus =
    /** Connected/present: lobby-bound or committed to a match. */
    | 'active'
    /**
     * Disconnected within the reconnect grace window: the identity AND
     * its handle stay reserved until the claimant returns or grace
     * expires (spec edge case: handle availability).
     */
    | 'grace';

/**
 * Ephemeral per-visitor lobby identity. `handle` and `handleKey` are
 * both `null` until the visitor picks a name (identity exists before
 * naming, US1 AC-1 vs AC-2) and are always set/cleared together.
 * Lifecycle fields are mutated only by registry transitions, mirroring
 * the feature-006 `PlayerSession` precedent.
 */
export interface GuestPlayerIdentity {
    /** Opaque unique id (FR-024); branded, never rendered anywhere. */
    readonly id: GuestPlayerId;
    /** Accepted display handle (trimmed, casing preserved), or `null`. */
    handle: string | null;
    /** FR-005 uniqueness key for {@linkcode handle}, or `null` iff it is. */
    handleKey: string | null;
    /** Current connection status (see {@linkcode GuestIdentityStatus}). */
    status: GuestIdentityStatus;
    /** Epoch ms of the disconnect that started the grace window, or `null`. */
    disconnectedAtMs: number | null;
    /** Epoch ms when the identity was minted. */
    readonly createdAtMs: number;
}

/** Arguments for {@linkcode createGuestPlayerIdentity}. */
export interface CreateGuestPlayerIdentityArgs {
    /** Pre-minted opaque id (registry owns generation). */
    readonly id: GuestPlayerId;
    /** Injected wall-clock reading in epoch ms. */
    readonly nowMs: number;
}

/**
 * Create a new guest identity with no handle and `active` status.
 *
 * @param args - Minted id plus the current wall-clock reading.
 * @returns A fresh `GuestPlayerIdentity` with all handle fields `null`.
 */
export function createGuestPlayerIdentity(args: CreateGuestPlayerIdentityArgs): GuestPlayerIdentity {
    const { id, nowMs } = args;
    return {
        id,
        handle: null,
        handleKey: null,
        status: 'active',
        disconnectedAtMs: null,
        createdAtMs: nowMs,
    };
}
