import { getItem } from "./items";
import { BACKPACK_SIZE, rollShop } from "./shop";
import type { RunState, Side } from "./types";

export const START_GOLD = 10;
export const START_LIVES = 3;
export const WINS_TO_VICTORY = 5;
export const GOLD_PER_ROUND = 5;
export const REROLL_COST = 1;

/** B7: `id` identifies the run in the hall of fame; the default is derived from the seed (handy in tests). */
export function newRun(seed: number, id = `run-${seed.toString(36).padStart(8, "0")}`): RunState {
  const roll = rollShop(seed);
  return {
    id,
    round: 1,
    gold: START_GOLD,
    lives: START_LIVES,
    wins: 0,
    seed: roll.seed,
    shop: roll.offers,
    backpack: Array(BACKPACK_SIZE).fill(null),
    nextUid: 1,
  };
}

export function firstFreeSlot(state: RunState): number {
  return state.backpack.indexOf(null);
}

/** Why an offer can't be bought right now, or `null` if it can. */
export function buyBlocker(state: RunState, offerIndex: number): string | null {
  const itemId = state.shop[offerIndex];
  if (!itemId) return "Already sold";
  if (firstFreeSlot(state) === -1) return "Backpack full";
  if (state.gold < getItem(itemId).price) return "Not enough gold";
  return null;
}

/** Buys a shop offer into the first free backpack slot; unchanged state if not allowed. */
export function buyItem(state: RunState, offerIndex: number): RunState {
  if (buyBlocker(state, offerIndex) !== null) return state;
  const itemId = state.shop[offerIndex]!;
  const slot = firstFreeSlot(state);
  const backpack = [...state.backpack];
  backpack[slot] = { uid: `item-${state.nextUid}`, itemId };
  const shop = [...state.shop];
  shop[offerIndex] = null;
  return { ...state, gold: state.gold - getItem(itemId).price, shop, backpack, nextUid: state.nextUid + 1 };
}

/** Gold received for selling an item: half its price, rounded down. */
export const sellValue = (itemId: string) => Math.floor(getItem(itemId).price / 2);

/** Why the item in `slot` can't be sold right now, or `null` if it can. */
export function sellBlocker(state: RunState, slot: number): string | null {
  if (!state.backpack[slot]) return "Empty slot";
  return null;
}

/** Sells the item in `slot` for `sellValue`; unchanged state if not allowed. */
export function sellItem(state: RunState, slot: number): RunState {
  if (sellBlocker(state, slot) !== null) return state;
  const item = state.backpack[slot]!;
  const backpack = [...state.backpack];
  backpack[slot] = null;
  return { ...state, gold: state.gold + sellValue(item.itemId), backpack };
}

/** Why the shop can't be rerolled right now, or `null` if it can. */
export function rerollBlocker(state: RunState): string | null {
  if (state.gold < REROLL_COST) return "Not enough gold";
  return null;
}

/** Replaces all offers with a new seeded roll for `REROLL_COST`; unchanged state if not allowed. */
export function rerollShop(state: RunState): RunState {
  if (rerollBlocker(state) !== null) return state;
  const roll = rollShop(state.seed);
  return { ...state, gold: state.gold - REROLL_COST, seed: roll.seed, shop: roll.offers };
}

export type RunOutcome = "victory" | "defeat";

/** `victory` / `defeat` once the run is over, otherwise `null`. */
export function runOutcome(state: RunState): RunOutcome | null {
  if (state.wins >= WINS_TO_VICTORY) return "victory";
  if (state.lives <= 0) return "defeat";
  return null;
}

/** Starts the next round: round + 1, round gold, fresh shop. The backpack is kept. */
export function startNextRound(state: RunState): RunState {
  const roll = rollShop(state.seed);
  return { ...state, round: state.round + 1, gold: state.gold + GOLD_PER_ROUND, seed: roll.seed, shop: roll.offers };
}

/** Records a battle (win → +1 win, loss → −1 life) and moves on to the next round unless the run is over. */
export function applyBattleResult(state: RunState, winner: Side): RunState {
  const scored = winner === "player" ? { ...state, wins: state.wins + 1 } : { ...state, lives: state.lives - 1 };
  return runOutcome(scored) ? scored : startNextRound(scored);
}

/** ------------- B2 IMPLEMENTATION ------------- */

const isSlot = (slot: number) => Number.isInteger(slot) && slot >= 0 && slot < BACKPACK_SIZE;

/** Why the item in `from` can't be moved to `to` right now, or `null` if it can. */
export function moveBlocker(state: RunState, from: number, to: number): string | null {
  if (!isSlot(from) || !isSlot(to)) return "Not a backpack slot";
  if (!state.backpack[from]) return "Nothing to move";
  if (from === to) return "Already in this slot";
  return null;
}

/** Moves the item in `from` to `to`; an item already in `to` swaps into `from`. Unchanged state if not allowed. */
export function moveItem(state: RunState, from: number, to: number): RunState {
  if (moveBlocker(state, from, to) !== null) return state;
  const backpack = [...state.backpack];
  [backpack[from], backpack[to]] = [backpack[to], backpack[from]];
  return { ...state, backpack };
}
