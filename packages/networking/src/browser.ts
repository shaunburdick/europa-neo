/**
 * Browser-safe surface of `@europa/networking` (`@europa/networking/browser`).
 *
 * Integration-wave addition (feature 004 ↔ 005 wiring): feature 005's
 * new browser WebSocket client (`packages/console/src/net/ws-match-client.ts`)
 * speaks the SAME wire codec as the server, but the package root barrel
 * pulls in `server.ts` → `ws` / `node:http`, which cannot enter a
 * browser bundle. This entry re-exports ONLY the transport pieces that
 * are pure (no Node built-ins, no `ws`):
 *
 *   - the JSON frame codec ({@link encodeFrame} / {@link decodeFrame} /
 *     {@link tryDecodeFrame}) — one source of truth for the wire bytes,
 *     so client and server can never drift apart silently;
 *   - the protocol version constant + version validator (FR-004);
 *   - the envelope schema validator (FR-003);
 *   - the protocol error hierarchy.
 *
 * Adding a Node-dependent export here is a packaging bug: everything
 * reachable from this module must bundle cleanly in a browser.
 */

export type { NetworkConstants } from './constants';
export { NETWORK_CONSTANTS } from './constants';
export { NETWORK_API_VERSION } from './contracts/network-types';

export type { NetworkErrorDetail } from './errors';
export { isNetworkError, NetworkError } from './errors';

export { decodeFrame, encodeFrame, tryDecodeFrame } from './frame';
export { validateEnvelope, validateVersion } from './validate';
