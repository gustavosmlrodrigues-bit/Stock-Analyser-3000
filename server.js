import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { buildDossier } from "./lib/dossier.js";
import { runAnalysis, MODEL } from "./lib/analyst.js";
import { getQuote, getEurRate, toEur } from "./lib/market.js";
import { resolveQuery } from "./lib/resolve.js";
import { parseScreenRequest, runScreen } from "./lib/screener.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, "public");
const PORT = Number(process.env.PORT) || 3000;
const TICKER_RE = /^[A-Za-z0-9.\-^=]{1,15}$/;

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit = 10_000) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > limit) throw new Error("body too large");
  }
  return data ? JSON.parse(data) : {};
}

/** Validate an analysis request. Exported for tests. */
export function parseAnalyzeRequest(body) {
  // `symbol` is an exact listing picked from the suggestions; `query` is whatever the user typed.
  const symbol = String(body.symbol ?? "").trim().toUpperCase();
  const query = String(body.query ?? body.ticker ?? "").trim().replace(/\s+/g, " ");
  if (symbol && !TICKER_RE.test(symbol)) return { error: "invalid_ticker" };
  if (!symbol && (query.length < 1 || query.length > 80)) return { error: "invalid_query" };
  const mode = body.mode === "deep" ? "deep" : "quick";
  const lang = body.lang === "en" ? "en" : "pt";
  const num = (x) => {
    if (x === null || x === undefined || x === "") return null;
    const n = Number(String(x).replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : NaN;
  };
  const brokerPrice = num(body.brokerPrice);
  const amountEur = num(body.amountEur);
  if (Number.isNaN(brokerPrice) || Number.isNaN(amountEur)) return { error: "invalid_number" };
  const brokerCurrency = body.brokerCurrency === "LOCAL" ? "LOCAL" : "EUR";
  return { symbol: symbol || null, query, mode, lang, brokerPrice, brokerCurrency, amountEur };
}

async function handleAnalyze(req, res) {
  let params;
  try {
    params = parseAnalyzeRequest(await readBody(req));
  } catch {
    return sendJson(res, 400, { error: "invalid_json" });
  }
  if (params.error) return sendJson(res, 400, params);

  const { controller, emit, heartbeat } = openSse(res);
  try {
    let ticker = params.symbol;
    if (!ticker) {
      emit("status", { step: "resolve" });
      const r = await resolveQuery(params.query);
      if (!r.best) return emit("notfound", { query: r.query, errors: r.errors });
      if (!r.confident) return emit("choose", { query: r.query, candidates: r.candidates });
      ticker = r.best.symbol;
      emit("resolved", { query: r.query, ...r.best, method: r.method });
    }
    const dossier = await buildDossier({ ...params, ticker }, (s) => emit("status", s));
    emit("dossier", dossier);
    if (controller.signal.aborted) return;
    emit("status", { step: "analysis" });
    const result = await runAnalysis({ dossier, mode: params.mode, lang: params.lang, amountEur: params.amountEur, signal: controller.signal }, emit);
    emit("done", result);
  } catch (err) {
    if (controller.signal.aborted) return;
    emit("error", describeError(err));
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
}

/** Start a server-sent events stream; the request is aborted when the browser goes away. */
function openSse(res) {
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  const controller = new AbortController();
  res.on("close", () => controller.abort());
  const emit = (event, data) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const heartbeat = setInterval(() => emit("ping", {}), 15000);
  return { controller, emit, heartbeat };
}

async function handleScreen(req, res) {
  let params;
  try {
    params = parseScreenRequest(await readBody(req));
  } catch {
    return sendJson(res, 400, { error: "invalid_json" });
  }
  if (params.error) return sendJson(res, 400, params);

  const { controller, emit, heartbeat } = openSse(res);
  try {
    const result = await runScreen(params, emit, controller.signal);
    if (result) emit("done", result);
  } catch (err) {
    if (controller.signal.aborted) return;
    emit("error", describeError(err));
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
}

function describeError(err) {
  if (err.code === "refusal") return { code: "refusal", message: err.message, details: err.details };
  if (err.code === "no_candidates" || err.code === "no_data") return { code: err.code, message: err.message };
  if (err instanceof Anthropic.AuthenticationError) return { code: "auth", message: "Chave da API da Anthropic inválida ou em falta (ANTHROPIC_API_KEY)." };
  if (err instanceof Anthropic.RateLimitError) return { code: "rate_limit", message: "Limite de pedidos atingido. Tenta daqui a um minuto." };
  if (err instanceof Anthropic.APIConnectionError) return { code: "connection", message: "Sem ligação à API da Anthropic." };
  if (err instanceof Anthropic.APIError) return { code: "api", message: `Erro da API (${err.status}): ${err.message}` };
  if (err instanceof Anthropic.AnthropicError) return { code: "auth", message: "Credenciais da Anthropic em falta: define ANTHROPIC_API_KEY no ficheiro .env." };
  console.error(err);
  return { code: "internal", message: err.message };
}

async function handleSearch(url, res) {
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2 || q.length > 80) return sendJson(res, 200, { candidates: [] });
  // The suggestions box never calls Claude: only Yahoo search and the local fuzzy match.
  const r = await resolveQuery(q, { allowAi: false });
  sendJson(res, 200, { candidates: r.candidates, confident: r.confident });
}

async function handleQuote(url, res) {
  const ticker = (url.searchParams.get("ticker") ?? "").toUpperCase();
  if (!TICKER_RE.test(ticker)) return sendJson(res, 400, { error: "invalid_ticker" });
  const q = await getQuote(ticker);
  let priceEur = null;
  if (q.quote?.currency) {
    try {
      priceEur = toEur(q.quote.price.value, await getEurRate(q.quote.currency));
    } catch (err) {
      q.errors.push({ source: "BCE (câmbio)", message: err.message });
    }
  }
  sendJson(res, q.quote ? 200 : 502, { ...q, priceEur });
}

async function serveStatic(pathname, res) {
  const rel = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return sendJson(res, 404, { error: "not_found" });
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: "not_found" });
  }
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (req.method === "POST" && url.pathname === "/api/analyze") return await handleAnalyze(req, res);
    if (req.method === "POST" && url.pathname === "/api/screen") return await handleScreen(req, res);
    if (req.method === "GET" && url.pathname === "/api/quote") return await handleQuote(url, res);
    if (req.method === "GET" && url.pathname === "/api/search") return await handleSearch(url, res);
    if (req.method === "GET" && url.pathname === "/api/health")
      return sendJson(res, 200, { ok: true, model: MODEL, anthropicKey: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN), secUserAgent: !!process.env.SEC_USER_AGENT });
    if (req.method === "GET") return await serveStatic(url.pathname, res);
    sendJson(res, 405, { error: "method_not_allowed" });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: "internal" });
    else res.end();
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => console.log(`Analista de ações a correr em http://localhost:${PORT}`));
}
