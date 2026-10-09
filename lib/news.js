import { fetchText } from "./sources.js";

const PAYWALLED = ["bloomberg.com", "ft.com", "wsj.com", "barrons.com", "economist.com", "nikkei.com", "handelsblatt.com", "lesechos.fr", "jornaldenegocios.pt", "expresso.pt"];

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : null;
};

/** Parse a Google News RSS feed. Exported for tests. */
export function parseGoogleNewsRss(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const sourceMatch = it.match(/<source url="([^"]*)">([\s\S]*?)<\/source>/);
    const sourceUrl = sourceMatch ? decode(sourceMatch[1]) : null;
    const pub = tag(it, "pubDate");
    let title = tag(it, "title") ?? "";
    const sourceName = sourceMatch ? decode(sourceMatch[2]) : null;
    if (sourceName && title.endsWith(` - ${sourceName}`)) title = title.slice(0, -(sourceName.length + 3));
    const host = sourceUrl ? safeHost(sourceUrl) : null;
    items.push({
      title,
      url: tag(it, "link"),
      publishedAt: pub ? new Date(pub).toISOString() : null,
      source: sourceName,
      sourceDomain: host,
      paywalled: host ? PAYWALLED.some((d) => host === d || host.endsWith(`.${d}`)) : false,
      badge: "aggregator",
    });
  }
  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

function safeHost(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const FEEDS = {
  en: { hl: "en-US", gl: "US", ceid: "US:en" },
  pt: { hl: "pt-PT", gl: "PT", ceid: "PT:pt-150" },
};

/** Headlines from the last `days` days. The model must still confirm causes in 2 independent sources. */
export async function getNews({ ticker, name, days = 3, langs = ["en"] }) {
  const cleanName = (name ?? "").replace(/\b(inc|corp|corporation|plc|ltd|n\.?v|s\.?a|ag|se|co)\b\.?/gi, "").replace(/[,.]+$/g, "").trim();
  const q = cleanName ? `"${cleanName}" OR ${ticker} stock when:${days}d` : `${ticker} stock when:${days}d`;
  const results = await Promise.allSettled(
    langs.map(async (l) => {
      const f = FEEDS[l];
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${f.hl}&gl=${f.gl}&ceid=${f.ceid}`;
      const { text, fetchedAt } = await fetchText(url, { source: "Google News RSS" });
      return { lang: l, url, fetchedAt, items: parseGoogleNewsRss(text).slice(0, 15) };
    }),
  );
  const feeds = [];
  const errors = [];
  for (const r of results) {
    if (r.status === "fulfilled") feeds.push(r.value);
    else errors.push({ source: "Google News RSS", message: r.reason.message });
  }
  return { query: q, feeds, errors };
}
