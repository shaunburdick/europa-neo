/**
 * Lobby projection — Feature 006 (T025)
 *
 * Pure projection of internal `MatchRecord`s into the public
 * `LobbyEntry` shape (data-model.md §12). The lobby lists ONLY
 * matches with `status === 'filling'` AND `visibility === 'public'`
 * (FR-005 + spec Q1 clarification: private matches are never
 * projected; running/finished/collected matches are no longer
 * joinable and drop out of the listing).
 *
 * The projection is rebuilt on every `listPublicMatches()` call —
 * O(N) over stored matches, acceptable at the v1 scale of ≤64
 * concurrent matches (`maxConcurrentMatches`). No caching, no stale
 * snapshots (SC-003: lobby reflects mutations within one tick).
 *
 * Pure module: no clock reads, no randomness — `nowMs` arrives as an
 * argument (constitution Principle II).
 */

import type { LobbyEntry } from '../contracts/match-types';
import type { MatchRecord } from './internal/matchRecord';

/**
 * Project one match into its lobby entry.
 *
 * @param match - The internal record to project.
 * @param nowMs - Current epoch ms (for the convenience age field).
 * @returns A fresh `LobbyEntry`, or `null` when the match must not
 *   appear in the lobby: private visibility (Q1), or a status other
 *   than `'filling'` (running/finished/collected are not joinable),
 *   or a corrupt record without its creator seat (defensive; seat 0
 *   is populated atomically at creation).
 */
export function projectLobbyEntry(match: MatchRecord, nowMs: number): LobbyEntry | null {
  if (match.visibility !== 'public' || match.status !== 'filling') {
    return null;
  }
  const host = match.seats.get(0);
  if (host === undefined) {
    // Unreachable via the create path (the creator occupies seat 0
    // before the record is stored); refuse to project a hostless match.
    return null;
  }

  const entry: LobbyEntry = {
    matchId: match.matchId,
    hostDisplayName: host.displayName,
    playerCount: match.settings.playerCount,
    seatsFilled: match.seats.size,
    boardSize: match.settings.boardSize,
    visibility: 'public',
    createdAtMs: match.createdAtMs,
    ageSeconds: (nowMs - match.createdAtMs) / 1000,
  };
  return entry;
}

/**
 * Project a snapshot of matches into the public lobby: filter to
 * joinable public matches, then map each through
 * {@linkcode projectLobbyEntry}. Insertion order is preserved so the
 * lobby is stable between calls absent mutations.
 *
 * @param matches - Snapshot of stored matches (e.g.,
 *   `store.listMatches()`).
 * @param nowMs - Current epoch ms.
 * @returns Fresh `LobbyEntry` array; empty when nothing is joinable.
 */
export function listPublicMatches(
  matches: readonly MatchRecord[],
  nowMs: number,
): readonly LobbyEntry[] {
  const entries: LobbyEntry[] = [];
  for (const match of matches) {
    const entry = projectLobbyEntry(match, nowMs);
    if (entry !== null) {
      entries.push(entry);
    }
  }
  return entries;
}
