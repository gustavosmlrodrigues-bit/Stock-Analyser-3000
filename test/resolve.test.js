import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, editDistance, similarity, localSearch, parseYahooSearch, mergeCandidates, isConfident } from "../lib/resolve.js";

const SEC = [
  { ticker: "AAPL", title: "Apple Inc." },
  { ticker: "APLE", title: "Apple Hospitality REIT, Inc." },
  { ticker: "NVDA", title: "NVIDIA CORP" },
  { ticker: "MSFT", title: "MICROSOFT CORP" },
  { ticker: "AMZN", title: "AMAZON COM INC" },
  { ticker: "TSLA", title: "Tesla, Inc." },
  { ticker: "KO", title: "COCA COLA CO" },
  { ticker: "BRK-B", title: "BERKSHIRE HATHAWAY INC" },
  { ticker: "MCD", title: "MCDONALDS CORP" },
];
const top = (q) => localSearch(q, SEC)[0]?.symbol;

test("normalize strips accents, suffixes and punctuation", () => {
  assert.equal(normalize("Jerónimo Martins, SGPS S.A."), "jeronimo martins sgps");
  assert.equal(normalize("NVIDIA CORP"), "nvidia");
  assert.equal(normalize("McDonald's Corp"), "mcdonalds");
});

test("editDistance counts transpositions as one edit", () => {
  assert.equal(editDistance("nvidia", "nvdia"), 1);
  assert.equal(editDistance("tesla", "tesal"), 1);
  assert.equal(editDistance("", "abc"), 3);
});

test("similarity tolerates typos and prefixes", () => {
  assert.ok(similarity("nvdia", "NVIDIA CORP") > 0.8);
  assert.ok(similarity("micro", "MICROSOFT CORP") >= 0.8);
  assert.ok(similarity("jeronimo martin", "Jerónimo Martins") > 0.9);
  assert.ok(similarity("banana", "MICROSOFT CORP") < 0.5);
});

test("localSearch finds misspelt and Portuguese names", () => {
  assert.equal(top("nvdia"), "NVDA");
  assert.equal(top("microsft"), "MSFT");
  assert.equal(top("amazom"), "AMZN");
  assert.equal(top("tesal"), "TSLA");
  assert.equal(top("coca cola"), "KO");
  assert.equal(top("mcdonalds"), "MCD");
  assert.equal(top("jeronimo martins"), "JMT.LS");
  assert.equal(top("Jerónimo Martins"), "JMT.LS");
  assert.equal(top("galp"), "GALP.LS");
  assert.equal(top("edp"), "EDP.LS");
  assert.equal(top("google"), "GOOGL");
  assert.equal(top("facebok"), "META");
  assert.equal(top("berkshire"), "BRK-B");
  assert.equal(top("samsung"), "005930.KS");
  assert.equal(top("novo nordisk"), "NOVO-B.CO");
  assert.equal(top("AAPL"), "AAPL");
  assert.equal(top("aapl"), "AAPL");
  assert.equal(isConfident(mergeCandidates("aapl", localSearch("aapl", SEC))), true);
  assert.deepEqual(localSearch("zzqx", SEC), []);
});

test("'aple' is ambiguous (Apple vs the APLE ticker): ask instead of guessing", () => {
  const c = mergeCandidates("aple", localSearch("aple", SEC));
  assert.ok(c.slice(0, 2).some((x) => x.symbol === "AAPL"));
  assert.ok(c.slice(0, 2).some((x) => x.symbol === "APLE"));
  assert.equal(isConfident(c), false);
});

test("a ticker in capitals is taken as a ticker; in lowercase a name match can win", () => {
  const list = [...SEC, { ticker: "F", title: "FORD MOTOR CO" }, { ticker: "FORD", title: "Forward Industries, Inc." }];
  const ford = mergeCandidates("ford", localSearch("ford", list));
  assert.equal(ford[0].symbol, "F");
  const FORD = mergeCandidates("FORD", localSearch("FORD", list));
  assert.equal(FORD[0].symbol, "FORD");
  const apple = mergeCandidates("apple", localSearch("apple", SEC));
  assert.equal(apple[0].symbol, "AAPL");
  assert.equal(isConfident(apple), true);
});

test("parseYahooSearch keeps equities and ETFs only", () => {
  const r = parseYahooSearch({
    quotes: [
      { symbol: "ASML", longname: "ASML Holding N.V.", exchDisp: "NASDAQ", quoteType: "EQUITY" },
      { symbol: "ASML.AS", shortname: "ASML HOLDING", exchDisp: "Amsterdam", quoteType: "EQUITY" },
      { symbol: "ASML260116C00800000", quoteType: "OPTION" },
      { symbol: "VWCE.DE", longname: "Vanguard FTSE All-World", exchDisp: "XETRA", quoteType: "ETF" },
    ],
  });
  assert.deepEqual(r.map((x) => x.symbol), ["ASML", "ASML.AS", "VWCE.DE"]);
  assert.equal(r[0].exchange, "NASDAQ");
});

test("isConfident: clear winner yes, close call no, same company on two exchanges yes", () => {
  assert.equal(isConfident([{ name: "Apple Inc.", score: 1 }, { name: "Apple Hospitality", score: 0.9 }]), true);
  assert.equal(isConfident([{ name: "NVIDIA", score: 0.9 }, { name: "Nvent", score: 0.7 }]), true);
  assert.equal(isConfident([{ name: "A Co", score: 0.8 }, { name: "B Co", score: 0.75 }]), false);
  assert.equal(isConfident([{ name: "ASML Holding N.V.", score: 0.8 }, { name: "ASML Holding", score: 0.79 }]), true);
  assert.equal(isConfident([{ name: "X", score: 0.5 }]), false);
  assert.equal(isConfident([]), false);
});

test("mergeCandidates: an exact ticker typed wins; duplicates collapse", () => {
  const yahoo = [
    { symbol: "EDP.LS", name: "EDP - Energias de Portugal, S.A.", exchange: "Lisbon", score: 0.97, source: "yahoo" },
    { symbol: "EDPFY", name: "EDP - Energias de Portugal ADR", exchange: "OTC", score: 0.9, source: "yahoo" },
  ];
  const c = mergeCandidates("edp", yahoo, localSearch("edp", SEC));
  assert.equal(c[0].symbol, "EDP.LS");
  assert.equal(c[0].exchange, "Lisbon");
  assert.equal(c.filter((x) => x.symbol === "EDP.LS").length, 1);
});
