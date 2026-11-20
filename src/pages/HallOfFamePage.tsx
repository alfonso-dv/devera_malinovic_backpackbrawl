import { useEffect, useState } from "react";
import { Link } from "react-router";
import { fetchHallOfFame } from "../api";
import { routeForGame } from "../game";
import { RANKING_RULE, submittedRunIds } from "../hallOfFame";
import { useGame } from "../state/GameContext";
import type { HallOfFameEntry } from "../types";

/** Result of one loading attempt; `attempt` tells which one it belongs to. */
type Loaded = { attempt: number; entries: HallOfFameEntry[] } | { attempt: number; error: string };

/** B7: the hall of fame as its own page, reachable at any time. */
export function HallOfFamePage() {
    const { game } = useGame();
    const [attempt, setAttempt] = useState(0);
    const [loaded, setLoaded] = useState<Loaded | null>(null);

    // Loads the list; "Try again" increases `attempt`, which runs the effect again.
    useEffect(() => {
        const controller = new AbortController();
        fetchHallOfFame(controller.signal).then(
            (entries) => setLoaded({ attempt, entries }),
            (error: unknown) => {
                if (!controller.signal.aborted) setLoaded({ attempt, error: error instanceof Error ? error.message : "Loading failed." });
            },
        );
        return () => controller.abort();
    }, [attempt]);

    // Loading until the result of the CURRENT attempt has arrived.
    const loading = loaded === null || loaded.attempt !== attempt;
    const mine = submittedRunIds();

    return (
        <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-lg border border-panel-edge bg-panel p-4">
            <header className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-2xl font-bold">🏆 Hall of fame</h2>
                <Link to={routeForGame(game)} className="text-sm font-bold text-gold underline">
                    {game ? "Back to the game" : "Back to the start"}
                </Link>
            </header>
            <p className="text-sm text-muted">Ranking: {RANKING_RULE}</p>

            {loading ? (
                <p role="status" className="animate-pulse text-gold">
                    📜 Loading the hall of fame…
                </p>
            ) : "error" in loaded ? (
                <div role="alert" className="flex flex-col items-start gap-2 text-life">
                    <p>⚠️ {loaded.error}</p>
                    <button type="button" onClick={() => setAttempt((n) => n + 1)} className="rounded-md bg-life px-3 py-1.5 font-bold text-parchment hover:brightness-110">
                        🔁 Try again
                    </button>
                </div>
            ) : loaded.entries.length === 0 ? (
                <p className="text-muted">No runs yet. Finish a run and be the first legend of the arena!</p>
            ) : (
                <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wider text-muted">
                    <tr>
                        <th className="py-1">#</th>
                        <th>Name</th>
                        <th>Result</th>
                        <th className="text-right">Wins</th>
                        <th className="text-right">Rounds</th>
                        <th className="text-right">Lives</th>
                    </tr>
                    </thead>
                    <tbody>
                    {loaded.entries.map((entry) => (
                        <tr key={entry.runId} className={`border-t border-panel-edge ${mine.has(entry.runId) ? "bg-gold/15 font-bold" : ""}`}>
                            <td className="py-1.5">{entry.rank}</td>
                            <td>
                                {entry.name}
                                {mine.has(entry.runId) && <span className="ml-1 text-xs text-gold">(you)</span>}
                            </td>
                            <td>{entry.outcome === "victory" ? "👑 Victory" : "🪦 Defeat"}</td>
                            <td className="text-right">{entry.wins}</td>
                            <td className="text-right">{entry.rounds}</td>
                            <td className="text-right">{entry.lives}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            )}
        </section>
    );
}
