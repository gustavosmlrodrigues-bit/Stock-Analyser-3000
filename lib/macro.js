import { fact, fetchText, parseCsv, SourceError } from "./sources.js";

// FRED series (public CSV endpoint, no key needed).
const FRED_SERIES = {
  DGS10: "Yield do Tesouro dos EUA a 10 anos (%)",
  DGS2: "Yield do Tesouro dos EUA a 2 anos (%)",
  DFF: "Taxa efetiva dos Fed Funds (%)",
  UNRATE: "Taxa de desemprego dos EUA (%)",
  CPIAUCSL: "Índice de preços no consumidor dos EUA (CPI)",
  DCOILBRENTEU: "Petróleo Brent (USD/barril)",
};

/** Last valid observation(s) from a FRED CSV. Exported for tests. */
export function parseFredCsv(text, id) {
  const rows = parseCsv(text);
  const dateKey = rows[0] && ("observation_date" in rows[0] ? "observation_date" : "DATE");
  return rows
    .filter((r) => r[dateKey] && r[id] && r[id] !== ".")
    .map((r) => ({ date: r[dateKey], val: Number(r[id]) }))
    .filter((r) => Number.isFinite(r.val));
}

async function fredSeries(id) {
  const start = new Date(Date.now() - 400 * 86400 * 1000).toISOString().slice(0, 10);
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${start}`;
  const { text } = await fetchText(url, { source: "FRED" });
  const obs = parseFredCsv(text, id);
  if (!obs.length) throw new SourceError("FRED", url, `${id}: no data`);
  return obs;
}

export function cpiYoY(obs) {
  const last = obs.at(-1);
  const target = new Date(last.date);
  target.setFullYear(target.getFullYear() - 1);
  const yearAgo = obs.find((o) => o.date === target.toISOString().slice(0, 10));
  if (!yearAgo) return null;
  return { value: ((last.val / yearAgo.val) - 1) * 100, last, yearAgo };
}

async function ecbDepositRate() {
  const url = "https://data-api.ecb.europa.eu/service/data/FM/B.U2.EUR.4F.KR.DFR.LEV?lastNObservations=1&format=csvdata";
  const { text } = await fetchText(url, { source: "BCE" });
  const last = parseCsv(text).at(-1);
  if (!last?.OBS_VALUE) throw new SourceError("BCE", url, "no data");
  return fact(Number(last.OBS_VALUE), {
    source: "BCE — taxa da facilidade de depósito",
    url: "https://data.ecb.europa.eu/data/datasets/FM",
    badge: "primary",
    asOf: last.TIME_PERIOD,
  });
}

/** Macro snapshot. Each series independent: a failure is reported, never filled in. */
export async function getMacro() {
  const out = {};
  const errors = [];
  const jobs = Object.entries(FRED_SERIES).map(async ([id, label]) => {
    const obs = await fredSeries(id);
    const last = obs.at(-1);
    const meta = { source: `FRED — ${label}`, url: `https://fred.stlouisfed.org/series/${id}`, badge: "primary", asOf: last.date };
    if (id === "CPIAUCSL") {
      const yoy = cpiYoY(obs);
      out.cpiYoY = yoy
        ? fact(yoy.value, { ...meta, badge: "calc", formula: `CPI ${yoy.last.date} (${yoy.last.val}) ÷ CPI ${yoy.yearAgo.date} (${yoy.yearAgo.val}) − 1` })
        : fact(null, { ...meta, badge: "unverified", note: "sem observação de há 12 meses" });
    } else {
      out[id] = fact(last.val, meta);
    }
  });
  jobs.push(ecbDepositRate().then((f) => (out.ecbDepositRate = f)));
  const settled = await Promise.allSettled(jobs);
  for (const s of settled) if (s.status === "rejected") errors.push({ source: s.reason.source ?? "macro", message: s.reason.message });
  if (out.DGS10 && out.DGS2) {
    out.curve10y2y = fact(out.DGS10.value - out.DGS2.value, { source: "FRED", url: "https://fred.stlouisfed.org/series/T10Y2Y", badge: "calc", formula: `10 anos (${out.DGS10.value}) − 2 anos (${out.DGS2.value})`, asOf: out.DGS10.asOf });
  }
  return { ...out, errors };
}
