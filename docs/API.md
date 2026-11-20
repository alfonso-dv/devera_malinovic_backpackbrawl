# Backpack Brawl API

The local API is a small Express server in `server/index.js`. It listens on port 4200 (override with the `PORT` environment variable). During Vite development, `/api` is proxied to it, so the frontend uses relative URLs such as `/api/opponents?round=1`. All responses are JSON. Only the hall of fame (B7) keeps state, in memory; restarting the server empties it.

## `GET /api/health`

Always answers immediately with status 200:

```json
{ "ok": true, "service": "backpack-brawl" }
```

## `GET /api/opponents`

Returns the opponent for one round of a run. The opponent table lives in `server/opponents.js`.

### Query parameters

| Parameter | Required | Meaning |
|---|---|---|
| `round` | yes | The 1-based round number. Must be a positive whole number written in digits (`1`, `2`, …). |
| `latency` | no | Response delay in milliseconds, clamped to 0–5000. Defaults to 1200. A value that is not a number falls back to the default. |
| `fail` | no | `fail=true` forces a 503 response (see below). |

### Success — 200

```json
{
  "id": "mossback-hermit",
  "name": "Mossback Hermit",
  "icon": "🐢",
  "hp": 25,
  "items": ["chipped-dagger", "pot-lid"],
  "round": 1
}
```

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Stable identifier of the opponent |
| `name` | string | Display name |
| `icon` | string | Emoji shown in the battle view |
| `hp` | number | Maximum (and starting) HP |
| `items` | string[] | Item ids from the catalog in `src/items.ts`; the same id may appear several times |
| `round` | number | The round this opponent was requested for (echoes `round`) |

The response matches the `Opponent` type in `src/types.ts`.

The answer is deterministic: the same `round` always returns the same opponent. There is one hand-built opponent per round for rounds 1–7. Every round past the table returns the last opponent with +6 HP per additional round. The table never needs more than 7 rounds (5 wins + 3 lives − 1), and an opponent never carries more than 6 items, the size of the player's 2×3 backpack.

### Errors

Every error response has the shape:

```json
{ "error": "human-readable explanation" }
```

| Status | When | `error` |
|---|---|---|
| 400 | `round` is missing, not a whole number, or less than 1 | `round must be a positive whole number` |
| 503 | `fail=true`, or the server was started with `API_FAIL=true` | `The arena gates are shut. No challenger answered the call.` |

An invalid `round` is reported as 400 even when failure is forced. All responses from this endpoint, errors included, arrive after the configured delay.

## `GET /api/hall-of-fame` (B7)

Returns the best finished runs, best first. The entries are kept **in memory**: restarting the server empties the hall of fame.

### Query parameters

| Parameter | Required | Meaning |
|---|---|---|
| `limit` | no | Number of entries, 1–50. Defaults to 10. Values that are not whole numbers fall back to 10. |
| `latency` | no | Response delay in milliseconds, clamped to 0–5000. Defaults to 600. |
| `fail` | no | `fail=true` forces a 503 response. |

### Success — 200

```json
{
  "entries": [
    { "rank": 1, "runId": "6f1c…", "name": "Loretta", "outcome": "victory", "wins": 5, "lives": 2, "rounds": 6, "createdAt": "2026-11-20T18:00:00.000Z" }
  ],
  "total": 1
}
```

`total` is the number of stored runs (it can be larger than the number of returned entries). An empty hall of fame returns `"entries": []`.

### Ranking

1. Victories before defeats
2. More wins
3. Fewer rounds
4. More lives left
5. Earlier submission (`createdAt`)

## `POST /api/hall-of-fame` (B7)

Submits one finished run. Body (JSON, at most 2 KB):

```json
{ "runId": "6f1c…", "name": "Loretta", "outcome": "victory", "wins": 5, "lives": 2, "rounds": 6 }
```

| Field | Rule |
|---|---|
| `runId` | 8–64 letters, digits or dashes. Unique per run, created by the client when the run starts. |
| `name` | 1–20 characters after trimming; letters (any language), digits, spaces and `- _ .`. Multiple spaces are collapsed. |
| `outcome` | `"victory"` or `"defeat"` |
| `wins` | whole number 0–5 |
| `lives` | whole number 0–3 |
| `rounds` | whole number 1–7 |

The run must also be **possible**: a victory has exactly 5 wins and at least 1 life left, a defeat has 0 lives and fewer than 5 wins, and `rounds` must equal `wins + (3 − lives)` because every round is one battle.

### Responses

| Status | When | Body |
|---|---|---|
| 201 | Run stored | `{ "entry": { …, "createdAt": "…" }, "rank": 3, "duplicate": false }` |
| 200 | The same `runId` with the same data was already stored (e.g. a retry after a lost answer). Nothing is stored twice. | `{ "entry": { … }, "rank": 3, "duplicate": true }` |
| 400 | Body is not valid JSON | `{ "error": "The request body must be valid JSON." }` |
| 409 | The same `runId` was already stored with **different** data | `{ "error": "This run was already submitted with different data." }` |
| 413 | Body larger than 2 KB | `{ "error": "The request body is too large." }` |
| 422 | A field is missing or invalid, or the run is impossible | `{ "error": "…explains the problem…" }`, e.g. `"rounds does not match wins and lives: this run must have taken 6 rounds."` |
| 503 | `fail=true` (or `API_FAIL=true`) | `{ "error": "The hall of fame is closed right now. Please try again." }` |

The validation lives in `server/hallOfFame.js` and is unit-tested in `server/hallOfFame.test.js`.

### Client

`fetchHallOfFame()` and `submitRun(submission)` in `src/api.ts` perform the requests and throw an `Error` with a message the player can read.

## Environment variables

| Variable | Effect |
|---|---|
| `PORT` | Port to listen on (default 4200). The Vite proxy expects 4200. |
| `API_LATENCY` | Default delay in milliseconds when a request has no `latency` parameter. |
| `API_FAIL` | `true` makes every opponent and hall of fame request fail with 503. |

Example: `API_FAIL=true pnpm server`.

## Client

`fetchOpponent(round)` in `src/api.ts` performs the request. It resolves with the `Opponent` on success and throws an `Error` carrying the server's `error` text (or a generic message with the status code) for any non-2xx response. When the API is not running, the Vite proxy answers with an error status of its own, which is reported the same way; a network failure rejects as well.