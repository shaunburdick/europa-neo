/**
 * Wire-view rehydration — decode-boundary repair for Set-typed fields.
 *
 * Feature 004's frame codec applies ONE deliberate serialization
 * transform on outbound frames (`frame.ts` §wireReplacer): every `Set`
 * becomes a sorted array, because plain `JSON.stringify` would
 * silently flatten a `Set` to `{}`. The contract types
 * (`PlayerView.visibleCells[].pipes: ReadonlySet<Direction>`) describe
 * the IN-MEMORY shape, so the recipient must rebuild Sets from those
 * arrays after decoding — otherwise `.has()`/`.size` consumers crash
 * (region-select pointer input) or silently misbehave (render diff),
 * which is exactly the live-wire "pipes.has is not a function" /
 * frozen-UI defect class.
 *
 * This module is the console's single rehydration point. It is called
 * from {@link ./ws-match-client} immediately after a frame decodes
 * successfully and BEFORE any consumer sees the envelope, so every
 * inbound path — live ticks, join snapshots, AND the reconnect
 * snapshot + replay window — is covered by construction.
 *
 * Scope note (full sweep of server→client payloads): `CellView.pipes`
 * is the ONLY Set/Map-typed field anywhere in `JoinAckPayload`,
 * `SnapshotPayload`, or `TickBroadcastPayload`. Everything else
 * (`TickEvents`, `MatchConfig`, `players`) is plain JSON. The helper
 * still walks views structurally so a future Set-typed field has an
 * obvious home.
 *
 * Determinism discipline: pure — no clock reads, no randomness. The
 * sorted-array → Set rebuild preserves the codec's canonical member
 * order (Set iteration follows insertion order), so rehydrated views
 * stay byte-stable under re-serialization.
 */

import type { NetworkPayload, ProtocolEnvelope } from '../state/types';

/**
 * Check whether `value` is a plain object (not null, not an array).
 *
 * @param value Any decoded JSON value.
 * @returns True when safe to spread/index as a record.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether one decoded cell still carries the WIRE form of a
 * Set-typed field (an array `pipes`) and therefore needs repair.
 *
 * @param cell One decoded `CellView`-shaped record.
 * @returns True when {@link rehydrateCell} would produce a copy.
 */
function cellNeedsRepair(cell: unknown): boolean {
    if (!isPlainObject(cell)) {
        return false;
    }
    // Destructure (not dot access): index-signature properties are
    // destructure/bracket-only here (noPropertyAccessFromIndexSignature).
    const { pipes } = cell;
    return Array.isArray(pipes);
}

/**
 * Rebuild one cell's Set-typed fields from their wire form. Today that
 * is exactly `pipes`; the structure keeps the per-field list in one
 * place. Cells without array-shaped `pipes` (already a Set on the demo
 * path, absent on redacted cells) pass through by reference.
 *
 * @param cell One decoded `CellView`-shaped record.
 * @returns The same record, or a shallow copy with `pipes` as a Set.
 */
function rehydrateCell(cell: unknown): unknown {
    if (!isPlainObject(cell)) {
        return cell;
    }
    const { pipes } = cell;
    if (!Array.isArray(pipes)) {
        return cell;
    }
    return { ...cell, pipes: new Set(pipes) };
}

/**
 * Rebuild Set-typed fields across a whole decoded `PlayerView`.
 *
 * The no-op path (the common pipe-free tick) returns the input by
 * REFERENCE after a scan that allocates nothing — 005 FR-035 forbids
 * even a discarded intermediate array, so this deliberately does NOT
 * `map` first and compare afterwards: `Array#map` would build a
 * result array on every tick just to throw it away.
 *
 * @param view One decoded `PlayerView`-shaped record.
 * @returns The same view, or a copy whose cells carry real Sets.
 */
function rehydrateWireView(view: unknown): unknown {
    if (!isPlainObject(view)) {
        return view;
    }
    const { visibleCells } = view;
    if (!Array.isArray(visibleCells)) {
        return view;
    }
    // Pass 1: is there anything to repair? (no allocation — a plain
    // index scan, early-exiting on the first offending cell)
    let needsRepair = false;
    for (let index = 0; index < visibleCells.length; index += 1) {
        if (cellNeedsRepair(visibleCells[index])) {
            needsRepair = true;
            break;
        }
    }
    if (!needsRepair) {
        return view;
    }
    // Pass 2 (repair only): mapping is fine here — this path exists to
    // copy, and only it pays for the new cell array.
    return { ...view, visibleCells: visibleCells.map((cell: unknown) => rehydrateCell(cell)) };
}

/**
 * Rehydrate every view carried by one inbound envelope. Only the three
 * view-bearing kinds (`joinAck`, `snapshot`, `tick`) are inspected;
 * every other envelope returns by reference untouched. Immutability is
 * preserved along the changed spine (envelope → payload → view → cell
 * are fresh copies; siblings are shared).
 *
 * Documented cast: the final cast back to
 * `ProtocolEnvelope<NetworkPayload>` mirrors the narrowing pattern the
 * networking server and `envelope-to-event.ts` already use — the wire
 * union is not discriminated in TS, and the codec guarantees the
 * payload shape for each kind. Only `pipes` changes type at runtime
 * (sorted array → Set of the same members), which is precisely the
 * repair the contract types already declare.
 *
 * @param envelope A successfully decoded, schema-valid inbound envelope.
 * @returns An envelope whose views honor the contract's ReadonlySet
 *          fields; often the input itself.
 */
export function rehydrateEnvelopeViews(envelope: ProtocolEnvelope<NetworkPayload>): ProtocolEnvelope<NetworkPayload> {
    if (envelope.type !== 'joinAck' && envelope.type !== 'snapshot' && envelope.type !== 'tick') {
        return envelope;
    }
    const payload: unknown = envelope.payload;
    if (!isPlainObject(payload)) {
        return envelope;
    }
    // Destructure (not dot/bracket access): satisfies both
    // `noPropertyAccessFromIndexSignature` and Biome's useLiteralKeys.
    const { view } = payload;
    const rehydrated = rehydrateWireView(view);
    if (rehydrated === view) {
        return envelope;
    }
    return {
        ...envelope,
        payload: { ...payload, view: rehydrated },
    } as ProtocolEnvelope<NetworkPayload>;
}
