import { fact } from "./sources.js";

// App calculations (🧮). Every result carries its formula and inputs so the user can check it.

const calc = (value, formula, note) => fact(value, { source: "Cálculo da app", badge: "calc", formula, note });
const v = (f) => (f && typeof f.value === "number" && Number.isFinite(f.value) ? f.value : null);
const big = (n) => {
  if (n == null) return "n/d";
  const a = Math.abs(n);
  if (a >= 1e12) return `${(n / 1e12).toFixed(2)} bi`;
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)} mM`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)} M`;
  return n.toFixed(2);
};
const pctChange = (from, to) => (from && to != null ? ((to - from) / Math.abs(from)) * 100 : null);

/**
 * Derive key metrics from a quote and SEC financials.
 * `priceOverride` (the broker price the user typed, already in the listing currency) always wins.
 */
export function computeMetrics({ quote, financials, priceOverride = null, reportingCurrencyMatches = true }) {
  const out = { alerts: [] };
  if (!financials) return out;
  const { ttm = {}, latest = {}, annual = {} } = financials;

  const price = priceOverride ?? v(quote?.price);
  const priceLabel = priceOverride != null ? "preço indicado pelo utilizador" : "preço de mercado";
  const shares = v(latest.sharesOutstanding) ?? v(latest.dilutedShares);

  // Free cash flow
  const ocf = v(ttm.ocf);
  const capex = v(ttm.capex);
  if (ocf != null && capex != null) out.fcfTtm = calc(ocf - capex, `fluxo operacional (${big(ocf)}) − capex (${big(capex)}), últimos 12 meses`);
  const fcf = v(out.fcfTtm);
  const sbc = v(ttm.sbc);
  if (fcf != null && sbc != null) out.fcfAfterSbcTtm = calc(fcf - sbc, `FCF (${big(fcf)}) − custo das ações dadas a funcionários (${big(sbc)})`);

  // Net debt
  const cash = (v(latest.cash) ?? 0) + (v(latest.shortTermInvestments) ?? 0);
  const debt = (v(latest.longTermDebt) ?? 0) + (v(latest.currentDebt) ?? 0);
  if (latest.cash || latest.longTermDebt) {
    out.netDebt = calc(debt - cash, `dívida (${big(debt)}) − caixa e investimentos de curto prazo (${big(cash)})`, "Não inclui locações (leases)");
  }

  if (!reportingCurrencyMatches) {
    out.alerts.push({
      code: "currency_mismatch",
      text: "A cotação e as contas estão em moedas diferentes (ou é um ADR com rácio desconhecido): valuation por ação não calculado.",
    });
  }

  // Valuation (only when price and financials share a currency)
  if (price != null && shares && reportingCurrencyMatches) {
    const mcap = price * shares;
    out.marketCap = calc(mcap, `${priceLabel} (${price}) × ações em circulação (${big(shares)})`);
    const nd = v(out.netDebt) ?? 0;
    out.enterpriseValue = calc(mcap + nd, `capitalização (${big(mcap)}) + dívida líquida (${big(nd)})`);
    if (fcf != null) out.fcfYieldEv = calc((fcf / (mcap + nd)) * 100, `FCF 12m (${big(fcf)}) ÷ valor da empresa (${big(mcap + nd)}) × 100`);
    const ni = v(ttm.netIncome);
    if (ni != null && ni > 0) out.peGaap = calc(mcap / ni, `capitalização (${big(mcap)}) ÷ lucro líquido contabilístico 12m (${big(ni)})`, "P/E contabilístico — o ajustado depende de itens pontuais, ver relatório");
    else if (ni != null) out.peGaap = calc(null, "lucro líquido 12m ≤ 0", "P/E não aplicável (prejuízo)");
  }

  // Forensics
  const ni = annual.netIncome ?? [];
  const ocfA = annual.ocf ?? [];
  const capA = annual.capex ?? [];
  const fcfByYear = ocfA
    .map((o) => ({ end: o.end, val: o.val - (capA.find((c) => c.end === o.end)?.val ?? 0) }))
    .filter((x) => capA.some((c) => c.end === x.end));
  if (ni.length >= 4 && fcfByYear.length >= 4) {
    const niFrom = ni.at(-4).val, niTo = ni.at(-1).val;
    const fFrom = fcfByYear.at(-4).val, fTo = fcfByYear.at(-1).val;
    const sumNi = ni.slice(-3).reduce((s, x) => s + x.val, 0);
    const sumF = fcfByYear.slice(-3).reduce((s, x) => s + x.val, 0);
    out.fcfConversion3y = calc(sumNi > 0 ? (sumF / sumNi) * 100 : null, `Σ FCF 3 anos (${big(sumF)}) ÷ Σ lucro 3 anos (${big(sumNi)}) × 100`);
    const gNi = pctChange(niFrom, niTo), gF = pctChange(fFrom, fTo);
    if (gNi != null && gF != null && gNi - gF > 30) {
      out.alerts.push({ code: "earnings_vs_cash", text: `Lucro cresceu ${gNi.toFixed(0)}% em 3 anos mas o FCF só ${gF.toFixed(0)}% — qualidade do lucro a verificar.` });
    }
  }

  const sh = annual.dilutedShares ?? [];
  if (sh.length >= 2) {
    const last = sh.at(-1), prev1 = sh.at(-2), prev5 = sh.at(-Math.min(6, sh.length));
    out.shareChange1y = calc(pctChange(prev1.val, last.val), `ações diluídas ${last.end.slice(0, 4)} vs ${prev1.end.slice(0, 4)}`);
    out.shareChangeLong = calc(pctChange(prev5.val, last.val), `ações diluídas ${last.end.slice(0, 4)} vs ${prev5.end.slice(0, 4)}`);
    if (v(out.shareChange1y) > 2) out.alerts.push({ code: "dilution", text: `Diluição: número de ações subiu ${v(out.shareChange1y).toFixed(1)}% no último ano.` });
  }

  const div = v(ttm.dividends);
  if (div && fcf != null) {
    out.dividendCoverage = calc(fcf > 0 ? (div / fcf) * 100 : null, `dividendos pagos 12m (${big(div)}) ÷ FCF 12m (${big(fcf)}) × 100`);
    if (fcf <= 0 || div > fcf) out.alerts.push({ code: "dividend_uncovered", text: "Dividendo não coberto pelo free cash flow dos últimos 12 meses." });
  }

  const debtSeries = (annual.longTermDebt ?? []);
  const bb = v(ttm.buybacks);
  if (debtSeries.length >= 2 && bb) {
    const d0 = debtSeries.at(-2).val, d1 = debtSeries.at(-1).val;
    if (d1 > d0 && fcf != null && bb + (div ?? 0) > fcf) {
      out.alerts.push({ code: "debt_funded_returns", text: `Dívida subiu (${big(d0)} → ${big(d1)}) enquanto recompras + dividendos (${big(bb + (div ?? 0))}) excedem o FCF — retorno ao acionista pago com dívida?` });
    }
  }

  const opInc = annual.operatingIncome ?? [];
  const rev = annual.revenue ?? [];
  const margins = opInc
    .map((o) => {
      const r = rev.find((x) => x.end === o.end);
      return r?.val ? { end: o.end, val: (o.val / r.val) * 100 } : null;
    })
    .filter(Boolean);
  if (margins.length) {
    out.operatingMargins = margins;
    const last = margins.at(-1).val, max = Math.max(...margins.map((m) => m.val)), avg = margins.reduce((s, m) => s + m.val, 0) / margins.length;
    out.operatingMarginLast = calc(last, `resultado operacional ÷ receita (${margins.at(-1).end.slice(0, 4)})`);
    if (margins.length >= 5 && last >= max - 0.5 && last > avg * 1.3) {
      out.alerts.push({ code: "peak_margins", text: `Margem operacional (${last.toFixed(1)}%) está no máximo de ${margins.length} anos e bem acima da média (${avg.toFixed(1)}%) — cuidado com P/E baixo em negócio cíclico.` });
    }
  }

  return out;
}
