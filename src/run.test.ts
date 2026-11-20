import { describe, expect, it } from "vitest";
import { newGame, updateRun } from "./game";
import { getItem } from "./items";
import {
  buyBlocker,
  buyItem,
  newRun,
  REROLL_COST,
  rerollBlocker,
  rerollShop,
  sellBlocker,
  sellItem,
  sellValue,
} from "./run";
import { BACKPACK_SIZE } from "./shop";
import type { RunState } from "./types";

const SEED = 12345;

/** A run with the given items in the first slots. */
function runWith(itemIds: string[], gold = 10): RunState {
  const run = newRun(SEED);
  const backpack = [...run.backpack];
  itemIds.forEach((itemId, i) => (backpack[i] = { uid: `test-${i}`, itemId }));
  return { ...run, gold, backpack, nextUid: itemIds.length + 1 };
}

/** Total of items owned: catches items being lost or duplicated. */
const itemCount = (run: RunState) => run.backpack.filter(Boolean).length;

describe("sellValue", () => {
  it("is half the price, rounded down", () => {
    expect(sellValue("iron-cleaver")).toBe(Math.floor(getItem("iron-cleaver").price / 2));
    expect(sellValue("iron-cleaver")).toBe(2); // 5 → 2
    expect(sellValue("hunting-bow")).toBe(2); // 4 → 2
    expect(sellValue("pot-lid")).toBe(1); // 2 → 1
  });
});

describe("sellItem", () => {
  it("removes the item and adds its sell value", () => {
    const run = runWith(["iron-cleaver", "pot-lid"], 3);
    const sold = sellItem(run, 0);
    expect(sold.backpack[0]).toBeNull();
    expect(sold.backpack[1]).toEqual(run.backpack[1]);
    expect(sold.gold).toBe(3 + 2);
    expect(itemCount(sold)).toBe(1);
  });

  it("changes nothing for an empty slot", () => {
    const run = runWith(["pot-lid"]);
    expect(sellBlocker(run, 3)).toBe("Empty slot");
    expect(sellItem(run, 3)).toBe(run);
  });

  it("changes nothing for a slot outside the backpack", () => {
    const run = runWith(["pot-lid"]);
    expect(sellItem(run, -1)).toBe(run);
    expect(sellItem(run, BACKPACK_SIZE)).toBe(run);
  });

  it("can't sell the same item twice", () => {
    const once = sellItem(runWith(["iron-cleaver"], 0), 0);
    expect(sellItem(once, 0)).toBe(once);
    expect(once.gold).toBe(2);
  });
});

describe("rerollShop", () => {
  it("costs exactly the reroll price and advances the seed", () => {
    const run = runWith([], 5);
    const rerolled = rerollShop(run);
    expect(rerolled.gold).toBe(5 - REROLL_COST);
    expect(rerolled.seed).not.toBe(run.seed);
    expect(rerolled.shop).toHaveLength(run.shop.length);
    expect(rerolled.shop.every((id) => id !== null)).toBe(true);
  });

  it("is deterministic for the same seed", () => {
    const run = runWith([], 5);
    expect(rerollShop(run).shop).toEqual(rerollShop(run).shop);
  });

  it("refills sold offers", () => {
    const bought = buyItem(runWith([], 10), 0);
    expect(bought.shop[0]).toBeNull();
    expect(rerollShop(bought).shop[0]).not.toBeNull();
  });

  it("changes nothing without enough gold, so gold never goes negative", () => {
    const run = runWith([], 0);
    expect(rerollBlocker(run)).toBe("Not enough gold");
    expect(rerollShop(run)).toBe(run);
  });

  it("does not touch the backpack", () => {
    const run = runWith(["pot-lid", "hunting-bow"], 5);
    expect(rerollShop(run).backpack).toEqual(run.backpack);
  });
});

describe("buyItem", () => {
  it("moves the paid item into the backpack", () => {
    const run = runWith([], 100);
    const itemId = run.shop[0]!;
    const bought = buyItem(run, 0);
    expect(bought.gold).toBe(100 - getItem(itemId).price);
    expect(bought.backpack[0]?.itemId).toBe(itemId);
    expect(bought.shop[0]).toBeNull();
  });

  it("changes nothing when the backpack is full (no gold lost, no item lost)", () => {
    const run = runWith(Array(BACKPACK_SIZE).fill("pot-lid"), 100);
    expect(buyBlocker(run, 0)).toBe("Backpack full");
    expect(buyItem(run, 0)).toBe(run);
  });

  it("changes nothing without enough gold", () => {
    const run = runWith([], 0);
    expect(buyBlocker(run, 0)).toBe("Not enough gold");
    expect(buyItem(run, 0)).toBe(run);
  });

  it("buy then sell keeps exactly one item per purchase", () => {
    let run = runWith([], 100);
    run = buyItem(run, 0);
    run = buyItem(run, 1);
    expect(itemCount(run)).toBe(2);
    run = sellItem(run, 0);
    expect(itemCount(run)).toBe(1);
    run = buyItem(run, 2); // fills the freed slot
    expect(run.backpack[0]).not.toBeNull();
    expect(itemCount(run)).toBe(2);
  });
});

describe("shop actions outside the shop phase", () => {
  const game = { ...newGame(SEED), run: runWith(["iron-cleaver"], 10) };

  for (const phase of ["searching", "battle", "finished"] as const) {
    it(`are ignored while ${phase}`, () => {
      const locked = { ...game, phase };
      expect(updateRun(locked, (run) => sellItem(run, 0))).toBe(locked);
      expect(updateRun(locked, rerollShop)).toBe(locked);
      expect(updateRun(locked, (run) => buyItem(run, 0))).toBe(locked);
    });
  }

  it("are applied while shopping", () => {
    expect(updateRun(game, (run) => sellItem(run, 0)).run.gold).toBe(12);
  });
});