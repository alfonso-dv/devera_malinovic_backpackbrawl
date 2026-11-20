import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOpponent, isValidOpponent } from "./api";

/* ------------- B5 TESTS ------------- */

const valid = { id: "x", name: "X", icon: "🐢", hp: 25, items: ["pot-lid"], round: 1 };

const respond = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })));

afterEach(() => vi.unstubAllGlobals());

describe("isValidOpponent", () => {
  it("accepts a well-formed opponent", () => {
    expect(isValidOpponent(valid)).toBe(true);
  });

  it.each([
    ["null", null],
    ["missing name", { ...valid, name: undefined }],
    ["zero hp", { ...valid, hp: 0 }],
    ["unknown item", { ...valid, items: ["laser-sword"] }],
    ["too many items", { ...valid, items: Array(7).fill("pot-lid") }],
    ["non-integer round", { ...valid, round: 1.5 }],
  ])("rejects %s", (_, data) => {
    expect(isValidOpponent(data)).toBe(false);
  });
});

describe("fetchOpponent", () => {
  it("resolves with a valid opponent", async () => {
    respond(200, valid);
    await expect(fetchOpponent(1)).resolves.toEqual(valid);
  });

  it("uses the server's error message", async () => {
    respond(503, { error: "The arena gates are shut." });
    await expect(fetchOpponent(1)).rejects.toThrow("The arena gates are shut.");
  });

  it("explains an error without a JSON body (e.g. API not running behind the proxy)", async () => {
    respond(502, "Bad Gateway");
    await expect(fetchOpponent(1)).rejects.toThrow("The arena is unavailable right now (error 502). Check that the game server is running.");
  });

  it("explains a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(fetchOpponent(1)).rejects.toThrow("Could not reach the arena");
  });

  it("rejects an invalid response body", async () => {
    respond(200, { ...valid, items: ["laser-sword"] });
    await expect(fetchOpponent(1)).rejects.toThrow("invalid challenger");
  });
});