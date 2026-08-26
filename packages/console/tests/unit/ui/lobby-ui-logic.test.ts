/**
 * Lobby UI logic unit tests — feature 010 (T-015).
 *
 * Node-mode pins for the landing UI's PURE layer:
 *
 *   - `validateHandleDraft` — the client-side mirror of matchmaking's
 *     FR-004/FR-005 validation (spec Clarifications v1.5 hardening).
 *     The corpus mirrors the server fixture classes; the server
 *     validator itself is not exported from the matchmaking barrel,
 *     so this pin guards the MIRROR (see lobby-handle.ts module note —
 *     a barrel export would enable a true differential test later).
 *   - label helpers — every player-visible phrase the components render.
 *   - `describeSnapshotChange` — the FR-013 announcement diff.
 *   - `resolveLobbyServerUrl` — page-URL → server-URL resolution with
 *     the documented 8080 default and `?ws=` override.
 */

import type { LobbyStatus, PublicLobbyEntry } from '@europa/matchmaking';
import { describe, expect, it } from 'vitest';
import { resolveLobbyServerUrl } from '../../../src/state/lobby-view';
import type { MatchId } from '../../../src/state/types';
import { LOBBY_HANDLE_MAX_CHARS, validateHandleDraft } from '../../../src/ui/lobby-handle';
import {
    connectionLabel,
    describeActionError,
    describeSnapshotChange,
    formatEntrySettings,
    formatOccupancy,
    identityStatusLabel,
    isJoinable,
    lobbyStatusLabel,
    rowActionLabel,
} from '../../../src/ui/lobby-labels';

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

/** Cast helper for entry fixtures (ids are opaque strings in tests). */
function matchIdOf(value: string): MatchId {
    return value as MatchId;
}

/** Build one public entry with overridable fields. */
function entryOf(overrides: Partial<PublicLobbyEntry> = {}): PublicLobbyEntry {
    return {
        matchId: matchIdOf('aaaaaaaa-0000-4000-8000-000000000000'),
        seatsFilled: 1,
        capacity: 2,
        status: 'waiting',
        boardSize: 32,
        tickIntervalMs: 250,
        ...overrides,
    };
} // ----------------------------------------------------------------------------
// Handle validation mirror
// ----------------------------------------------------------------------------

describe('validateHandleDraft (client mirror of FR-004 as hardened by v1.5)', () => {
    it('accepts ordinary names and trims edges', () => {
        const verdict = validateHandleDraft('  Nova  ');
        expect(verdict).toEqual({ ok: true, value: 'Nova' });
    });

    it('accepts astral emoji as single code points', () => {
        // 🚀 = 2 UTF-16 units, 1 code point — must count as ONE char.
        const verdict = validateHandleDraft('🚀🚀🚀');
        expect(verdict).toEqual({ ok: true, value: '🚀🚀🚀' });
    });

    it('accepts exactly the maximum length in code points', () => {
        const verdict = validateHandleDraft('a'.repeat(LOBBY_HANDLE_MAX_CHARS));
        expect(verdict.ok).toBe(true);
    });

    it('accepts zero-width space (Cf stays valid content per v1.5)', () => {
        const verdict = validateHandleDraft('no\u200bva');
        expect(verdict).toEqual({ ok: true, value: 'no\u200bva' });
    });

    it('rejects whitespace-only input as empty', () => {
        const verdict = validateHandleDraft('   ');
        expect(verdict.ok).toBe(false);
        expect(!verdict.ok ? verdict.issue : null).toBe('empty');
    });

    it('rejects overlong input with counts in the message', () => {
        const verdict = validateHandleDraft('a'.repeat(LOBBY_HANDLE_MAX_CHARS + 1));
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) {
            expect(verdict.issue).toBe('too_long');
            expect(verdict.message).toContain(String(LOBBY_HANDLE_MAX_CHARS + 1));
        }
    });

    it('rejects control characters (Cc), including interior newline', () => {
        const verdict = validateHandleDraft('no\nva');
        expect(verdict.ok).toBe(false);
        expect(!verdict.ok ? verdict.issue : null).toBe('control_character');
    });

    it('rejects bidi overrides and isolates (v1.5 LOW-6)', () => {
        for (const character of ['\u202A', '\u202E', '\u2066', '\u2069']) {
            const verdict = validateHandleDraft(`no${character}va`);
            expect(verdict.ok).toBe(false);
            expect(!verdict.ok ? verdict.issue : null).toBe('bidi_control');
        }
    });

    it('rejects lone surrogates but accepts well-formed pairs (v1.5 LOW-7)', () => {
        const lone = validateHandleDraft('no\uDEADva');
        expect(lone.ok).toBe(false);
        expect(!lone.ok ? lone.issue : null).toBe('lone_surrogate');

        const paired = validateHandleDraft('no\uD83D\uDE80va');
        expect(paired.ok).toBe(true);
    });
});

// ----------------------------------------------------------------------------
// Labels
// ----------------------------------------------------------------------------

describe('lobby labels', () => {
    it('renders every connection state distinctly', () => {
        const labels = (
            ['idle', 'connecting', 'ready', 'disconnected', 'reconnecting', 'failed', 'closed'] as const
        ).map(connectionLabel);
        expect(new Set(labels).size).toBe(labels.length);
    });

    it('keeps identity status wording distinct per lifecycle', () => {
        expect(identityStatusLabel('restoring', null)).toMatch(/Restoring/i);
        expect(identityStatusLabel('unnamed', null)).toMatch(/Choose a name/i);
        expect(identityStatusLabel('named', 'Nova')).toMatch(/Ready to play/i);
    });

    it('labels the two actionable statuses only', () => {
        expect(lobbyStatusLabel('waiting')).toBe('Waiting for players');
        expect(lobbyStatusLabel('in_progress')).toBe('In progress');
    });

    it('formats occupancy and settings summaries', () => {
        expect(formatOccupancy(1, 2)).toBe('1 of 2 seats filled');
        const entry = entryOf({ boardSize: 48, tickIntervalMs: 250 });
        expect(formatEntrySettings(entry)).toBe('48×48 board · 250 ms ticks');
    });

    it('offers Join only for open waiting matches', () => {
        expect(isJoinable(entryOf({ status: 'waiting', seatsFilled: 0, capacity: 2 }))).toBe(true);
        expect(isJoinable(entryOf({ status: 'waiting', seatsFilled: 2, capacity: 2 }))).toBe(false);
        expect(isJoinable(entryOf({ status: 'in_progress', seatsFilled: 2, capacity: 2 }))).toBe(false);
    });

    it('composes row action accessible names with row context', () => {
        const entry = entryOf();
        expect(rowActionLabel('join', entry)).toBe('Join match — Waiting for players, 1 of 2 seats filled');
        expect(rowActionLabel('spectate', entry)).toContain('Spectate match —');
    });
});

// ----------------------------------------------------------------------------
// Action-error wording
// ----------------------------------------------------------------------------

describe('describeActionError', () => {
    it('prefers the sanitized server message verbatim', () => {
        const text = describeActionError({
            code: 'handle_taken',
            message: 'nova is already in use.',
            detail: null,
        });
        expect(text).toBe('nova is already in use.');
    });

    it('falls back per code when the message is empty', () => {
        expect(describeActionError({ code: 'match_full', message: '', detail: null })).toMatch(/filled/i);
        expect(describeActionError({ code: 'timeout', message: '', detail: null })).toMatch(/respond/i);
        expect(describeActionError({ code: 'transport', message: '', detail: null })).toMatch(/connection dropped/i);
    });

    it('defaults unknown additive codes to the generic branch (tolerance rule)', () => {
        const unknown = describeActionError({
            code: 'some_future_code' as 'internal_error',
            message: '',
            detail: null,
        });
        expect(unknown).toMatch(/try again/i);
    });
});

// ----------------------------------------------------------------------------
// Snapshot-diff announcements
// ----------------------------------------------------------------------------

describe('describeSnapshotChange', () => {
    it('returns null when nothing changed', () => {
        const entries = [entryOf()];
        expect(describeSnapshotChange(entries, entries)).toBeNull();
    });

    it('announces additions, removals, starts, and occupancy updates', () => {
        const added = describeSnapshotChange([], [entryOf()]);
        expect(added).toBe('A new match was listed.');

        const removed = describeSnapshotChange([entryOf()], []);
        expect(removed).toBe('A match left the list.');

        const started = describeSnapshotChange([entryOf()], [entryOf({ status: 'in_progress' as LobbyStatus })]);
        expect(started).toBe('A match started.');

        const filled = describeSnapshotChange([entryOf({ seatsFilled: 1 })], [entryOf({ seatsFilled: 2 })]);
        expect(filled).toBe('A match was updated.');
    });

    it('uses plural forms for multiple simultaneous changes', () => {
        const next = [entryOf(), entryOf({ matchId: matchIdOf('bbbbbbbb-0000-4000-8000-000000000000') })];
        expect(describeSnapshotChange([], next)).toBe('2 new matches were listed.');
    });
});

// ----------------------------------------------------------------------------
// Server URL resolution
// ----------------------------------------------------------------------------

describe('resolveLobbyServerUrl', () => {
    it('derives ws://<hostname>:8080 by default (documented host mirror)', () => {
        expect(resolveLobbyServerUrl('', { protocol: 'http:', hostname: 'localhost' })).toBe('ws://localhost:8080');
        expect(resolveLobbyServerUrl('', { protocol: 'http:', hostname: 'europa.example' })).toBe(
            'ws://europa.example:8080',
        );
    });

    it('upgrades to wss on HTTPS pages (mixed-content rule)', () => {
        expect(resolveLobbyServerUrl('', { protocol: 'https:', hostname: 'europa.example' })).toBe(
            'wss://europa.example:8080',
        );
    });

    it('honors an explicit ?ws= override verbatim', () => {
        expect(resolveLobbyServerUrl('?ws=wss://host.example:9999', { protocol: 'http:', hostname: 'localhost' })).toBe(
            'wss://host.example:9999',
        );
    });

    it('normalizes http(s) and bare-host overrides to ws schemes', () => {
        expect(
            resolveLobbyServerUrl('?ws=http://host.example:9090', { protocol: 'http:', hostname: 'localhost' }),
        ).toBe('ws://host.example:9090');
        expect(resolveLobbyServerUrl('?ws=host.example%3A9090', { protocol: 'http:', hostname: 'localhost' })).toBe(
            'ws://host.example:9090',
        );
    });

    it('falls back to localhost when the page has no hostname (file://)', () => {
        expect(resolveLobbyServerUrl('', { protocol: 'file:', hostname: '' })).toBe('ws://localhost:8080');
    });
});
