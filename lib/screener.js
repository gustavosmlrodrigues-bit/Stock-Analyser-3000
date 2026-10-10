import { buildDossier } from "./dossier.js";
import { streamClaude, extractJsonBlock, clampScore } from "./analyst.js";
import { SCREEN_SYSTEM_PROMPT, buildScreenCandidatesPrompt, buildScreenScoringPrompt } from "./prompts.js";

const TICKER_RE = /^[A-Za-z0-9.\-^=]{1,15}$/;
const REGIONS = new Set(["global", "us", "europe"]);

// Stage 1 checks the thesis and picks names; stage 2 scores them with the app's fresh data.
const CANDIDATES = { effort: "high", maxTokens: 24000, searches: 12, fetches: 4 };
const scoringCfg = (n) => ({ effort: "high", maxTokens: 48000, searches: Math.min(40, 6 + 2 * n), fetches: 10 });

/** Validate a screener request. Exported for tests. */
export function parseScreenRequest(body) {
  const thesis = String(body.thesis ?? "").trim().replace(/\s+/g, " ");
  if (thesis.length > 400) return { error: "invalid_thesis" };
  const raw = body.minScore === undefined || body.minScore === "" ? 8.5 : Number(String(body.minScore).replace(",", "."));
  if (!Number.isFinite(raw) || raw < 0 || raw > 10) return { error: "invalid_score" };
  const count = Math.round(Number(body.count ?? 15));
  return {
    thesis,
    minScore: raw,
    scoreKey: body.scoreKey === "hold" ? "hold" : "buy",
    region: REGIONS.has(body.region) ? body.region : "global",
    count: Number.isFinite(count) ? Math.max(5, Math.min(25, count)) : 15,
    lang: body.lang === "en" ? "en" : "pt",
  };
}

/** Clean the candidate list the model proposed: valid, unique tickers only. Exported for tests. */
export function parseCandidates(json, max) {
  const seen = new Set();
  const out = [];
  for (const c of json?.candidates ?? []) {
    const symbol = String(c?.symbol ?? "").trim().toUpperCase();
    if (!TICKER_RE.test(symbol) || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push({ symbol, name: String(c.name ?? symbol), sector: c.sector ?? null, link: c.link ?? null, why: c.why ?? null });
    if (out.length >= max) break;
  }
  return out;
}

/** Merge the model's scores with the confirmed candidates, rank them and apply the filter. Exported for tests. */
export function rankResults(json, candidates, { minScore, scoreKey }) {
  const bySymbol = new Map((json?.results ?? []).map((r) => [String(r?.symbol ?? "").toUpperCase(), r]));
  const rows = candidates.map((c) => {
    const r = bySymbol.get(c.symbol) ?? {};
    const row = {
      ...c,
      name: r.name ?? c.name,
      hold: clampScore(r.hold),
      buy: clampScore(r.buy),
      thesisFit: clampScore(r.thesisFit),
      price: r.price ?? null,
      why: r.why ?? c.why,
      risk: r.risk ?? null,
      passPrice: r.passPrice ?? null,
    };
    row.passes = row[scoreKey] != null && row[scoreKey] >= minScore;
    return row;
  });
  const key = (r) => r[scoreKey] ?? -1;
  rows.sort((a, b) => key(b) - key(a) || (b.thesisFit ?? -1) - (a.thesisFit ?? -1));
  return rows;
}

/** What the scoring stage needs from each dossier: price, the app's calculations and the latest filings. */
function compactDossier(d) {
  const q = d.quote;
  return {
    ticker: d.ticker,
    name: q?.name ?? d.sec?.name ?? null,
    exchange: q?.exchange ?? null,
    currency: q?.currency ?? null,
    price: q?.price ?? null,
    changePct: q?.changePct ?? null,
    high52: q?.high52 ?? null,
    low52: q?.low52 ?? null,
    priceEur: d.priceEur,
    metrics: d.metrics,
    sec: d.sec && {
      name: d.sec.name,
      isForeignFiler: d.sec.isForeignFiler,
      insiderForm4Last90d: d.sec.insiderForm4Last90d,
      filings: d.sec.filings.filter((f) => f.form !== "4").slice(0, 5),
      ttm: d.sec.financials?.ttm ?? null,
      latest: d.sec.financials?.latest ?? null,
    },
    secNote: d.secNote,
    errors: d.errors,
  };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Screen the market for a thesis. emit(event, data) adds, on top of the analyst events:
 *   status {step}, stage {n, body}, candidates {thesis, candidates, avoid}, checked {symbol, ok}, screen {...result}.
 */
export async function runScreen(params, emit, signal) {
  const { thesis, region, count, lang, minScore, scoreKey } = params;
  const nowIso = () => new Date().toISOString();

  // 1. Thesis check + candidates (live web research).
  emit("status", { step: "screenCandidates" });
  const s1 = await streamClaude(
    { system: SCREEN_SYSTEM_PROMPT, user: buildScreenCandidatesPrompt({ thesis, region, count, lang, nowIso: nowIso() }), ...CANDIDATES, signal },
    emit,
  );
  const p1 = extractJsonBlock(s1.markdown);
  emit("stage", { n: 1, body: p1.body });
  const proposed = parseCandidates(p1.json, count);
  emit("candidates", { thesis: p1.json?.thesis ?? null, candidates: proposed, avoid: p1.json?.avoid ?? [] });
  if (!proposed.length) {
    const err = new Error("O analista não devolveu candidatos válidos.");
    err.code = "no_candidates";
    throw err;
  }

  // 2. Fresh data for every candidate. A ticker without a live quote is dropped, never guessed.
  emit("status", { step: "screenData" });
  const errors = [];
  const dossiers = await mapLimit(proposed, 4, async (c) => {
    if (signal?.aborted) return null;
    try {
      const d = await buildDossier({ ticker: c.symbol, mode: "quick", withNews: false });
      emit("checked", { symbol: c.symbol, ok: !!d.quote });
      if (!d.quote) errors.push({ source: c.symbol, message: "sem cotação ao vivo — candidato excluído" });
      return d.quote ? d : null;
    } catch (err) {
      emit("checked", { symbol: c.symbol, ok: false });
      errors.push({ source: c.symbol, message: err.message });
      return null;
    }
  });
  const confirmed = proposed.filter((_, i) => dossiers[i]);
  if (signal?.aborted) return null;
  if (!confirmed.length) {
    const err = new Error("Nenhum candidato tem cotação ao vivo (Yahoo/Stooq indisponíveis?).");
    err.code = "no_data";
    throw err;
  }

  // 3. Scores, with the same calibration as the single-stock analyst.
  emit("status", { step: "screenScoring" });
  const user = buildScreenScoringPrompt({
    thesis,
    thesisView: p1.json?.thesis,
    dossiers: dossiers.filter(Boolean).map(compactDossier),
    minScore,
    scoreKey,
    lang,
    nowIso: nowIso(),
  });
  const s2 = await streamClaude({ system: SCREEN_SYSTEM_PROMPT, user, ...scoringCfg(confirmed.length), signal }, emit);
  const p2 = extractJsonBlock(s2.markdown);
  emit("stage", { n: 2, body: p2.body });

  const results = rankResults(p2.json, confirmed, { minScore, scoreKey });
  return {
    params,
    thesis: p1.json?.thesis ?? null,
    avoid: p1.json?.avoid ?? [],
    results,
    passing: results.filter((r) => r.passes).length,
    scored: !!p2.json,
    truncated: s1.truncated || s2.truncated,
    citations: [...s1.citations, ...s2.citations],
    consulted: [...s1.consulted, ...s2.consulted],
    model: s2.model,
    usage: [s1.usage, s2.usage],
    errors,
  };
}
