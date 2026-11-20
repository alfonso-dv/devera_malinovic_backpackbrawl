/* ------------- B7: hall of fame -------------
 * Validation, ranking and in-memory storage of finished runs. Plain functions without
 * Express, so they can be unit-tested directly (see hallOfFame.test.js).
 * The run rules below mirror src/run.ts (3 lives, 5 wins to victory).
 */

export const START_LIVES = 3;
export const WINS_TO_VICTORY = 5;
export const NAME_MAX_LENGTH = 20;
/** Letters (any language), digits, spaces and - _ . */
const NAME_PATTERN = /^[\p{L}\p{N} _.-]+$/u;
const RUN_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;

/** Ranking: victories first, then more wins, then fewer rounds, then more lives left, then earlier submission. */
export function compareEntries(a, b) {
    const victory = (e) => (e.outcome === "victory" ? 1 : 0);
    return (
        victory(b) - victory(a) ||
        b.wins - a.wins ||
        a.rounds - b.rounds ||
        b.lives - a.lives ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.runId.localeCompare(b.runId)
    );
}

const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

/** Trims the name and collapses runs of whitespace into one space. */
export const normalizeName = (name) => name.trim().replace(/\s+/g, " ");

/**
 * Checks a submitted run: right shape AND a run that is actually possible.
 * Returns `{ value }` with the cleaned run, or `{ error }` with a message for the player.
 */
export function validateSubmission(body) {
    if (typeof body !== "object" || body === null || Array.isArray(body)) return { error: "The request body must be a JSON object." };
    const { runId, name, outcome, wins, lives, rounds } = body;

    if (typeof runId !== "string" || !RUN_ID_PATTERN.test(runId)) return { error: "runId must be 8–64 letters, digits or dashes." };
    if (typeof name !== "string") return { error: "name is required." };
    const cleanName = normalizeName(name);
    if (cleanName.length === 0) return { error: "Please enter a name." };
    if (cleanName.length > NAME_MAX_LENGTH) return { error: `The name may have at most ${NAME_MAX_LENGTH} characters.` };
    if (!NAME_PATTERN.test(cleanName)) return { error: "The name may only contain letters, digits, spaces and - _ ." };

    if (outcome !== "victory" && outcome !== "defeat") return { error: 'outcome must be "victory" or "defeat".' };
    if (!isInt(wins, 0, WINS_TO_VICTORY)) return { error: `wins must be a whole number from 0 to ${WINS_TO_VICTORY}.` };
    if (!isInt(lives, 0, START_LIVES)) return { error: `lives must be a whole number from 0 to ${START_LIVES}.` };
    if (!isInt(rounds, 1, WINS_TO_VICTORY + START_LIVES - 1)) return { error: `rounds must be a whole number from 1 to ${WINS_TO_VICTORY + START_LIVES - 1}.` };

    // Plausibility: a finished run ends with the 5th win or the last lost life, and every round is one battle.
    if (outcome === "victory" && (wins !== WINS_TO_VICTORY || lives < 1)) return { error: `A victory needs exactly ${WINS_TO_VICTORY} wins and at least 1 life left.` };
    if (outcome === "defeat" && (lives !== 0 || wins >= WINS_TO_VICTORY)) return { error: `A defeat needs 0 lives left and fewer than ${WINS_TO_VICTORY} wins.` };
    const expectedRounds = wins + (START_LIVES - lives);
    if (rounds !== expectedRounds) return { error: `rounds does not match wins and lives: this run must have taken ${expectedRounds} rounds.` };

    return { value: { runId, name: cleanName, outcome, wins, lives, rounds } };
}

/** In-memory hall of fame. Restarting the server empties it (a database is not required). */
export function createHallOfFame(now = () => new Date().toISOString()) {
    const entries = new Map(); // runId → entry

    const ranked = () => [...entries.values()].sort(compareEntries);
    const rankOf = (runId) => ranked().findIndex((e) => e.runId === runId) + 1;
    const sameRun = (a, b) => ["name", "outcome", "wins", "lives", "rounds"].every((key) => a[key] === b[key]);

    return {
        /**
         * Adds a validated run. The same runId is never stored twice:
         * identical data → `{ duplicate: true }` with the stored entry (safe to retry),
         * different data → `{ conflict: true }`.
         */
        add(value) {
            const existing = entries.get(value.runId);
            if (existing) {
                if (!sameRun(existing, value)) return { conflict: true };
                return { entry: existing, rank: rankOf(value.runId), duplicate: true };
            }
            const entry = { ...value, createdAt: now() };
            entries.set(value.runId, entry);
            return { entry, rank: rankOf(value.runId), duplicate: false };
        },
        /** The best `limit` runs with their rank (1 = best). */
        top(limit = DEFAULT_LIMIT) {
            return ranked().slice(0, limit).map((entry, i) => ({ rank: i + 1, ...entry }));
        },
        get size() {
            return entries.size;
        },
    };
}

/** Parses `?limit=`; falls back to DEFAULT_LIMIT and clamps to 1…MAX_LIMIT. */
export function parseLimit(value) {
    if (typeof value !== "string" || !/^\d+$/.test(value)) return DEFAULT_LIMIT;
    return Math.min(MAX_LIMIT, Math.max(1, Number(value)));
}
