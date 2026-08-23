/**
 * ReconnectRegistry Unit Tests — Feature 004 US2 (T035)
 *
 * Covers FR-007 (token-identified sessions) and FR-009 (grace-window
 * enforcement): register/lookup/consume/expireOld semantics, expiry
 * boundaries, idempotent consumption, and latest-binding-wins on
 * re-registration.
 *
 * The registry is PURE (constitution Principle II): every method takes
 * `nowMs`; no clock reads anywhere in the module under test.
 */

import { describe, expect, it } from 'vitest';

import { toBranded } from '../../src/ids';
import { ReconnectRegistry } from '../../src/reconnect';
import type { ConnectionId, MatchId, PlayerId, SessionToken } from '../../src/types';

/** Deterministic test tokens/ids (branded strings; uniqueness per test). */
function token(n: number): SessionToken {
  return toBranded<SessionToken>(`token-${String(n).padStart(3, '0')}`);
}
function connId(n: number): ConnectionId {
  return toBranded<ConnectionId>(`conn-${String(n).padStart(3, '0')}`);
}
function matchId(n: number): MatchId {
  return toBranded<MatchId>(`match-${String(n).padStart(3, '0')}`);
}
function playerId(n: number): PlayerId {
  return n as PlayerId;
}

describe('ReconnectRegistry', () => {
  it('register records a binding that lookup returns within the grace window', () => {
    const registry = new ReconnectRegistry(60_000);
    registry.register(token(1), connId(1), playerId(1), matchId(1), 1_000);

    const binding = registry.lookup(token(1), 61_000 - 1);
    expect(binding).not.toBeNull();
    expect(binding).not.toHaveProperty('expired');
    expect(binding).toMatchObject({
      sessionToken: token(1),
      connectionId: connId(1),
      playerId: playerId(1),
      matchId: matchId(1),
      registeredAtMs: 1_000,
    });
  });

  it('lookup returns the binding when nowMs - registeredAtMs < graceMs (boundary)', () => {
    const registry = new ReconnectRegistry(5_000);
    registry.register(token(2), connId(2), playerId(2), matchId(2), 10_000);

    // Exactly graceMs - 1 later: still valid. Exactly graceMs later: expired.
    expect(registry.lookup(token(2), 14_999)).not.toHaveProperty('expired');
    expect(registry.lookup(token(2), 15_000)).toEqual({ expired: true });
  });

  it('lookup returns null for an unknown token', () => {
    const registry = new ReconnectRegistry(60_000);
    expect(registry.lookup(token(404), 0)).toBeNull();
  });

  it('consume removes the binding and returns it; a second consume is idempotent (null)', () => {
    const registry = new ReconnectRegistry(60_000);
    registry.register(token(3), connId(3), playerId(3), matchId(3), 0);

    const first = registry.consume(token(3), 1_000);
    expect(first).not.toBeNull();
    expect(first).not.toHaveProperty('expired');
    expect(first).toMatchObject({ connectionId: connId(3), playerId: playerId(3) });

    expect(registry.consume(token(3), 2_000)).toBeNull();
    expect(registry.lookup(token(3), 2_000)).toBeNull();
  });

  it('consume reports an expired binding instead of returning it', () => {
    const registry = new ReconnectRegistry(1_000);
    registry.register(token(4), connId(4), playerId(4), matchId(4), 0);

    expect(registry.consume(token(4), 1_000)).toEqual({ expired: true });
    // Consumed regardless: the stale entry does not linger.
    expect(registry.lookup(token(4), 1_001)).toBeNull();
  });

  it('expireOld removes exactly the expired bindings and returns them for onSeatExpired dispatch', () => {
    const registry = new ReconnectRegistry(10_000);
    registry.register(token(5), connId(5), playerId(5), matchId(5), 0);
    registry.register(token(6), connId(6), playerId(6), matchId(5), 5_000);
    registry.register(token(7), connId(7), playerId(7), matchId(7), 9_999);

    // At t=10_000: token5 (age 10_000) and token6 (age 5_000… not yet)
    // — only token5 has reached the boundary.
    let expired = registry.expireOld(10_000);
    expect(expired).toHaveLength(1);
    expect(expired[0]).toMatchObject({
      sessionToken: token(5),
      playerId: playerId(5),
      matchId: matchId(5),
    });

    // At t=15_000: token6 crosses; token7 (age ~5_001) survives.
    expired = registry.expireOld(15_000);
    expect(expired).toHaveLength(1);
    expect(expired[0]?.sessionToken).toBe(token(6));

    // Survivors are still lookable; swept ones are gone.
    expect(registry.lookup(token(7), 15_000)).not.toBeNull();
    expect(registry.lookup(token(5), 15_000)).toBeNull();

    // Sweeping again is a no-op.
    expect(registry.expireOld(15_001)).toEqual([]);
  });

  it('re-registering a token keeps the latest connectionId and refreshes the window', () => {
    const registry = new ReconnectRegistry(10_000);
    registry.register(token(8), connId(8), playerId(8), matchId(8), 0);
    registry.register(token(8), connId(9), playerId(8), matchId(8), 8_000);

    const binding = registry.lookup(token(8), 9_000);
    expect(binding).toMatchObject({
      connectionId: connId(9),
      playerId: playerId(8),
      matchId: matchId(8),
      registeredAtMs: 8_000,
    });

    // The refreshed registration extends the grace window: at
    // t=17_999 (age 9_999 from the re-register) it is still valid even
    // though the FIRST registration would long have expired.
    expect(registry.lookup(token(8), 17_999)).not.toHaveProperty('expired');
    expect(registry.lookup(token(8), 18_000)).toEqual({ expired: true });
  });

  it('honors a custom grace window (configurable via ServerConfig.reconnectGraceMs)', () => {
    const registry = new ReconnectRegistry(50);
    registry.register(token(9), connId(10), playerId(1), matchId(9), 100);

    expect(registry.lookup(token(9), 149)).not.toHaveProperty('expired');
    expect(registry.lookup(token(9), 150)).toEqual({ expired: true });
  });
});
