/**
 * Constants Smoke Tests — Feature 004 (Phase 2)
 *
 * Verifies the tunable-constants location: spec-mandated values, the
 * lockstep invariant against the contract's `NETWORK_DEFAULT_CONFIG`
 * (so the contract copy and this file cannot drift apart silently),
 * and the `NETWORK_API_VERSION` re-export identity.
 */

import { describe, expect, it } from 'vitest';

import { NETWORK_API_VERSION, NETWORK_CONSTANTS } from '../../src/constants';
import { NETWORK_DEFAULT_CONFIG } from '../../src/types';

describe('NETWORK_CONSTANTS', () => {
  it('carries the wire-protocol version', () => {
    expect(NETWORK_CONSTANTS.networkApiVersion).toBe('0.1.0');
  });

  it('matches the spec-mandated values', () => {
    expect(NETWORK_CONSTANTS.defaultTickRateMs).toBe(250); // 4 Hz
    expect(NETWORK_CONSTANTS.defaultHeartbeatIntervalMs).toBe(5000);
    expect(NETWORK_CONSTANTS.defaultReconnectGraceMs).toBe(60_000);
    expect(NETWORK_CONSTANTS.defaultOrdersPerSecond).toBe(10);
    expect(NETWORK_CONSTANTS.defaultRateLimitBurstFactor).toBe(2.0);
    expect(NETWORK_CONSTANTS.defaultMaxConcurrentMatches).toBe(64);
    expect(NETWORK_CONSTANTS.defaultWsIdleTimeoutMs).toBe(30_000);
    expect(NETWORK_CONSTANTS.defaultMaxFrameBytes).toBe(16_384); // ws README default
    expect(NETWORK_CONSTANTS.replayRingBufferTicks).toBe(16); // US2 AC-1 ring depth
  });

  it('stays in lockstep with the contract NETWORK_DEFAULT_CONFIG', () => {
    // The constants object mirrors the contract's server-config
    // defaults field-by-field; if either side changes without the
    // other, this fails.
    expect(NETWORK_CONSTANTS.defaultTickRateMs).toBe(NETWORK_DEFAULT_CONFIG.tickRateMs);
    expect(NETWORK_CONSTANTS.defaultHeartbeatIntervalMs).toBe(
      NETWORK_DEFAULT_CONFIG.heartbeatIntervalMs,
    );
    expect(NETWORK_CONSTANTS.defaultReconnectGraceMs).toBe(NETWORK_DEFAULT_CONFIG.reconnectGraceMs);
    expect(NETWORK_CONSTANTS.defaultOrdersPerSecond).toBe(NETWORK_DEFAULT_CONFIG.ordersPerSecond);
    expect(NETWORK_CONSTANTS.defaultRateLimitBurstFactor).toBe(
      NETWORK_DEFAULT_CONFIG.rateLimitBurstFactor,
    );
    expect(NETWORK_CONSTANTS.defaultMaxConcurrentMatches).toBe(
      NETWORK_DEFAULT_CONFIG.maxConcurrentMatches,
    );
    expect(NETWORK_CONSTANTS.defaultWsIdleTimeoutMs).toBe(NETWORK_DEFAULT_CONFIG.wsIdleTimeoutMs);
  });

  it('re-exports the contract version constant by identity', () => {
    expect(NETWORK_API_VERSION).toBe('0.1.0');
  });
});
