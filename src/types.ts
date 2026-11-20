export interface ItemEffects {
  damage?: number;
  block?: number;
  /** B3: poison stacks added to the enemy. */
  poison?: number;
  /** B3: HP the fighter restores for itself (never above max HP). */
  heal?: number;
  /** B4: burn stacks added to the enemy. Only granted by the active Fire set bonus. */
  burn?: number;
}

/** B4: the item sets. */
export type SetId = "fire" | "nature";

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  price: number;
  /** Cooldown in battle ticks (1 tick = 0.5 s). */
  cooldown: number;
  effects: ItemEffects;
  /** B4: the set this item belongs to, if any. */
  set?: SetId;
}

/** A concrete item the player owns; several instances may share one `itemId`. */
export interface ItemInstance {
  uid: string;
  itemId: string;
}

/** Fixed-size grid, row by row; `null` marks a free slot. */
export type Backpack = (ItemInstance | null)[];

/** Shop offers by item id; `null` marks an offer that was already bought. */
export type ShopOffers = (string | null)[];

export type Phase = "shop" | "searching" | "battle" | "finished";

export interface RunState {
  round: number;
  gold: number;
  lives: number;
  wins: number;
  /** Seed for the next shop roll — keeps every shop deterministic. */
  seed: number;
  shop: ShopOffers;
  backpack: Backpack;
  /** Counter for generating unique `ItemInstance.uid`s. */
  nextUid: number;
}

export interface Opponent {
  id: string;
  name: string;
  icon: string;
  hp: number;
  round: number;
  items: string[];
}

export type Side = "player" | "opponent";

export interface FighterSnapshot {
  hp: number;
  maxHp: number;
  block: number;
  /** B3: current poison stacks. */
  poison: number;
  /** B4: current burn stacks. */
  burn: number;
}

/**
 * "poison" / "burn" = stacks applied by an item,
 * "poisonTick" / "burnTick" = the status dealing its damage.
 */
export type BattleEventKind = "damage" | "block" | "heal" | "poison" | "poisonTick" | "burn" | "burnTick";

export interface BattleEvent {
  tick: number;
  /** Who caused the event. */
  source: Side;
  /** Who is affected by it. */
  target: Side;
  kind: BattleEventKind;
  amount: number;
  /** Item that triggered the event; missing for status ticks (poison/burn damage). */
  itemId?: string;
  message: string;
}

export interface BattleFrame {
  tick: number;
  player: FighterSnapshot;
  opponent: FighterSnapshot;
  /** Events that happened during this tick. */
  events: BattleEvent[];
}

export interface BattleResult {
  winner: Side;
  reason: "knockout" | "timeout";
  frames: BattleFrame[];
  events: BattleEvent[];
}

/** An item as it fights: the catalog values it brings into battle. */
export interface FighterItem {
  itemId: string;
  name: string;
  icon: string;
  cooldown: number;
  effects: ItemEffects;
  set?: SetId;
}

/** Everything `simulateBattle` needs to know about one side. */
export interface Fighter {
  name: string;
  maxHp: number;
  items: FighterItem[];
  /** B4: sets with enough items for their bonus. */
  activeSets: SetId[];
}

/** A simulated battle being replayed frame by frame. */
export interface BattleReplay {
  opponent: Opponent;
  player: Fighter;
  enemy: Fighter;
  result: BattleResult;
  /** Index into `result.frames` that is currently shown. */
  frame: number;
}

/** The opponent search that is currently running. */
export interface ActiveSearch {
  /** Unique per search: responses carrying another id are stale and ignored. */
  id: string;
  /** The round the search was started for. */
  round: number;
}

/** Everything the UI needs: the run plus where in the round loop we are. */
export interface GameState {
  phase: Phase;
  run: RunState;
  /** Set while `phase === "searching"`, otherwise `null`. */
  search: ActiveSearch | null;
  /** Set while `phase === "battle"`. */
  battle: BattleReplay | null;
  /** Last opponent-search error, shown in the shop. */
  error: string | null;
}
