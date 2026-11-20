import { RunHeader } from "../components/RunHeader";
import { RunOver } from "../components/RunOver";
import { SubmitRun } from "../components/SubmitRun";
import { runOutcome } from "../run";
import { useActiveGame } from "../state/GameContext";

export function ResultPage() {
    const { game, startNewRun } = useActiveGame();
    const outcome = runOutcome(game.run);
    if (!outcome) return null;

    // Starting a new run moves the phase to "shop", so RequireRoute redirects to the shop.
    return (
        <>
            <RunHeader run={game.run} />
            <RunOver run={game.run} outcome={outcome} onNewRun={startNewRun} />
            {/* B7: key = run id, so a new run always gets a fresh form. */}
            <SubmitRun key={game.run.id} run={game.run} />
        </>
    );
}
