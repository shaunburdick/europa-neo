/**
 * Identity Generation Smoke Tests — Feature 004 (Phase 2)
 *
 * Covers the branded-token helpers: format (v4 UUID), uniqueness, and
 * the `toBranded` trust-boundary helper.
 */

import { describe, expect, it } from 'vitest';
import { generateConnectionId, generateSessionToken, toBranded } from '../../src/ids';
import type { ConnectionId, SessionToken } from '../../src/types';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('generateSessionToken', () => {
  it('produces a 36-char v4 UUID', () => {
    const token = generateSessionToken();
    expect(token).toHaveLength(36);
    expect(UUID_V4.test(token)).toBe(true);
  });

  it('produces distinct tokens across calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(generateSessionToken());
    }
    expect(seen.size).toBe(100);
  });
});

describe('generateConnectionId', () => {
  it('produces a 36-char v4 UUID', () => {
    const id = generateConnectionId();
    expect(id).toHaveLength(36);
    expect(UUID_V4.test(id)).toBe(true);
  });

  it('never collides with session tokens (distinct brands, same source)', () => {
    const connId = generateConnectionId();
    const token = generateSessionToken();
    // Different brands must not be interchangeable at the type level;
    // runtime values are plain strings but the brands keep call sites
    // honest. This assertion documents the runtime shape only.
    expect(connId).not.toBe(token);
  });
});

describe('toBranded', () => {
  it('returns the identical string value', () => {
    const branded = toBranded<SessionToken>('abc-123');
    expect(branded).toBe('abc-123');
  });

  it('is the single crossing point for every brand kind', () => {
    const matchLike = toBranded<ConnectionId>('conn-x');
    expect(matchLike).toBe('conn-x');
  });
});
