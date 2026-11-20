import { CATALOG } from "./items";
import { BACKPACK_SIZE } from "./shop";
import type { Opponent } from "./types";

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