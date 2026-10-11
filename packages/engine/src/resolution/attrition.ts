/**
 * Shared two-way attrition helper — spec 001, Clarifications v1.16
 * (issues #132/#136; FR-008 two-way core + FR-013 landing attacks).
 *
 * Pure `resolveTwoWayAttrition(input): AttritionOutcome`.
 *
 * The 1:1 attrition math for a two-sided fight exists in exactly one
 * place so the combat phase (`resolveCombat`) and the paratroop
 * enemy-landing branch (`resolveParatroop`) can never drift apart:
 *
 *   - `damage = min(attackerTotal, defenderTotal)` — every troop on the
 *     losing side (and an equal number on the winning side) is destroyed.
 *   - The side with the higher total survives with the difference,
 *     clamped to `cellCapacity` (FR-011 / Clarifications v1.5).
 *   - Equal remnants annihilate: `winnerOwner = 0` (mutual destruction —
 *     the combat model's tie semantics).
 *
 * **Roles-agnostic by design**: callers identify their own attacker and
 * defender (flow combat uses "garrison owner is defender", spec v1.4;
 * a paratroop landing always treats the landing player as attacker,
 * spec v1.16). The helper carries neither convention — only the math.
 *
 * **Determinism** (FR-017): integer-only (`Math.min`, `>>> 0`); no RNG,
 * no wall-clock; allocates nothing beyond the return object (SC-006).
 */

/** Inputs to a two-sided attrition resolution. */
export interface AttritionInput {
    /** 1-based dense owner byte of the attacking side. */
    readonly attackerOwner: number;
    /** Pre-attrition total force of the attacking side (int ≥ 0). */
    readonly attackerTotal: number;
    /** 1-based dense owner byte of the defending side. */
    readonly defenderOwner: number;
    /** Pre-attrition total force of the defending side (int ≥ 0). */
    readonly defenderTotal: number;
    /** `ENGINE_CONSTANTS.cellCapacity` — the surviving force is clamped to it (FR-011). */
    readonly cellCapacity: number;
}

/** Outcome of a two-sided attrition resolution. */
export interface AttritionOutcome {
    /** Surviving owner byte; `0` means mutual annihilation (tie). */
    readonly winnerOwner: number;
    /** Surviving force, clamped to `cellCapacity` (FR-011, v1.5). */
    readonly winnerCount: number;
    /** Losses suffered by BOTH sides: `min(attackerTotal, defenderTotal)`. */
    readonly damage: number;
}

/**
 * Resolve 1:1 attrition between two total forces. Pure.
 *
 * @param input Attacker/defender owner bytes and pre-attrition totals,
 *              plus the cell capacity used to clamp the winner.
 * @returns The surviving owner (`0` on tie), the surviving count
 *          (clamped to `cellCapacity`), and the damage both sides took.
 */
export function resolveTwoWayAttrition(input: AttritionInput): AttritionOutcome {
    const { attackerOwner, attackerTotal, defenderOwner, defenderTotal, cellCapacity } = input;

    const damage = Math.min(attackerTotal, defenderTotal) >>> 0;

    // Remaining troops after 1:1 attrition (unsigned: totals are ≥ 0).
    const attackerRemaining = (attackerTotal - damage) >>> 0;
    const defenderRemaining = (defenderTotal - damage) >>> 0;

    if (attackerRemaining > defenderRemaining) {
        return {
            winnerOwner: attackerOwner,
            // Clamp so the winner never exceeds the cell's capacity (FR-011).
            winnerCount: Math.min(attackerRemaining, cellCapacity),
            damage,
        };
    }
    if (defenderRemaining > attackerRemaining) {
        return {
            winnerOwner: defenderOwner,
            winnerCount: Math.min(defenderRemaining, cellCapacity),
            damage,
        };
    }
    // Equal remnants → mutual annihilation (count 0, owner 0).
    return { winnerOwner: 0, winnerCount: 0, damage };
}
