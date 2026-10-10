import { getQuote, getEurRate, toEur } from "./market.js";
import { getSecData } from "./sec.js";
import { getNews } from "./news.js";
import { getMacro } from "./macro.js";
import { computeMetrics } from "./metrics.js";
import { fact } from "./sources.js";

/**
 * Collect fresh data for one request. Nothing here is reused between requests except quotes < 15 min.
 * Every failure is recorded in `errors` so the report can say "não disponível" instead of guessing.
 *
 * @param {{ticker: string, mode: "quick"|"deep", brokerPrice?: number|null, brokerCurrency?: "EUR"|"LOCAL", withNews?: boolean}} req
 * @param {(msg: object) => void} onStatus
 */
export async function buildDossier({ ticker, mode, brokerPrice = null, brokerCurrency = "EUR", withNews = true }, onStatus = () => {}) {
  const startedAt = new Date().toISOString();
  const errors = [];
  let secFailed = false;

  onStatus({ step: "quote" });
  const [quoteRes, sec] = await Promise.all([
    getQuote(ticker),
    getSecData(ticker).catch((err) => {
      secFailed = true;
      errors.push({ source: "SEC EDGAR", message: err.message });
      return null;
    }),
  ]);
  errors.push(...quoteRes.errors);
  if (sec) errors.push(...sec.errors);
  const quote = quoteRes.quote;

  let fx = null;
  if (quote?.currency) {
    try {
      fx = await getEurRate(quote.currency);
    } catch (err) {
      errors.push({ source: "BCE (câmbio)", message: err.message });
    }
  }

  // The broker price always wins. Convert to the listing currency for per-share maths.
  let brokerPriceFact = null;
  let priceOverride = null;
  if (brokerPrice != null) {
    brokerPriceFact = fact(brokerPrice, { source: "Indicado pelo utilizador (corretora)", badge: "primary", note: brokerCurrency === "EUR" ? "em EUR" : `em ${quote?.currency ?? "moeda local"}` });
    if (brokerCurrency === "EUR" && fx) priceOverride = brokerPrice * fx.perEur.value * fx.divisor;
    else if (brokerCurrency !== "EUR") priceOverride = brokerPrice;
    else errors.push({ source: "Conversão", message: "Sem câmbio BCE: preço da corretora em EUR não convertido para a moeda de cotação" });
  }

  const reportingCurrency = sec?.financials?.units?.revenue?.split("/")[0] ?? null;
  const listingIso = fx?.iso ?? quote?.currency ?? null;
  const reportingCurrencyMatches = !!reportingCurrency && !!listingIso && reportingCurrency === listingIso && !sec?.submissions?.isForeignFiler;

  const name = quote?.name ?? sec?.title ?? null;
  if (withNews) onStatus({ step: "news" });
  const newsP = !withNews ? Promise.resolve({ query: null, feeds: [], errors: [] }) : getNews({ ticker, name, days: mode === "deep" ? 7 : 3, langs: ["en", "pt"] });
  const macroP = mode === "deep" ? (onStatus({ step: "macro" }), getMacro()) : Promise.resolve(null);
  const [news, macro] = await Promise.all([newsP, macroP]);
  errors.push(...news.errors);
  if (macro) errors.push(...macro.errors);

  const metrics = computeMetrics({ quote, financials: sec?.financials, priceOverride, reportingCurrencyMatches });

  return {
    ticker,
    mode,
    startedAt,
    finishedAt: new Date().toISOString(),
    quote,
    quoteCachedAgeSec: quoteRes.cachedAgeSec,
    priceEur: quote ? toEur(quote.price.value, fx) : null,
    brokerPrice: brokerPriceFact,
    fx: fx ? { iso: fx.iso, perEur: fx.perEur } : null,
    sec: sec
      ? {
          cik: sec.cik,
          name: sec.title,
          filings: sec.submissions?.filings ?? [],
          isForeignFiler: sec.submissions?.isForeignFiler ?? null,
          insiderForm4Last90d: sec.submissions?.insiderForm4Last90d ?? null,
          financials: sec.financials ?? null,
        }
      : null,
    secNote: sec
      ? null
      : secFailed
        ? "SEC EDGAR indisponível neste pedido (ver erros): dados contabilísticos não verificados pela app."
        : "Empresa não encontrada no SEC EDGAR (provavelmente cotada fora dos EUA): usar regulador local e site de investidores.",
    metrics,
    news,
    macro,
    errors,
  };
}

/** Compact version of the dossier for the model: drops bulky series it does not need verbatim. */
export function dossierForModel(d) {
  const fin = d.sec?.financials;
  return {
    ...d,
    sec: d.sec && {
      ...d.sec,
      filings: d.sec.filings.slice(0, 25),
      financials: fin && { annual: fin.annual, ttm: fin.ttm, latest: fin.latest, units: fin.units, concepts: fin.concepts, sourceUrl: fin.sourceUrl },
    },
    news: { query: d.news.query, items: d.news.feeds.flatMap((f) => f.items.map((i) => ({ ...i, feed: f.lang }))) },
  };
}
