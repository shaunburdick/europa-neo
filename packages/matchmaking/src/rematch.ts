/**
 * Rematch coordinator — Feature 006 (T051 + T053)
 *
 * The pure voting/window layer over `RematchOffer` per FR-009,
 * `data-model.md` §9, and research.md §5:
 *
 *   onMatchTerminal → match `finished`
 *     └─ requestRematch  → openRematchWindow (offer stored on record)
 *          ├─ acceptRematch × all originals → new match created
 *          ├─ declineRematch (anyone)       → original collected
 *          └─ window expires unresolved     → original collected
 *
 * All functions are pure: offers and vote sets are mutated in place
 * (the store holds live references — constitution Principle V) but no
 * clock is read, no id is minted, and no I/O happens here. Window
 * deadlines arrive as arguments so tests drive expiry with fake time
 * (constitution Principle II: no timers inside matchmaking logic; the
 * host integration wave owns real scheduling).
 *
 * Forfeited-participant exclusion (T053, spec edge case "What happens
 * when a rematch participant has left?"): the seat-level checks live
 * in the matchmaker wiring (`matchmaker.ts`), which resolves a voter's
 * seat/session before calling {@linkcode castAcceptVote}; this module
 * exposes {@linkcode classifyVoterEligibility} so the "already voted"
 * and "not an original participant" branches stay pure and directly
 * testable.
 */

import type { MatchId } from '@europa/networking';

import type { PlayerSessionId } from '../contracts/match-types';
import type { MatchRecord, RematchOffer } from './internal/matchRecord';

/**
 * Outcome of pre-flight voter classification for a rematch offer.
 *
 * - `'eligible'`      — the voter is an original participant who has
 *   not yet voted.
 * - `'already_voted'` — the voter already cast accept OR decline
 *   (`rematch_already_voted`).
 * - `'not_in_match'`  — the voter is seated in the match but was not
 *   part of the original snapshot (`player_not_in_match`).
 */
export type VoterEligibility = 'eligible' | 'already_voted' | 'not_in_match';

/**
 * Open a rematch window on a `finished` match (FR-009): snapshot the
 * original participants from the record's seats, anchor the deadline
 * at the finish time plus the configured window, and return the fresh
 * offer with empty vote sets.
 *
 * @param finishedMatch - The match whose `seats` snapshot seeds
 *   `allOriginalPlayerIds`; its `finishedAtMs` anchors the deadline.
 * @param offerId - Freshly minted MatchId for the potential new match
 *   (FR-009 "newly generated seed/ID/link"); minted by the caller so
 *   this module stays deterministic.
 * @param nowMs - Epoch ms the window is being opened.
 * @param rematchWindowMs - Configured window length; the deadline is
 *   `finishedAtMs + rematchWindowMs` regardless of when the first
 *   request arrives (T047).
 * @returns The new offer, ready to store on `MatchRecord.rematch`.
 */
export function openRematchWindow(
    finishedMatch: MatchRecord,
    offerId: MatchId,
    nowMs: number,
    rematchWindowMs: number,
): RematchOffer {
    const finishedAtMs = finishedMatch.finishedAtMs ?? nowMs;
    return {
        offerId,
        windowExpiresAtMs: finishedAtMs + rematchWindowMs,
        acceptedBy: new Set<PlayerSessionId>(),
        declinedBy: new Set<PlayerSessionId>(),
        allOriginalPlayerIds: [...finishedMatch.seats.values()].map((seat) => seat.playerSessionId),
        newMatchRecord: null,
    };
}

/**
 * Classify a voter against an open offer (T048/T053 gate order):
 * double votes (accept or decline) beat membership, membership beats
 * eligibility. Callers resolve the voter's seat/session FIRST (token
 * mismatches → `session_invalid`) and only consult this for seated,
 * live participants.
 *
 * @param offer - The open rematch offer.
 * @param voterId - The seated participant's session id.
 * @returns The eligibility verdict (see {@linkcode VoterEligibility}).
 */
export function classifyVoterEligibility(offer: RematchOffer, voterId: PlayerSessionId): VoterEligibility {
    if (offer.acceptedBy.has(voterId) || offer.declinedBy.has(voterId)) {
        return 'already_voted';
    }
    if (!offer.allOriginalPlayerIds.includes(voterId)) {
        return 'not_in_match';
    }
    return 'eligible';
}

/**
 * Cast an accept vote (FR-009 / US4 AC-2). The caller MUST have
 * classified the voter as `'eligible'` first — casting twice corrupts
 * nothing (Set semantics) but the `allAccepted` edge only fires once
 * because the second vote classifies as `'already_voted'`.
 *
 * @param offer - The open rematch offer (mutated: voter added to
 *   `acceptedBy`).
 * @param voterId - The eligible original participant's session id.
 * @returns The same offer plus whether this vote completed the set
 *   (every original participant has accepted).
 */
export function castAcceptVote(
    offer: RematchOffer,
    voterId: PlayerSessionId,
): { offer: RematchOffer; allAccepted: boolean } {
    offer.acceptedBy.add(voterId);
    const allAccepted = offer.acceptedBy.size === offer.allOriginalPlayerIds.length;
    return { offer, allAccepted };
}

/**
 * Cast a decline vote (US4 AC-2: any decline resolves the offer — the
 * caller transitions the original match to `collected`).
 *
 * @param offer - The open rematch offer (mutated: voter added to
 *   `declinedBy`).
 * @param voterId - The eligible original participant's session id.
 * @returns The same offer.
 */
export function castDeclineVote(
    offer: RematchOffer,
    voterId: PlayerSessionId,
): {
    offer: RematchOffer;
} {
    offer.declinedBy.add(voterId);
    return { offer };
}

/**
 * Whether the offer's acceptance window has lapsed at `nowMs`
 * (deadline comparison only — resolution state is ignored).
 *
 * @param offer - The offer to check.
 * @param nowMs - Current injected-clock reading.
 * @returns `true` iff `nowMs` is past `windowExpiresAtMs`.
 */
export function isWindowClosed(offer: RematchOffer, nowMs: number): boolean {
    return nowMs > offer.windowExpiresAtMs;
}

/**
 * Whether the offer is fully spent at `nowMs`: either the window
 * lapsed unresolved or the rematch already resolved into a new match.
 * Drives the matchmaker's lazy expiry sweep (check-on-access via read
 * paths — no timers, dispatch ruling 1).
 *
 * @param offer - The offer to check.
 * @param nowMs - Current injected-clock reading.
 * @returns `true` iff the offer can no longer accept useful votes.
 */
export function isOfferExpired(offer: RematchOffer, nowMs: number): boolean {
    return isWindowClosed(offer, nowMs) || offer.newMatchRecord !== null;
}
