/**
 * Lobby create-match form — feature 010 (T-015, US2/US3).
 *
 * The landing page's "host a battle" path (FR-008/FR-009): player
 * count, board size, and cities-per-player, submitted as PARTIAL
 * match settings — matchmaking merges omitted fields with its shipped
 * defaults and validates there (server-authoritative; tick cadence is
 * deliberately not exposed so every public match stays on the host's
 * production 250 ms rhythm).
 *
 * Field-specific feedback (US3 AC-4): rejected settings arrive in the
 * store's `createMatch` action slot with `detail` keys mirroring
 * matchmaking's dotted rejection paths (`settings.playerCount`,
 * `settings.boardSize`, …). This form renders those under their
 * fields; codes without specifics fall back to one form-level line.
 *
 * Terrain preset note: the payload carries a COMPLETE
 * `LobbyTerrainSettings` (the wire type has no partial-terrain shape)
 * seeded from the shipped generation defaults with the chosen
 * cities-per-player override. The defaults are mirrored here — not
 * imported from `@europa/terrain` — because importing that barrel into
 * the SPA would drag the generator code into the browser bundle
 * (tracked gzip budget). The mirror is pinned against the real
 * constant by `tests/unit/ui/lobby-ui-logic.test.ts`; if terrain's
 * defaults change, that pin fails first.
 *
 * Accessibility contract: native radios/select/button (keyboard-
 * operable by construction), a real `<label>` per field, `role="alert"`
 * error lines, `.europa-focus-ring` indicators, and a busy state that
 * disables submission while the create action is in flight.
 */

import type { LobbyMatchSettings, LobbyTerrainSettings } from '@europa/networking';
import type { JSX } from 'react';
import { type FormEvent, useId, useState } from 'react';

import type { LobbyActionStatus } from '../state/lobby-state';
import { describeActionError } from './lobby-labels';

// ----------------------------------------------------------------------------
// Settings payload (mirrored defaults — see module note)
// ----------------------------------------------------------------------------

/**
 * Shipped generation defaults mirrored from `@europa/terrain`'s
 * `DEFAULT_GENERATION_SETTINGS` (pinned by unit test — see module
 * note). The create payload spreads this and overrides
 * `citiesPerPlayer`.
 */
export const CREATE_TERRAIN_PRESET: LobbyTerrainSettings = {
    waterRatio: 0.1,
    roughness: 0.5,
    octaves: 4,
    citiesPerPlayer: 1,
    symmetryStrategy: 'point',
    minCityWaterDistance: 3,
    minCityCityDistance: 5,
    maxRegenAttempts: 5,
} as const;

/** Board sizes offered by the form. All are safely above the terrain
 * placement constraints' practical floor (smaller boards can exhaust
 * regeneration attempts on matchmaking-generated maps); 32 is the
 * shipped default. */
export const CREATE_BOARD_SIZES: readonly number[] = [32, 48, 64] as const;

/** Cities-per-player options (GenerationSettings safe range [1, 4]). */
export const CREATE_CITIES_OPTIONS: readonly number[] = [1, 2, 3, 4] as const;

/** Player counts per the engine contract (engine FR-019: 2..4). */
export const CREATE_PLAYER_COUNTS: readonly (2 | 3 | 4)[] = [2, 3, 4] as const;

/** The form's editable values. */
export interface LobbyCreateFormValues {
    readonly playerCount: 2 | 3 | 4;
    readonly boardSize: number;
    readonly citiesPerPlayer: number;
}

/**
 * Build the partial wire-settings payload for a create request:
 * player/board choices plus the full terrain preset with the chosen
 * cities-per-player. Tick cadence is omitted (matchmaking default).
 *
 * @param values The submitted form values.
 */
export function buildCreateSettings(values: LobbyCreateFormValues): Partial<LobbyMatchSettings> {
    return {
        playerCount: values.playerCount,
        boardSize: values.boardSize,
        terrainSettings: {
            ...CREATE_TERRAIN_PRESET,
            citiesPerPlayer: values.citiesPerPlayer,
        },
    };
}

/**
 * Extract the dotted settings-field key (if any) this action error
 * names, e.g. `'settings.playerCount'`. Unknown shapes yield `null`.
 *
 * @param status The create action slot.
 */
function rejectedSettingsField(status: LobbyActionStatus): string | null {
    if (status.error === null || status.error.detail === null) {
        return null;
    }
    for (const key of Object.keys(status.error.detail)) {
        if (key.startsWith('settings.')) {
            return key;
        }
    }
    return null;
}

/** Props for {@link LobbyCreateForm}. */
export interface LobbyCreateFormProps {
    /**
     * Master disable (the caller disables creation while unnamed or
     * while any seat-granting action is in flight — FR-010's
     * one-seat-per-identity discipline starts client-side).
     */
    readonly disabled: boolean;
    /** The store's `createMatch` action slot (loading/error tracking). */
    readonly actionStatus: LobbyActionStatus;
    /** Submit the chosen settings; the caller binds the controller command. */
    readonly onCreate: (values: LobbyCreateFormValues) => void;
}

/**
 * The create-public-match card: three fields + submit, with
 * field-specific server feedback.
 */
export function LobbyCreateForm({ disabled, actionStatus, onCreate }: LobbyCreateFormProps): JSX.Element {
    const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(2);
    const [boardSize, setBoardSize] = useState<number>(32);
    const [citiesPerPlayer, setCitiesPerPlayer] = useState<number>(1);

    const headingId = useId();
    const countFieldName = useId();
    const boardFieldName = useId();
    const citiesFieldName = useId();
    const formErrorId = useId();

    const creating = actionStatus.phase === 'loading';
    const busy = disabled || creating;

    const rejectedField = rejectedSettingsField(actionStatus);
    const formError =
        actionStatus.error !== null && rejectedField === null ? describeActionError(actionStatus.error) : null;

    /** Assemble the values and hand them to the caller. */
    function submit(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault();
        onCreate({ playerCount, boardSize, citiesPerPlayer });
    }

    return (
        <section className="europa-lobby__card" aria-labelledby={headingId}>
            <h2 id={headingId} className="europa-lobby__card-title">
                Create a match
            </h2>
            <form className="europa-lobby__form" onSubmit={submit}>
                <fieldset className="europa-lobby__fieldset" disabled={busy}>
                    <legend className="europa-lobby__field-label" id={countFieldName}>
                        Players
                    </legend>
                    <div className="europa-lobby__radio-row" role="radiogroup" aria-labelledby={countFieldName}>
                        {CREATE_PLAYER_COUNTS.map((count) => (
                            <label key={count} className="europa-lobby__radio">
                                <input
                                    type="radio"
                                    name="playerCount"
                                    value={count}
                                    checked={playerCount === count}
                                    onChange={() => {
                                        setPlayerCount(count);
                                    }}
                                />
                                {String(count)}
                            </label>
                        ))}
                    </div>
                    {/* Field-specific rejection line (US3 AC-4): shown only
              when the server named THIS field in `detail`. */}
                    {actionStatus.error !== null && rejectedField === 'settings.playerCount' ? (
                        <p className="europa-lobby__error" role="alert">
                            {describeActionError(actionStatus.error)}
                        </p>
                    ) : null}
                </fieldset>
                <div className="europa-lobby__field">
                    <label className="europa-lobby__field-label" htmlFor={boardFieldName}>
                        Board size
                    </label>
                    <select
                        id={boardFieldName}
                        className="europa-lobby__input europa-focus-ring"
                        value={boardSize}
                        onChange={(event) => {
                            setBoardSize(Number(event.target.value));
                        }}
                        disabled={busy}
                    >
                        {CREATE_BOARD_SIZES.map((size) => (
                            <option key={size} value={size}>
                                {`${String(size)} × ${String(size)}`}
                            </option>
                        ))}
                    </select>
                    {actionStatus.error !== null && rejectedField === 'settings.boardSize' ? (
                        <p className="europa-lobby__error" role="alert">
                            {describeActionError(actionStatus.error)}
                        </p>
                    ) : null}
                </div>
                <div className="europa-lobby__field">
                    <label className="europa-lobby__field-label" htmlFor={citiesFieldName}>
                        Cities per player
                    </label>
                    <select
                        id={citiesFieldName}
                        className="europa-lobby__input europa-focus-ring"
                        value={citiesPerPlayer}
                        onChange={(event) => {
                            setCitiesPerPlayer(Number(event.target.value));
                        }}
                        disabled={busy}
                    >
                        {CREATE_CITIES_OPTIONS.map((count) => (
                            <option key={count} value={count}>
                                {String(count)}
                            </option>
                        ))}
                    </select>
                </div>
                {/* Form-level fallback for codes without field specifics. */}
                {formError !== null ? (
                    <p className="europa-lobby__error" id={formErrorId} role="alert">
                        {formError}
                    </p>
                ) : null}
                <button type="submit" className="europa-lobby__button europa-focus-ring" disabled={busy}>
                    {creating ? 'Creating…' : 'Create match'}
                </button>
            </form>
        </section>
    );
}
