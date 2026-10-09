import { fact, fetchJson, fetchText, parseCsv, SourceError } from "./sources.js";

// The only cache in the app: quotes younger than 15 minutes (rule 1).
const QUOTE_TTL_MS = 15 * 60 * 1000;
const quoteCache = new Map();

export function clearQuoteCache() {
  quoteCache.clear();
}

/** Parse a Yahoo Finance v8 chart response into a quote. Exported for tests. */
export function parseYahooChart(json, url, fetchedAt) {
  const result = json?.chart?.result?.[0];
  if (!result) throw new SourceError("Yahoo Finance", url, json?.chart?.error?.description ?? "no data");
  const meta = result.meta ?? {};
  const q = result.indicators?.quote?.[0] ?? {};
  const ts = result.timestamp ?? [];
  const closes = (q.close ?? []).map((v, i) => ({ v, t: ts[i] })).filter((x) => x.v != null);
  const highs = (q.high ?? []).filter((v) => v != null);
  const lows = (q.low ?? []).filter((v) => v != null);

  const price = meta.regularMarketPrice ?? closes.at(-1)?.v;
  if (price == null) throw new SourceError("Yahoo Finance", url, "no price");

  // Previous close: the last daily bar that is not the current trading day.
  const marketDay = meta.regularMarketTime ? dayKey(meta.regularMarketTime) : null;
  const prior = closes.filter((c) => marketDay == null || dayKey(c.t) !== marketDay);
  const previousClose = meta.previousClose ?? prior.at(-1)?.v ?? null;

  const high52 = meta.fiftyTwoWeekHigh ?? (highs.length ? Math.max(...highs) : null);
  const low52 = meta.fiftyTwoWeekLow ?? (lows.length ? Math.min(...lows) : null);
  const asOf = meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : fetchedAt;
  const src = { source: "Yahoo Finance", url: `https://finance.yahoo.com/quote/${encodeURIComponent(meta.symbol ?? "")}`, badge: "aggregator", asOf };

  const change = previousClose != null ? price - previousClose : null;
  return {
    symbol: meta.symbol,
    name: meta.longName ?? meta.shortName ?? meta.symbol,
    exchange: meta.fullExchangeName ?? meta.exchangeName ?? null,
    currency: meta.currency ?? null,
    instrumentType: meta.instrumentType ?? null,
    price: fact(price, src),
    previousClose: fact(previousClose, src),
    change: fact(change, { ...src, badge: "calc", formula: "preço − fecho anterior" }),
    changePct: fact(change != null && previousClose ? (change / previousClose) * 100 : null, {
      ...src,
      badge: "calc",
      formula: "(preço − fecho anterior) / fecho anterior × 100",
    }),
    high52: fact(high52, src),
    low52: fact(low52, src),
    fetchedAt,
  };
}

function dayKey(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

async function yahooQuote(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1y&interval=1d&includePrePost=false`;
  const { json, fetchedAt } = await fetchJson(url, { source: "Yahoo Finance" });
  return parseYahooChart(json, url, fetchedAt);
}

/** Stooq fallback (last price only). US tickers need the ".us" suffix. */
export function parseStooq(text, ticker, url, fetchedAt) {
  const [row] = parseCsv(text);
  const close = Number(row?.Close);
  if (!row || !Number.isFinite(close)) throw new SourceError("Stooq", url, "no data");
  const asOf = row.Date && row.Time ? new Date(`${row.Date}T${row.Time}Z`).toISOString() : fetchedAt;
  const src = { source: "Stooq", url: `https://stooq.com/q/?s=${encodeURIComponent(stooqSymbol(ticker))}`, badge: "aggregator", asOf };
  const none = (label) => fact(null, { ...src, badge: "unverified", note: `${label} indisponível no Stooq` });
  return {
    symbol: ticker,
    name: row.Name || ticker,
    exchange: null,
    currency: null,
    instrumentType: null,
    price: fact(close, src),
    previousClose: none("fecho anterior"),
    change: none("variação"),
    changePct: none("variação %"),
    high52: none("máximo 52 semanas"),
    low52: none("mínimo 52 semanas"),
    fetchedAt,
  };
}

function stooqSymbol(ticker) {
  return ticker.includes(".") ? ticker.toLowerCase() : `${ticker.toLowerCase()}.us`;
}

async function stooqQuote(ticker) {
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol(ticker))}&f=sd2t2ohlcvn&h&e=csv`;
  const { text, fetchedAt } = await fetchText(url, { source: "Stooq" });
  return parseStooq(text, ticker, url, fetchedAt);
}

/**
 * Current quote for a ticker. Yahoo first, Stooq as fallback.
 * Returns { quote, errors[] }. Cached for at most 15 minutes.
 */
export async function getQuote(ticker, { now = Date.now() } = {}) {
  const key = ticker.toUpperCase();
  const hit = quoteCache.get(key);
  if (hit && now - hit.at < QUOTE_TTL_MS) return { ...hit.value, cachedAgeSec: Math.round((now - hit.at) / 1000) };

  const errors = [];
  for (const provider of [yahooQuote, stooqQuote]) {
    try {
      const quote = await provider(key);
      const value = { quote, errors };
      quoteCache.set(key, { at: now, value });
      return { ...value, cachedAgeSec: 0 };
    } catch (err) {
      errors.push({ source: err.source ?? provider.name, url: err.url ?? null, message: err.message });
    }
  }
  return { quote: null, errors, cachedAgeSec: 0 };
}

/** ECB reference rate: units of `currency` per 1 EUR. */
export function parseEcbRate(text, currency, url, fetchedAt) {
  const rows = parseCsv(text);
  const last = rows.at(-1);
  const rate = Number(last?.OBS_VALUE);
  if (!last || !Number.isFinite(rate)) throw new SourceError("BCE", url, "no data");
  return fact(rate, {
    source: `BCE — taxa de referência EUR/${currency}`,
    url: "https://data.ecb.europa.eu/data/datasets/EXR",
    badge: "primary",
    asOf: last.TIME_PERIOD ? new Date(`${last.TIME_PERIOD}T16:00:00+01:00`).toISOString() : fetchedAt,
    note: `1 EUR = ${rate} ${currency}`,
  });
}

/** Rate to convert a price in `currency` into EUR. Handles GBp (pence) and ILA (agorot). */
export async function getEurRate(currency) {
  if (!currency) return null;
  const minorUnits = { GBp: ["GBP", 100], GBX: ["GBP", 100], ILA: ["ILS", 100], ZAc: ["ZAR", 100] };
  const [iso, divisor] = minorUnits[currency] ?? [currency.toUpperCase(), 1];
  if (iso === "EUR") return { perEur: fact(1, { source: "—", badge: "calc", formula: "EUR = EUR" }), divisor: 1, iso };
  const url = `https://data-api.ecb.europa.eu/service/data/EXR/D.${iso}.EUR.SP00.A?lastNObservations=1&format=csvdata`;
  const { text, fetchedAt } = await fetchText(url, { source: "BCE" });
  return { perEur: parseEcbRate(text, iso, url, fetchedAt), divisor, iso };
}

/** Convert a local-currency price to EUR, with the formula visible. */
export function toEur(price, fx) {
  if (price == null || !fx) return null;
  const eur = price / fx.divisor / fx.perEur.value;
  const formula = fx.divisor === 1 ? `${price} ${fx.iso} ÷ ${fx.perEur.value}` : `${price} ÷ ${fx.divisor} ÷ ${fx.perEur.value}`;
  return fact(eur, { source: fx.perEur.source, url: fx.perEur.url, badge: "calc", formula, asOf: fx.perEur.asOf });
}
