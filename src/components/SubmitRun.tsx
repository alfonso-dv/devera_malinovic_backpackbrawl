import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { submitRun } from "../api";
import { ROUTES } from "../game";
import { getSubmitted, markSubmitted, NAME_MAX_LENGTH, nameBlocker, toSubmission, type SubmittedRun } from "../hallOfFame";
import type { RunState } from "../types";

type Status =
    | { kind: "idle" }
    | { kind: "submitting" }
    | { kind: "error"; message: string }
    | { kind: "done"; result: SubmittedRun };

/** B7: enter a name at the end of a run and send the run to the hall of fame. */
export function SubmitRun({ run }: { run: RunState }) {
    // A run that was already submitted from this browser starts as "done": no second form, no second submission.
    const [status, setStatus] = useState<Status>(() => {
        const result = getSubmitted(run.id);
        return result ? { kind: "done", result } : { kind: "idle" };
    });
    // The name stays in state after an error, so a retry doesn't need retyping.
    const [name, setName] = useState("");
    // Guards against a double click before React has re-rendered the disabled button.
    const inFlight = useRef(false);

    const blocker = nameBlocker(name);
    const submitting = status.kind === "submitting";

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        const submission = toSubmission(run, name);
        if (blocker !== null || !submission || inFlight.current || status.kind === "done") return;
        inFlight.current = true;
        setStatus({ kind: "submitting" });
        try {
            const { entry } = await submitRun(submission);
            const result = { name: entry.name, rank: entry.rank };
            markSubmitted(run.id, result);
            setStatus({ kind: "done", result });
        } catch (error) {
            setStatus({ kind: "error", message: error instanceof Error ? error.message : "Submitting failed." });
        } finally {
            inFlight.current = false;
        }
    }

    if (status.kind === "done") {
        return (
            <section role="status" className="mx-auto flex w-full max-w-lg flex-col items-center gap-2 rounded-lg border border-gold bg-panel p-4 text-center">
                <p className="font-display text-lg font-bold">
                    🏆 Saved as „{status.result.name}“: rank {status.result.rank}
                </p>
                <Link to={ROUTES.hallOfFame} className="font-bold text-gold underline">
                    See the hall of fame
                </Link>
            </section>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-lg flex-col gap-2 rounded-lg border border-panel-edge bg-panel p-4">
            <label htmlFor="hof-name" className="font-display text-lg font-bold">
                🏆 Enter the hall of fame
            </label>
            <div className="flex gap-2">
                <input
                    id="hof-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={NAME_MAX_LENGTH + 10}
                    disabled={submitting}
                    placeholder="Your name"
                    autoComplete="nickname"
                    className="min-w-0 flex-1 rounded-md border border-panel-edge bg-ink px-3 py-2 text-parchment"
                />
                <button
                    type="submit"
                    disabled={blocker !== null || submitting}
                    title={blocker ?? undefined}
                    aria-busy={submitting}
                    className="shrink-0 rounded-md bg-gold px-4 py-2 font-bold text-ink hover:brightness-110 disabled:bg-panel-edge disabled:text-muted"
                >
                    {submitting ? "Saving…" : status.kind === "error" ? "🔁 Try again" : "Submit"}
                </button>
            </div>
            {/* The reason is shown before the player tries, like the shop's blockers. */}
            <p className="text-xs text-muted">{blocker ?? `Letters, digits, spaces and - _ . (max. ${NAME_MAX_LENGTH})`}</p>
            {status.kind === "error" && (
                <p role="alert" className="text-sm text-life">
                    ⚠️ {status.message} Your name is kept, just try again.
                </p>
            )}
        </form>
    );
}
