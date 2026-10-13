export interface AttritionInput {
    /** 1-based dense owner byte of the attacking side. */
    readonly attackerOwner: number;
    readonly attackerTotal: number;
    /** 1-based dense owner byte of the defending side. */
    readonly defenderOwner: number;
    readonly defenderTotal: number;
    readonly cellCapacity: number;
}

export interface AttritionOutcome {
    /** Surviving owner byte; `0` means mutual annihilation (tie). */
    readonly winnerOwner: number;
    readonly winnerCount: number;
    /** Losses suffered by both sides. */
    readonly damage: number;
}

export function resolveTwoWayAttrition(input: AttritionInput): AttritionOutcome {
    const { attackerOwner, attackerTotal, defenderOwner, defenderTotal, cellCapacity } = input;

    const damage = Math.min(attackerTotal, defenderTotal) >>> 0;

    const attackerRemaining = (attackerTotal - damage) >>> 0;
    const defenderRemaining = (defenderTotal - damage) >>> 0;

    if (attackerRemaining > defenderRemaining) {
        return {
            winnerOwner: attackerOwner,
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
    // Tie: equal remnants annihilate both sides, leaving an empty neutral cell.
    return { winnerOwner: 0, winnerCount: 0, damage };
}
