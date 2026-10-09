import { fact, fetchJson, SourceError } from "./sources.js";

// SEC EDGAR — primary source. The SEC requires a descriptive User-Agent with contact details.
const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
// The ticker→CIK map is reference data, not a fact shown to the user, so it may live for a day.
let tickerList = null;
let tickerMap = null;
let tickerMapAt = 0;

async function loadTickers() {
  if (!tickerMap || Date.now() - tickerMapAt > 24 * 3600 * 1000) {
    const { json } = await fetchJson(TICKERS_URL, { source: "SEC EDGAR" });
    tickerList = Object.values(json).map((c) => ({ ticker: c.ticker.toUpperCase(), cik: c.cik_str, title: c.title }));
    tickerMap = new Map(tickerList.map((c) => [c.ticker, c]));
    tickerMapAt = Date.now();
  }
}

/** All SEC-registered tickers with company names (used by the search box). */
export async function lookupAllTickers() {
  await loadTickers();
  return tickerList;
}

export async function lookupCik(ticker) {
  await loadTickers();
  // Share classes: BRK-B on Yahoo is BRK-B on EDGAR too; BRK.B → BRK-B.
  return tickerMap.get(ticker.toUpperCase().replace(".", "-")) ?? null;
}

const pad = (cik) => String(cik).padStart(10, "0");
const filingUrl = (cik, accession, doc) =>
  `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}/${doc}`;

const WATCHED_FORMS = new Set(["8-K", "10-Q", "10-K", "6-K", "20-F", "40-F", "4", "SC 13D", "SC 13G", "DEF 14A", "S-1", "424B5"]);

/** Recent filings from the submissions endpoint. Exported for tests. */
export function parseSubmissions(json, cik, fetchedAt) {
  const r = json?.filings?.recent;
  if (!r?.form) throw new SourceError("SEC EDGAR", null, "no filings");
  const filings = [];
  for (let i = 0; i < r.form.length && filings.length < 40; i++) {
    if (!WATCHED_FORMS.has(r.form[i])) continue;
    filings.push({
      form: r.form[i],
      filed: r.filingDate[i],
      reportDate: r.reportDate?.[i] || null,
      description: r.primaryDocDescription?.[i] || null,
      items: r.items?.[i] || null,
      url: filingUrl(cik, r.accessionNumber[i], r.primaryDocument[i]),
      badge: "primary",
    });
  }
  const since = new Date(Date.now() - 90 * 86400 * 1000).toISOString().slice(0, 10);
  const insider = filings.filter((f) => f.form === "4" && f.filed >= since);
  return {
    name: json.name,
    sic: json.sicDescription ?? null,
    fiscalYearEnd: json.fiscalYearEnd ?? null,
    isForeignFiler: filings.some((f) => ["20-F", "6-K", "40-F"].includes(f.form)),
    filings,
    insiderForm4Last90d: fact(insider.length, {
      source: "SEC EDGAR — Form 4",
      url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${pad(cik)}&type=4&owner=include`,
      badge: "primary",
      asOf: fetchedAt,
      note: "Número de Form 4 nos últimos 90 dias (compras e vendas; ver cada documento para o sentido)",
    }),
    fetchedAt,
  };
}

// Concept fallbacks: first one that exists wins. [taxonomy, concept]
const CONCEPTS = {
  revenue: [["us-gaap", "Revenues"], ["us-gaap", "RevenueFromContractWithCustomerExcludingAssessedTax"], ["us-gaap", "SalesRevenueNet"], ["ifrs-full", "Revenue"]],
  operatingIncome: [["us-gaap", "OperatingIncomeLoss"], ["ifrs-full", "ProfitLossFromOperatingActivities"]],
  netIncome: [["us-gaap", "NetIncomeLoss"], ["ifrs-full", "ProfitLossAttributableToOwnersOfParent"], ["ifrs-full", "ProfitLoss"]],
  epsDiluted: [["us-gaap", "EarningsPerShareDiluted"], ["ifrs-full", "DilutedEarningsLossPerShare"]],
  ocf: [["us-gaap", "NetCashProvidedByUsedInOperatingActivities"], ["ifrs-full", "CashFlowsFromUsedInOperatingActivities"]],
  capex: [["us-gaap", "PaymentsToAcquirePropertyPlantAndEquipment"], ["ifrs-full", "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"]],
  sbc: [["us-gaap", "ShareBasedCompensation"], ["us-gaap", "AllocatedShareBasedCompensationExpense"]],
  dividends: [["us-gaap", "PaymentsOfDividends"], ["us-gaap", "PaymentsOfDividendsCommonStock"], ["ifrs-full", "DividendsPaidClassifiedAsFinancingActivities"]],
  buybacks: [["us-gaap", "PaymentsForRepurchaseOfCommonStock"], ["ifrs-full", "PaymentsToAcquireOrRedeemEntitysShares"]],
  cash: [["us-gaap", "CashAndCashEquivalentsAtCarryingValue"], ["us-gaap", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"], ["ifrs-full", "CashAndCashEquivalents"]],
  shortTermInvestments: [["us-gaap", "ShortTermInvestments"], ["us-gaap", "MarketableSecuritiesCurrent"]],
  longTermDebt: [["us-gaap", "LongTermDebtNoncurrent"], ["us-gaap", "LongTermDebt"], ["ifrs-full", "NoncurrentPortionOfNoncurrentBorrowings"]],
  currentDebt: [["us-gaap", "LongTermDebtCurrent"], ["us-gaap", "DebtCurrent"], ["ifrs-full", "CurrentPortionOfNoncurrentBorrowings"]],
  equity: [["us-gaap", "StockholdersEquity"], ["ifrs-full", "EquityAttributableToOwnersOfParent"]],
  dilutedShares: [["us-gaap", "WeightedAverageNumberOfDilutedSharesOutstanding"], ["ifrs-full", "WeightedAverageNumberOfSharesOutstandingDiluted"]],
  sharesOutstanding: [["dei", "EntityCommonStockSharesOutstanding"]],
};
const DURATION = new Set(["revenue", "operatingIncome", "netIncome", "epsDiluted", "ocf", "capex", "sbc", "dividends", "buybacks", "dilutedShares"]);

const days = (a, b) => (new Date(b) - new Date(a)) / 86400000;

function pickConcept(facts, key) {
  for (const [tax, name] of CONCEPTS[key]) {
    const c = facts?.[tax]?.[name];
    if (!c?.units) continue;
    const unit = Object.keys(c.units)[0];
    const rows = c.units[unit].filter((x) => typeof x.val === "number" && x.end);
    if (rows.length) return { concept: `${tax}:${name}`, unit, rows };
  }
  return null;
}

/** Keep the most recently filed value for each (start,end) period. */
function latestByPeriod(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = `${r.start ?? ""}|${r.end}`;
    const prev = m.get(k);
    if (!prev || r.filed > prev.filed) m.set(k, r);
  }
  return [...m.values()];
}

/**
 * Annual series (up to 10 fiscal years) and trailing-twelve-months values from XBRL company facts.
 * TTM = last FY + current YTD − prior-year YTD (10-Q values are cumulative year-to-date).
 * Exported for tests.
 */
export function parseCompanyFacts(json, cik, fetchedAt) {
  const facts = json?.facts;
  if (!facts) throw new SourceError("SEC EDGAR XBRL", null, "no facts");
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${pad(cik)}.json`;
  const viewer = `https://www.sec.gov/cgi-bin/viewer?action=view&cik=${Number(cik)}&type=10-K`;
  const annual = {};
  const ttm = {};
  const latest = {};
  const units = {};
  const concepts = {};

  for (const key of Object.keys(CONCEPTS)) {
    const picked = pickConcept(facts, key);
    if (!picked) continue;
    units[key] = picked.unit;
    concepts[key] = picked.concept;
    const rows = latestByPeriod(picked.rows);

    if (DURATION.has(key)) {
      const fy = rows
        .filter((r) => ["10-K", "20-F", "40-F", "10-K/A", "20-F/A"].includes(r.form) && r.start && days(r.start, r.end) > 350 && days(r.start, r.end) < 380)
        .sort((a, b) => a.end.localeCompare(b.end));
      const byYear = new Map(fy.map((r) => [r.end.slice(0, 4), r]));
      annual[key] = [...byYear.values()].slice(-10).map((r) => ({ end: r.end, val: r.val, form: r.form, filed: r.filed }));

      // TTM
      const lastFy = fy.at(-1);
      const ytd = rows
        .filter((r) => r.form?.startsWith("10-Q") && r.start && lastFy && r.end > lastFy.end && days(lastFy.end, r.start) < 10)
        .sort((a, b) => a.end.localeCompare(b.end))
        .at(-1);
      if (lastFy && ytd && key !== "epsDiluted" && key !== "dilutedShares") {
        const len = days(ytd.start, ytd.end);
        const priorYtd = rows.find((r) => r.start && r.end < lastFy.end && Math.abs(days(r.end, ytd.end) - 365) < 15 && Math.abs(days(r.start, r.end) - len) < 15);
        if (priorYtd) {
          ttm[key] = fact(lastFy.val + ytd.val - priorYtd.val, {
            source: "SEC EDGAR (XBRL)",
            url,
            badge: "calc",
            asOf: ytd.filed,
            formula: `FY até ${lastFy.end} (${fmt(lastFy.val)}) + acumulado até ${ytd.end} (${fmt(ytd.val)}) − acumulado até ${priorYtd.end} (${fmt(priorYtd.val)})`,
          });
        }
      }
      if (!ttm[key] && lastFy) {
        ttm[key] = fact(lastFy.val, { source: `SEC EDGAR — ${lastFy.form} (ano fiscal até ${lastFy.end})`, url: viewer, badge: "primary", asOf: lastFy.filed });
      }
      if (key === "dilutedShares") {
        const lastQ = rows.sort((a, b) => a.end.localeCompare(b.end)).at(-1);
        if (lastQ) latest[key] = fact(lastQ.val, { source: `SEC EDGAR — ${lastQ.form} (período até ${lastQ.end})`, url: viewer, badge: "primary", asOf: lastQ.filed });
      }
    } else {
      const sorted = rows.sort((a, b) => a.end.localeCompare(b.end));
      const last = sorted.at(-1);
      latest[key] = fact(last.val, { source: `SEC EDGAR — ${last.form} (${last.end})`, url: viewer, badge: "primary", asOf: last.filed });
      const fy = sorted.filter((r) => ["10-K", "20-F", "40-F"].includes(r.form));
      const byYear = new Map(fy.map((r) => [r.end.slice(0, 4), r]));
      annual[key] = [...byYear.values()].slice(-10).map((r) => ({ end: r.end, val: r.val, form: r.form, filed: r.filed }));
    }
  }

  return { entityName: json.entityName, annual, ttm, latest, units, concepts, sourceUrl: url, fetchedAt };
}

function fmt(n) {
  return Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(0)}M` : String(n);
}

export async function getSecData(ticker) {
  const company = await lookupCik(ticker);
  if (!company) return null; // not an SEC registrant (e.g. a European listing)
  const [subs, facts] = await Promise.allSettled([
    fetchJson(`https://data.sec.gov/submissions/CIK${pad(company.cik)}.json`, { source: "SEC EDGAR" }),
    fetchJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${pad(company.cik)}.json`, { source: "SEC EDGAR XBRL" }),
  ]);
  const errors = [];
  const out = { cik: company.cik, title: company.title, errors };
  if (subs.status === "fulfilled") out.submissions = parseSubmissions(subs.value.json, company.cik, subs.value.fetchedAt);
  else errors.push({ source: "SEC EDGAR (submissions)", message: subs.reason.message });
  if (facts.status === "fulfilled") out.financials = parseCompanyFacts(facts.value.json, company.cik, facts.value.fetchedAt);
  else errors.push({ source: "SEC EDGAR (XBRL)", message: facts.reason.message });
  return out;
}
