/**
 * Unit tests for `acceptRematch` votes — Feature 006 (T048)
 *
 * Covers FR-009 + spec US4 AC-2: participants cast accept votes on an
 * open rematch offer; the vote that completes the set returns the new
 * match's id and the caller's fresh seat assignment. Gate order pins
 * the contract's error taxonomy: `rematch_not_offered` for a missing
 * or mismatched offer, `session_invalid` for a token matching no seat,
 * `player_not_in_match` for a seated player outside the original
 * snapshot, and `rematch_already_voted` for double votes.
 *
 * Test descriptions cite the requirement they pin.
 */

import { describe, expect, it } from 'vitest';

import type { MatchId, SessionToken } from '../../contracts/match-types';
import { MATCHMAKING_CONSTANTS } from '../../src/constants';
import { createMatchmaker } from '../../src/matchmaker';
import { FakeServer } from '../fixtures/fakeServer';
import { makeFinished2pScenario } from '../fixtures/rematchScenario';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000' as MatchId;
const FOREIGN_TOKEN = '22222222-2222-4222-8222-222222222222' as SessionToken;

/** Open the window as Alice and return the offer id. */
function openOffer(scenario: ReturnType<typeof makeFinished2pScenario>): MatchId {
  const requested = scenario.matchmaker.requestRematch({
    matchId: scenario.matchId,
    sessionToken: scenario.alice.sessionToken,
  });
  if (!requested.ok) {
    throw new Error('fixture: requestRematch failed');
  }
  return requested.rematchOfferId;
}

describe('acceptRematch casts votes on the open offer (FR-009 / US4 AC-2 / T048)', () => {
  it('US4 AC-2: a non-final accept returns allAccepted: false with no new match', () => {
    const scenario = makeFinished2pScenario();
    const offerId = openOffer(scenario);

    const result = scenario.matchmaker.acceptRematch({
      matchId: scenario.matchId,
      rematchOfferId: offerId,
      sessionToken: scenario.alice.sessionToken,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.allAccepted).toBe(false);
    expect(result.newMatchId).toBeUndefined();
    expect(result.newSeatAssignment).toBeUndefined();
    // The original match is still finished — nothing resolved yet.
    expect(scenario.matchmaker.stats().finishedMatches).toBe(1);
    scenario.matchmaker.close();
  });

  it('FR-009: accepting with a mismatched rematchOfferId returns rematch_not_offered', () => {
    const scenario = makeFinished2pScenario();
    openOffer(scenario);

    const result = scenario.matchmaker.acceptRematch({
      matchId: scenario.matchId,
      rematchOfferId: UNKNOWN_ID,
      sessionToken: scenario.bob.sessionToken,
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('rematch_not_offered');
    scenario.matchmaker.close();
  });

  it('FR-009: accepting when no window was ever opened returns rematch_not_offered', () => {
    const scenario = makeFinished2pScenario();

    const result = scenario.matchmaker.acceptRematch({
      matchId: scenario.matchId,
      rematchOfferId: UNKNOWN_ID,
      sessionToken: scenario.alice.sessionToken,
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('rematch_not_offered');
    scenario.matchmaker.close();
  });

  it('FR-006: a token matching no seat returns session_invalid', () => {
    const scenario = makeFinished2pScenario();
    const offerId = openOffer(scenario);

    const result = scenario.matchmaker.acceptRematch({
      matchId: scenario.matchId,
      rematchOfferId: offerId,
      sessionToken: FOREIGN_TOKEN,
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('session_invalid');
    scenario.matchmaker.close();
  });

  it('contract: a double accept returns rematch_already_voted', () => {
    const scenario = makeFinished2pScenario();
    const offerId = openOffer(scenario);
    const first = scenario.matchmaker.acceptRematch({
      matchId: scenario.matchId,
      rematchOfferId: offerId,
      sessionToken: scenario.alice.sessionToken,
    });
    expect(first.ok).toBe(true);

    const second = scenario.matchmaker.acceptRematch({
      matchId: scenario.matchId,
      rematchOfferId: offerId,
      sessionToken: scenario.alice.sessionToken,
    });
    expect(second.ok).toBe(false);
    if (second.ok) {
      return;
    }
    expect(second.error.code).toBe('rematch_already_voted');
    scenario.matchmaker.close();
  });

  it('contract: accepting after a decline is rejected — the decline resolved the offer', () => {
    const scenario = makeFinished2pScenario();
    const offerId = openOffer(scenario);
    const declined = scenario.matchmaker.declineRematch({
      matchId: scenario.matchId,
      rematchOfferId: offerId,
      sessionToken: scenario.alice.sessionToken,
    });
    expect(declined.ok).toBe(true);

    // T052: a decline IMMEDIATELY transitions the original match to
    // collected, so the later accept hits the status gate — the offer
    // no longer exists to vote on.
    const accepted = scenario.matchmaker.acceptRematch({
      matchId: scenario.matchId,
      rematchOfferId: offerId,
      sessionToken: scenario.alice.sessionToken,
    });
    expect(accepted.ok).toBe(false);
    if (accepted.ok) {
      return;
    }
    expect(accepted.error.code).toBe('rematch_not_offered');
    scenario.matchmaker.close();
  });

  it('US4 AC-2: the completing vote returns allAccepted: true + newMatchId + newSeatAssignment', () => {
    const scenario = makeFinished2pScenario();
    const offerId = openOffer(scenario);
    const aliceAccept = scenario.matchmaker.acceptRematch({
      matchId: scenario.matchId,
      rematchOfferId: offerId,
      sessionToken: scenario.alice.sessionToken,
    });
    expect(aliceAccept.ok).toBe(true);
    if (!aliceAccept.ok) {
      return;
    }
    expect(aliceAccept.allAccepted).toBe(false);

    const bobAccept = scenario.matchmaker.acceptRematch({
      matchId: scenario.matchId,
      rematchOfferId: offerId,
      sessionToken: scenario.bob.sessionToken,
    });
    expect(bobAccept.ok).toBe(true);
    if (!bobAccept.ok) {
      return;
    }
    expect(bobAccept.allAccepted).toBe(true);
    expect(bobAccept.newMatchId).toBeDefined();
    expect(bobAccept.newMatchId).not.toBe(scenario.matchId);
    expect(bobAccept.newSeatAssignment).toBeDefined();
    scenario.matchmaker.close();
  });

  it('US4 AC-2: the new match is created in filling with the same visibility and settings', () => {
    // Custom settings prove settings parity flows through to the lobby
    // projection of the new (public, filling) match.
    const server = new FakeServer();
    const clockMs = 5_000_000;
    const now = (): number => clockMs;
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server, now });
    const created = matchmaker.createMatch({
      visibility: 'public',
      displayName: 'Alice',
      settings: { boardSize: 20 },
    });
    if (!created.ok) {
      throw new Error('fixture create failed');
    }
    const joined = matchmaker.joinMatch({
      matchId: created.data.matchId,
      displayName: 'Bob',
    });
    if (!joined.ok) {
      throw new Error('fixture join failed');
    }
    server.fireOnMatchTerminal({
      matchId: created.data.matchId,
      result: { kind: 'win', winner: 1, tick: 7, reason: 'last_standing' },
      tick: 7,
    });

    const requested = matchmaker.requestRematch({
      matchId: created.data.matchId,
      sessionToken: created.data.seatAssignment.sessionToken,
    });
    if (!requested.ok) {
      throw new Error('fixture request failed');
    }
    const aliceAccept = matchmaker.acceptRematch({
      matchId: created.data.matchId,
      rematchOfferId: requested.rematchOfferId,
      sessionToken: created.data.seatAssignment.sessionToken,
    });
    if (!aliceAccept.ok) {
      throw new Error('fixture alice accept failed');
    }
    const bobAccept = matchmaker.acceptRematch({
      matchId: created.data.matchId,
      rematchOfferId: requested.rematchOfferId,
      sessionToken: joined.data.seatAssignment.sessionToken,
    });
    expect(bobAccept.ok).toBe(true);
    if (!bobAccept.ok || !bobAccept.allAccepted || bobAccept.newMatchId === undefined) {
      throw new Error('fixture: all-accept did not resolve');
    }

    const stats = matchmaker.stats();
    expect(stats.fillingMatches).toBe(1);

    const lobby = matchmaker.listPublicMatches();
    expect(lobby.ok).toBe(true);
    if (!lobby.ok) {
      return;
    }
    const entry = lobby.matches.find((m) => m.matchId === bobAccept.newMatchId);
    expect(entry).toBeDefined();
    expect(entry?.boardSize).toBe(20);
    expect(entry?.playerCount).toBe(2);
    expect(entry?.visibility).toBe('public');
    matchmaker.close();
  });
});
