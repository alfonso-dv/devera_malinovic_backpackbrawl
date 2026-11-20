import { isValidOpponent } from "./api";
import { buildOpponentFighter, buildPlayerFighter, simulateBattle } from "./battle";
import { skipReplay } from "./game";
import { isKnownItem } from "./items";
import { runOutcome, START_LIVES, WINS_TO_VICTORY } from "./run";
import { BACKPACK_SIZE, SHOP_SIZE } from "./shop";
import type { GameState, Opponent, Phase, RunState } from "./types";

/* ------------- B6: save & resume -------------
 *
 * What is saved: the run (round, gold, lives, wins, seed, shop, backpack, nextUid),
 * the phase and — during a battle — only the opponent. The battle itself is NOT saved:
 * it is simulated again from backpack + opponent, which gives exactly the same result
 * because the simulation is deterministic. So nobody can edit a saved battle result.
 *
 * Refresh policy:
 * - During a search: the request is lost. The game returns to the shop with a message
 *   and the player can search again. The shop, gold and backpack are unchanged
 *   (no free reroll), and the opponent per round is fixed by the server (no other opponent).
 * - During a battle replay: the battle is restored and jumps straight to its end. The result
 *   is applied exactly once — refreshing can't avoid a loss or give a second result.
 *
 * Saved data that is malformed, from another version or describes an impossible run is
 * thrown away and the player starts at the start page (a playable state).
 */

export const SAVE_KEY = "backpack-brawl:save";
/** Bump when the format changes; older saves are then rejected as incompatible. B7: 2 = runs have an `id`. */
export const SAVE_VERSION = 2;

export const SEARCH_INTERRUPTED = "The search was interrupted by reloading the page. Nothing was lost — just search again.";

export interface SaveData {
    version: number;
    phase: Phase;
    run: RunState;
    /** Only during a battle: the opponent of the battle. */
    opponent: Opponent | null;
    /** Only during a battle: true if the result is already part of `run`. */
    resultApplied: boolean;
}

/** The part of the game that is worth saving. */
export function toSaveData(game: GameState): SaveData {
    const battle = game.battle;
    return {
        version: SAVE_VERSION,
        phase: game.phase,
        run: game.run,
        opponent: game.phase === "battle" && battle ? battle.opponent : null,
        resultApplied: battle ? battle.frame >= battle.result.frames.length - 1 : false,
    };
}

export interface LoadResult {
    game: GameState | null;
    /** Message for the player if a save existed but could not be used. */
    notice: string | null;
}

/** Turns the saved string back into a game. Never throws. */
export function loadGame(raw: string | null): LoadResult {
    if (raw === null) return { game: null, notice: null };
    try {
        const data: unknown = JSON.parse(raw);
        const game = restore(data);
        if (game) return { game, notice: null };
    } catch {
        // invalid JSON — handled below
    }
    return { game: null, notice: "Your saved run could not be loaded (damaged or from an older version), so a fresh start is waiting for you." };
}

function restore(data: unknown): GameState | null {
    if (!isObject(data) || data.version !== SAVE_VERSION) return null;
    const run = data.run;
    if (!isValidRun(run)) return null;
    const over = runOutcome(run) !== null;

    switch (data.phase) {
        case "shop":
            return over ? null : { phase: "shop", run, search: null, battle: null, error: null };

        case "searching":
            // Policy: a search can't survive a refresh → back to the shop, try again.
            return over ? null : { phase: "shop", run, search: null, battle: null, error: SEARCH_INTERRUPTED };

        case "finished":
            return over ? { phase: "finished", run, search: null, battle: null, error: null } : null;

        case "battle": {
            const opponent = data.opponent;
            const applied = data.resultApplied;
            if (!isValidOpponent(opponent) || typeof applied !== "boolean") return null;
            // Before the result is applied the battle belongs to the current round.
            if (!applied && (over || opponent.round !== run.round)) return null;
            const player = buildPlayerFighter(run.backpack);
            const enemy = buildOpponentFighter(opponent);
            const result = simulateBattle(player, enemy);
            const last = result.frames.length - 1;
            // Not applied yet: start at frame 0 and skip, which applies the result exactly once.
            const game: GameState = { phase: "battle", run, search: null, error: null, battle: { opponent, player, enemy, result, frame: applied ? last : 0 } };
            return applied ? game : skipReplay(game);
        }

        default:
            return null;
    }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isInt = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
    Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

/** Checks shape AND plausibility: no negative gold, no unknown items, round fits wins and losses, … */
export function isValidRun(value: unknown): value is RunState {
    if (!isObject(value)) return false;
    const { id, round, gold, lives, wins, seed, shop, backpack, nextUid } = value;
    if (typeof id !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(id)) return false; // B7: run id for the hall of fame
    if (!isInt(round, 1) || !isInt(gold, 0) || !isInt(lives, 0, START_LIVES) || !isInt(wins, 0, WINS_TO_VICTORY)) return false;
    if (!isInt(seed, 0, 2 ** 32 - 1) || !isInt(nextUid, 1)) return false;
    if (lives === 0 && wins === WINS_TO_VICTORY) return false; // can't win and lose at the same time

    // Every round is one battle: round = wins + losses + 1 (no +1 once the run is over).
    const losses = START_LIVES - lives;
    const over = lives === 0 || wins === WINS_TO_VICTORY;
    if (round !== wins + losses + (over ? 0 : 1)) return false;

    if (!Array.isArray(shop) || shop.length !== SHOP_SIZE || !shop.every((id) => id === null || isKnownItem(id))) return false;
    if (!Array.isArray(backpack) || backpack.length !== BACKPACK_SIZE) return false;
    const uids = new Set<string>();
    for (const slot of backpack) {
        if (slot === null) continue;
        if (!isObject(slot) || typeof slot.uid !== "string" || !isKnownItem(slot.itemId)) return false;
        if (uids.has(slot.uid)) return false; // an item can't be in two slots
        uids.add(slot.uid);
    }
    return true;
}
