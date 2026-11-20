import { runOutcome } from "./run";
import type { RunState, RunSubmission } from "./types";

/* ------------- B7: hall of fame (client rules) -------------
 * The server validates every submission itself (server/hallOfFame.js). These checks only
 * let the interface explain a problem BEFORE the player submits, like the shop's blockers.
 */

export const NAME_MAX_LENGTH = 20;
const NAME_PATTERN = /^[\p{L}\p{N} _.-]+$/u;

/** Shown on the hall of fame page; must match `compareEntries` on the server. */
export const RANKING_RULE = "Victories first, then more wins, then fewer rounds, then more lives left, then whoever was first.";

/** Trims the name and collapses runs of whitespace into one space (same as the server). */
export const normalizeName = (name: string) => name.trim().replace(/\s+/g, " ");

/** Why this name can't be submitted, or `null` if it can. */
export function nameBlocker(name: string): string | null {
    const clean = normalizeName(name);
    if (clean.length === 0) return "Enter your name";
    if (clean.length > NAME_MAX_LENGTH) return `At most ${NAME_MAX_LENGTH} characters`;
    if (!NAME_PATTERN.test(clean)) return "Only letters, digits, spaces and - _ .";
    return null;
}

/** The data sent for a finished run, or `null` if the run isn't over yet. */
export function toSubmission(run: RunState, name: string): RunSubmission | null {
    const outcome = runOutcome(run);
    if (!outcome) return null;
    return { runId: run.id, name: normalizeName(name), outcome, wins: run.wins, lives: run.lives, rounds: run.round };
}

/* ---- Remembering submitted runs in the browser ----
 * So that a reload of the result page can't lead to a second submission. The server
 * also ignores a second submission of the same runId (defence in depth).
 */

export const SUBMITTED_KEY = "backpack-brawl:submitted-runs";

export interface SubmittedRun {
    name: string;
    rank: number;
}

function readAll(): Record<string, SubmittedRun> {
    try {
        const data: unknown = JSON.parse(localStorage.getItem(SUBMITTED_KEY) ?? "{}");
        return typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, SubmittedRun>) : {};
    } catch {
        return {}; // blocked storage or broken JSON: behave as if nothing was submitted
    }
}

/** The stored result if this run was already submitted from this browser. */
export function getSubmitted(runId: string): SubmittedRun | null {
    const entry = readAll()[runId];
    return entry && typeof entry.name === "string" && Number.isInteger(entry.rank) ? entry : null;
}

export function markSubmitted(runId: string, result: SubmittedRun) {
    try {
        localStorage.setItem(SUBMITTED_KEY, JSON.stringify({ ...readAll(), [runId]: result }));
    } catch {
        // storage full or blocked: the server still prevents a duplicate entry
    }
}

/** Run ids submitted from this browser (to highlight them in the list). */
export const submittedRunIds = () => new Set(Object.keys(readAll()));
