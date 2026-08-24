/** Configuration and security helpers for the local/LAN host launcher. */

import { isAbsolute, relative } from 'node:path';

/** Resolved host and port settings used by the launcher. */
export interface HostConfig {
  readonly bindHost: string;
  readonly publicHost: string;
  readonly wsPort: number;
  readonly staticPort: number;
}

/** Return true for an address that listens on all interfaces. */
export function isWildcardHost(host: string): boolean {
  return host === '0.0.0.0' || host === '::' || host === '[::]';
}

/** Return true when a normalized filesystem path is inside a directory. */
export function isPathInside(root: string, candidate: string): boolean {
  const descendant = relative(root, candidate);
  return descendant === '' || (!descendant.startsWith('..') && !isAbsolute(descendant));
}

/** HTTP response headers applied by the development static server. */
export const STATIC_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
} as const;
