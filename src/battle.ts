import { getItem } from "./items";
import { FIRE_BURN_PER_HIT, NATURE_BONUS_HP, activeSets } from "./sets";
import { itemIdsOf } from "./shop";
import type { Backpack, BattleEvent, BattleResult, Fighter, FighterItem, FighterSnapshot, Opponent, Side } from "./types";

/** Seconds per battle tick. */
export const TICK_SECONDS = 0.5;
/** Battles that last longer are decided by the timeout rule. */
export const MAX_TICKS = 60;
export const HERO_BASE_HP = 40;

/* ------------- B3: poison -------------
 * Every POISON_INTERVAL ticks a poisoned fighter loses POISON_DAMAGE_PER_STACK HP per stack.
 * Poison ignores block and never wears off.
 */
export const POISON_INTERVAL = 2;
export const POISON_DAMAGE_PER_STACK = 1;

/* ------------- B4: burn -------------
 * Every BURN_INTERVAL ticks a burning fighter takes BURN_DAMAGE_PER_STACK damage per stack.
 * Block absorbs it first. Afterwards half of the stacks wear off (rounded down) until none are left.
 * Compared to poison: twice the damage per stack, and every Fire item adds FIRE_BURN_PER_HIT
 * stacks on top of its normal hit (stacks faster) — but block absorbs it and it decays.
 */
export const BURN_INTERVAL = 2;
export const BURN_DAMAGE_PER_STACK = 2;

/**
 * Turns a list of item ids into a fighter with the catalog values of each item.
 * B4: set bonuses are applied here, so they work the same for the player and for opponents.
 */
export function buildFighter(itemIds: string[], baseHp: number, name = "Fighter"): Fighter {
  const sets = activeSets(itemIds);
  const fireActive = sets.includes("fire");
  const items: FighterItem[] = itemIds.map((id) => {
    const def = getItem(id);
    const effects = { ...def.effects };
    // Fire bonus: every Fire item additionally applies burn.
    if (fireActive && def.set === "fire") effects.burn = (effects.burn ?? 0) + FIRE_BURN_PER_HIT;
    return { itemId: def.id, name: def.name, icon: def.icon, cooldown: def.cooldown, effects, set: def.set };
  });
  // Nature bonus: more max HP.
  const maxHp = baseHp + (sets.includes("nature") ? NATURE_BONUS_HP : 0);
  return { name, maxHp, items, activeSets: sets };
}

/** The player's fighter: every backpack item and the hero's base HP. */
export function buildPlayerFighter(backpack: Backpack): Fighter {
  return buildFighter(itemIdsOf(backpack), HERO_BASE_HP, "Hero");
}

export function buildOpponentFighter(opponent: Opponent): Fighter {
  return buildFighter(opponent.items, opponent.hp, opponent.name);
}

interface FighterState {
  fighter: Fighter;
  hp: number;
  block: number;
  poison: number;
  burn: number;
  /** Ticks each item has charged towards its cooldown. */
  charge: number[];
}

const other = (side: Side): Side => (side === "player" ? "opponent" : "player");

const snapshot = (s: FighterState): FighterSnapshot => ({
  hp: Math.max(0, s.hp),
  maxHp: s.fighter.maxHp,
  block: s.block,
  poison: s.poison,
  burn: s.burn,
});

const isDown = (s: FighterState) => s.hp <= 0;

/**
 * Runs a full battle. Pure and deterministic: the same fighters always give
 * the same result.
 *
 * Each tick:
 * 1. Each fighter charges all items by one tick; items whose charge reaches their cooldown fire.
 * 2. Fired items resolve (player first, then opponent). Both sides fire "simultaneously":
 *    which items fire is decided before any effect is applied.
 * 3. B3/B4: status effects deal their damage (burn every BURN_INTERVAL ticks, poison every
 *    POISON_INTERVAL ticks), player first, then opponent.
 * After step 3 the battle ends if someone is down; if both are down, the player loses.
 * After `MAX_TICKS` the higher HP percentage wins; a tie is a player loss.
 */
export function simulateBattle(player: Fighter, opponent: Fighter): BattleResult {
  const state: Record<Side, FighterState> = {
    player: initState(player),
    opponent: initState(opponent),
  };
  const frames: BattleResult["frames"] = [
    { tick: 0, player: snapshot(state.player), opponent: snapshot(state.opponent), events: [] },
  ];
  const events: BattleEvent[] = [];

  const knockoutWinner = (): Side | null => {
    if (isDown(state.player)) return "opponent";
    if (isDown(state.opponent)) return "player";
    return null;
  };

  let winner: Side | null = null;
  let tick = 0;
  while (winner === null && tick < MAX_TICKS) {
    tick += 1;
    const tickEvents: BattleEvent[] = [];
    const emit = (event: Omit<BattleEvent, "tick">) => tickEvents.push({ tick, ...event });

    const fired: Record<Side, FighterItem[]> = {
      player: chargeItems(state.player),
      opponent: chargeItems(state.opponent),
    };
    for (const side of ["player", "opponent"] as const) {
      for (const item of fired[side]) resolveItem(item, state[side], state[other(side)], side, emit);
    }
    // B3/B4: status effects come after all items of this tick.
    for (const side of ["player", "opponent"] as const) {
      applyStatus(tick, state[side], side, emit);
    }
    winner = knockoutWinner();

    frames.push({ tick, player: snapshot(state.player), opponent: snapshot(state.opponent), events: tickEvents });
    events.push(...tickEvents);
  }

  if (winner !== null) return { winner, reason: "knockout", frames, events };
  return { winner: timeoutWinner(state.player, state.opponent), reason: "timeout", frames, events };
}

function initState(fighter: Fighter): FighterState {
  return { fighter, hp: fighter.maxHp, block: 0, poison: 0, burn: 0, charge: fighter.items.map(() => 0) };
}

/** Advances one tick of cooldowns and returns the items that fire this tick. */
function chargeItems(s: FighterState): FighterItem[] {
  const fired: FighterItem[] = [];
  s.fighter.items.forEach((item, i) => {
    s.charge[i] += 1;
    if (s.charge[i] >= item.cooldown) {
      s.charge[i] = 0;
      fired.push(item);
    }
  });
  return fired;
}

function resolveItem(
    item: FighterItem,
    self: FighterState,
    enemy: FighterState,
    side: Side,
    emit: (event: Omit<BattleEvent, "tick">) => void,
) {
  const { damage, block, poison, heal, burn } = item.effects;
  const base = { source: side, itemId: item.itemId };
  const enemySide = other(side);

  if (damage) {
    const absorbed = Math.min(enemy.block, damage);
    enemy.block -= absorbed;
    enemy.hp -= damage - absorbed;
    const note = absorbed > 0 ? ` (${absorbed} blocked)` : "";
    emit({ ...base, target: enemySide, kind: "damage", amount: damage, message: `${item.name} hits ${enemy.fighter.name} for ${damage}${note}` });
  }
  if (block) {
    self.block += block;
    emit({ ...base, target: side, kind: "block", amount: block, message: `${item.name} grants ${self.fighter.name} ${block} block` });
  }
  // B3: poison stacks on the enemy.
  if (poison) {
    enemy.poison += poison;
    emit({ ...base, target: enemySide, kind: "poison", amount: poison, message: `${item.name} poisons ${enemy.fighter.name} (+${poison}, now ${enemy.poison})` });
  }
  // B3: heal never goes above max HP, and a knocked-out fighter can't heal back up.
  if (heal && self.hp > 0) {
    const healed = Math.min(heal, self.fighter.maxHp - self.hp);
    self.hp += healed;
    const note = healed < heal ? ` (max HP reached)` : "";
    emit({ ...base, target: side, kind: "heal", amount: healed, message: `${item.name} heals ${self.fighter.name} for ${healed}${note}` });
  }
  // B4: burn stacks on the enemy (only from the Fire set bonus).
  if (burn) {
    enemy.burn += burn;
    emit({ ...base, target: enemySide, kind: "burn", amount: burn, message: `${item.name} sets ${enemy.fighter.name} on fire (+${burn} burn, now ${enemy.burn})` });
  }
}

/** B3/B4: lets burn and poison deal their damage to `self` (the fighter carrying the status). */
function applyStatus(tick: number, self: FighterState, side: Side, emit: (event: Omit<BattleEvent, "tick">) => void) {
  // The "source" of a status tick is the enemy who applied it, so the log shows it on their side.
  const base = { source: other(side), target: side };

  if (self.burn > 0 && tick % BURN_INTERVAL === 0) {
    const damage = self.burn * BURN_DAMAGE_PER_STACK;
    const absorbed = Math.min(self.block, damage);
    self.block -= absorbed;
    self.hp -= damage - absorbed;
    self.burn = Math.floor(self.burn / 2); // decay: half the stacks wear off (rounded down)
    const note = absorbed > 0 ? ` (${absorbed} blocked)` : "";
    emit({ ...base, kind: "burnTick", amount: damage, message: `Burn scorches ${self.fighter.name} for ${damage}${note}, ${self.burn} left` });
  }

  if (self.poison > 0 && tick % POISON_INTERVAL === 0) {
    const damage = self.poison * POISON_DAMAGE_PER_STACK;
    self.hp -= damage; // ignores block
    emit({ ...base, kind: "poisonTick", amount: damage, message: `Poison eats ${damage} HP of ${self.fighter.name}` });
  }
}

function timeoutWinner(player: FighterState, opponent: FighterState): Side {
  const ratio = (s: FighterState) => s.hp / s.fighter.maxHp;
  return ratio(player) > ratio(opponent) ? "player" : "opponent";
}
