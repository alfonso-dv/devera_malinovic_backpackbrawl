import { useEffect, useState, type ReactNode } from "react";
import { newGame } from "../game";
import { loadGame, SAVE_KEY, toSaveData } from "../save";
import type { GameState } from "../types";
import { GameContext, type GameContextValue } from "./GameContext";

const randomSeed = () => Math.floor(Math.random() * 2 ** 32);
/** B7: unique id per run (used by the hall of fame to recognise the same run). */
const newRunId = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `run-${Date.now()}-${Math.floor(Math.random() * 1e9)}`);

/* B6: localStorage can be missing or blocked (private mode, disabled cookies), so every
 * access is wrapped in try/catch. Without storage the game still works, it just isn't saved. */
function readSave(): string | null {
  try {
    return localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

function writeSave(game: GameState | null) {
  try {
    if (game) localStorage.setItem(SAVE_KEY, JSON.stringify(toSaveData(game)));
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    // storage full or blocked: keep playing without saving
  }
}

/** Holds the game state for all routes, so it survives navigating between pages. */
export function GameProvider({ children }: { children: ReactNode }) {
  // B6: the saved run is loaded once, before the first render, so the router already
  // sees the right phase and RequireRoute sends the player to the matching page.
  const [initial] = useState(() => loadGame(readSave()));
  const [game, setGame] = useState<GameState | null>(initial.game);
  const [notice, setNotice] = useState<string | null>(initial.notice);

  // B6: save after every change of the game state (also removes a broken save).
  useEffect(() => writeSave(game), [game]);

  const value: GameContextValue = {
    game,
    notice,
    startNewRun: () => {
      setNotice(null);
      setGame(newGame(randomSeed(), newRunId()));
    },
    update: (transition) => setGame((current) => (current ? transition(current) : current)),
  };

  return <GameContext value={value}>{children}</GameContext>;
}
