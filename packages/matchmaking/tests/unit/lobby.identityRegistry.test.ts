/**
 * Unit tests for the in-memory identity registry — Feature 010 (T-005)
 *
 * Pins the registry behaviors the spec demands, at the registry level
 * (the T-007 facade composes on top of these):
 *
 *   - atomic create with unique opaque ids (FR-002, US1 AC-1);
 *   - validated atomic handle reservation/rename with exactly-one-winner
 *     conflict resolution under ≥10 simultaneous conflicting claims
 *     (FR-004/FR-005, NFR-002, SC-003);
 *   - disconnect → grace → release lifecycle: handles stay reserved
 *     through grace, free on expiry or explicit release (edge cases;
 *     Clarifications v1.0);
 *   - restore-by-persistent-token within/outside grace, with stale or
 *     forged claims never overriding the server record (US1 AC-3,
 *     v1.1 amendment);
 *   - close semantics dropping all state and disabling the instance
 *     (plan.md §4).
 *
 * Determinism (constitution Principle II): the registry runs on an
 * injected manual clock and a deterministic id generator — no fake
 * timers, no wall clock, no randomness anywhere in this suite.
 */
import { describe, expect, it } from 'vitest';

import type { Result } from '../../src/contracts/lobby-api';
import type { LobbyError } from '../../src/contracts/lobby-types';
import { createIdentityRegistry, type IdentityRegistry } from '../../src/internal/identityRegistry';
import { buildIdentityClaim, nextGuestPlayerId } from '../fixtures/lobbyIdentities';

// ----------------------------------------------------------------------------
// Deterministic test doubles
// ----------------------------------------------------------------------------

/** Clock geometry for the grace suites (small, human-checkable numbers). */
const BASE_MS = 1_700_000_000_000;
const GRACE_MS = 5_000;
const STEP_MS = 3_000;
const ONE_MS = 1;

/** Race/scenario sizes (NFR-002 requires at least 10 conflicting claims). */
const RACE_SIZE = 10;
const UNIQUE_CREATE_COUNT = 50;

/**
 * Manual clock: readings start at {@linkcode BASE_MS} and move only
 * when the suite advances them.
 */
function manualClock(): { readonly now: () => number; readonly advanceBy: (ms: number) => void } {
    let currentMs = BASE_MS;
    return {
        now: () => currentMs,
        advanceBy: (ms: number) => {
            currentMs += ms;
        },
    };
}

/** Deterministic opaque-id generator (`alpha-1`, `alpha-2`, …). */
function sequenceIds(prefix: string): () => string {
    let counter = 0;
    return () => {
        counter += 1;
        return `${prefix}-${counter}`;
    };
}

/** Registry wired to the manual clock and a deterministic id sequence. */
function createTestRegistry(prefix: string): {
    readonly registry: IdentityRegistry;
    readonly clock: ReturnType<typeof manualClock>;
} {
    const clock = manualClock();
    const registry = createIdentityRegistry({ now: clock.now, randomId: sequenceIds(prefix), graceMs: GRACE_MS });
    return { registry, clock };
}

/** Create an identity and successfully reserve `handle` for it. */
function createNamedIdentity(registry: IdentityRegistry, handle: string) {
    const identity = registry.createIdentity();
    const result = registry.setHandle(identity.id, handle);
    expect(result).toEqual({ ok: true, data: handle });
    return identity;
}

// ----------------------------------------------------------------------------
// Create (FR-002 / US1 AC-1)
// ----------------------------------------------------------------------------

describe('createIdentity — atomic minting', () => {
    it('mints unique opaque ids and starts every identity unnamed and active', () => {
        const { registry } = createTestRegistry('guest');
        const created = Array.from({ length: UNIQUE_CREATE_COUNT }, () => registry.createIdentity());

        const ids = created.map((identity) => identity.id);
        expect(new Set(ids).size).toBe(UNIQUE_CREATE_COUNT);
        for (const identity of created) {
            expect(identity.handle).toBeNull();
            expect(identity.handleKey).toBeNull();
            expect(identity.status).toBe('active');
            expect(identity.disconnectedAtMs).toBeNull();
            expect(identity.createdAtMs).toBe(BASE_MS);
        }
    });

    it('stamps creation time from the injected clock, not the wall clock', () => {
        const { registry, clock } = createTestRegistry('guest');
        const first = registry.createIdentity();
        clock.advanceBy(STEP_MS);
        const second = registry.createIdentity();
        expect(second.createdAtMs - first.createdAtMs).toBe(STEP_MS);
    });
});

// ----------------------------------------------------------------------------
// setHandle (FR-004 / FR-005 / FR-019)
// ----------------------------------------------------------------------------

describe('setHandle — validation, display form, and projection', () => {
    it('accepts a valid handle trimmed, preserves casing, and projects the safe IdentityState', () => {
        const { registry } = createTestRegistry('guest');
        const identity = registry.createIdentity();

        expect(registry.setHandle(identity.id, '  Nova  ')).toEqual({ ok: true, data: 'Nova' });
        expect(registry.projectIdentity(identity.id)).toEqual({ handle: 'Nova', hasIdentity: true });
    });

    it('returns handle_invalid as a value for rejected input and leaves the identity unchanged', () => {
        const { registry } = createTestRegistry('guest');
        const identity = createNamedIdentity(registry, 'Nova');

        const result = registry.setHandle(identity.id, '\u0000bad');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('handle_invalid');
        }
        expect(registry.projectIdentity(identity.id)).toEqual({ handle: 'Nova', hasIdentity: true });
    });

    it('renames update the display handle without changing the identity reference (FR-019)', () => {
        const { registry } = createTestRegistry('guest');
        const identity = createNamedIdentity(registry, 'Nova');

        expect(registry.setHandle(identity.id, 'Cosmo')).toEqual({ ok: true, data: 'Cosmo' });
        // Same id, new handle: the projection follows the record, not a copy.
        expect(registry.projectIdentity(identity.id)).toEqual({ handle: 'Cosmo', hasIdentity: true });
    });

    it('frees the previous handle on rename so another identity can claim it', () => {
        const { registry } = createTestRegistry('guest');
        const first = createNamedIdentity(registry, 'Nova');
        const second = createNamedIdentity(registry, 'Astra');

        expect(registry.setHandle(first.id, 'Cosmo')).toEqual({ ok: true, data: 'Cosmo' });
        expect(registry.setHandle(second.id, 'Nova')).toEqual({ ok: true, data: 'Nova' });
    });

    it('allows a case-only self-rename (own key is excluded from the conflict check)', () => {
        const { registry } = createTestRegistry('guest');
        const identity = createNamedIdentity(registry, 'Nova');

        expect(registry.setHandle(identity.id, 'NOVA')).toEqual({ ok: true, data: 'NOVA' });
        expect(registry.projectIdentity(identity.id)).toEqual({ handle: 'NOVA', hasIdentity: true });
    });

    it('throws on an unknown identity id (caller invariant breach, not a recoverable failure)', () => {
        const { registry } = createTestRegistry('guest');
        expect(() => registry.setHandle(nextGuestPlayerId(), 'Nova')).toThrowError(/unknown guest player id/);
    });
});

// ----------------------------------------------------------------------------
// Uniqueness races (NFR-002 / SC-003)
// ----------------------------------------------------------------------------

describe('setHandle — concurrent conflicting claims resolve to exactly one winner', () => {
    it(`gives ${RACE_SIZE} simultaneous claims for one handle exactly one winner and nine handle_taken`, () => {
        const { registry } = createTestRegistry('guest');

        // Serialized by the event loop, each call rechecks ownership
        // immediately before assignment — the production concurrency model.
        const outcomes = Array.from({ length: RACE_SIZE }, () => {
            const contestant = registry.createIdentity();
            return { id: contestant.id, result: registry.setHandle(contestant.id, 'Nova') };
        });

        const winners = outcomes.filter((outcome) => outcome.result.ok);
        expect(winners).toHaveLength(1);
        expect(winners[0]?.result).toEqual({ ok: true, data: 'Nova' });

        for (const outcome of outcomes) {
            if (!outcome.result.ok) {
                expect(outcome.result.error.code).toBe('handle_taken');
                expect(registry.projectIdentity(outcome.id)).toEqual({
                    handle: null,
                    hasIdentity: true,
                });
            }
        }
        expect(registry.stats()).toEqual({ identities: RACE_SIZE, reservedHandles: 1 });
    });

    it('resolves a mixed two-handle race to exactly one winner per handle', () => {
        const { registry } = createTestRegistry('guest');
        const handles = ['Nova', 'Astra'];

        // Alternating arrivals: Nova/Astra/Nova/Astra… — RACE_SIZE total.
        const outcomes: Array<{ readonly handle: string; readonly result: Result<string, LobbyError> }> = [];
        for (let seat = 0; seat < RACE_SIZE / handles.length; seat += 1) {
            for (const handle of handles) {
                const contestant = registry.createIdentity();
                outcomes.push({ handle, result: registry.setHandle(contestant.id, handle) });
            }
        }

        for (const handle of handles) {
            const winnersForHandle = outcomes.filter((outcome) => outcome.handle === handle && outcome.result.ok);
            expect(winnersForHandle).toHaveLength(1);
        }
    });
});

// ----------------------------------------------------------------------------
// Disconnect → grace → release (edge cases; Clarifications v1.0)
// ----------------------------------------------------------------------------

describe('disconnect and grace — handle reservation lifecycle', () => {
    it('keeps the handle reserved while the owner sits in grace', () => {
        const { registry } = createTestRegistry('guest');
        const leaver = createNamedIdentity(registry, 'Nova');

        registry.disconnect(leaver.id);

        expect(leaver.status).toBe('grace');
        expect(leaver.disconnectedAtMs).toBe(BASE_MS);
        const rival = registry.createIdentity();
        expect(registry.setHandle(rival.id, 'nova').ok).toBe(false);
    });

    it('restores the same identity and server-held handle when the claimant returns within grace', () => {
        const { registry, clock } = createTestRegistry('guest');
        const leaver = createNamedIdentity(registry, 'Nova');
        registry.disconnect(leaver.id);

        clock.advanceBy(GRACE_MS - ONE_MS);
        const outcome = registry.restoreIdentity(buildIdentityClaim({ guestPlayerId: leaver.id }));

        expect(outcome.restored).toBe(true);
        expect(outcome.identity.id).toBe(leaver.id);
        expect(outcome.identity.status).toBe('active');
        expect(outcome.identity.disconnectedAtMs).toBeNull();
        // The stale locally-stored handle in the default claim ('Nova'
        // happens to match here) must never override the server record —
        // proven separately below with a mismatched claim.
        expect(registry.projectIdentity(leaver.id)).toEqual({ handle: 'Nova', hasIdentity: true });
    });

    it('mints a fresh identity and frees the handle once grace expires', () => {
        const { registry, clock } = createTestRegistry('guest');
        const leaver = createNamedIdentity(registry, 'Nova');
        registry.disconnect(leaver.id);

        clock.advanceBy(GRACE_MS);
        const outcome = registry.restoreIdentity(buildIdentityClaim({ guestPlayerId: leaver.id }));

        expect(outcome.restored).toBe(false);
        expect(outcome.identity.id).not.toBe(leaver.id);
        expect(registry.projectIdentity(leaver.id)).toBeUndefined();

        const successor = registry.createIdentity();
        expect(registry.setHandle(successor.id, 'nova')).toEqual({ ok: true, data: 'nova' });
    });

    it('treats the instant before the grace boundary as still reserved (networking >= convention)', () => {
        const { registry, clock } = createTestRegistry('guest');
        const leaver = createNamedIdentity(registry, 'Nova');
        registry.disconnect(leaver.id);

        clock.advanceBy(GRACE_MS - ONE_MS);
        const rival = registry.createIdentity();
        expect(registry.setHandle(rival.id, 'Nova').ok).toBe(false);
    });

    it('releases only past-grace identities in one sweep and reports the count', () => {
        const { registry, clock } = createTestRegistry('guest');
        const early = createNamedIdentity(registry, 'Early');
        const middle = createNamedIdentity(registry, 'Middle');
        const late = createNamedIdentity(registry, 'Late');

        registry.disconnect(early.id); // expires at BASE + GRACE
        clock.advanceBy(STEP_MS);
        registry.disconnect(middle.id); // expires at BASE + STEP + GRACE
        clock.advanceBy(STEP_MS);
        registry.disconnect(late.id); // expires at BASE + 2·STEP + GRACE

        // At BASE + 2·STEP: only `early` is past grace (STEP < GRACE).
        expect(registry.releaseExpired()).toBe(1);
        expect(registry.projectIdentity(early.id)).toBeUndefined();
        expect(registry.projectIdentity(middle.id)).toBeDefined();
        expect(registry.stats().reservedHandles).toBe(2);

        clock.advanceBy(GRACE_MS - STEP_MS + ONE_MS);
        expect(registry.releaseExpired()).toBe(1);
        expect(registry.projectIdentity(middle.id)).toBeUndefined();
        expect(registry.projectIdentity(late.id)).toBeDefined();

        clock.advanceBy(STEP_MS);
        expect(registry.releaseExpired()).toBe(1);
        expect(registry.stats()).toEqual({ identities: 0, reservedHandles: 0 });
    });

    it('releases immediately on explicit release so the handle is claimable without waiting for grace', () => {
        const { registry } = createTestRegistry('guest');
        const leaver = createNamedIdentity(registry, 'Nova');
        registry.release(leaver.id);

        expect(registry.projectIdentity(leaver.id)).toBeUndefined();
        const successor = createNamedIdentity(registry, 'Nova');
        expect(successor.handle).toBe('Nova');
    });

    it('is idempotent when releasing an already-released or unknown identity', () => {
        const { registry } = createTestRegistry('guest');
        const leaver = createNamedIdentity(registry, 'Nova');
        registry.release(leaver.id);
        expect(() => registry.release(leaver.id)).not.toThrow();
        expect(() => registry.release(nextGuestPlayerId())).not.toThrow();
    });

    it('throws when disconnecting an unknown identity (caller invariant breach)', () => {
        const { registry } = createTestRegistry('guest');
        expect(() => registry.disconnect(nextGuestPlayerId())).toThrowError(/unknown guest player id/);
    });
});

// ----------------------------------------------------------------------------
// Restore claims (US1 AC-3; v1.1 amendment)
// ----------------------------------------------------------------------------

describe('restoreIdentity — persistent resume claims', () => {
    it('mints fresh for a first visit without any claim', () => {
        const { registry } = createTestRegistry('guest');
        const outcome = registry.restoreIdentity(undefined);
        expect(outcome.restored).toBe(false);
        expect(outcome.identity.handle).toBeNull();
    });

    it('mints fresh for a claim missing the guestPlayerId field', () => {
        const { registry } = createTestRegistry('guest');
        const { guestPlayerId: _strippedId, ...firstVisit } = buildIdentityClaim();
        const outcome = registry.restoreIdentity(firstVisit);
        expect(outcome.restored).toBe(false);
        expect(outcome.identity.handle).toBeNull();
    });

    it('ignores forged or unknown ids and mints fresh instead of failing', () => {
        const { registry } = createTestRegistry('guest');
        const outcome = registry.restoreIdentity(buildIdentityClaim({ guestPlayerId: nextGuestPlayerId() }));
        expect(outcome.restored).toBe(false);
        expect(registry.stats().identities).toBe(1);
    });

    it('never lets the claimed handle override the server-held handle', () => {
        const { registry } = createTestRegistry('guest');
        const identity = createNamedIdentity(registry, 'Nova');
        registry.disconnect(identity.id);

        const outcome = registry.restoreIdentity(
            buildIdentityClaim({ guestPlayerId: identity.id, handle: 'StaleLocalCopy' }),
        );

        expect(outcome.restored).toBe(true);
        expect(registry.projectIdentity(identity.id)).toEqual({ handle: 'Nova', hasIdentity: true });
    });

    it('returns the same identity for a claim on an already-active session (second tab, no duplicate)', () => {
        const { registry } = createTestRegistry('guest');
        const identity = createNamedIdentity(registry, 'Nova');

        const outcome = registry.restoreIdentity(buildIdentityClaim({ guestPlayerId: identity.id }));

        expect(outcome.restored).toBe(true);
        expect(outcome.identity.id).toBe(identity.id);
        expect(registry.stats().identities).toBe(1);
    });
});

// ----------------------------------------------------------------------------
// Close (plan.md §4)
// ----------------------------------------------------------------------------

describe('close — shutdown semantics', () => {
    it('disables every operation after closing', () => {
        const { registry } = createTestRegistry('guest');
        const identity = createNamedIdentity(registry, 'Nova');

        registry.close();

        const operations: ReadonlyArray<() => unknown> = [
            () => registry.createIdentity(),
            () => registry.restoreIdentity(undefined),
            () => registry.setHandle(identity.id, 'Cosmo'),
            () => registry.disconnect(identity.id),
            () => registry.release(identity.id),
            () => registry.releaseExpired(),
            () => registry.projectIdentity(identity.id),
            () => registry.stats(),
        ];
        for (const operation of operations) {
            expect(operation).toThrowError(/instance is closed/);
        }
    });

    it('is idempotent', () => {
        const { registry } = createTestRegistry('guest');
        registry.close();
        expect(() => registry.close()).not.toThrow();
    });

    it('starts a fresh instance completely empty (restart loses all state)', () => {
        const populated = createTestRegistry('guest');
        createNamedIdentity(populated.registry, 'Nova');
        populated.registry.close();

        const restarted = createTestRegistry('restarted');
        expect(restarted.registry.stats()).toEqual({ identities: 0, reservedHandles: 0 });
        // The old identity does not carry over: its id is unknown here.
        expect(() => restarted.registry.disconnect(nextGuestPlayerId())).toThrowError(/unknown guest player id/);
    });
});
