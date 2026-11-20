import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchHallOfFame, submitRun } from "./api";
import { getSubmitted, markSubmitted, nameBlocker, normalizeName, SUBMITTED_KEY, toSubmission } from "./hallOfFame";
import { newRun } from "./run";
import type { RunState } from "./types";

/* ------------- B7 TESTS (client) ------------- */

const run = (change: Partial<RunState>): RunState => ({ ...newRun(1, "run-test-0001"), ...change });

describe("nameBlocker", () => {
    it.each([
        ["", "Enter your name"],
        ["   ", "Enter your name"],
        ["x".repeat(21), "At most 20 characters"],
        ["<b>Hi</b>", "Only letters, digits, spaces and - _ ."],
    ])("blocks %j", (name, reason) => {
        expect(nameBlocker(name)).toBe(reason);
    });

    it("accepts normal names, also with umlauts", () => {
        expect(nameBlocker("Loretta")).toBeNull();
        expect(nameBlocker("Jörg_2.0")).toBeNull();
    });

    it("normalizes spaces like the server", () => {
        expect(normalizeName("  Lo   retta ")).toBe("Lo retta");
    });
});

describe("toSubmission", () => {
    it("is null while the run is not over", () => {
        expect(toSubmission(run({ wins: 2, lives: 3, round: 3 }), "Lo")).toBeNull();
    });

    it("builds the data for a finished run", () => {
        expect(toSubmission(run({ wins: 5, lives: 2, round: 6 }), " Lo ")).toEqual({
            runId: "run-test-0001",
            name: "Lo",
            outcome: "victory",
            wins: 5,
            lives: 2,
            rounds: 6,
        });
        expect(toSubmission(run({ wins: 1, lives: 0, round: 4 }), "Lo")?.outcome).toBe("defeat");
    });
});

describe("remembering submitted runs", () => {
    const store = new Map<string, string>();
    beforeEach(() => {
        store.clear();
        vi.stubGlobal("localStorage", {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => store.set(k, v),
        });
    });
    afterEach(() => vi.unstubAllGlobals());

    it("remembers a submitted run", () => {
        expect(getSubmitted("run-a")).toBeNull();
        markSubmitted("run-a", { name: "Lo", rank: 3 });
        expect(getSubmitted("run-a")).toEqual({ name: "Lo", rank: 3 });
    });

    it("survives broken storage data", () => {
        store.set(SUBMITTED_KEY, "{broken");
        expect(getSubmitted("run-a")).toBeNull();
    });
});

describe("hall of fame API client", () => {
    const entry = { runId: "run-test-0001", name: "Lo", outcome: "victory", wins: 5, lives: 2, rounds: 6, createdAt: "2026-01-01T00:00:00.000Z" };
    const respond = (status: number, body: unknown) => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
        vi.stubGlobal("fetch", fetchMock);
        return fetchMock;
    };
    afterEach(() => vi.unstubAllGlobals());

    it("loads the list", async () => {
        respond(200, { entries: [{ rank: 1, ...entry }], total: 1 });
        expect(await fetchHallOfFame()).toEqual([{ rank: 1, ...entry }]);
    });

    it("rejects invalid list data", async () => {
        respond(200, { entries: [{ name: "?" }] });
        await expect(fetchHallOfFame()).rejects.toThrow("invalid data");
    });

    it("submits a run as JSON and returns the entry with its rank", async () => {
        const fetchMock = respond(201, { entry, rank: 4, duplicate: false });
        const result = await submitRun({ runId: entry.runId, name: "Lo", outcome: "victory", wins: 5, lives: 2, rounds: 6 });
        expect(result).toEqual({ entry: { ...entry, rank: 4 }, duplicate: false });
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("/api/hall-of-fame");
        expect(init.method).toBe("POST");
    });

    it("passes on the server's error message", async () => {
        respond(422, { error: "rounds does not match wins and lives" });
        await expect(submitRun({ runId: entry.runId, name: "Lo", outcome: "victory", wins: 5, lives: 2, rounds: 3 })).rejects.toThrow("rounds does not match");
    });

    it("explains an unreachable server", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
        await expect(fetchHallOfFame()).rejects.toThrow("Could not reach the hall of fame");
    });
});

describe("hall of fame API client without a running server", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("explains a proxy error (API not started)", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("Bad Gateway", { status: 502 })));
        await expect(fetchHallOfFame()).rejects.toThrow("Check that the game server is running");
    });
});
