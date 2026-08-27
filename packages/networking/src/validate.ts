/**
 * Envelope Schema Validation — Feature 004
 *
 * The runtime schema guard for every inbound frame (FR-003: the wire
 * carries exactly the declared message kinds — the twelve gameplay
 * kinds plus feature 010's additive lobby family; FR-004: every
 * envelope carries a schema `version` and major-version mismatch is
 * rejected gracefully).
 *
 * Two layers of checking:
 *   1. **Envelope shape** — object with a known `type` discriminator,
 *      a non-empty `version` string, a positive-integer `seq` in the
 *      uint32 range, and an object `payload`.
 *   2. **Per-kind payload fields** — required fields present per the
 *      payload definitions in `contracts/network-types.ts`, with
 *      cheap primitive type checks (`string` / `number` / `object` /
 *      `array`). Deep semantic validation (e.g., is this `Order`
 *      actually executable?) is deliberately NOT done here — that is
 *      the engine's job at order-application time.
 *
 * All rejections throw `NetworkError` with code `'malformed_payload'`
 * except version drift, which gets its own non-throwing helper
 * (`validateVersion`) so callers can reply with a `version_mismatch`
 * error and close politely per FR-004.
 *
 * Pure module: no I/O, no clock reads, no randomness.
 */

import { NETWORK_API_VERSION } from './constants';
import type { MessageKind, NetworkPayload, ProtocolEnvelope } from './contracts/network-types';
import { NetworkError } from './errors';

// ----------------------------------------------------------------------------
// Message-kind table
// ----------------------------------------------------------------------------

/** Every `MessageKind` the protocol declares (closed set, FR-003). */
const MESSAGE_KINDS: ReadonlySet<string> = new Set<string>([
    'hello',
    'joinMatch',
    'order',
    'ping',
    // Feature 010 lobby family (additive; see contracts/network-types.ts).
    // Schema admission and dispatcher ROUTING are both live: schema-valid
    // lobby frames are rate-gated and routed to the injected lobby facade
    // (server.ts), never answered by the polite default arm.
    'lobbyIdentity',
    'lobbySetHandle',
    'lobbySubscribe',
    'lobbyCreate',
    'lobbyJoin',
    'lobbySpectate',
    'lobbyLeave',
    'helloAck',
    'joinAck',
    'snapshot',
    'tick',
    'orderAck',
    'terminal',
    'pong',
    'error',
    'lobbyEvent',
]);

/** Type guard narrowing a string to the closed `MessageKind` union. */
function isMessageKind(value: string): value is MessageKind {
    return MESSAGE_KINDS.has(value);
}

/**
 * Non-narrowing membership check for the closed `MessageKind` set.
 * Exported for the connection layer's error classification: a frame
 * whose `type` is a string outside this set is reported to the client
 * as `unknown_message_kind` rather than generic `malformed_payload`
 * (FR-008), so clients can distinguish "unsupported message" from
 * "corrupt frame".
 *
 * @param value Any string.
 * @returns `true` iff `value` is one of the declared protocol kinds.
 */
export function isKnownMessageKind(value: string): boolean {
    return MESSAGE_KINDS.has(value);
}

/**
 * Cheap primitive checks for per-kind payload fields. `any` means
 * presence-only (used for fields that are legitimately nullable or
 * deeply validated elsewhere, e.g., `JoinAckPayload.playerId` which
 * is `null` for spectators).
 */
type FieldKind = 'string' | 'number' | 'object' | 'array' | 'any';

interface FieldSpec {
    readonly key: string;
    readonly kind: FieldKind;
}

function field(key: string, kind: FieldKind): FieldSpec {
    return { key, kind };
}

/**
 * Required fields per message kind, transcribed from the payload
 * interfaces in `contracts/network-types.ts`. Optional fields
 * (`reconnectToken`, `requestedSeat`, `clientInfo`, `detail`,
 * `LobbyIdentityPayload.claim`, `LobbyCreatePayload.settings`) are
 * intentionally absent — their absence never invalidates a frame.
 */
const PAYLOAD_FIELDS: Readonly<Record<MessageKind, readonly FieldSpec[]>> = {
    // Client → Server
    hello: [field('protocolVersion', 'string')],
    joinMatch: [field('matchId', 'string'), field('role', 'string'), field('displayName', 'string')],
    order: [field('order', 'object')],
    ping: [field('clientTimeMs', 'number')],
    // Feature 010 lobby family (additive; contract is the source of truth).
    lobbyIdentity: [],
    lobbySetHandle: [field('handle', 'string'), field('actionId', 'number')],
    lobbySubscribe: [field('actionId', 'number')],
    lobbyCreate: [field('actionId', 'number')],
    lobbyJoin: [field('actionId', 'number'), field('matchId', 'string')],
    lobbySpectate: [field('actionId', 'number'), field('matchId', 'string')],
    lobbyLeave: [field('actionId', 'number')],
    // Server → Client
    helloAck: [
        field('protocolVersion', 'string'),
        field('connectionId', 'string'),
        field('heartbeatIntervalMs', 'number'),
    ],
    joinAck: [
        field('sessionToken', 'string'),
        field('playerId', 'any'), // null for spectators
        field('view', 'object'),
        field('tick', 'number'),
        field('players', 'array'),
    ],
    // US2: snapshot carries the seat's fog-filtered view + boundary tick
    // (a raw `world` body would leak fog-hidden state — FR-005/SC-004).
    snapshot: [field('tick', 'number'), field('view', 'object')],
    tick: [field('tick', 'number'), field('view', 'object')],
    orderAck: [field('seq', 'number'), field('result', 'object')],
    terminal: [field('result', 'object')],
    pong: [field('clientTimeMs', 'number'), field('serverTimeMs', 'number')],
    error: [field('code', 'string'), field('message', 'string')],
    lobbyEvent: [field('event', 'object')],
};

// ----------------------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------------------

const MAX_UINT32 = 0xffff_ffff;

/**
 * Check whether a value is a plain object (not null, not an array).
 * Arrays fail because no envelope or payload field is ever an array
 * at the top level.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Build a `malformed_payload` rejection describing what was wrong.
 *
 * @param problem Human-readable description of the violation.
 * @param detail  Optional structured context (offending field, etc.).
 */
function malformed(problem: string, detail?: Record<string, string>): NetworkError {
    return new NetworkError('malformed_payload', problem, detail);
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Assert that `value` is a structurally valid `ProtocolEnvelope`.
 * Throws `NetworkError` (`'malformed_payload'`) on any violation;
 * returns nothing on success (the assertion narrows the type).
 *
 * Checks performed:
 *   - `value` is a plain object
 *   - `type` is one of the declared `MessageKind`s
 *   - `version` is a non-empty string (semantic comparison against
 *     `NETWORK_API_VERSION` is `validateVersion`'s job)
 *   - `seq` is a positive integer within the uint32 range (replay
 *     numbering starts at 1 per session — see `SequenceNumber`)
 *   - `payload` is a plain object whose required fields for the
 *     declared `type` are present with plausible primitive types
 *
 * @param value Any decoded JSON value.
 * @throws NetworkError with code `'malformed_payload'` on violation.
 */
export function validateEnvelope(value: unknown): asserts value is ProtocolEnvelope<NetworkPayload> {
    if (!isPlainObject(value)) {
        throw malformed('envelope must be a JSON object');
    }

    const { type, version, seq, payload } = value;

    if (typeof type !== 'string' || !isMessageKind(type)) {
        throw malformed('envelope.type must be a known MessageKind', {
            received: typeof type === 'string' ? type : typeof type,
        });
    }
    if (typeof version !== 'string' || version.length === 0) {
        throw malformed('envelope.version must be a non-empty string');
    }
    if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 1 || seq > MAX_UINT32) {
        throw malformed('envelope.seq must be a positive integer in the uint32 range');
    }
    if (!isPlainObject(payload)) {
        throw malformed('envelope.payload must be a JSON object');
    }

    const required = PAYLOAD_FIELDS[type];
    for (const spec of required) {
        const fieldValue = payload[spec.key];
        if (fieldValue === undefined) {
            throw malformed(`payload.${spec.key} is required for ${type} messages`);
        }
        if (spec.kind === 'any') {
            // Presence-only: null is legitimate (e.g., JoinAckPayload.playerId
            // is null for spectator seats).
            continue;
        }
        if (fieldValue === null) {
            throw malformed(`payload.${spec.key} must not be null for ${type} messages`);
        }
        switch (spec.kind) {
            case 'string':
                if (typeof fieldValue !== 'string') {
                    throw malformed(`payload.${spec.key} must be a string for ${type} messages`);
                }
                break;
            case 'number':
                if (typeof fieldValue !== 'number' || Number.isNaN(fieldValue)) {
                    throw malformed(`payload.${spec.key} must be a number for ${type} messages`);
                }
                break;
            case 'object':
                if (!isPlainObject(fieldValue)) {
                    throw malformed(`payload.${spec.key} must be an object for ${type} messages`);
                }
                break;
            case 'array':
                if (!Array.isArray(fieldValue)) {
                    throw malformed(`payload.${spec.key} must be an array for ${type} messages`);
                }
                break;
        }
    }
}

/**
 * Extract the BREAKING-boundary component of a version string per
 * FR-004 and standard pre-1.0 semver convention: for `0.x.y` versions
 * the minor component carries the breaking boundary (`0.1.0` → `0.1`),
 * because `0.x` ranges are incompatible across minors; for `M ≥ 1`
 * versions the major component does (`1.2.3` → `1`). Unparseable input
 * yields the empty string, which never matches a real boundary.
 *
 * @param version A (possibly malformed) version string.
 * @returns The boundary component.
 */
function breakingBoundary(version: string): string {
    const parts = version.split('.');
    const major = parts[0] ?? '';
    // Pre-1.0 semver convention: for 0.x.y versions the minor component
    // carries the breaking boundary ("0.1" line ≠ "0.2" line). The
    // "0." prefix keeps the boundary disjoint from post-1.0 majors.
    if (major === '0') {
        return `0.${parts[1] ?? ''}`;
    }
    return major;
}

/**
 * Compare a received protocol version against `NETWORK_API_VERSION`
 * by BREAKING BOUNDARY only (FR-004: drift within the same boundary is
 * accepted gracefully — e.g., `0.1.5` after `0.1.0`; cross-boundary
 * drift is rejected — e.g., `0.2.0` or `1.0.0` against `0.1.0`, since
 * pre-1.0 minors are the compatibility line). Non-string input and
 * unparseable versions are treated as mismatches rather than thrown
 * exceptions so the caller can always respond with a polite
 * `version_mismatch` error frame.
 *
 * @param received The `protocolVersion` / `version` string the peer sent.
 * @returns `{ ok: true }` when boundaries match, otherwise
 *          `{ ok: false, error }` carrying a `version_mismatch`
 *          `NetworkError` whose detail records expected vs received.
 */
export function validateVersion(received: string): { ok: true } | { ok: false; error: NetworkError } {
    if (typeof received !== 'string') {
        return {
            ok: false,
            error: new NetworkError('version_mismatch', 'protocol version must be a string', {
                expected: NETWORK_API_VERSION,
                received: String(received),
            }),
        };
    }

    const expectedBoundary = breakingBoundary(NETWORK_API_VERSION);
    const receivedBoundary = breakingBoundary(received);

    if (receivedBoundary !== expectedBoundary) {
        return {
            ok: false,
            error: new NetworkError(
                'version_mismatch',
                `unsupported protocol version (expected ${NETWORK_API_VERSION}.x-compatible, got ${received || 'nothing'})`,
                { expected: NETWORK_API_VERSION, received },
            ),
        };
    }

    return { ok: true };
}
