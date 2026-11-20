import { describe, expect, it } from "vitest";
import {
    BURN_DAMAGE_PER_STACK,
    BURN_INTERVAL,
    buildFighter,
    POISON_DAMAGE_PER_STACK,
    POISON_INTERVAL,
    simulateBattle,
} from "./battle";
import { CATALOG } from "./items";
import { activeSets, countSets, FIRE_BURN_PER_HIT, NATURE_BONUS_HP } from "./sets";
import type { Fighter } from "./types";

/** A fighter with hand-made items, so every test controls exactly what happens. */
function fighter(items: Fighter["items"], maxHp = 100): Fighter {
    return { name: "Test", maxHp, items, activeSets: [] };
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

    it("has at least 2 sets with at least 3 items each, one of them Fire", () => {
        const counts = countSets(CATALOG.map((i) => i.id));
        expect(counts.fire).toBeGreaterThanOrEqual(3);
        expect(counts.nature).toBeGreaterThanOrEqual(3);
    });
});

/* ------------- B4 TESTS ------------- */

describe("sets", () => {
    it("are active with 2 or more items of the set", () => {
        expect(activeSets(["ember-torch"])).toEqual([]);
        expect(activeSets(["ember-torch", "hunting-bow"])).toEqual(["fire"]);
        expect(activeSets(["ember-torch", "ember-torch"])).toEqual(["fire"]); // duplicates count
        expect(activeSets(["red-apple", "healing-salve", "ember-torch"])).toEqual(["nature"]);
    });

    it("Fire gives Fire items burn, but only while active", () => {
        const off = buildFighter(["ember-torch", "chipped-dagger"], 40);
        expect(off.items[0].effects.burn).toBeUndefined();
        const on = buildFighter(["ember-torch", "flame-wand", "chipped-dagger"], 40);
        expect(on.items[0].effects.burn).toBe(FIRE_BURN_PER_HIT);
        expect(on.items[1].effects.burn).toBe(FIRE_BURN_PER_HIT);
        expect(on.items[2].effects.burn).toBeUndefined(); // dagger is not a Fire item
    });

    it("Nature gives extra max HP", () => {
        expect(buildFighter(["red-apple", "venom-vial"], 40).maxHp).toBe(40 + NATURE_BONUS_HP);
        expect(buildFighter(["red-apple"], 40).maxHp).toBe(40);
    });

    it("work for opponents the same way (same buildFighter)", () => {
        expect(buildFighter(["ember-torch", "hunting-bow"], 50, "Ash Golem").activeSets).toEqual(["fire"]);
    });
});

/** Cooldown 31 fires exactly once in a 60-tick battle: at tick 31 (an odd tick, before a status tick). */
const ONCE = 31;

describe("burn", () => {
    it("is absorbed by block first", () => {
        const burner = fighter([item({ burn: 10 }, ONCE)]);
        const target = dummy(100, [item({ block: 5 }, ONCE)]);
        const result = simulateBattle(burner, target);
        // Tick 31: 10 burn and 5 block. Tick 32: burn deals 10 × dmg, 5 of it is blocked.
        const damage = 10 * BURN_DAMAGE_PER_STACK;
        const tick = result.events.find((e) => e.kind === "burnTick")!;
        expect(tick.tick).toBe(ONCE + 1);
        expect(tick.amount).toBe(damage);
        expect(result.frames[ONCE + 1].opponent.block).toBe(0);
        expect(result.frames[ONCE + 1].opponent.hp).toBe(100 - (damage - 5));
    });

    it("decays (halves after every burn tick) until it wears off", () => {
        const result = simulateBattle(fighter([item({ burn: 8 }, ONCE)]), dummy(1000));
        const burnAt = (tick: number) => result.frames[tick].opponent.burn;
        expect(burnAt(ONCE)).toBe(8);
        expect(burnAt(ONCE + 1)).toBe(4);
        expect(burnAt(ONCE + 3)).toBe(2);
        expect(burnAt(ONCE + 5)).toBe(1);
        expect(burnAt(ONCE + 7)).toBe(0);
        expect(result.frames.at(-1)!.opponent.burn).toBe(0);
        expect(BURN_INTERVAL).toBe(2); // the expectations above assume a burn tick every 2 ticks
    });

    it("deals more damage per stack than poison", () => {
        expect(BURN_DAMAGE_PER_STACK).toBeGreaterThan(POISON_DAMAGE_PER_STACK);
    });
});