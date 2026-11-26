import { describe, expect, it } from "vitest";
import { advanceReplay, isReplayDone, newGame, skipReplay, startBattle, startSearch } from "./game";
import { buyItem } from "./run";
import { loadGame, SAVE_VERSION, SEARCH_INTERRUPTED, toSaveData } from "./save";
import type { GameState, Opponent, RunState } from "./types";

/* ------------- B6 TESTS ------------- */

const SEED = 12345;

/** Simulates a browser refresh: game state → JSON (localStorage) → game state. */
function reload(game: GameState): GameState | null {
    return loadGame(JSON.stringify(toSaveData(game))).game;
}

/** A game in the shop with one item bought, so a search may start. */
function shopGame(): GameState {
    const game = newGame(SEED);
    return { ...game, run: buyItem({ ...game.run, gold: 100 }, 0) };
}

const opponent = (round = 1): Opponent => ({
    id: "mossback-hermit",
    name: "Mossback Hermit",
    icon: "🐢",
    hp: 25,
    items: ["chipped-dagger", "pot-lid"],
    round,
});

/** A battle that was just started (replay at frame 0, result not applied yet). */
function battleGame(): GameState {
    return startBattle(startSearch(shopGame(), "s1"), "s1", opponent());
}

/** Number of battles recorded in a run (wins + lost lives). */
const battlesIn = (run: RunState) => run.wins + (3 - run.lives);

describe("refresh policy", () => {
    it("restores the shop exactly as it was (no free reroll)", () => {
        const game = shopGame();
        const loaded = reload(game);
        expect(loaded).toEqual(game);
        expect(loaded?.run.shop).toEqual(game.run.shop);
        expect(loaded?.run.seed).toBe(game.run.seed);
        expect(loaded?.run.gold).toBe(game.run.gold);
    });

    it("turns a running search into the shop with a message, nothing else changes", () => {
        const searching = startSearch(shopGame(), "s1");
        const loaded = reload(searching);
        expect(loaded?.phase).toBe("shop");
        expect(loaded?.search).toBeNull();
        expect(loaded?.error).toBe(SEARCH_INTERRUPTED);
        expect(loaded?.run).toEqual(searching.run);
    });

    it("jumps a running battle to its end and applies the result exactly once", () => {
        const battle = advanceReplay(advanceReplay(battleGame()));
        expect(battle.battle && isReplayDone(battle.battle)).toBe(false);

        const loaded = reload(battle);
        expect(loaded?.phase).toBe("battle");
        expect(loaded?.battle && isReplayDone(loaded.battle)).toBe(true);
        expect(battlesIn(loaded!.run)).toBe(battlesIn(battle.run) + 1);
    });

    it("changes nothing on a second reload", () => {
        const once = reload(battleGame());
        const twice = reload(once!);
        expect(twice).toEqual(once);
    });

    it("gives the same result as watching the battle to the end (no avoided defeat)", () => {
        const battle = battleGame();
        const watched = skipReplay(battle);
        expect(reload(battle)?.run).toEqual(watched.run);
        expect(reload(battle)?.battle?.result.winner).toBe(watched.battle?.result.winner);
    });

    it("does not apply a result again when the replay had already finished", () => {
        const done = skipReplay(battleGame());
        expect(toSaveData(done).resultApplied).toBe(true);
        expect(reload(done)?.run).toEqual(done.run);
    });

    it("keeps the result screen of a finished run", () => {
        const game = shopGame();
        const finished: GameState = { ...game, phase: "finished", run: { ...game.run, wins: 5, lives: 3, round: 5 } };
        const loaded = reload(finished);
        expect(loaded?.phase).toBe("finished");
        expect(loaded?.run).toEqual(finished.run);
    });

    it("saves the opponent only during a battle", () => {
        expect(toSaveData(shopGame()).opponent).toBeNull();
        expect(toSaveData(battleGame()).opponent).toEqual(opponent());
    });
});

/* ---- Broken, incompatible or impossible saves ---- */

/** A valid shop save with some fields replaced. */
function saveWith(changes: { run?: Record<string, unknown>; [key: string]: unknown }): string {
    const data = toSaveData(shopGame());
    const { run, ...rest } = changes;
    return JSON.stringify({ ...data, ...rest, run: { ...data.run, ...run } });
}

/** A rejected save gives no game (start page) and a message for the player. Never throws. */
function expectRejected(raw: string) {
    const result = loadGame(raw);
    expect(result.game).toBeNull();
    expect(typeof result.notice).toBe("string");
}

describe("rejected saves", () => {
    it("rejects text that is not JSON", () => {
        expectRejected("{ this is not json");
    });

    it("rejects a save from another version", () => {
        expectRejected(saveWith({ version: SAVE_VERSION - 1 }));
    });

    it("rejects negative gold", () => {
        expectRejected(saveWith({ run: { gold: -5 } }));
    });

    it("rejects too many lives", () => {
        expectRejected(saveWith({ run: { lives: 4 } }));
    });

    it("rejects a round that doesn't fit wins and losses", () => {
        expectRejected(saveWith({ run: { round: 7, wins: 0, lives: 3 } }));
    });

    it("rejects a run that is won and lost at once", () => {
        expectRejected(saveWith({ run: { wins: 5, lives: 0, round: 8 } }));
    });

    it("rejects an unknown item in the backpack", () => {
        const backpack = [{ uid: "item-1", itemId: "golden-sword" }, null, null, null, null, null];
        expectRejected(saveWith({ run: { backpack } }));
    });

    it("rejects an unknown item in the shop", () => {
        expectRejected(saveWith({ run: { shop: ["golden-sword", null, null, null] } }));
    });

    it("rejects a backpack of the wrong size", () => {
        expectRejected(saveWith({ run: { backpack: [null, null, null] } }));
    });

    it("rejects the same item in two slots (duplicate uid)", () => {
        const item = { uid: "item-1", itemId: "pot-lid" };
        expectRejected(saveWith({ run: { backpack: [item, item, null, null, null, null] } }));
    });

    it("rejects a run without an id", () => {
        expectRejected(saveWith({ run: { id: undefined } }));
    });

    it("rejects a battle with an invalid opponent", () => {
        expectRejected(saveWith({ phase: "battle", opponent: { id: "ghost" }, resultApplied: false }));
    });

    it("rejects an unknown phase or a phase that doesn't fit the run", () => {
        expectRejected(saveWith({ phase: "paused" }));
        expectRejected(saveWith({ phase: "shop", run: { wins: 5, lives: 3, round: 5 } }));
    });
});
