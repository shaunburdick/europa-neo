/**
 * Lobby create-form board-size pre-selection unit tests — feature 012
 * (T-010), covering FR-002's player-count → board-size coupling.
 *
 * The pre-selection logic lives in the pure, exported
 * `resolveBoardSizeOnPlayerCountChange` helper (extracted from the
 * radio `onChange` handler so the contract is unit-testable without
 * rendering — the "unset" branch is not reachable through the UI). This
 * suite pins every radio transition the form supports:
 *
 *   2→3, 3→2, 2→4, 4→2, 3→4
 *
 * with three preconditions each:
 *   - unset (null / undefined / NaN) → selects the target default;
 *   - still at the previous count's default → re-applies the target
 *     default;
 *   - explicit non-default (100) → preserved across the switch.
 *
 * It also pins `buildCreateSettings` so the FR-004 cities-per-player
 * override still flows into the wire payload (terrain preset reuse).
 *
 * NOTE: this file is `.test.tsx` but contains NO JSX — it drives the
 * component via `React.createElement` so it runs under the unit config
 * (happy-dom, no React plugin). The pure-function matrix is the
 * authoritative contract test; the rendering block is a wiring smoke
 * test confirming the form actually invokes the resolver.
 */

import { BOARD_SIZE_DEFAULTS, type PlayerCount } from '@europa/matchmaking';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { LobbyActionStatus } from '../../../src/state/lobby-state';
import {
    buildCreateSettings,
    LobbyCreateForm,
    type LobbyCreateFormValues,
    resolveBoardSizeOnPlayerCountChange,
} from '../../../src/ui/lobby-create-form';

// ----------------------------------------------------------------------------
// Radio-transition matrix (FR-002 pre-selection)
// ----------------------------------------------------------------------------

/** Every player-count transition the form's radio row exposes. */
const TRANSITIONS: ReadonlyArray<readonly [PlayerCount, PlayerCount]> = [
    [2, 3],
    [3, 2],
    [2, 4],
    [4, 2],
    [3, 4],
] as const;

describe('resolveBoardSizeOnPlayerCountChange (FR-002 pre-selection)', () => {
    for (const [from, to] of TRANSITIONS) {
        describe(`${from} → ${to}`, () => {
            it('unset (null) selects the target default', () => {
                expect(resolveBoardSizeOnPlayerCountChange(from, null, to)).toBe(BOARD_SIZE_DEFAULTS[to]);
            });

            it('unset (undefined) selects the target default', () => {
                expect(resolveBoardSizeOnPlayerCountChange(from, undefined, to)).toBe(BOARD_SIZE_DEFAULTS[to]);
            });

            it('unset (NaN) selects the target default', () => {
                expect(resolveBoardSizeOnPlayerCountChange(from, Number.NaN, to)).toBe(BOARD_SIZE_DEFAULTS[to]);
            });

            it('still at the previous default re-applies the target default', () => {
                expect(resolveBoardSizeOnPlayerCountChange(from, BOARD_SIZE_DEFAULTS[from], to)).toBe(
                    BOARD_SIZE_DEFAULTS[to],
                );
            });

            it('explicit non-default (100) is preserved across the switch', () => {
                expect(resolveBoardSizeOnPlayerCountChange(from, 100, to)).toBe(100);
            });
        });
    }

    it('treats an override equal to the previous default as "at default" (re-applies)', () => {
        // 2→3 with board still at the 2-player default (32) must follow to 48.
        expect(resolveBoardSizeOnPlayerCountChange(2, BOARD_SIZE_DEFAULTS[2], 3)).toBe(BOARD_SIZE_DEFAULTS[3]);
    });

    it('preserves an override that happens to equal the target default but not the previous one', () => {
        // 2→3 while the player picked 48 (the 3/4 default, but NOT the 2 default):
        // 48 !== previousDefault(32), so it is preserved as 48.
        expect(resolveBoardSizeOnPlayerCountChange(2, 48, 3)).toBe(48);
    });
});

// ----------------------------------------------------------------------------
// buildCreateSettings — FR-004 cities-per-player override reuse
// ----------------------------------------------------------------------------

describe('buildCreateSettings (FR-004 reuse)', () => {
    it('flows the citiesPerPlayer override into terrainSettings', () => {
        const values: LobbyCreateFormValues = { playerCount: 3, boardSize: 48, citiesPerPlayer: 4 };
        const settings = buildCreateSettings(values);
        expect(settings.terrainSettings?.citiesPerPlayer).toBe(4);
    });

    it('includes the player/board choices and omits tick cadence', () => {
        const values: LobbyCreateFormValues = { playerCount: 4, boardSize: 48, citiesPerPlayer: 2 };
        const settings = buildCreateSettings(values);
        expect(settings.playerCount).toBe(4);
        expect(settings.boardSize).toBe(48);
        // Tick cadence is server-authoritative; the client never sends it.
        expect(settings).not.toHaveProperty('tickIntervalMs');
    });

    it('preserves the mirrored terrain preset while overriding citiesPerPlayer', () => {
        const values: LobbyCreateFormValues = { playerCount: 2, boardSize: 32, citiesPerPlayer: 3 };
        const settings = buildCreateSettings(values);
        expect(settings.terrainSettings).toMatchObject({
            waterRatio: 0.1,
            roughness: 0.5,
            octaves: 4,
            citiesPerPlayer: 3,
            symmetryStrategy: 'point',
            minCityWaterDistance: 3,
            minCityCityDistance: 5,
            maxRegenAttempts: 5,
        });
    });
});

// ----------------------------------------------------------------------------
// Rendering wiring smoke test (no JSX — React.createElement under happy-dom)
// ----------------------------------------------------------------------------

/** Mount the form and return the live container plus a teardown. */
function mountForm(onCreate: (values: LobbyCreateFormValues) => void = () => undefined): {
    container: HTMLElement;
    unmount: () => void;
} {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(
            createElement(LobbyCreateForm, {
                disabled: false,
                actionStatus: { phase: 'idle', error: null },
                onCreate,
            }),
        );
    });
    return {
        container,
        unmount: () => {
            act(() => {
                root.unmount();
            });
            container.remove();
        },
    };
}

/** Find a player-count radio by its value. */
function playerRadio(container: HTMLElement, count: PlayerCount): HTMLInputElement {
    const radio = container.querySelector<HTMLInputElement>(
        `input[type="radio"][name="playerCount"][value="${count}"]`,
    );
    if (radio === null) {
        throw new Error(`player-count radio ${count} not found`);
    }
    return radio;
}

/** Current board-size select value. */
function boardSelect(container: HTMLElement): HTMLSelectElement {
    const select = container.querySelector<HTMLSelectElement>('select');
    if (select === null) {
        throw new Error('board-size select not found');
    }
    return select;
}

describe('LobbyCreateForm wiring (FR-002 end-to-end)', () => {
    it('re-applies the target default when the player has not overridden (2→3→4)', () => {
        const { container, unmount } = mountForm();
        try {
            // Initial: 2 players, board at the 2-player default (32).
            expect(boardSelect(container).value).toBe(String(BOARD_SIZE_DEFAULTS[2]));

            // Switch to 3 players → board follows to the 3-player default (48).
            act(() => {
                playerRadio(container, 3).click();
            });
            expect(boardSelect(container).value).toBe(String(BOARD_SIZE_DEFAULTS[3]));

            // Switch to 4 players → board follows to the 4-player default (48).
            act(() => {
                playerRadio(container, 4).click();
            });
            expect(boardSelect(container).value).toBe(String(BOARD_SIZE_DEFAULTS[4]));
        } finally {
            unmount();
        }
    });

    it('preserves an explicit board override (48) across count switches (2→3→4)', () => {
        const { container, unmount } = mountForm();
        try {
            // Override the board to 48 at 2 players (48 is NOT the 2-player default 32).
            const select = boardSelect(container);
            act(() => {
                select.value = '48';
                select.dispatchEvent(new Event('change', { bubbles: true }));
            });
            expect(select.value).toBe('48');

            // Switch to 3 players → 48 preserved (48 !== previous default 32).
            act(() => {
                playerRadio(container, 3).click();
            });
            expect(boardSelect(container).value).toBe('48');

            // Switch to 4 players → 48 preserved (48 is the 3/4 default, so it is
            // re-applied as the target default and stays 48).
            act(() => {
                playerRadio(container, 4).click();
            });
            expect(boardSelect(container).value).toBe('48');
        } finally {
            unmount();
        }
    });

    it('submits the resolved board size and the cities override (FR-004)', () => {
        const submitted: LobbyCreateFormValues[] = [];
        const { container, unmount } = mountForm((values) => {
            submitted.push(values);
        });
        try {
            // Pick 3 players (board → 48) and cities = 4, then submit.
            act(() => {
                playerRadio(container, 3).click();
            });
            // The second select is cities-per-player.
            const citiesSelect = container.querySelectorAll<HTMLSelectElement>('select')[1];
            if (citiesSelect === undefined) {
                throw new Error('cities-per-player select not found');
            }
            act(() => {
                citiesSelect.value = '4';
                citiesSelect.dispatchEvent(new Event('change', { bubbles: true }));
            });
            const form = container.querySelector('form');
            if (form === null) {
                throw new Error('create form not found');
            }
            act(() => {
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            });
            expect(submitted).toHaveLength(1);
            expect(submitted[0]).toEqual({ playerCount: 3, boardSize: BOARD_SIZE_DEFAULTS[3], citiesPerPlayer: 4 });
        } finally {
            unmount();
        }
    });
});

// ----------------------------------------------------------------------------
// Rejection rendering (US3 AC-4 / FR-002 invalid-size rejection surfaced via
// `actionStatus.error.detail`). These exercise the `rejectedSettingsField`
// helper's branches (null error, null detail, empty detail, settings.* key,
// non-settings key) and the field-specific vs form-level error rendering plus
// the busy-label ternary — the branches the coverage gate flagged at <80%.
// ----------------------------------------------------------------------------

/** Mount the form with an explicit action status (error/loading states). */
function mountFormWithStatus(
    actionStatus: LobbyActionStatus,
    onCreate: (values: LobbyCreateFormValues) => void = () => undefined,
): { container: HTMLElement; unmount: () => void } {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(
            createElement(LobbyCreateForm, {
                disabled: false,
                actionStatus,
                onCreate,
            }),
        );
    });
    return {
        container,
        unmount: () => {
            act(() => {
                root.unmount();
            });
            container.remove();
        },
    };
}

/** Text of every role="alert" error line currently rendered. */
function errorLines(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll<HTMLElement>('.europa-lobby__error')).map(
        (el) => el.textContent?.trim() ?? '',
    );
}

/** Build an error action status carrying the given `detail` record. */
function errorStatus(
    detail: Readonly<Record<string, string | number | boolean>> | null,
    message = 'The server rejected the request.',
): LobbyActionStatus {
    return { phase: 'error', error: { code: 'internal_error', message, detail } };
}

describe('LobbyCreateForm rejection rendering (US3 AC-4 / FR-002)', () => {
    it('shows a form-level error when the action failed with no detail', () => {
        const { container, unmount } = mountFormWithStatus(errorStatus(null));
        try {
            const lines = errorLines(container);
            expect(lines).toHaveLength(1);
            expect(lines[0]).toBe('The server rejected the request.');
        } finally {
            unmount();
        }
    });

    it('shows a form-level error when detail names no settings.* field', () => {
        const { container, unmount } = mountFormWithStatus(errorStatus({ someOtherKey: 'x' }));
        try {
            const lines = errorLines(container);
            expect(lines).toHaveLength(1);
            expect(lines[0]).toBe('The server rejected the request.');
        } finally {
            unmount();
        }
    });

    it('shows a form-level error when detail is an empty record (loop not entered)', () => {
        const { container, unmount } = mountFormWithStatus(errorStatus({}));
        try {
            const lines = errorLines(container);
            expect(lines).toHaveLength(1);
            expect(lines[0]).toBe('The server rejected the request.');
        } finally {
            unmount();
        }
    });

    it('renders a playerCount field-specific error when detail names settings.playerCount', () => {
        const { container, unmount } = mountFormWithStatus(
            errorStatus({ 'settings.playerCount': 'must be 2-4' }, 'Player count rejected.'),
        );
        try {
            const lines = errorLines(container);
            expect(lines).toHaveLength(1);
            expect(lines[0]).toBe('Player count rejected.');
        } finally {
            unmount();
        }
    });

    it('renders a boardSize field-specific error when detail names settings.boardSize (invalid-size rejection)', () => {
        const { container, unmount } = mountFormWithStatus(
            errorStatus({ 'settings.boardSize': 'not in allowed set' }, 'Board size rejected.'),
        );
        try {
            const lines = errorLines(container);
            expect(lines).toHaveLength(1);
            expect(lines[0]).toBe('Board size rejected.');
        } finally {
            unmount();
        }
    });

    it('renders no error line when the action is idle with no error', () => {
        const { container, unmount } = mountFormWithStatus({ phase: 'idle', error: null });
        try {
            expect(errorLines(container)).toHaveLength(0);
        } finally {
            unmount();
        }
    });

    it('shows the busy "Creating…" label while the create action is loading', () => {
        const { container, unmount } = mountFormWithStatus({ phase: 'loading', error: null });
        try {
            const button = container.querySelector('button[type="submit"]');
            expect(button).not.toBeNull();
            expect(button?.textContent?.trim()).toBe('Creating…');
            expect(button?.hasAttribute('disabled')).toBe(true);
        } finally {
            unmount();
        }
    });
});
