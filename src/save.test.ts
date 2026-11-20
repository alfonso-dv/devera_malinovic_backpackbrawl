import { describe, expect, it } from "vitest";
import { advanceReplay, newGame, startBattle, startSearch } from "./game";
import { buyItem } from "./run";
import { loadGame, SAVE_VERSION, SEARCH_INTERRUPTED, toSaveData } from "./save";
import type { GameState, Opponent } from "./types";

/* ------------- B6 TESTS ------------- */

const SEED = 12345;

/** Same as a real save + reload: GameState → JSON string → GameState. */
const reload = (game: GameState) => loadGame(JSON.stringify(toSaveData(game)));

function readyGame(): GameState {
    const game = newGame(SEED);
    return { ...game, run: buyItem({ ...game.run, gold: 100 }, 0) };
}

const opponent: Opponent = { id: "mossback-hermit", name: "Mossback Hermit", icon: "🐢", hp: 25, items: ["chipped-dagger", "pot-lid"], round: 1 };

const inBattle = () => startBattle(startSearch(readyGame(), "a"), "a", opponent);

describe("save & resume", () => {
    it("has no game and no message without a save", () => {
        expect(loadGame(null)).toEqual({ game: null, notice: null });
    });

    it("restores the shop exactly: same offers, gold and backpack (no free reroll)", () => {
        const game = readyGame();
        const { game: loaded } = reload(game);
        expect(loaded?.phase).toBe("shop");
        expect(loaded?.run).toEqual(game.run);
    });

    it("turns a running search into the shop with a message", () => {
        const { game } = reload(startSearch(readyGame(), "a"));
        expect(game?.phase).toBe("shop");
        expect(game?.search).toBeNull();
        expect(game?.error).toBe(SEARCH_INTERRUPTED);
    });

    it("restores a battle replay at its end and applies the result once", () => {
        const battle = advanceReplay(inBattle()); // somewhere in the middle of the replay
        const { game } = reload(battle);
        expect(game?.phase).toBe("battle");
        expect(game?.battle?.frame).toBe(game!.battle!.result.frames.length - 1);
        const before = battle.run;
        const after = game!.run;
        // Exactly one battle more was recorded: either +1 win or −1 life.
        expect(after.wins - before.wins + (before.lives - after.lives)).toBe(1);
    });

    it("gives the same result after a refresh (can't avoid a loss)", () => {
        const original = inBattle();
        const { game } = reload(original);
        expect(game?.battle?.result.winner).toBe(original.battle?.result.winner);
    });

    it("does not apply the result a second time when reloading again", () => {
        const first = reload(inBattle()).game!;
        const second = reload(first).game!;
        expect(second.run).toEqual(first.run);
    });

    it("restores the finished screen", () => {
        const finished: GameState = { ...readyGame(), phase: "finished", run: { ...readyGame().run, lives: 0, round: 3 } };
        expect(reload(finished).game?.phase).toBe("finished");
    });
});

describe("broken saves fall back to a playable state", () => {
    const valid = () => toSaveData(readyGame());
    const load = (data: unknown) => loadGame(JSON.stringify(data));

    it.each([
        ["no JSON", "{not json"],
        ["JSON null", "null"],
        ["a number", "42"],
    ])("rejects %s", (_name, raw) => {
        const result = loadGame(raw);
        expect(result.game).toBeNull();
        expect(result.notice).toMatch(/could not be loaded/);
    });

    it("rejects another version", () => {
        expect(load({ ...valid(), version: SAVE_VERSION + 1 }).game).toBeNull();
    });

    it.each([
        ["negative gold", { gold: -5 }],
        ["more lives than possible", { lives: 9 }],
        ["round that doesn't fit wins and losses", { round: 7 }],
        ["unknown item in the shop", { shop: ["laser-sword", null, null, null] }],
        ["wrong backpack size", { backpack: [null] }],
        ["the same item twice", { backpack: [{ uid: "x", itemId: "pot-lid" }, { uid: "x", itemId: "pot-lid" }, null, null, null, null] }],
        ["won and lost at once", { wins: 5, lives: 0 }],
    ])("rejects an impossible run: %s", (_name, change) => {
        const data = valid();
        expect(load({ ...data, run: { ...data.run, ...change } }).game).toBeNull();
    });

    it("rejects a battle without a valid opponent", () => {
        const data = toSaveData(inBattle());
        expect(load({ ...data, opponent: { ...opponent, items: ["laser-sword"] } }).game).toBeNull();
    });

    it("rejects a shop phase for a run that is already over", () => {
        const data = valid();
        expect(load({ ...data, run: { ...data.run, lives: 0, round: 3 } }).game).toBeNull();
    });
});
