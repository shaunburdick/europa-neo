import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../scripts/host';
import { isPathInside, isWildcardHost, STATIC_SECURITY_HEADERS } from '../../scripts/host-config';

describe('host configuration security helpers', () => {
  it('does not confuse a sibling directory with a child path', () => {
    expect(isPathInside('/srv/console/dist', '/srv/console/dist-escape/index.html')).toBe(false);
    expect(isPathInside('/srv/console/dist', '/srv/console/dist/index.html')).toBe(true);
  });

  it('recognizes wildcard bind addresses', () => {
    expect(isWildcardHost('0.0.0.0')).toBe(true);
    expect(isWildcardHost('192.168.1.10')).toBe(false);
  });

  it('keeps defaults loopback-safe and requires a LAN advertisement', () => {
    expect(resolveConfig([], {})).toMatchObject({
      bindHost: '127.0.0.1',
      publicHost: 'localhost',
      wsPort: 8080,
      staticPort: 5173,
    });
    expect(resolveConfig(['--bind-host', '0.0.0.0'], {})).toBeNull();
    expect(
      resolveConfig(['--bind-host', '0.0.0.0', '--public-host', '192.168.1.20'], {}),
    ).toMatchObject({
      bindHost: '0.0.0.0',
      publicHost: '192.168.1.20',
    });
  });

  it('defines the static server security headers', () => {
    expect(STATIC_SECURITY_HEADERS).toEqual({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
  });
});
