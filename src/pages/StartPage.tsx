import { useNavigate } from "react-router";
import { routeForGame, ROUTES } from "../game";
import { START_GOLD, START_LIVES, WINS_TO_VICTORY } from "../run";
import { useGame } from "../state/GameContext";

export function StartPage() {
    const { game, notice, startNewRun } = useGame();
    const navigate = useNavigate();

    function handleNewRun() {
        // B6: a saved run would be overwritten, so ask first.
        if (game && game.phase !== "finished" && !window.confirm("Start a new run? Your current run will be lost.")) return;
        startNewRun();
        navigate(ROUTES.shop);
    }

    return (
        <section className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-lg border-2 border-gold bg-panel p-8 text-center">
            <p className="text-6xl" aria-hidden>
                🎒⚔️
            </p>
            <h2 className="font-display text-3xl font-bold">Pack your bag. Win the arena.</h2>
            {/* B6: a broken save is not silently ignored. */}
            {notice && (
                <p role="alert" className="rounded-md border border-life p-2 text-sm text-life">
                    ⚠️ {notice}
                </p>
            )}
            <ul className="flex flex-col gap-1 text-muted">
                <li>🏪 Buy items in the shop and arrange them in your backpack.</li>
                <li>⚔️ Your items fight on their own — watch the battle unfold.</li>
                <li>
                    🏆 Reach {WINS_TO_VICTORY} wins before you lose all {START_LIVES} lives. You start with {START_GOLD} 🪙.
                </li>
                <li>💾 Your run is saved in this browser. Reload any time and continue.</li>
            </ul>
            <div className="flex flex-wrap justify-center gap-2">
                {game && game.phase !== "finished" && (
                    <button
                        type="button"
                        onClick={() => navigate(routeForGame(game))}
                        autoFocus
                        className="rounded-md bg-gold px-5 py-2 font-display font-bold text-ink hover:brightness-110"
                    >
                        ▶ Continue run (round {game.run.round})
                    </button>
                )}
                <button
                    type="button"
                    onClick={handleNewRun}
                    autoFocus={!game || game.phase === "finished"}
                    className="rounded-md border-2 border-gold px-5 py-2 font-display font-bold text-gold hover:bg-gold/10"
                >
                    🎒 New run
                </button>
            </div>
        </section>
    );
}
