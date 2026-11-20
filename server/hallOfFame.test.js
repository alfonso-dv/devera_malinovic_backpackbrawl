import { describe, expect, it } from "vitest";
import { compareEntries, createHallOfFame, DEFAULT_LIMIT, MAX_LIMIT, parseLimit, validateSubmission } from "./hallOfFame.js";

/* ------------- B7 TESTS (server) ------------- */

const victory = { runId: "run-aaaa-0001", name: "Loretta", outcome: "victory", wins: 5, lives: 2, rounds: 6 };
const defeat = { runId: "run-aaaa-0002", name: "Kim", outcome: "defeat", wins: 3, lives: 0, rounds: 6 };

describe("validateSubmission", () => {
    it("accepts a possible run and cleans the name", () => {
        expect(validateSubmission({ ...victory, name: "  Lo   retta " })).toEqual({ value: { ...victory, name: "Lo retta" } });
        expect(validateSubmission(defeat).value).toEqual(defeat);
    });

    it.each([
        ["no object", null],
        ["an array", []],
        ["missing runId", { ...victory, runId: undefined }],
        ["short runId", { ...victory, runId: "abc" }],
        ["missing name", { ...victory, name: undefined }],
        ["empty name", { ...victory, name: "   " }],
        ["too long name", { ...victory, name: "x".repeat(21) }],
        ["name with HTML", { ...victory, name: "<script>" }],
        ["unknown outcome", { ...victory, outcome: "draw" }],
        ["non-integer wins", { ...victory, wins: 4.5 }],
        ["too many lives", { ...victory, lives: 4 }],
        ["victory without 5 wins", { ...victory, wins: 4, rounds: 5 }],
        ["victory without lives", { ...victory, lives: 0, rounds: 8 }],
        ["defeat with lives left", { ...defeat, lives: 1, rounds: 5 }],
        ["defeat with 5 wins", { ...defeat, wins: 5, rounds: 8 }],
        ["rounds that don't fit", { ...victory, rounds: 5 }],
    ])("rejects %s with a message", (_name, body) => {
        const result = validateSubmission(body);
        expect(result.value).toBeUndefined();
        expect(typeof result.error).toBe("string");
    });

    it("explains which rounds would fit", () => {
        expect(validateSubmission({ ...victory, rounds: 5 }).error).toMatch(/6 rounds/);
    });
});

describe("ranking", () => {
    const entry = (e) => ({ createdAt: "2026-01-01T00:00:00.000Z", ...e });

    it("puts victories first, then more wins, then fewer rounds, then more lives", () => {
        const list = [
            entry({ runId: "d1", outcome: "defeat", wins: 4, lives: 0, rounds: 7 }),
            entry({ runId: "v2", outcome: "victory", wins: 5, lives: 1, rounds: 7 }),
            entry({ runId: "d2", outcome: "defeat", wins: 2, lives: 0, rounds: 5 }),
            entry({ runId: "v1", outcome: "victory", wins: 5, lives: 3, rounds: 5 }),
            entry({ runId: "d3", outcome: "defeat", wins: 4, lives: 0, rounds: 7, createdAt: "2026-02-01T00:00:00.000Z" }),
        ];
        expect(list.sort(compareEntries).map((e) => e.runId)).toEqual(["v1", "v2", "d1", "d3", "d2"]);
    });
});

describe("createHallOfFame", () => {
    let clock = 0;
    const now = () => new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)).toISOString();

    it("stores runs and returns their rank", () => {
        const hof = createHallOfFame(now);
        expect(hof.add(defeat)).toMatchObject({ rank: 1, duplicate: false });
        expect(hof.add(victory)).toMatchObject({ rank: 1, duplicate: false }); // a victory beats the defeat
        expect(hof.top().map((e) => [e.rank, e.name])).toEqual([[1, "Loretta"], [2, "Kim"]]);
    });

    it("never stores the same run twice: a retry returns the stored entry", () => {
        const hof = createHallOfFame(now);
        const first = hof.add(victory);
        const again = hof.add(victory);
        expect(again.duplicate).toBe(true);
        expect(again.entry).toEqual(first.entry);
        expect(hof.size).toBe(1);
    });

    it("rejects the same runId with different data", () => {
        const hof = createHallOfFame(now);
        hof.add(victory);
        expect(hof.add({ ...victory, name: "Cheater" })).toEqual({ conflict: true });
        expect(hof.size).toBe(1);
    });

    it("starts empty and limits the list", () => {
        const hof = createHallOfFame(now);
        expect(hof.top()).toEqual([]);
        for (let i = 0; i < 15; i++) hof.add({ ...defeat, runId: `run-many-${String(i).padStart(4, "0")}` });
        expect(hof.top()).toHaveLength(DEFAULT_LIMIT);
        expect(hof.top(3)).toHaveLength(3);
    });
});

describe("parseLimit", () => {
    it.each([
        [undefined, DEFAULT_LIMIT],
        ["abc", DEFAULT_LIMIT],
        ["0", 1],
        ["5", 5],
        ["999", MAX_LIMIT],
    ])("%s → %s", (input, expected) => {
        expect(parseLimit(input)).toBe(expected);
    });
});
