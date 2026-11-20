import {
  BURN_DAMAGE_PER_STACK,
  BURN_INTERVAL,
  HERO_BASE_HP,
  MAX_TICKS,
  POISON_DAMAGE_PER_STACK,
  POISON_INTERVAL,
  TICK_SECONDS,
} from "./battle";
import { GOLD_PER_ROUND, REROLL_COST, START_GOLD, START_LIVES, WINS_TO_VICTORY } from "./run";
import { FIRE_BURN_PER_HIT, SET_IDS, SET_THRESHOLD, SETS } from "./sets";
import { BACKPACK_COLS, BACKPACK_ROWS, SHOP_SIZE } from "./shop";
import type { ItemEffects } from "./types";

/**
 * Player-facing explanations of the rules. Built from the game constants so
 * the texts stay correct when numbers are rebalanced.
 */

const BATTLE_SECONDS = MAX_TICKS * TICK_SECONDS;

/** "every 1 s" / "every 0.5 s" for an interval in ticks. */
const every = (ticks: number) => `every ${ticks * TICK_SECONDS} s`;

const POISON_RULE = `Poison: ${every(POISON_INTERVAL)} a poisoned fighter loses ${POISON_DAMAGE_PER_STACK} HP per stack. Stacks add up, ignore block and never wear off.`;
const HEAL_RULE = "Heal: restores the fighter's own HP, never above max HP. A knocked-out fighter can't heal.";
const BURN_RULE = `Burn (Fire set): every Fire item adds ${FIRE_BURN_PER_HIT} stacks per hit. Then, ${every(BURN_INTERVAL)}, a burning fighter takes ${BURN_DAMAGE_PER_STACK} damage per stack (poison: ${POISON_DAMAGE_PER_STACK}). Block absorbs it first. Afterwards half of the stacks burn out (rounded down) until none are left.`;

/** Tooltip per item effect. */
export const EFFECT_HELP: Record<keyof ItemEffects, string> = {
  damage: "Damage: hits the enemy. Block absorbs it first, the rest is lost from HP.",
  block: "Block: absorbs incoming damage until used up. Unused block stays for the rest of the battle.",
  poison: POISON_RULE,
  heal: HEAL_RULE,
  burn: BURN_RULE,
};

export const COOLDOWN_HELP = `Cooldown: the item fires every time this much battle time has passed (1 tick = ${TICK_SECONDS} s).`;

/** Tooltip per fighter status shown in battle. */
export const STATUS_HELP = {
  hp: "HP: reaching 0 is a knockout.",
  block: EFFECT_HELP.block,
  poison: POISON_RULE,
  burn: BURN_RULE,
  timer: `After ${BATTLE_SECONDS} s the fighter with the higher share of HP wins; a tie counts as your loss.`,
};

export interface RuleSection {
  title: string;
  rules: string[];
}

export const RULES: RuleSection[] = [
  {
    title: "🏆 The run",
    rules: [
      `Reach ${WINS_TO_VICTORY} wins before you lose all ${START_LIVES} lives.`,
      `Each battle is one round: a win gives +1 win, a loss costs 1 life.`,
      `Opponents get tougher every round.`,
    ],
  },
  {
    title: "🏪 Shop & backpack",
    rules: [
      `You start with ${START_GOLD} 🪙 and earn ${GOLD_PER_ROUND} 🪙 at the start of every new round. Unspent gold carries over.`,
      `The shop offers ${SHOP_SIZE} new items every round. Reroll all offers for ${REROLL_COST} 🪙.`,
      `Bought items go to the first free slot of your ${BACKPACK_COLS}×${BACKPACK_ROWS} backpack. You can't buy when it is full.`,
      `To rearrange, click an item to select it, then click a highlighted slot. Moving onto another item swaps the two. Click the item again, press Esc or use Cancel to deselect.`,
      `Sell an item from your backpack for half its price, rounded down.`,
      `Gold never goes below 0: actions you can't afford are disabled and tell you why.`,
      `You can only buy, sell, reroll and move items while shopping, not while searching or fighting.`,
      `Only items in your backpack fight. Their position doesn't matter.`,
    ],
  },
  {
    title: "⚔️ Battle",
    rules: [
      `Find opponent looks for this round's challenger. Only one search runs at a time, and your shop and backpack are locked meanwhile.`,
      `If the search fails, you are back in the shop with an explanation and can simply try again. Nothing is lost.`,
      `Battles run on their own. Your hero has ${HERO_BASE_HP} HP; every item fires whenever its cooldown is up.`,
      `Damage hits block first; only the rest is lost from HP. Unused block stays for the rest of the battle.`,
      `Knock the enemy out to win. ${STATUS_HELP.timer} If both fall at once, you lose.`,
    ],
  },
  {
    title: "☠️ Status effects",
    rules: [
      POISON_RULE,
      HEAL_RULE,
      BURN_RULE,
      `Order in every tick: items fire first, then burn and poison deal their damage.`,
    ],
  },
  {
    title: "🧩 Item sets",
    rules: [
      `A set bonus is active while ${SET_THRESHOLD} or more items of that set are in a backpack. Duplicates count.`,
      ...SET_IDS.map((id) => `${SETS[id].icon} ${SETS[id].name}: ${SETS[id].bonus}`),
      `Opponents get set bonuses by the same rules.`,
    ],
  },
];
