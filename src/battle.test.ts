import { describe, expect, it } from "vitest";
import { POISON_DAMAGE_PER_STACK, POISON_INTERVAL, simulateBattle } from "./battle";
import { CATALOG } from "./items";
import type { Fighter } from "./types";

/** A fighter with hand-made items, so every test controls exactly what happens. */
function fighter(items: Fighter["items"], maxHp = 100): Fighter {
    return { name: "Test", maxHp, items };
}

const item = (effects: Fighter["items"][number]["effects"], cooldown = 1) => ({
    itemId: "chipped-dagger", // only used for the icon in the log
    name: "Test item",
    icon: "?",
    cooldown,
    effects,
});

/** A target fighter: by default without items, so it only takes hits. */
const dummy = (maxHp = 100, items: Fighter["items"] = []) => fighter(items, maxHp);

/* ------------- B3 TESTS ------------- */

describe("poison", () => {
    it("stacks up and deals damage per stack every POISON_INTERVAL ticks", () => {
        // Adds 1 poison every tick.
        const result = simulateBattle(fighter([item({ poison: 1 })]), dummy());
        const ticks = result.events.filter((e) => e.kind === "poisonTick");
        expect(ticks[0].tick).toBe(POISON_INTERVAL);
        // At tick 2 there are 2 stacks, at tick 4 there are 4 stacks.
        expect(ticks[0].amount).toBe(2 * POISON_DAMAGE_PER_STACK);
        expect(ticks[1].amount).toBe(4 * POISON_DAMAGE_PER_STACK);
        expect(result.frames[2].opponent.poison).toBe(2);
    });

    it("ignores block", () => {
        const poisoner = fighter([item({ poison: 3 }, 2)]);
        const blocker = dummy(100, [item({ block: 50 }, 1)]);
        const result = simulateBattle(poisoner, blocker);
        // Tick 2: poison 3 applied, then the poison tick deals 3 although the target has block.
        const frame = result.frames[2];
        expect(frame.opponent.hp).toBe(100 - 3);
        expect(frame.opponent.block).toBe(100); // 2 × 50, untouched by poison
    });
});

describe("heal", () => {
    it("restores HP but never above max HP", () => {
        // Opponent hits for 5 every 2 ticks, player heals 3 every tick.
        const result = simulateBattle(fighter([item({ heal: 3 })], 20), dummy(100, [item({ damage: 5 }, 2)]));
        for (const frame of result.frames) expect(frame.player.hp).toBeLessThanOrEqual(20);
        const heals = result.events.filter((e) => e.kind === "heal");
        expect(heals[0].amount).toBe(0); // tick 1: already at full HP
        expect(heals.some((e) => e.amount === 3)).toBe(true);
    });

    it("is deterministic: the same fighters give the same battle", () => {
        const a = fighter([item({ heal: 2, damage: 1 }, 3), item({ poison: 1 }, 4)]);
        const b = fighter([item({ damage: 4 }, 2)]);
        expect(simulateBattle(a, b)).toEqual(simulateBattle(a, b));
    });
});

describe("catalog", () => {
    it("has at least 3 items per new effect", () => {
        expect(CATALOG.filter((i) => i.effects.poison).length).toBeGreaterThanOrEqual(3);
        expect(CATALOG.filter((i) => i.effects.heal).length).toBeGreaterThanOrEqual(3);
    });
});