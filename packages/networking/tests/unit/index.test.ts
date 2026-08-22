/**
 * Barrel Surface Smoke Tests — Feature 004 (Phase 2)
 *
 * Verifies the Phase 2 populated barrel exposes the full type
 * surface's runtime artifacts and every foundational utility, so
 * downstream packages can rely on `@europa/networking` root imports.
 */

import { describe, expect, it } from 'vitest';

import {
  createTickClock,
  decodeFrame,
  encodeFrame,
  generateConnectionId,
  generateSessionToken,
  isNetworkError,
  NETWORK_API_VERSION,
  NETWORK_CONSTANTS,
  NETWORK_DEFAULT_CONFIG,
  NetworkError,
  NULL_LOGGER,
  toBranded,
  tryDecodeFrame,
  validateEnvelope,
  validateVersion,
} from '../../src/index';

describe('barrel runtime surface', () => {
  it('exposes the constants', () => {
    expect(NETWORK_API_VERSION).toBe('0.1.0');
    expect(NETWORK_CONSTANTS.defaultTickRateMs).toBe(250);
    expect(NETWORK_DEFAULT_CONFIG.port).toBe(8080);
    expect(typeof NULL_LOGGER.info).toBe('function');
  });

  it('exposes the framing utilities', () => {
    expect(typeof encodeFrame).toBe('function');
    expect(typeof decodeFrame).toBe('function');
    expect(typeof tryDecodeFrame).toBe('function');
  });

  it('exposes validation + error helpers', () => {
    expect(typeof validateEnvelope).toBe('function');
    expect(typeof validateVersion).toBe('function');
    expect(new NetworkError('rate_limited', 'x').code).toBe('rate_limited');
    expect(isNetworkError(new NetworkError('rate_limited', 'x'))).toBe(true);
  });

  it('exposes identity generation', () => {
    expect(generateSessionToken()).toHaveLength(36);
    expect(generateConnectionId()).toHaveLength(36);
    expect(toBranded('plain')).toBe('plain');
  });

  it('exposes the tick clock factory', () => {
    const clock = createTickClock(60_000, () => {});
    expect(clock.tickCount()).toBe(0);
    clock.stop();
  });
});
