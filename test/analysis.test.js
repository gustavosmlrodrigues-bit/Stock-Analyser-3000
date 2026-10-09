import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMetrics } from "../lib/metrics.js";
import { fact } from "../lib/sources.js";
import { splitSummary } from "../lib/analyst.js";
import { buildUserPrompt, SYSTEM_PROMPT } from "../lib/prompts.js";
import { parseAnalyzeRequest } from "../server.js";
import { renderMarkdown } from "../public/markdown.js";

const p = (v) => fact(v, { source: "test", badge: "primary" });
const series = (vals, start = 2021) => vals.map((val, i) => ({ end: `${start + i}-12-31`, val }));

const financials = {
  ttm: { ocf: p(500), capex: p(100), sbc: p(50), netIncome: p(200), dividends: p(500), buybacks: p(300) },
  latest: { sharesOutstanding: p(100), cash: p(100), longTermDebt: p(400) },
  annual: {
    netIncome: series([100, 150, 200, 300]),
    ocf: series([300, 300, 310, 320]),
    capex: series([100, 100, 100, 100]),
    dilutedShares: series([90, 95, 100]),
    longTermDebt: series([200, 400]),
    revenue: series([1000, 1000, 1000, 1000, 1000]),
    operatingIncome: series([100, 100, 100, 100, 200]),
  },
};

test("computeMetrics: FCF, net debt, valuation with visible formulas", () => {
  const m = computeMetrics({ quote: { price: p(20) }, financials, reportingCurrencyMatches: true });
  assert.equal(m.fcfTtm.value, 400);
  assert.equal(m.fcfAfterSbcTtm.value, 350);
  assert.equal(m.netDebt.value, 300);
  assert.equal(m.marketCap.value, 2000);
  assert.equal(m.enterpriseValue.value, 2300);
  assert.equal(m.peGaap.value, 10);
  assert.ok(Math.abs(m.fcfYieldEv.value - (400 / 2300) * 100) < 1e-9);
  for (const k of ["fcfTtm", "netDebt", "marketCap", "peGaap", "fcfYieldEv"]) {
    assert.equal(m[k].badge, "calc");
    assert.ok(m[k].formula.length > 0, `${k} has a formula`);
  }
});

test("computeMetrics: broker price overrides market price", () => {
  const m = computeMetrics({ quote: { price: p(20) }, financials, priceOverride: 30, reportingCurrencyMatches: true });
  assert.equal(m.marketCap.value, 3000);
  assert.match(m.marketCap.formula, /utilizador/);
});

test("computeMetrics: forensic alerts", () => {
  const m = computeMetrics({ quote: { price: p(20) }, financials, reportingCurrencyMatches: true });
  const codes = m.alerts.map((a) => a.code);
  assert.ok(codes.includes("earnings_vs_cash"), "profit up 200% vs FCF ~10%");
  assert.ok(codes.includes("dilution"), "shares +5.3%");
  assert.ok(codes.includes("dividend_uncovered"), "dividends 500 > FCF 400");
  assert.ok(codes.includes("debt_funded_returns"));
  assert.ok(codes.includes("peak_margins"));
});

test("computeMetrics: no per-share valuation when currencies differ (ADR)", () => {
  const m = computeMetrics({ quote: { price: p(20) }, financials, reportingCurrencyMatches: false });
  assert.equal(m.marketCap, undefined);
  assert.equal(m.peGaap, undefined);
  assert.ok(m.alerts.some((a) => a.code === "currency_mismatch"));
});

test("splitSummary separates and clamps the JSON block", () => {
  const md = "## Veredicto\nTexto.\n\n```json\n{\"scores\":{\"hold\":12,\"buy\":6.5},\"verdict\":[\"a\"],\"action\":\"€400 agora\"}\n```\n";
  const { body, summary } = splitSummary(md);
  assert.equal(body, "## Veredicto\nTexto.");
  assert.deepEqual(summary.scores, { hold: 10, buy: 6.5 });
  assert.equal(summary.action, "€400 agora");
  assert.equal(splitSummary("sem bloco").summary, null);
  assert.equal(splitSummary("x\n```json\n{bad\n```").summary, null);
});

test("prompts: system prompt is stable; user prompt carries date, mode, language and dossier", () => {
  assert.doesNotMatch(SYSTEM_PROMPT, /\d{4}-\d{2}-\d{2}T/);
  const u = buildUserPrompt({ dossier: { ticker: "AAPL" }, mode: "deep", lang: "en", amountEur: 1000, nowIso: "2026-10-09T10:00:00Z" });
  assert.match(u, /2026-10-09T10:00:00Z/);
  assert.match(u, /PROFUNDO/);
  assert.match(u, /English/);
  assert.match(u, /€1000/);
  assert.match(u, /"ticker":"AAPL"/);
  const q = buildUserPrompt({ dossier: { ticker: "EDP.LS" }, mode: "quick", lang: "pt", nowIso: "x" });
  assert.match(q, /RÁPIDO/);
  assert.match(q, /português de Portugal/);
});

test("parseAnalyzeRequest validates input", () => {
  assert.deepEqual(parseAnalyzeRequest({ ticker: " aapl ", mode: "deep", brokerPrice: "123,45", amountEur: "" }), {
    ticker: "AAPL",
    mode: "deep",
    lang: "pt",
    brokerPrice: 123.45,
    brokerCurrency: "EUR",
    amountEur: null,
  });
  assert.equal(parseAnalyzeRequest({ ticker: "<script>" }).error, "invalid_ticker");
  assert.equal(parseAnalyzeRequest({ ticker: "AAPL", brokerPrice: "-3" }).error, "invalid_number");
  assert.equal(parseAnalyzeRequest({ ticker: "EDP.LS", mode: "x", lang: "en" }).mode, "quick");
});

test("renderMarkdown escapes HTML and only links http(s)", () => {
  const html = renderMarkdown('<img src=x onerror=alert(1)> [x](javascript:alert(1)) [✓](https://sec.gov/a?b=1&c=2)');
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /href="javascript/);
  assert.match(html, /class="badge b-primary"/);
});

test("renderMarkdown renders headings, tables and lists", () => {
  const html = renderMarkdown("## Preço\n| a | b |\n|---|---|\n| 1 | **2** |\n\n- um\n- dois\n\n1. x\n2. y");
  assert.match(html, /<h3>Preço<\/h3>/);
  assert.match(html, /<table>.*<th>a<\/th>.*<strong>2<\/strong>/s);
  assert.match(html, /<ul><li>um<\/li><li>dois<\/li><\/ul>/);
  assert.match(html, /<ol><li>x<\/li><li>y<\/li><\/ol>/);
});

test("renderMarkdown: emphasis never breaks link attributes", () => {
  const html = renderMarkdown("227 USD [≈](https://finance.yahoo.com/q_a_b) _(09/10 15:30)_ e https://x.com/a_b_c");
  assert.match(html, /target="_blank"/);
  assert.match(html, /<em>\(09\/10 15:30\)<\/em>/);
  assert.match(html, /href="https:\/\/finance.yahoo.com\/q_a_b"/);
  assert.match(html, /href="https:\/\/x.com\/a_b_c"/);
});
