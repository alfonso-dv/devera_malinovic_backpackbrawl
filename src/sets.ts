import { getItem } from "./items";
import type { SetId } from "./types";

/* ------------- B4: item sets -------------
 * A set is active for a fighter while at least SET_THRESHOLD of its items are in
 * that fighter's backpack (duplicates count). The same rules apply to the player
 * and to opponents, because both are built with `buildFighter` in battle.ts.
 */

/** Items of one set needed for its bonus. */
export const SET_THRESHOLD = 2;

/** Burn stacks every Fire item adds to the enemy when it fires (while Fire is active). */
export const FIRE_BURN_PER_HIT = 2;

/** Extra max HP while Nature is active. */
export const NATURE_BONUS_HP = 10;

export interface SetDef {
    id: SetId;
    name: string;
    icon: string;
    /** Player-facing description of the bonus. */
    bonus: string;
}

export const SETS: Record<SetId, SetDef> = {
    fire: {
        id: "fire",
        name: "Fire",
        icon: "🔥",
        bonus: `Every Fire item also adds ${FIRE_BURN_PER_HIT} burn to the enemy when it fires.`,
    },
    nature: {
        id: "nature",
        name: "Nature",
        icon: "🌱",
        bonus: `+${NATURE_BONUS_HP} max HP for the whole battle.`,
    },
};

export const SET_IDS = Object.keys(SETS) as SetId[];

/** How many items of each set are in `itemIds`. */
export function countSets(itemIds: string[]): Record<SetId, number> {
    const counts = Object.fromEntries(SET_IDS.map((id) => [id, 0])) as Record<SetId, number>;
    for (const id of itemIds) {
        const set = getItem(id).set;
        if (set) counts[set] += 1;
    }
    return counts;
}

/** The sets whose bonus is active for these items. */
export function activeSets(itemIds: string[]): SetId[] {
    const counts = countSets(itemIds);
    return SET_IDS.filter((id) => counts[id] >= SET_THRESHOLD);
}