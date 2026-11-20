import cors from "cors";
import express from "express";
import { createHallOfFame, parseLimit, validateSubmission } from "./hallOfFame.js";
import { opponentForRound, parseRound } from "./opponents.js";

const app = express();
const port = Number(process.env.PORT ?? 4200);

app.use(cors());
// B7: small JSON bodies only; a submitted run is a few short fields.
app.use(express.json({ limit: "2kb" }));
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "backpack-brawl" }));

app.get("/api/opponents", (req, res) => {
  const requested = Number(req.query.latency ?? process.env.API_LATENCY ?? 1200);
  const latency = Number.isFinite(requested) ? Math.max(0, Math.min(5000, requested)) : 1200;
  setTimeout(() => {
    const round = parseRound(req.query.round);
    if (round === null) return res.status(400).json({ error: "round must be a positive whole number" });
    if (req.query.fail === "true" || process.env.API_FAIL === "true") {
      return res.status(503).json({ error: "The arena gates are shut. No challenger answered the call." });
    }
    res.json(opponentForRound(round));
  }, latency);
});

/* ------------- B7: hall of fame ------------- */

const hallOfFame = createHallOfFame();

/** Same delay and forced-failure options as /api/opponents (default 600 ms), so loading and error states can be tried out. */
function withDelay(req, res, handler) {
  const requested = Number(req.query.latency ?? process.env.API_LATENCY ?? 600);
  const latency = Number.isFinite(requested) ? Math.max(0, Math.min(5000, requested)) : 600;
  setTimeout(() => {
    if (req.query.fail === "true" || process.env.API_FAIL === "true") {
      return res.status(503).json({ error: "The hall of fame is closed right now. Please try again." });
    }
    handler();
  }, latency);
}

app.get("/api/hall-of-fame", (req, res) => {
  withDelay(req, res, () => res.json({ entries: hallOfFame.top(parseLimit(req.query.limit)), total: hallOfFame.size }));
});

app.post("/api/hall-of-fame", (req, res) => {
  withDelay(req, res, () => {
    const { value, error } = validateSubmission(req.body);
    if (error) return res.status(422).json({ error });
    const result = hallOfFame.add(value);
    if (result.conflict) return res.status(409).json({ error: "This run was already submitted with different data." });
    res.status(result.duplicate ? 200 : 201).json(result);
  });
});

// B7: answer broken JSON bodies with a clear JSON error instead of Express' HTML page.
app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "The request body must be valid JSON." });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "The request body is too large." });
  res.status(500).json({ error: "Something went wrong on the server." });
});

app.listen(port, () => console.log(`Backpack Brawl API listening on http://localhost:${port}`));