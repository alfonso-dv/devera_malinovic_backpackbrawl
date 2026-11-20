import { useEffect, useRef } from "react";
import { fetchOpponent } from "../api";
import { Backpack } from "../components/Backpack";
import { FightBar } from "../components/FightBar";
import { RulesPanel } from "../components/RulesPanel";
import { RunHeader } from "../components/RunHeader";
import { Shop } from "../components/Shop";
import { fightBlocker, searchFailed, startBattle, startSearch, updateRun } from "../game";
import { buyItem, moveItem, rerollShop, sellItem } from "../run";
import { useActiveGame } from "../state/GameContext";

export function ShopPage() {
  const { game, update } = useActiveGame();
  const { run, phase } = game;

  /** The request that is running right now, so a second click can't send another one. */
  const pending = useRef<AbortController | null>(null);

  // Leaving the page cancels a running request (its result would be ignored anyway).
  useEffect(() => () => pending.current?.abort(), []);

  function handleBuy(offerIndex: number) {
    update((current) => updateRun(current, (currentRun) => buyItem(currentRun, offerIndex)));
  }

  function handleSell(slot: number) {
    update((current) => updateRun(current, (currentRun) => sellItem(currentRun, slot)));
  }

  function handleReroll() {
    update((current) => updateRun(current, rerollShop));
  }

  /** Handles moving an item between slots in the backpack. */
  function handleMove(from: number, to: number) {
    update((current) => updateRun(current, (currentRun) => moveItem(currentRun, from, to)));
  }


  /* ------------- B5 IMPLEMENTATION ------------- */

  // Once the opponent is found the phase becomes "battle" and RequireRoute redirects to the battle page.
  // The game rules (startSearch / startBattle / searchFailed) ignore every response that doesn't belong
  // to the running search, so even a slow, duplicate or late response can't start or restart a battle.
  async function handleFindOpponent() {
    if (fightBlocker(game) !== null || pending.current) return;
    const searchId = newSearchId();
    const controller = new AbortController();
    pending.current = controller;
    update((current) => startSearch(current, searchId));
    try {
      const opponent = await fetchOpponent(run.round, controller.signal);
      update((current) => startBattle(current, searchId, opponent));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Opponent search failed.";
      update((current) => searchFailed(current, searchId, message));
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }

  return (
    <>
      <RunHeader run={run} />
      <FightBar phase={phase} blocker={fightBlocker(game)} error={game.error} onFight={handleFindOpponent} />

      {phase !== "shop" && <p className="text-sm text-muted">🔒 Shop and backpack are locked while searching for an opponent.</p>}

      {/* While searching, the whole shop/backpack area is disabled so the fighting build can't change. */}
      <fieldset disabled={phase !== "shop"} className="grid min-w-0 gap-4 disabled:opacity-60 lg:grid-cols-[1fr_16rem_18rem]">
        <Shop run={run} onBuy={handleBuy} onReroll={handleReroll} />
        <Backpack run={run} locked={phase !== "shop"} onSell={handleSell} onMove={handleMove} />
        <aside className="flex flex-col gap-4">
          <RulesPanel open={run.round === 1} />
        </aside>
      </fieldset>
    </>
  );
}

/** A unique id for every opponent search. */
function newSearchId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}