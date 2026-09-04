/**
 * Single-source application version for Europa Neo (feature 009).
 *
 * FR-001 single-source rules:
 * - The root `package.json` `version` field is THE source of truth for
 *   the application version.
 * - Every workspace package (`packages/*`) carries the identical version
 *   in lockstep, and this constant MUST mirror that value exactly.
 * - All guarded surfaces (hello-ack `appVersion`, `GET /version`, HUD
 *   footer, README header, manual index footer) project THIS constant;
 *   none of them may carry an independent version string.
 * - Bumps happen as ONE lockstep commit flipping every guarded location
 *   at once (see `packages/version/README.md`); the drift check enforces
 *   agreement mechanically.
 *
 * FR-004 boundary: this is *release identity*. It is distinct from the
 * wire *protocol version* (`NETWORK_API_VERSION`, spec 004) — separate
 * lifecycles, and no code path may derive either value from the other.
 */
export const APP_VERSION = '0.2.0';
