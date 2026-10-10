import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScreenRequest, parseCandidates, rankResults } from "../lib/screener.js";
import { extractJsonBlock } from "../lib/analyst.js";
import { SYSTEM_PROMPT, SCREEN_SYSTEM_PROMPT, buildScreenCandidatesPrompt, buildScreenScoringPrompt } from "../lib/prompts.js";

test("parseScreenRequest: defaults to buy ≥ 8.5, global, 15 candidates", () => {
  assert.deepEqual(parseScreenRequest({ thesis: "  o petróleo   vai descer " }), {
    thesis: "o petróleo vai descer",
    minScore: 8.5,
    scoreKey: "buy",
    region: "global",
    count: 15,
    lang: "pt",
  });
  const r = parseScreenRequest({ minScore: "8,5", scoreKey: "hold", region: "europe", count: "99", lang: "en" });
  assert.equal(r.minScore, 8.5);
  assert.equal(r.scoreKey, "hold");
  assert.equal(r.region, "europe");
  assert.equal(r.count, 25);
  assert.equal(parseScreenRequest({ region: "mars", count: "x" }).region, "global");
  assert.equal(parseScreenRequest({ count: "x" }).count, 15);
  assert.equal(parseScreenRequest({ minScore: "11" }).error, "invalid_score");
  assert.equal(parseScreenRequest({ minScore: "abc" }).error, "invalid_score");
  assert.equal(parseScreenRequest({ thesis: "x".repeat(401) }).error, "invalid_thesis");
});

test("parseCandidates keeps valid, unique tickers up to the limit", () => {
  const json = {
    candidates: [
      { symbol: "dal", name: "Delta" },
      { symbol: "DAL", name: "dup" },
      { symbol: "<script>", name: "bad" },
      { symbol: "RYA.IR", name: "Ryanair", link: "beneficia" },
      { name: "no symbol" },
      { symbol: "UNP", name: "Union Pacific" },
    ],
  };
  assert.deepEqual(parseCandidates(json, 2).map((c) => c.symbol), ["DAL", "RYA.IR"]);
  assert.deepEqual(parseCandidates(null, 5), []);
});

test("rankResults filters by the chosen score, sorts, and never invents scores", () => {
  const candidates = [{ symbol: "A", name: "A" }, { symbol: "B", name: "B" }, { symbol: "C", name: "C" }];
  const json = {
    results: [
      { symbol: "a", buy: 8.6, hold: 9, thesisFit: 7 },
      { symbol: "B", buy: 12, hold: 6, thesisFit: 9 },
      { symbol: "Z", buy: 10 }, // not a confirmed candidate: ignored
    ],
  };
  const rows = rankResults(json, candidates, { minScore: 8.5, scoreKey: "buy" });
  assert.deepEqual(rows.map((r) => r.symbol), ["B", "A", "C"]);
  assert.equal(rows[0].buy, 10, "clamped to 0-10");
  assert.deepEqual(rows.map((r) => r.passes), [true, true, false]);
  assert.equal(rows[2].buy, null);
  const byHold = rankResults(json, candidates, { minScore: 8.5, scoreKey: "hold" });
  assert.deepEqual(byHold.filter((r) => r.passes).map((r) => r.symbol), ["A"]);
  assert.ok(rankResults(null, candidates, { minScore: 0, scoreKey: "buy" }).every((r) => !r.passes));
});

test("extractJsonBlock splits the trailing JSON", () => {
  const { body, json } = extractJsonBlock('## Tese\nTexto\n```json\n{"candidates":[]}\n```\n');
  assert.equal(body, "## Tese\nTexto");
  assert.deepEqual(json, { candidates: [] });
  assert.equal(extractJsonBlock("```json\n{oops\n```").json, null);
});

test("screener prompts share the analyst's rules and carry thesis, filter and data", () => {
  const core = SYSTEM_PROMPT.slice(0, SYSTEM_PROMPT.indexOf("# FORMATO DE SAÍDA"));
  assert.ok(SCREEN_SYSTEM_PROMPT.startsWith(core.trimEnd()), "same golden rules and score calibration");
  assert.doesNotMatch(SCREEN_SYSTEM_PROMPT, /\d{4}-\d{2}-\d{2}T/);
  const p1 = buildScreenCandidatesPrompt({ thesis: "o petróleo vai descer", region: "europe", count: 12, lang: "pt", nowIso: "2026-10-10T09:00:00Z" });
  assert.match(p1, /o petróleo vai descer/);
  assert.match(p1, /Europa/);
  assert.match(p1, /12 ações/);
  assert.match(p1, /2026-10-10T09:00:00Z/);
  const p2 = buildScreenScoringPrompt({ thesis: "t", thesisView: { view: "discutível" }, dossiers: [{ ticker: "DAL" }], minScore: 8.5, scoreKey: "buy", lang: "en", nowIso: "x" });
  assert.match(p2, /Comprar agora" ≥ 8.5/);
  assert.match(p2, /"ticker":"DAL"/);
  assert.match(p2, /discutível/);
  assert.match(p2, /English/);
});
