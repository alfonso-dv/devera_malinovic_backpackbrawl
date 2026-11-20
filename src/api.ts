
import { CATALOG } from "./items";
import { BACKPACK_SIZE } from "./shop";
import type { HallOfFameEntry, Opponent, RunSubmission } from "./types";

/** A search that takes longer than this is given up (the API itself answers within 5 s). */
export const SEARCH_TIMEOUT_MS = 10_000;

const knownItems = new Set(CATALOG.map((item) => item.id));

/** True if `data` is an opponent the game can fight: right shape and only known items. */
export function isValidOpponent(data: unknown): data is Opponent {
    if (typeof data !== "object" || data === null) return false;
    const o = data as Record<string, unknown>;
    return (
        typeof o.id === "string" &&
        typeof o.name === "string" &&
        typeof o.icon === "string" &&
        typeof o.hp === "number" &&
        Number.isFinite(o.hp) &&
        o.hp > 0 &&
        Number.isInteger(o.round) &&
        Array.isArray(o.items) &&
        o.items.length <= BACKPACK_SIZE &&
        o.items.every((id) => typeof id === "string" && knownItems.has(id))
    );
}

/**
 * Asks the API for this round's opponent. Always either resolves with a valid
 * opponent or throws an `Error` whose message can be shown to the player.
 */
export async function fetchOpponent(round: number, signal?: AbortSignal): Promise<Opponent> {
    const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
    let response: Response;
    try {
        response = await fetch(`/api/opponents?round=${encodeURIComponent(round)}`, {
            signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
    } catch (error) {
        if (timeout.aborted) throw new Error("The search took too long. The arena may be busy.", { cause: error });
        if (signal?.aborted) throw new Error("The search was cancelled.", { cause: error });
        throw new Error("Could not reach the arena. Check that the game server is running.", { cause: error });
    }

    if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
        if (typeof body?.error === "string") throw new Error(body.error);
        throw new Error(`The arena is unavailable right now (error ${response.status}). Check that the game server is running.`);
    }

    const data: unknown = await response.json().catch(() => null);
    if (!isValidOpponent(data)) throw new Error("The arena sent an invalid challenger.");
    return data;
}

/* ------------- B7: hall of fame ------------- */

/** True if `data` is a hall of fame entry as the API returns it. */
export function isValidEntry(data: unknown): data is HallOfFameEntry {
    if (typeof data !== "object" || data === null) return false;
    const e = data as Record<string, unknown>;
    return (
        Number.isInteger(e.rank) &&
        typeof e.runId === "string" &&
        typeof e.name === "string" &&
        (e.outcome === "victory" || e.outcome === "defeat") &&
        Number.isInteger(e.wins) &&
        Number.isInteger(e.lives) &&
        Number.isInteger(e.rounds) &&
        typeof e.createdAt === "string"
    );
}

/** Shared request handling: timeout, network errors and the server's `{ error }` messages. */
async function requestJson(url: string, init: RequestInit = {}, signal?: AbortSignal): Promise<unknown> {
    const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
    let response: Response;
    try {
        response = await fetch(url, { ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    } catch (error) {
        if (timeout.aborted) throw new Error("The hall of fame took too long to answer.", { cause: error });
        if (signal?.aborted) throw new Error("The request was cancelled.", { cause: error });
        throw new Error("Could not reach the hall of fame. Check that the game server is running.", { cause: error });
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
        const message = (body as { error?: unknown } | null)?.error;
        if (typeof message === "string") throw new Error(message);
        // Without a JSON error the answer came from the Vite proxy: the API itself is not running.
        if (response.status >= 500) throw new Error("Could not reach the hall of fame. Check that the game server is running.");
        throw new Error(`The hall of fame is unavailable right now (error ${response.status}).`);
    }
    return body;
}

/** The best runs, best first. */
export async function fetchHallOfFame(signal?: AbortSignal): Promise<HallOfFameEntry[]> {
    const body = (await requestJson("/api/hall-of-fame", {}, signal)) as { entries?: unknown } | null;
    if (!Array.isArray(body?.entries) || !body.entries.every(isValidEntry)) throw new Error("The hall of fame sent invalid data.");
    return body.entries;
}

/** Submits a finished run. Resolves with the stored entry (also when this run was already stored before). */
export async function submitRun(submission: RunSubmission): Promise<{ entry: HallOfFameEntry; duplicate: boolean }> {
    const body = (await requestJson("/api/hall-of-fame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission),
    })) as { entry?: unknown; rank?: unknown; duplicate?: unknown } | null;
    const entry = body?.entry && typeof body.entry === "object" ? { ...body.entry, rank: body.rank } : null;
    if (!isValidEntry(entry)) throw new Error("The hall of fame sent an invalid answer.");
    return { entry, duplicate: body?.duplicate === true };
}
