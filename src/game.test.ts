import { describe, expect, it } from "vitest";
import { fightBlocker, newGame, searchFailed, skipReplay, startBattle, startSearch } from "./game";
import { buyItem } from "./run";
import type { GameState, Opponent } from "./types";

/* ------------- B5 TESTS ------------- */

const SEED = 12345;

/** A game in the shop with one item bought, so a search may start. */
function readyGame(): GameState {
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

describe("startSearch", () => {
  it("starts a search for the current round", () => {
    const game = startSearch(readyGame(), "a");
    expect(game.phase).toBe("searching");
    expect(game.search).toEqual({ id: "a", round: 1 });
  });

  it("can't start a second search while one is running", () => {
    const searching = startSearch(readyGame(), "a");
    expect(fightBlocker(searching)).toBe("Already searching");
    expect(startSearch(searching, "b")).toBe(searching);
  });

  it("can't start without items or outside the shop", () => {
    const empty = newGame(SEED);
    expect(startSearch(empty, "a")).toBe(empty);
    const finished = { ...readyGame(), phase: "finished" as const };
    expect(startSearch(finished, "a")).toBe(finished);
  });

  it("clears an earlier error", () => {
    const failed = searchFailed(startSearch(readyGame(), "a"), "a", "boom");
    expect(startSearch(failed, "b").error).toBeNull();
  });
});

describe("searchFailed", () => {
  it("returns to a usable shop with the message", () => {
    const failed = searchFailed(startSearch(readyGame(), "a"), "a", "The arena gates are shut.");
    expect(failed.phase).toBe("shop");
    expect(failed.search).toBeNull();
    expect(failed.error).toBe("The arena gates are shut.");
    expect(fightBlocker(failed)).toBeNull(); // can try again
  });

  it("ignores a failure of an older search", () => {
    const game = startSearch(searchFailed(startSearch(readyGame(), "a"), "a", "x"), "b");
    expect(searchFailed(game, "a", "late failure")).toBe(game);
  });

  it("ignores a failure when no search is running", () => {
    const game = readyGame();
    expect(searchFailed(game, "a", "x")).toBe(game);
  });
});

describe("startBattle", () => {
  it("starts the battle for the running search", () => {
    const battle = startBattle(startSearch(readyGame(), "a"), "a", opponent());
    expect(battle.phase).toBe("battle");
    expect(battle.search).toBeNull();
    expect(battle.battle?.opponent.name).toBe("Mossback Hermit");
  });

  it("never starts a battle without a running search", () => {
    const game = readyGame();
    expect(startBattle(game, "a", opponent())).toBe(game);
  });

  it("ignores a slow response from an older search", () => {
    const game = startSearch(searchFailed(startSearch(readyGame(), "old"), "old", "x"), "new");
    expect(startBattle(game, "old", opponent())).toBe(game);
  });

  it("ignores a duplicate response: the battle is not restarted", () => {
    const battle = startBattle(startSearch(readyGame(), "a"), "a", opponent());
    const advanced = skipReplay(battle);
    expect(startBattle(advanced, "a", opponent())).toBe(advanced);
  });

  it("ignores a late response after the battle's result was applied", () => {
    const finished = skipReplay(startBattle(startSearch(readyGame(), "a"), "a", opponent()));
    const { wins, lives } = finished.run;
    const late = startBattle(finished, "a", opponent());
    expect(late.run.wins).toBe(wins);
    expect(late.run.lives).toBe(lives);
  });

  it("rejects an opponent for another round and returns to the shop", () => {
    const game = startBattle(startSearch(readyGame(), "a"), "a", opponent(2));
    expect(game.phase).toBe("shop");
    expect(game.battle).toBeNull();
    expect(game.error).toMatch(/round 2/);
  });

  it("ignores a response for a search of an earlier run", () => {
    const newRun = startSearch(readyGame(), "b");
    expect(startBattle(newRun, "a", opponent())).toBe(newRun);
  });
});