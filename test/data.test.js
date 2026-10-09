import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { fact, parseCsv } from "../lib/sources.js";
import { parseYahooChart, parseStooq, parseEcbRate, toEur, getQuote, clearQuoteCache } from "../lib/market.js";
import { parseSubmissions, parseCompanyFacts } from "../lib/sec.js";
import { parseGoogleNewsRss } from "../lib/news.js";
import { parseFredCsv, cpiYoY } from "../lib/macro.js";

test("fact() requires a formula for calculated values and a known badge", () => {
  assert.throws(() => fact(1, { source: "x", badge: "calc" }), /formula/);
  assert.throws(() => fact(1, { source: "x", badge: "nope" }), /badge/);
  const f = fact(2, { source: "x", badge: "calc", formula: "1+1" });
  assert.equal(f.value, 2);
  assert.ok(f.asOf);
});

test("parseCsv handles quotes and CRLF", () => {
  const rows = parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n');
  assert.deepEqual(rows, [{ a: "x, y", b: 'he said "hi"' }]);
});

const day = (s) => Date.parse(`${s}T20:00:00Z`) / 1000;
const yahoo = {
  chart: {
    result: [
      {
        meta: { symbol: "AAPL", longName: "Apple Inc.", currency: "USD", fullExchangeName: "NasdaqGS", regularMarketPrice: 105, regularMarketTime: day("2026-10-09") },
        timestamp: [day("2026-10-07"), day("2026-10-08"), day("2026-10-09")],
        indicators: { quote: [{ close: [98, 100, 105], high: [120, 101, 106], low: [80, 97, 99] }] },
      },
    ],
  },
};

test("parseYahooChart computes change vs previous session and 52w range", () => {
  const q = parseYahooChart(yahoo, "u", "2026-10-09T20:00:00Z");
  assert.equal(q.price.value, 105);
  assert.equal(q.previousClose.value, 100);
  assert.equal(q.change.value, 5);
  assert.equal(q.changePct.value, 5);
  assert.equal(q.change.badge, "calc");
  assert.equal(q.high52.value, 120);
  assert.equal(q.low52.value, 80);
  assert.equal(q.price.badge, "aggregator");
});

test("parseYahooChart reports missing data instead of inventing it", () => {
  assert.throws(() => parseYahooChart({ chart: { result: null, error: { description: "No data found" } } }, "u"), /No data found/);
});

test("parseStooq marks unavailable fields as unverified", () => {
  const q = parseStooq("Symbol,Date,Time,Open,High,Low,Close,Volume,Name\nAAPL.US,2026-10-09,22:00:00,1,2,0.5,1.5,100,APPLE\n", "AAPL", "u", "t");
  assert.equal(q.price.value, 1.5);
  assert.equal(q.change.value, null);
  assert.equal(q.change.badge, "unverified");
  assert.throws(() => parseStooq("Symbol,Date,Time,Open,High,Low,Close\nX,N/D,N/D,N/D,N/D,N/D,N/D\n", "X", "u", "t"), /no data/);
});

test("ECB rate parse and EUR conversion (including pence)", () => {
  const rate = parseEcbRate("KEY,TIME_PERIOD,OBS_VALUE\nEXR.D.USD.EUR.SP00.A,2026-10-08,1.1000\n", "USD", "u", "t");
  assert.equal(rate.value, 1.1);
  assert.equal(rate.badge, "primary");
  const eur = toEur(110, { perEur: rate, divisor: 1, iso: "USD" });
  assert.ok(Math.abs(eur.value - 100) < 1e-9);
  assert.equal(eur.badge, "calc");
  const gbp = parseEcbRate("TIME_PERIOD,OBS_VALUE\n2026-10-08,0.8\n", "GBP", "u", "t");
  assert.ok(Math.abs(toEur(400, { perEur: gbp, divisor: 100, iso: "GBP" }).value - 5) < 1e-9);
});

test("getQuote caches for at most 15 minutes and falls back to Stooq", async (t) => {
  clearQuoteCache();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    calls++;
    if (String(url).includes("yahoo")) return new Response("blocked", { status: 429 });
    return new Response("Symbol,Date,Time,Open,High,Low,Close,Volume,Name\nMSFT.US,2026-10-09,22:00:00,1,2,0.5,400,MICROSOFT\n");
  });
  const now = Date.now();
  const a = await getQuote("msft", { now });
  assert.equal(a.quote.price.value, 400);
  assert.equal(a.errors[0].source, "Yahoo Finance");
  assert.equal(calls, 2);
  const b = await getQuote("MSFT", { now: now + 14 * 60 * 1000 });
  assert.equal(calls, 2, "served from cache under 15 min");
  assert.ok(b.cachedAgeSec > 0);
  await getQuote("MSFT", { now: now + 16 * 60 * 1000 });
  assert.equal(calls, 4, "refetched after 15 min");
});

test("parseSubmissions keeps watched forms with primary-source links", () => {
  const recent = new Date().toISOString().slice(0, 10);
  const s = parseSubmissions(
    {
      name: "Apple Inc.",
      filings: {
        recent: {
          form: ["4", "8-K", "SD", "10-Q"],
          filingDate: [recent, "2026-08-01", "2026-07-01", "2026-08-02"],
          accessionNumber: ["0001-26-000001", "0001-26-000002", "0001-26-000003", "0001-26-000004"],
          primaryDocument: ["x.xml", "a.htm", "b.htm", "c.htm"],
          reportDate: ["", "", "", "2026-06-28"],
          items: ["", "2.02,9.01", "", ""],
        },
      },
    },
    320193,
    "t",
  );
  assert.deepEqual(s.filings.map((f) => f.form), ["4", "8-K", "10-Q"]);
  assert.equal(s.filings[1].url, "https://www.sec.gov/Archives/edgar/data/320193/000126000002/a.htm");
  assert.equal(s.insiderForm4Last90d.value, 1);
  assert.equal(s.isForeignFiler, false);
});

// Fiscal year ends Dec 31. FY2024 and FY2025 annual + YTD Q2 2025 and Q2 2026.
const usd = (rows) => ({ units: { USD: rows } });
const facts = {
  entityName: "Test Co",
  facts: {
    "us-gaap": {
      Revenues: usd([
        { start: "2024-01-01", end: "2024-12-31", val: 1000, form: "10-K", fp: "FY", filed: "2025-02-01" },
        { start: "2025-01-01", end: "2025-12-31", val: 1200, form: "10-K", fp: "FY", filed: "2026-02-01" },
        { start: "2025-01-01", end: "2025-06-30", val: 550, form: "10-Q", fp: "Q2", filed: "2025-08-01" },
        { start: "2026-01-01", end: "2026-06-30", val: 700, form: "10-Q", fp: "Q2", filed: "2026-08-01" },
        // Same period re-reported later (restatement): latest filed wins
        { start: "2025-01-01", end: "2025-12-31", val: 1210, form: "10-K", fp: "FY", filed: "2026-03-01" },
      ]),
      NetCashProvidedByUsedInOperatingActivities: usd([{ start: "2025-01-01", end: "2025-12-31", val: 300, form: "10-K", filed: "2026-02-01" }]),
      PaymentsToAcquirePropertyPlantAndEquipment: usd([{ start: "2025-01-01", end: "2025-12-31", val: 100, form: "10-K", filed: "2026-02-01" }]),
      CashAndCashEquivalentsAtCarryingValue: usd([
        { end: "2025-12-31", val: 50, form: "10-K", filed: "2026-02-01" },
        { end: "2026-06-30", val: 80, form: "10-Q", filed: "2026-08-01" },
      ]),
    },
  },
};

test("parseCompanyFacts builds annual series and TTM = FY + YTD − prior YTD", () => {
  const f = parseCompanyFacts(facts, 1, "t");
  assert.deepEqual(f.annual.revenue.map((r) => r.val), [1000, 1210]);
  assert.equal(f.ttm.revenue.value, 1210 + 700 - 550);
  assert.equal(f.ttm.revenue.badge, "calc");
  assert.match(f.ttm.revenue.formula, /acumulado/);
  assert.equal(f.ttm.ocf.value, 300);
  assert.equal(f.ttm.ocf.badge, "primary");
  assert.equal(f.latest.cash.value, 80);
  assert.equal(f.units.revenue, "USD");
});

test("parseGoogleNewsRss extracts title, source, date and flags paywalls", () => {
  const xml = `<rss><channel><item><title>Apple falls on tariff news - Reuters</title><link>https://news.google.com/a</link><pubDate>Thu, 09 Oct 2026 12:00:00 GMT</pubDate><source url="https://www.reuters.com">Reuters</source></item>
  <item><title><![CDATA[Apple &amp; the Fed - WSJ]]></title><link>https://news.google.com/b</link><pubDate>Thu, 09 Oct 2026 14:00:00 GMT</pubDate><source url="https://www.wsj.com">WSJ</source></item></channel></rss>`;
  const items = parseGoogleNewsRss(xml);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Apple & the Fed");
  assert.equal(items[0].paywalled, true);
  assert.equal(items[1].title, "Apple falls on tariff news");
  assert.equal(items[1].source, "Reuters");
  assert.equal(items[1].paywalled, false);
  assert.equal(items[1].publishedAt, "2026-10-09T12:00:00.000Z");
});

test("FRED CSV parsing skips missing values; CPI YoY", () => {
  const obs = parseFredCsv("observation_date,DGS10\n2026-10-07,4.10\n2026-10-08,.\n2026-10-09,4.20\n", "DGS10");
  assert.deepEqual(obs.map((o) => o.val), [4.1, 4.2]);
  const cpi = parseFredCsv("DATE,CPIAUCSL\n2025-08-01,300\n2026-07-01,306\n2026-08-01,309\n", "CPIAUCSL");
  assert.ok(Math.abs(cpiYoY(cpi).value - 3) < 1e-9);
});
