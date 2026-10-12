/**
 * Inbound frame validation — 005 FR-032 (issue #152).
 *
 * The wire codec already validates envelope shape and each kind's
 * TOP-LEVEL payload fields before a frame reaches a console client
 * (004 FR-003, `validate.ts`). What it structurally cannot check is
 * the payload below `lobbyEvent`, whose body is a DISCRIMINATED UNION
 * owned by matchmaking, not by the envelope schema — so a frame like
 * `{ kind: 'identity', identity: null }` passes the codec and then
 * throws inside the lobby client's dispatcher, taking out the socket's
 * `onmessage` dispatch with it.
 *
 * This module is the console's second gate, run BEFORE dispatch:
 *
 *   1. envelope structure (object, `type`, `seq`, `payload`);
 *   2. the full nested `lobbyEvent` variant set — each variant's own
 *      required/optional fields, with the types the console consumes;
 *   3. the consumed top-level fields of every server→client kind the
 *      console translates, so a frame from a non-codec path (test
 *      double, injected frame, future transport) cannot corrupt state.
 *
 * A non-null diagnostic means "drop the frame and log this"; it never
 * throws out of `onmessage`, never mutates state, and never severs the
 * connection (004 FR-010 drop-don't-sever discipline).
 *
 * **Field-forward compatibility (Gate 3 Decision 6)**: the validator
 * checks the fields it KNOWS and silently ignores everything else.
 * Unknown additive envelope kinds, unknown `lobbyEvent` variants, and
 * unknown additive FIELDS (fields a later wave adds to a known variant)
 * are accepted untouched — that is what lets `resumeSecret` ride a
 * W3-era `identity` event through this W2-era validator unchanged.
 *
 * Pure: no I/O, no clock, no state.
 */

/** One structural problem with an inbound frame, or `null` when it is well-formed. */
export type FrameDiagnostic = string;

/**
 * Field shapes this validator asserts. Deliberately narrower than the
 * wire contract where a mismatch cannot throw or corrupt state (a
 * missing `tick`, for example, just fails a `>` comparison), and
 * exact where it can (an identity's `handle`, a seat token's type).
 */
type FieldKind =
    | 'string'
    | 'number'
    | 'object'
    | 'array'
    | 'stringOrNull'
    | 'optionalString'
    | 'optionalNumber'
    | 'optionalObject';

/**
 * Check whether `value` is a plain object (not null, not an array).
 *
 * @param value Any decoded JSON value.
 * @returns True when safe to destructure as a record.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Report the first field of `record` whose shape disagrees with `kind`.
 *
 * @param record The object under inspection.
 * @param key Field name.
 * @param kind Expected shape.
 * @returns A diagnostic naming the offending field, or `null`.
 */
function fieldProblem(record: Record<string, unknown>, key: string, kind: FieldKind): string | null {
    const value = record[key];
    const optional = kind === 'optionalString' || kind === 'optionalNumber' || kind === 'optionalObject';
    if (value === undefined) {
        return optional ? null : `${key} is missing`;
    }
    switch (kind) {
        case 'string':
        case 'optionalString':
            return typeof value === 'string' ? null : `${key} is not a string`;
        case 'number':
        case 'optionalNumber':
            return typeof value === 'number' ? null : `${key} is not a number`;
        case 'object':
        case 'optionalObject':
            return isPlainObject(value) ? null : `${key} is not an object`;
        case 'array':
            return Array.isArray(value) ? null : `${key} is not an array`;
        case 'stringOrNull':
            return typeof value === 'string' || value === null ? null : `${key} is neither a string nor null`;
        default: {
            const unhandled: never = kind;
            throw new Error(`inbound-validation: unhandled field kind ${String(unhandled)}`);
        }
    }
}

/**
 * Validate `record` against a list of expected fields, stopping at the
 * first problem so the diagnostic names one concrete cause.
 *
 * @param record The object under inspection.
 * @param spec Field expectations, in declaration order.
 * @returns The first diagnostic, or `null` when every field conforms.
 */
function fieldsProblem(
    record: Record<string, unknown>,
    spec: ReadonlyArray<readonly [string, FieldKind]>,
): string | null {
    for (const [key, kind] of spec) {
        const problem = fieldProblem(record, key, kind);
        if (problem !== null) {
            return problem;
        }
    }
    return null;
}

/**
 * Validate one nested `lobbyEvent` body against its discriminated
 * `kind`. Unknown variants and unknown additive fields pass through —
 * see the module note on field-forward compatibility.
 *
 * @param event The decoded `lobbyEvent` payload's `event` value.
 * @returns A diagnostic naming the malformed field, or `null`.
 */
function lobbyEventDiagnostic(event: unknown): string | null {
    if (!isPlainObject(event)) {
        return 'lobbyEvent.event is not an object';
    }
    const { kind } = event;
    if (typeof kind !== 'string') {
        return 'lobbyEvent.event.kind is not a string';
    }
    switch (kind) {
        case 'identity': {
            const { identity } = event;
            if (!isPlainObject(identity)) {
                return 'identity event: identity is not an object';
            }
            return fieldsProblem(identity, [
                ['handle', 'stringOrNull'],
                ['guestPlayerId', 'optionalString'],
            ]);
        }
        case 'snapshot': {
            const { snapshot } = event;
            if (!isPlainObject(snapshot)) {
                return 'snapshot event: snapshot is not an object';
            }
            return fieldsProblem(snapshot, [
                ['revision', 'number'],
                ['entries', 'array'],
                ['activeMatchId', 'stringOrNull'],
            ]);
        }
        case 'actionAccepted':
            return fieldsProblem(event, [
                ['actionId', 'number'],
                ['transition', 'string'],
                ['seatSessionToken', 'optionalString'],
            ]);
        case 'error':
            return fieldsProblem(event, [
                ['code', 'string'],
                ['message', 'string'],
                ['actionId', 'optionalNumber'],
                ['detail', 'optionalObject'],
            ]);
        case 'roster': {
            const { roster } = event;
            if (!isPlainObject(roster)) {
                return 'roster event: roster is not an object';
            }
            return fieldsProblem(roster, [
                ['revision', 'number'],
                ['players', 'array'],
            ]);
        }
        case 'rosterDelta': {
            const { delta } = event;
            if (!isPlainObject(delta)) {
                return 'rosterDelta event: delta is not an object';
            }
            return fieldsProblem(delta, [
                ['revision', 'number'],
                ['changes', 'array'],
            ]);
        }
        default:
            // Unknown additive variant: accepted here, ignored by the
            // dispatcher's default arm (wire tolerance rule).
            return null;
    }
}

/**
 * Validate one decoded inbound envelope structurally, against its
 * declared kind. Run BEFORE dispatch (005 FR-032).
 *
 * @param envelope A decoded inbound envelope (any origin — codec,
 *                 test double, or injected frame).
 * @returns The first structural problem, or `null` when the frame may
 *          be dispatched.
 */
export function inboundFrameDiagnostic(envelope: unknown): FrameDiagnostic | null {
    if (!isPlainObject(envelope)) {
        return 'envelope is not an object';
    }
    const { type, seq, payload } = envelope;
    if (typeof type !== 'string') {
        return 'envelope.type is not a string';
    }
    if (typeof seq !== 'number') {
        return 'envelope.seq is not a number';
    }
    if (!isPlainObject(payload)) {
        return `payload of "${type}" is not an object`;
    }
    switch (type) {
        // --- Server → client kinds the console dispatches ---
        case 'helloAck':
            return fieldsProblem(payload, [
                ['connectionId', 'string'],
                ['heartbeatIntervalMs', 'number'],
            ]);
        case 'joinAck':
            return fieldsProblem(payload, [
                ['sessionToken', 'string'],
                ['playerId', 'stringOrNull'],
                ['view', 'object'],
                ['players', 'array'],
            ]);
        case 'snapshot':
        case 'tick':
            return fieldsProblem(payload, [
                ['tick', 'number'],
                ['view', 'object'],
            ]);
        case 'orderAck':
            return fieldsProblem(payload, [
                ['seq', 'number'],
                ['result', 'object'],
            ]);
        case 'terminal':
            return fieldsProblem(payload, [['result', 'object']]);
        case 'pong':
            return fieldsProblem(payload, [
                ['clientTimeMs', 'number'],
                ['serverTimeMs', 'number'],
            ]);
        case 'error':
            return fieldsProblem(payload, [
                ['code', 'string'],
                ['message', 'string'],
            ]);
        case 'lobbyEvent': {
            // Destructure: index-signature property access stays bracket-
            // or destructure-only (tsconfig noPropertyAccessFromIndexSignature).
            const { event } = payload;
            return lobbyEventDiagnostic(event);
        }
        default:
            // Client→server kinds can never arrive inbound, and unknown
            // additive kinds are ignored by every dispatcher — neither
            // is a structural failure THIS console consumes.
            return null;
    }
}
