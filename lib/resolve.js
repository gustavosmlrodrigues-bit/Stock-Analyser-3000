import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { fetchJson } from "./sources.js";
import { lookupAllTickers } from "./sec.js";
import { MODEL } from "./analyst.js";

// Turn whatever the user typed ("aple", "jeronimo martins", "nvdia", "EDP.LS") into a listed symbol.
// Order: Yahoo Finance search (any exchange) + local fuzzy match (SEC list + aliases), then Claude as a
// last resort for badly misspelt names. Every candidate Claude suggests is re-checked against Yahoo.

// Common names Yahoo or the SEC list miss, mostly European and Asian listings (Yahoo symbols).
export const ALIASES = [
  ["EDP.LS", "EDP Energias de Portugal", ["edp", "energias de portugal"]],
  ["EDPR.LS", "EDP Renováveis", ["edp renovaveis", "edpr"]],
  ["GALP.LS", "Galp Energia", ["galp"]],
  ["JMT.LS", "Jerónimo Martins", ["jeronimo martins", "pingo doce"]],
  ["BCP.LS", "Banco Comercial Português", ["bcp", "millennium bcp", "millenium"]],
  ["NOS.LS", "NOS SGPS", ["nos"]],
  ["SON.LS", "Sonae", ["sonae"]],
  ["NVG.LS", "The Navigator Company", ["navigator"]],
  ["CTT.LS", "CTT Correios de Portugal", ["ctt", "correios"]],
  ["SEM.LS", "Semapa", ["semapa"]],
  ["ALTR.LS", "Altri", ["altri"]],
  ["RENE.LS", "REN Redes Energéticas Nacionais", ["ren"]],
  ["MOTA.LS", "Mota-Engil", ["mota engil"]],
  ["COR.LS", "Corticeira Amorim", ["corticeira amorim", "amorim"]],
  ["ASML.AS", "ASML Holding", ["asml"]],
  ["ADYEN.AS", "Adyen", ["adyen"]],
  ["INGA.AS", "ING Groep", ["ing"]],
  ["PHIA.AS", "Philips", ["philips"]],
  ["HEIA.AS", "Heineken", ["heineken"]],
  ["MC.PA", "LVMH", ["lvmh", "louis vuitton"]],
  ["OR.PA", "L'Oréal", ["loreal", "l oreal"]],
  ["RMS.PA", "Hermès", ["hermes"]],
  ["TTE.PA", "TotalEnergies", ["total", "totalenergies"]],
  ["AIR.PA", "Airbus", ["airbus"]],
  ["SAN.PA", "Sanofi", ["sanofi"]],
  ["BNP.PA", "BNP Paribas", ["bnp", "bnp paribas"]],
  ["SU.PA", "Schneider Electric", ["schneider"]],
  ["SAP.DE", "SAP", ["sap"]],
  ["SIE.DE", "Siemens", ["siemens"]],
  ["ALV.DE", "Allianz", ["allianz"]],
  ["DTE.DE", "Deutsche Telekom", ["deutsche telekom", "telekom"]],
  ["VOW3.DE", "Volkswagen", ["volkswagen", "vw"]],
  ["BMW.DE", "BMW", ["bmw"]],
  ["MBG.DE", "Mercedes-Benz Group", ["mercedes", "mercedes benz", "daimler"]],
  ["ADS.DE", "Adidas", ["adidas"]],
  ["RHM.DE", "Rheinmetall", ["rheinmetall"]],
  ["IBE.MC", "Iberdrola", ["iberdrola"]],
  ["ITX.MC", "Inditex", ["inditex", "zara"]],
  ["SAN.MC", "Banco Santander", ["santander"]],
  ["TEF.MC", "Telefónica", ["telefonica"]],
  ["ENEL.MI", "Enel", ["enel"]],
  ["ISP.MI", "Intesa Sanpaolo", ["intesa"]],
  ["RACE.MI", "Ferrari", ["ferrari"]],
  ["NOVO-B.CO", "Novo Nordisk", ["novo nordisk", "novo"]],
  ["NESN.SW", "Nestlé", ["nestle"]],
  ["ROG.SW", "Roche", ["roche"]],
  ["NOVN.SW", "Novartis", ["novartis"]],
  ["UBSG.SW", "UBS", ["ubs"]],
  ["SHEL.L", "Shell", ["shell"]],
  ["AZN.L", "AstraZeneca", ["astrazeneca", "astra zeneca"]],
  ["HSBA.L", "HSBC", ["hsbc"]],
  ["ULVR.L", "Unilever", ["unilever"]],
  ["BP.L", "BP", ["bp", "british petroleum"]],
  ["RR.L", "Rolls-Royce", ["rolls royce"]],
  ["005930.KS", "Samsung Electronics", ["samsung"]],
  ["000660.KS", "SK Hynix", ["sk hynix", "hynix"]],
  ["0700.HK", "Tencent", ["tencent"]],
  ["9988.HK", "Alibaba (Hong Kong)", ["alibaba hk"]],
  ["7203.T", "Toyota", ["toyota"]],
  ["6758.T", "Sony", ["sony"]],
  ["TSM", "Taiwan Semiconductor (ADR)", ["tsmc", "taiwan semiconductor"]],
  ["GOOGL", "Alphabet (Google)", ["google", "alphabet"]],
  ["META", "Meta Platforms (Facebook)", ["facebook", "meta", "instagram"]],
  ["BRK-B", "Berkshire Hathaway B", ["berkshire", "berkshire hathaway", "buffett"]],
];

const SUFFIXES = /\b(inc|incorporated|corp|corporation|co|company|plc|ltd|limited|holdings?|group|sa|s\.a|ag|se|nv|n\.v|spa|ab|asa|class [abc]|the)\b\.?/g;

export function normalize(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/&/g, " and ")
    .replace(SUFFIXES, " ")
    .replace(/[^a-z0-9.\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Damerau-Levenshtein (optimal string alignment) distance. */
export function editDistance(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

/**
 * Similarity 0..1 between what was typed and a name. Rewards prefixes ("micro" → "microsoft")
 * and tolerates typos ("nvdia" → "nvidia", "aple" → "apple").
 */
export function similarity(query, name) {
  const q = normalize(query), n = normalize(name);
  if (!q || !n) return 0;
  if (q === n) return 1;
  const sim = (a, b) => 1 - editDistance(a, b) / Math.max(a.length, b.length);
  let best = sim(q, n);
  // Compare against the same number of leading words, and against each word.
  const nw = n.split(" "), qw = q.split(" ");
  // A match on the first words only ("apple" → "Apple Hospitality REIT") ranks below a full-name match.
  best = Math.max(best, sim(q, nw.slice(0, qw.length).join(" ")) * (0.9 + 0.1 * Math.min(1, qw.length / nw.length)));
  if (qw.length === 1) for (const w of nw) best = Math.max(best, sim(q, w) * 0.95);
  if (q.length >= 3 && n.startsWith(q)) best = Math.max(best, 0.8 + 0.2 * (q.length / n.length));
  return best;
}

/**
 * Score for "what was typed is exactly this ticker". Typed in capitals ("AAPL") it is a deliberate
 * ticker; typed in lowercase ("aple", "ford") it may be a misspelt name, so a name match can beat it.
 */
export function tickerScore(query) {
  const t = query.trim();
  return /[A-Z]/.test(t) && t === t.toUpperCase() ? 1 : 0.9;
}

/** Local fuzzy search over aliases + SEC list. Pure given the lists; exported for tests. */
export function localSearch(query, secList = [], limit = 8) {
  const q = normalize(query);
  const qTicker = query.trim().toUpperCase();
  const tScore = tickerScore(query);
  if (!q) return [];
  const out = new Map();
  const add = (symbol, name, score, source) => {
    const prev = out.get(symbol);
    if (!prev || prev.score < score) out.set(symbol, { symbol, name, exchange: null, type: "EQUITY", score, source });
  };
  for (const [symbol, name, keys] of ALIASES) {
    const s = Math.max(similarity(query, name), ...keys.map((k) => similarity(query, k)), symbol === qTicker || symbol.split(".")[0] === qTicker ? tScore : 0);
    if (s >= 0.6) add(symbol, name, s, "alias");
  }
  for (const c of secList) {
    if (c.ticker === qTicker) add(c.ticker, c.title, tScore, "sec");
    else if (Math.abs(c.ticker.length - qTicker.length) <= 1 && qTicker.length >= 3 && editDistance(c.ticker, qTicker) === 1) add(c.ticker, c.title, 0.62, "sec");
    // Cheap pre-filter before the edit distance: share the first letter of some word.
    const n = normalize(c.title);
    if (!n || !n.split(" ").some((w) => w[0] === q[0])) continue;
    const s = similarity(query, c.title);
    if (s >= 0.65) add(c.ticker, c.title, s, "sec");
  }
  return [...out.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Yahoo Finance search: works across exchanges and tolerates some typos. Exported for tests. */
export function parseYahooSearch(json) {
  return (json?.quotes ?? [])
    .filter((x) => x.symbol && ["EQUITY", "ETF"].includes(x.quoteType))
    .map((x, i) => ({
      symbol: x.symbol,
      name: x.longname || x.shortname || x.symbol,
      exchange: x.exchDisp || x.exchange || null,
      type: x.quoteType,
      score: Math.max(0.5, 0.97 - i * 0.07),
      source: "yahoo",
    }));
}

async function yahooSearch(query) {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0&listsCount=0&enableFuzzyQuery=true`;
  const { json } = await fetchJson(url, { source: "Yahoo Finance (pesquisa)", timeoutMs: 8000 });
  return parseYahooSearch(json);
}

/** Merge candidate lists; the same symbol keeps its best score. Exported for tests. */
export function mergeCandidates(query, ...lists) {
  const qTicker = query.trim().toUpperCase();
  const tScore = tickerScore(query);
  const map = new Map();
  for (const list of lists) {
    for (const c of list) {
      const exact = c.symbol.toUpperCase() === qTicker;
      const nameSim = similarity(query, c.name);
      // Yahoo's rank says little about how close the name is: blend it with our own name similarity.
      const base = c.source === "yahoo" ? Math.max(c.score * 0.6 + nameSim * 0.4, nameSim) : c.score;
      const score = Math.max(base, exact ? tScore : 0);
      const prev = map.get(c.symbol);
      if (!prev || prev.score < score) map.set(c.symbol, { ...c, exchange: c.exchange ?? prev?.exchange ?? null, score });
    }
  }
  return [...map.values()].sort((a, b) => b.score - a.score);
}

/** Is the top candidate clear enough to go ahead without asking? Exported for tests. */
export function isConfident(cands) {
  const [a, b] = cands;
  if (!a) return false;
  // Two different companies both matching perfectly (e.g. ticker FORD and "Ford") still need a choice.
  if (a.score >= 0.999) return !(b && b.score >= 0.999 && normalize(a.name) !== normalize(b.name));
  if (!b) return a.score >= 0.6;
  // Same company on two exchanges (ASML / ASML.AS) is not ambiguity.
  if (normalize(a.name) === normalize(b.name)) return a.score >= 0.6;
  return a.score >= 0.75 && a.score - b.score >= 0.12;
}

const GUESS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    guesses: {
      type: "array",
      items: { type: "object", additionalProperties: false, properties: { company: { type: "string" }, ticker: { type: "string" } }, required: ["company", "ticker"] },
    },
  },
  required: ["guesses"],
};

async function claudeGuess(query) {
  const client = new Anthropic();
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: "low", format: jsonSchemaOutputFormat(GUESS_SCHEMA) },
    messages: [
      {
        role: "user",
        content: `Um investidor escreveu isto para procurar uma ação cotada em bolsa (pode ter erros de escrita, estar em português ou ser uma alcunha): "${query.slice(0, 80)}"\nDevolve até 3 empresas cotadas mais prováveis, cada uma com o ticker no formato do Yahoo Finance (ex.: AAPL, EDP.LS, ASML.AS, 005930.KS). Se não fizer sentido como empresa, devolve uma lista vazia.`,
      },
    ],
  });
  if (res.stop_reason === "refusal") return [];
  return res.parsed_output?.guesses ?? [];
}

/**
 * Resolve free text to a symbol.
 * @returns {{query, best, candidates, confident, method, errors}}
 */
export async function resolveQuery(query, { allowAi = true } = {}) {
  const q = String(query ?? "").trim().slice(0, 80);
  const errors = [];
  const [yahoo, secList] = await Promise.all([
    yahooSearch(q).catch((e) => (errors.push({ source: "Yahoo Finance (pesquisa)", message: e.message }), [])),
    lookupAllTickers().catch((e) => (errors.push({ source: "SEC EDGAR (lista de tickers)", message: e.message }), [])),
  ]);
  let candidates = mergeCandidates(q, yahoo, localSearch(q, secList));
  let method = "search";

  if (allowAi && (!candidates.length || candidates[0].score < 0.6)) {
    try {
      const guesses = await claudeGuess(q);
      const verified = (
        await Promise.all(
          guesses.slice(0, 3).map(async (g) => {
            const found = await yahooSearch(g.ticker).catch(() => []);
            const hit = found.find((f) => f.symbol.toUpperCase() === g.ticker.toUpperCase()) ?? found[0];
            return hit ? { ...hit, score: 0.7, source: "ai" } : null;
          }),
        )
      ).filter(Boolean);
      if (verified.length) {
        candidates = mergeCandidates(q, verified, candidates);
        method = "ai";
      }
    } catch (e) {
      errors.push({ source: "Claude (sugestão de ticker)", message: e.message });
    }
  }
  // Nothing found anywhere (e.g. every source down): offer what was typed, but ask before using it.
  if (!candidates.length && /^[A-Za-z0-9.\-^=]{1,15}$/.test(q)) {
    candidates = [{ symbol: q.toUpperCase(), name: q.toUpperCase(), exchange: null, type: null, score: 0.5, source: "direct" }];
    method = "direct";
  }
  candidates = candidates.slice(0, 6);
  return { query: q, best: candidates[0] ?? null, candidates, confident: method === "ai" ? candidates.length === 1 || isConfident(candidates) : isConfident(candidates), method, errors };
}
