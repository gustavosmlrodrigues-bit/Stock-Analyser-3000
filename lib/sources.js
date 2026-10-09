// Every number the app shows carries its provenance: source, link, timestamp and a badge.
//   primary    ✓  primary source (SEC filing, company IR, regulator)
//   aggregator ≈  data aggregator (Yahoo, Stooq, Google News…)
//   calc       🧮 computed by the app — `formula` is always set
//   unverified ⚠️ could not be verified
export const BADGES = {
  primary: "✓",
  aggregator: "≈",
  calc: "🧮",
  unverified: "⚠️",
};

/**
 * Wrap a value with its provenance.
 * @param {*} value
 * @param {{source: string, url?: string, badge: keyof BADGES, asOf?: string, formula?: string, note?: string}} meta
 */
export function fact(value, meta) {
  if (!BADGES[meta.badge]) throw new Error(`Unknown badge: ${meta.badge}`);
  if (meta.badge === "calc" && !meta.formula) throw new Error("Calculated facts need a visible formula");
  return {
    value,
    source: meta.source,
    url: meta.url ?? null,
    badge: meta.badge,
    asOf: meta.asOf ?? new Date().toISOString(),
    formula: meta.formula ?? null,
    note: meta.note ?? null,
  };
}

export class SourceError extends Error {
  constructor(source, url, message) {
    super(`${source}: ${message}`);
    this.source = source;
    this.url = url;
  }
}

const DEFAULT_UA = "StockAnalyser3000/0.1 (set SEC_USER_AGENT in .env)";

/** Fetch a URL with a timeout. Never cached: every call goes to the network. */
export async function fetchText(url, { source, headers = {}, timeoutMs = 15000 } = {}) {
  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": process.env.SEC_USER_AGENT || DEFAULT_UA, ...headers },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (err) {
    throw new SourceError(source ?? url, url, err.name === "TimeoutError" ? "timeout" : err.message);
  }
  if (!res.ok) throw new SourceError(source ?? url, url, `HTTP ${res.status}`);
  return { text: await res.text(), fetchedAt: new Date().toISOString() };
}

export async function fetchJson(url, opts = {}) {
  const { text, fetchedAt } = await fetchText(url, { ...opts, headers: { Accept: "application/json", ...opts.headers } });
  try {
    return { json: JSON.parse(text), fetchedAt };
  } catch {
    throw new SourceError(opts.source ?? url, url, "invalid JSON");
  }
}

/** Minimal CSV parser (quoted fields, commas inside quotes). Returns array of objects keyed by header. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i]?.trim() ?? ""])));
}
