import { STRINGS } from "./i18n.js";
import { renderMarkdown } from "./markdown.js";

const $ = (id) => document.getElementById(id);
const BADGE_CLASS = { primary: "b-primary", aggregator: "b-aggregator", calc: "b-calc", unverified: "b-unverified" };
const BADGE_ICON = { primary: "✓", aggregator: "≈", calc: "🧮", unverified: "⚠️" };

let lang = "pt";
try {
  lang = localStorage.getItem("lang") === "en" ? "en" : "pt";
} catch {}
const t = (k) => STRINGS[lang][k] ?? STRINGS.pt[k] ?? k;

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const locale = () => (lang === "en" ? "en-GB" : "pt-PT");
const num = (n, d = 2) => (n == null || !Number.isFinite(n) ? "—" : n.toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }));
const big = (n) => {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(locale(), { notation: "compact", maximumFractionDigits: 2 });
};
const when = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? esc(iso) : d.toLocaleString(locale(), { dateStyle: "short", timeStyle: iso.length > 10 ? "short" : undefined });
};

function badge(f) {
  if (!f) return "";
  const cls = BADGE_CLASS[f.badge] ?? "b-unverified";
  const icon = BADGE_ICON[f.badge] ?? "⚠️";
  const title = esc([f.source, f.formula, f.note].filter(Boolean).join(" — "));
  return f.url
    ? `<a class="badge ${cls}" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer" title="${title}">${icon}</a>`
    : `<span class="badge ${cls}" title="${title}">${icon}</span>`;
}
const prov = (f) => (f ? `${esc(f.source)}${f.asOf ? ` · ${when(f.asOf)}` : ""}${f.formula ? `<div class="formula">= ${esc(f.formula)}</div>` : ""}${f.note ? `<div class="formula">${esc(f.note)}</div>` : ""}` : "");

// ---------- language ----------
function applyLang() {
  document.documentElement.lang = lang === "en" ? "en" : "pt-PT";
  document.title = t("title");
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const b of document.querySelectorAll("[data-lang]")) b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
  if (state.dossier) renderDossier(state.dossier);
  if (state.result) renderResult(state.result);
}
for (const b of document.querySelectorAll("[data-lang]")) {
  b.addEventListener("click", () => {
    lang = b.dataset.lang;
    try {
      localStorage.setItem("lang", lang);
    } catch {}
    applyLang();
  });
}

// ---------- state ----------
const state = { dossier: null, result: null, markdown: "", controller: null, sources: 0, renderPending: false };

// ---------- setup check ----------
fetch("/api/health")
  .then((r) => r.json())
  .then((h) => {
    const msgs = [];
    if (!h.anthropicKey) msgs.push(t("setupKey"));
    if (!h.secUserAgent) msgs.push(t("setupSec"));
    if (msgs.length) {
      $("setup-warning").innerHTML = msgs.map(esc).join("<br>");
      $("setup-warning").hidden = false;
    }
  })
  .catch(() => {});

// ---------- form ----------
$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  body.lang = lang;
  await analyze(body);
});
$("cancel").addEventListener("click", () => state.controller?.abort());

// ---------- search box with suggestions ----------
const sugg = { items: [], active: -1, timer: null, seq: 0 };
const qInput = $("query");

function closeSuggestions() {
  $("suggestions").hidden = true;
  qInput.setAttribute("aria-expanded", "false");
  sugg.active = -1;
}

function renderSuggestions() {
  const ul = $("suggestions");
  if (!sugg.items.length) return closeSuggestions();
  ul.innerHTML = sugg.items
    .map((c, i) => `<li role="option" id="sugg-${i}" aria-selected="${i === sugg.active}" data-i="${i}"><span class="s-name">${esc(c.name)}</span><span class="s-sym">${esc(c.symbol)}<span class="s-ex">${esc(c.exchange ?? "")}</span></span></li>`)
    .join("");
  ul.hidden = false;
  qInput.setAttribute("aria-expanded", "true");
  if (sugg.active >= 0) qInput.setAttribute("aria-activedescendant", `sugg-${sugg.active}`);
  else qInput.removeAttribute("aria-activedescendant");
}

function pick(c) {
  qInput.value = `${c.name} (${c.symbol})`;
  $("symbol").value = c.symbol;
  closeSuggestions();
}

qInput.addEventListener("input", () => {
  $("symbol").value = ""; // typed again: the earlier pick no longer applies
  clearTimeout(sugg.timer);
  const q = qInput.value.trim();
  if (q.length < 2) {
    sugg.items = [];
    return closeSuggestions();
  }
  sugg.timer = setTimeout(async () => {
    const seq = ++sugg.seq;
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`).then((x) => x.json());
      if (seq !== sugg.seq) return; // a newer search is on its way
      sugg.items = r.candidates ?? [];
      sugg.active = -1;
      renderSuggestions();
    } catch {
      closeSuggestions();
    }
  }, 250);
});

qInput.addEventListener("keydown", (e) => {
  if ($("suggestions").hidden) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const n = sugg.items.length;
    sugg.active = e.key === "ArrowDown" ? (sugg.active + 1) % n : (sugg.active - 1 + n) % n;
    renderSuggestions();
  } else if (e.key === "Enter" && sugg.active >= 0) {
    e.preventDefault();
    pick(sugg.items[sugg.active]);
  } else if (e.key === "Escape") {
    closeSuggestions();
  }
});
qInput.addEventListener("blur", () => setTimeout(closeSuggestions, 150));
$("suggestions").addEventListener("mousedown", (e) => {
  const li = e.target.closest("li[data-i]");
  if (!li) return;
  e.preventDefault();
  pick(sugg.items[Number(li.dataset.i)]);
});

function showChoices(data) {
  const div = document.createElement("div");
  div.className = "notice warn";
  div.innerHTML = `<b>${esc(t("choose"))}</b><div class="choices">${data.candidates
    .map((c, i) => `<button type="button" data-i="${i}">${esc(c.name)} — <b>${esc(c.symbol)}</b><small>${esc(c.exchange ?? "")}</small></button>`)
    .join("")}</div>`;
  div.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-i]");
    if (!b) return;
    pick(data.candidates[Number(b.dataset.i)]);
    $("form").requestSubmit();
  });
  $("choices").replaceChildren(div);
  $("results").hidden = true;
  div.querySelector("button")?.focus();
}

function resetUi() {
  Object.assign(state, { dossier: null, result: null, markdown: "", sources: 0 });
  $("choices").replaceChildren();
  $("results").hidden = false;
  $("quote-card").innerHTML = "";
  for (const id of ["hold", "buy"]) {
    $(`${id}-bar`).style.width = "0";
    $(`${id}-val`).textContent = "—";
  }
  $("verdict").innerHTML = "";
  $("action").hidden = true;
  $("earnings").textContent = "";
  $("log").innerHTML = "";
  $("progress-count").textContent = "";
  $("alerts").innerHTML = "";
  $("report").innerHTML = `<p class="muted">${esc(t("waiting"))}</p>`;
  for (const id of ["facts", "filings", "news", "sources", "errors"]) $(id).innerHTML = "";
  $("progress").open = true;
  $("progress").classList.add("running");
  $("progress-title").textContent = t("working");
}

function log(text, cls = "") {
  const li = document.createElement("li");
  li.textContent = text;
  if (cls) li.className = cls;
  $("log").append(li);
  $("log").scrollTop = $("log").scrollHeight;
  return li;
}

async function analyze(body) {
  resetUi();
  $("submit").disabled = true;
  $("cancel").hidden = false;
  const controller = new AbortController();
  state.controller = controller;
  let thinkingLi = null;

  try {
    const res = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(t(err.error) || `HTTP ${res.status}`);
    }
    for await (const { event, data } of readSse(res.body)) {
      switch (event) {
        case "status":
          log({ resolve: t("stepResolve"), quote: t("stepQuote"), news: t("stepNews"), macro: t("stepMacro"), analysis: t("stepAnalysis") }[data.step] ?? data.step);
          thinkingLi = null;
          break;
        case "resolved":
          log(`✓ ${t("resolvedAs")}: “${data.query}” → ${data.name} (${data.symbol})${data.exchange ? ` · ${data.exchange}` : ""} ${data.method === "ai" ? t("resolvedAi") : ""}`);
          break;
        case "choose":
          showChoices(data);
          break;
        case "notfound":
          $("results").hidden = true;
          $("choices").innerHTML = `<div class="notice err">${esc(t("notFound"))}</div>`;
          break;
        case "dossier":
          state.dossier = data;
          renderDossier(data);
          break;
        case "thinking":
          if (!thinkingLi) thinkingLi = log("", "thinking");
          thinkingLi.textContent += data.text;
          break;
        case "search":
          log(`${t("searching")}: ${data.query ?? ""}`);
          thinkingLi = null;
          break;
        case "fetch":
          log(`${t("reading")}: ${data.query ?? ""}`);
          thinkingLi = null;
          break;
        case "sources":
          $("progress-count").textContent = `· ${data.count} ${t("sourcesCount")}`;
          break;
        case "fallback":
          log(`${t("fallback")}: ${data.to ?? ""}`);
          break;
        case "text":
          state.markdown += data.text;
          scheduleReportRender();
          break;
        case "done":
          state.result = data;
          renderResult(data);
          break;
        case "error":
          showError(data.message);
          break;
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") showError(err.message);
  } finally {
    $("submit").disabled = false;
    $("cancel").hidden = true;
    $("progress").classList.remove("running");
    $("progress-title").textContent = t("finished");
    state.controller = null;
  }
}

async function* readSse(stream) {
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = "message";
      let data = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (event === "ping") continue;
      try {
        yield { event, data: data ? JSON.parse(data) : {} };
      } catch {}
    }
  }
}

function scheduleReportRender() {
  if (state.renderPending) return;
  state.renderPending = true;
  requestAnimationFrame(() => {
    state.renderPending = false;
    // Hide the trailing JSON summary while it streams in.
    const visible = state.markdown.replace(/```json[\s\S]*$/, "");
    $("report").innerHTML = renderMarkdown(visible);
  });
}

function showError(message) {
  const div = document.createElement("div");
  div.className = "notice err";
  div.textContent = message;
  $("errors").prepend(div);
}

// ---------- rendering ----------
function renderDossier(d) {
  renderQuote(d);
  renderFacts(d);
  renderFilings(d);
  renderNews(d);
  renderAlerts(d);
  renderSourceErrors(d);
}

function renderQuote(d) {
  const q = d.quote;
  if (!q) {
    $("quote-card").innerHTML = `<h2>${esc(d.ticker)}</h2><p class="muted">${esc(t("noData"))}</p>`;
    return;
  }
  const chg = q.change?.value, pct = q.changePct?.value;
  const dir = chg > 0 ? "up" : chg < 0 ? "down" : "";
  const lo = q.low52?.value, hi = q.high52?.value, p = q.price.value;
  const pos = lo != null && hi != null && hi > lo ? Math.max(0, Math.min(100, ((p - lo) / (hi - lo)) * 100)) : null;
  const broker = d.brokerPrice
    ? `<p class="small"><b>${esc(t("yourPrice"))}:</b> ${num(d.brokerPrice.value)} ${esc(d.brokerPrice.note ?? "")} ${badge(d.brokerPrice)}</p>`
    : "";
  $("quote-card").innerHTML = `
    <h2>${esc(q.symbol)}${q.exchange ? ` · ${esc(q.exchange)}` : ""}</h2>
    <p class="name">${esc(q.name)}</p>
    <div class="price">${num(p)} <small>${esc(q.currency ?? "")}</small> ${badge(q.price)}
      <span class="chg ${dir}" style="font-size:16px">${chg != null ? `${chg > 0 ? "+" : ""}${num(chg)} (${pct > 0 ? "+" : ""}${num(pct)}%) ${t("today")}` : ""}</span></div>
    ${d.priceEur ? `<p class="small">≈ €${num(d.priceEur.value)} ${badge(d.priceEur)} <span class="muted">${esc(t("inEur"))}</span></p>` : ""}
    ${broker}
    ${pos != null ? `<div class="range"><div class="range-bar"><i style="left:${pos}%"></i></div><div class="range-labels"><span>${num(lo)}</span><span>${esc(t("range52"))} ${badge(q.high52)}</span><span>${num(hi)}</span></div></div>` : ""}
    <p class="prov">${prov(q.price)}${d.quoteCachedAgeSec ? ` · ${esc(t("cachedQuote"))} ${d.quoteCachedAgeSec}${esc(t("seconds"))}` : ""}</p>`;
}

function renderFacts(d) {
  const m = d.metrics ?? {};
  const fin = d.sec?.financials;
  const rows = [];
  const add = (key, f, fmt = big) => rows.push(`<tr><td>${esc(t("m")[key] ?? key)}</td><td class="num">${f?.value == null ? esc(t("noData")) : fmt(f.value)} ${badge(f)}</td><td class="small">${prov(f)}</td></tr>`);
  if (fin?.ttm?.revenue) add("revenue", fin.ttm.revenue);
  if (fin?.ttm?.netIncome) add("netIncome", fin.ttm.netIncome);
  for (const [k, fmt] of [["peGaap", (n) => num(n, 1)], ["fcfTtm", big], ["fcfAfterSbcTtm", big], ["fcfYieldEv", (n) => num(n, 1)], ["netDebt", big], ["marketCap", big], ["enterpriseValue", big], ["fcfConversion3y", (n) => num(n, 0)], ["shareChange1y", (n) => num(n, 1)], ["shareChangeLong", (n) => num(n, 1)], ["dividendCoverage", (n) => num(n, 0)], ["operatingMarginLast", (n) => num(n, 1)]]) {
    if (m[k]) add(k, m[k], fmt);
  }
  if (d.sec?.insiderForm4Last90d) add("insider", d.sec.insiderForm4Last90d, (n) => String(n));
  for (const [k, f] of Object.entries(d.macro ?? {})) {
    if (k !== "errors" && f && typeof f === "object") rows.push(`<tr><td>${esc(f.source)}</td><td class="num">${num(f.value)} ${badge(f)}</td><td class="small">${prov({ ...f, source: "" })}</td></tr>`);
  }
  $("facts").innerHTML = rows.length
    ? `<table><thead><tr><th>${esc(t("metric"))}</th><th>${esc(t("value"))}</th><th>${esc(t("provenance"))}</th></tr></thead><tbody>${rows.join("")}</tbody></table>`
    : `<p class="muted">${esc(t("noData"))}</p>`;
}

function renderFilings(d) {
  const f = d.sec?.filings ?? [];
  $("filings").innerHTML = f.length
    ? `<ul class="list">${f
        .slice(0, 25)
        .map((x) => `<li><span class="tag">${esc(x.form)}</span><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.description || x.form)}</a> <span class="badge b-primary">✓</span><div class="meta">${when(x.filed)}${x.items ? ` · items ${esc(x.items)}` : ""}</div></li>`)
        .join("")}</ul>`
    : `<p class="muted">${esc(d.secNote ?? t("noFilings"))}</p>`;
}

function renderNews(d) {
  const items = (d.news?.feeds ?? []).flatMap((f) => f.items);
  $("news").innerHTML = items.length
    ? `<ul class="list">${items
        .map((n) => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a> <span class="badge b-aggregator">≈</span><div class="meta">${esc(n.source ?? "")} · ${when(n.publishedAt)}${n.paywalled ? ` · ${esc(t("paywalled"))}` : ""}</div></li>`)
        .join("")}</ul>`
    : `<p class="muted">${esc(t("noNews"))}</p>`;
}

function renderAlerts(d) {
  const a = d.metrics?.alerts ?? [];
  $("alerts").innerHTML = a.length ? `<div class="notice warn"><b>${esc(t("alerts"))}</b><ul>${a.map((x) => `<li>${esc(x.text)}</li>`).join("")}</ul></div>` : "";
}

function renderSourceErrors(d) {
  const e = d.errors ?? [];
  const html = e.length ? `<div class="notice warn"><b>${esc(t("sourceErrors"))}</b><ul>${e.map((x) => `<li>${esc(x.source)}: ${esc(x.message)}</li>`).join("")}</ul></div>` : "";
  $("errors").querySelector(".source-errors")?.remove();
  if (html) $("errors").insertAdjacentHTML("beforeend", `<div class="source-errors">${html}</div>`);
}

function renderResult(r) {
  $("report").innerHTML = renderMarkdown(r.markdown) + (r.truncated ? `<p class="notice warn">${esc(t("truncated"))}</p>` : "");
  const s = r.summary;
  if (s) {
    for (const k of ["hold", "buy"]) {
      const v = s.scores?.[k];
      $(`${k}-bar`).style.width = v == null ? "0" : `${v * 10}%`;
      $(`${k}-val`).textContent = v == null ? "—" : num(v, v % 1 ? 1 : 0);
    }
    $("verdict").innerHTML = (s.verdict ?? []).map((l) => `<li>${esc(l)}</li>`).join("");
    if (s.action) {
      $("action").textContent = s.action;
      $("action").hidden = false;
    }
    const ne = s.nextEarnings;
    if (ne?.date) {
      $("earnings").innerHTML = `${esc(t("nextEarnings"))}: <b>${when(ne.date)}</b> (${esc(ne.confirmed ? t("confirmed") : t("estimated"))})${ne.source ? ` <a class="badge ${ne.confirmed ? "b-primary" : "b-unverified"}" href="${esc(ne.source)}" target="_blank" rel="noopener noreferrer">${ne.confirmed ? "✓" : "⚠️"}</a>` : ""}`;
    }
  }
  const all = new Map();
  for (const c of [...(r.citations ?? []), ...(r.consulted ?? [])]) if (c.url && !all.has(c.url)) all.set(c.url, c);
  $("sources").innerHTML = all.size
    ? `<ul class="list">${[...all.values()].map((c) => `<li><a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.title || c.url)}</a>${c.pageAge ? `<div class="meta">${esc(c.pageAge)}</div>` : ""}</li>`).join("")}</ul>`
    : `<p class="muted">${esc(t("noSources"))}</p>`;
}

applyLang();
