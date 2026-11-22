# Agente VALUE — 2026-11-22 (preços: fecho de sexta 2026-11-20)

> Declaração: sou feito pela Anthropic. A Alphabet (GOOGL) tem participação na Anthropic, pelo que a análise da GOOGL pode estar enviesada; trata-a com cautela.

## Limitações desta execução (ler primeiro)
- A FMP (plano limitado) negou muitos tickers (CTSH, QCOM, ELV, CF, MO, ACN, CRM, EBAY, CMCSA, GILD, DELL, etc.), bloqueou cotações internacionais/em lote e, a meio, atingiu o limite de pedidos (rate limit) em statements e quote. Por isso **não foi possível**: Piotroski (exceto HCA), P/E médio 10 anos, P/TBV, e preços de VZ/T/UNH/TGT/NKE.
- WebFetch não resolve sec.gov nem fortune.com (rede), só WebSearch (US-only; sem dados de preço fiáveis para Europa/Japão/Coreia/Índia/Brasil). **Não há candidatos não-EUA verificados.** Cobertura global NÃO foi cumprida; é preciso nova corrida com acesso.
- Triagem: 11 candidatos com números FMP verificados + 5 sem dados (marcados "NAO AVALIADO" no CSV) = 16 linhas. Só ADBE e PYPL passam realmente os critérios Value; os restantes do top 5 são "melhor do que sobra".
- Múltiplos TTM vêm da FMP (P/E = 1/earnings yield; P/FCF = 1/FCF yield). Notas 0–10 são julgamento meu com os pesos pedidos.
- Nenhum resultado dos candidatos cai em 22-nov a 2-dez (calendário FMP só mostrou NIO, BILI, ZM). Datas dos próximos resultados são estimativas.

## Ranking
| # | Ticker | Preço (2026-11-20) | Nota | P/E | P/FCF | Próx. resultados |
|---|---|---|---|---|---|---|
| 1 | ADBE | 217,71 USD | 7,5 | 11,8 | 8,0 | ~meados dez (estimativa) |
| 2 | PYPL | 53,29 USD | 6,8 | 9,6 | 7,0 | ~fim jan/fev (estimativa) |
| 3 | GOOGL | 265,29 USD | 6,6 | 13,8 | 164 | ~fim jan/fev (estimativa) |
| 4 | HCA | 475,57 USD | 6,0 | 15,6 | 16,6 | ~fim jan (estimativa) |
| 5 | VZ | n/d (mcap 192,6 mil M) | 5,6 | 11,8 | 9,1 | ~fim jan (estimativa) |

Veredicto: ADBE é o único que merece "Comprar por fases" (nota 7,5, zona normal). Os outros: observar.

---
## 1. ADBE — Adobe (NASDAQ) — Stalwart (a roçar slow grower) — nota 7,5
**Tese.** Software de criatividade/documentos com ROIC ~37% e ~12% de FCF yield, penalizado por medo de disrupção por IA generativa e por transição de gestão. Preço 217,71 (52 sem: 190,12–362,71), mcap 84,7 mil M. Mercado trata-a como cadáver em lenta decadência; os números mostram receita +13% e EPS +15%.
**Números (FMP TTM + 8-K T3 FY26).** P/E 11,8 (GAAP); P/E sobre non-GAAP FY26 ~9 (estimativa: ~24 USD); P/FCF 8,0; EV/EBITDA 8,5; EV/EBIT ~9,3 (estimativa: EBIT GAAP T3 2,35 mil M x4). ROE 63% (inflacionado por recompras), ROIC 37%. Dív.líq./EBITDA 0,23; caixa 5,64 mil M. T3 FY26: receita 6,76 mil M (+13%), EPS GAAP 4,62 vs non-GAAP 6,13, CFO 2,52 mil M, RPO 22,16 mil M, ARR 27,5 mil M. Guidance FY: receita 26,576–26,626 mil M.
**Forense.** GAAP vs ajustado: 4,62/6,13 => ajustado 33% acima (<40%, explicado sobretudo por SBC e amortizações). SBC ~8% da receita (FMP) => FCF ajustado por SBC ~8,5 mil M (estimativa) => P/(FCF-SBC) ~10x, ainda barato. FCF/lucro: OCF/NI 1,48 (bom). Recebíveis 29 dias (estável), sem inventário. Sem ganhos não operacionais relevantes encontrados. Recompras (~9,5M ações no T3) superam a diluição. Sem financiamento circular. Piotroski: indisponível (rate limit).
**Anti-armadilha.** Receita não está em queda (+13%). Balanço sólido (caixa 5,6 mil M, quase sem dívida líquida). Catalisador: recompras agressivas, ARR "AI-first" +150% (segundo a empresa), resultados T4 em meados de dezembro. Risco real: IA pode erodir o pricing power de longo prazo (Firefly/modelos de terceiros) — é essa a dúvida que o preço incorpora.
**Riscos.** (1) Disrupção por IA; (2) transição CEO (Chakravarthy em 1-dez, Narayen executive chair) com **CFO interino** (Steve Day) — governação a vigiar, sem penalização formal; (3) SBC elevado; (4) o múltiplo pode ficar barato mais tempo (queda de 40% desde máximos).
**Zonas (estimativa).** Normal (7–7,5): <=220 USD (P/FCF <=8,1x) — já está aqui. Forte (8–8,5): <=185 (~15% abaixo; P/FCF ~6,8x, margem de segurança contra queda de ARR). Excelente (9): <=155 (~30% abaixo; ~5,7x FCF, P/E GAAP ~8). Lógica: múltiplo de FCF ajustado à qualidade e piso de ~25% de queda estrutural no FCF.
**Fontes.** FMP quote/key-metrics-ttm (API, 2026-11-22); https://www.sec.gov/Archives/edgar/data/0000796343/000079634326000147/adbeex991q326.htm ; https://www.morningstar.com/news/business-wire/20260910832552/adobe-reports-record-q3-results ; https://news.adobe.com/news/2026/09/adobe-q3fy26-financial-results

## 2. PYPL — PayPal (NASDAQ) — Turnaround — nota 6,8
**Tese.** Pagamentos com FCF yield ~14% e P/E 9,6, a recomprar ~6 mil M USD/ano (≈14% do mcap), mas branded checkout estagnado (+1–2%) e crescimento de margem de transação de só +2%. O EPS cresce 8% por recompras/custos, não por negócio.
**Números.** Preço 53,29 (52 sem 38,46–63,93), mcap 44,3 mil M. P/E TTM 9,6; P/FCF 7,0 (TTM; FCF reportado T3 1,43 mil M, -17%, vs ajustado ~2,0 mil M); EV/EBITDA 7,3; ROE 23,8%; ROIC 13,3%; dív.líq./EBITDA 0,91. EPS T3: GAAP 1,25 (-4%) vs non-GAAP 1,45 (+8%). Guidance 2026: EPS non-GAAP ~5,60; FCF ajustado >=6,5 mil M; recompras ~6 mil M; dividendo 0,14 USD/trim. Contas ativas 228M (estáveis).
**Forense.** Gap GAAP/ajustado 14% (<40%). SBC 2,8% da receita. FCF ajustado exclui 616 M de recebíveis BNPL — é capital de giro real do negócio de crédito: usar FCF reportado como referência prudente. Recebíveis ~107 dias (carteira de crédito BNPL/empréstimos crescente: vigiar perdas). Diluição negativa (acções 960M → 858M). Piotroski indisponível.
**Anti-armadilha.** Receita não em queda, mas crescimento orgânico fraco e Europa fraca; balanço ok. Catalisador: recompras + dividendo + serviços financeiros (>20% da margem, crescimento de dois dígitos). Mais "barato por um motivo" do que ADBE; 2027 terá mais investimento.
**Riscos.** Perda de quota (Apple Pay, etc.), perdas de crédito BNPL, compressão de margem, EPS dependente de recompras.
**Zonas (estimativa).** Normal <=49 USD (~8,75x EPS non-GAAP 2026); forte <=42 (7,5x); excelente <=36 (6,4x). Lógica: o crescimento é baixo, por isso só compensa com múltiplo muito deprimido.
**Fontes.** FMP (API, 2026-11-22); https://fortune.com/company/paypal-holdings/earnings/q3-2026/ ; https://s205.q4cdn.com/875401827/files/content_files/PYPL-3Q-26-Earnings-IR-Newsletter.pdf ; https://247wallst.com/cards/paypal-q3-2026-earnings-pypl-01m5ygpczmqds61s62w3y8g3z4

## 3. GOOGL — Alphabet (NASDAQ) — Stalwart — nota 6,6
**Tese.** Qualidade máxima, P/E TTM 13,8, mas **P/FCF ~164** porque o capex é 34% da receita (ciclo IA). Não passa o critério FCF; entra como "qualidade a preço razoável", não Value puro. Preço 265,29 (52 sem 264,22–408,61: no mínimo anual), mcap 3,24 bi.
**Números.** EV/EBITDA 10,4; ROE 42,6%; ROIC 14,8%; dív.líq./EBITDA 0,27; current ratio 2,8. SBC 6,5% da receita.
**Forense.** OCF/NI só 0,76 (mau sinal: lucro inclui provavelmente ganhos não realizados em participações privadas — inclui a Anthropic; ver declaração). Capex/OCF 89%. Fiquei sem statements (rate limit) para confirmar.
**Anti-armadilha.** Não há queda de receita; balanço forte; catalisador: normalização do capex, Cloud. Mas o seu FCF depende do ciclo de IA que está em pânico — correlação alta com NVDA/TSM que já tens (limite Chips/IA 16%).
**Riscos.** Capex IA sem retorno, regulação antitrust, disrupção da pesquisa, correlação com a carteira.
**Zonas (estimativa).** Normal <=245 (P/E ~12,7); forte <=215 (11,2); excelente <=185 (9,6) — só faz sentido se o FCF recuperar.
**Fontes.** FMP quote/key-metrics-ttm (API, 2026-11-22).

## 4. HCA — HCA Healthcare (NYSE) — Stalwart — nota 6,0
**Tese.** Hospitais com ROIC 18,5%, recompras fortes e P/E 15,6; preço 475,57 (+3,3% em dia de pânico; 52 sem 353,99–556,52). Não é barata o suficiente (P/E>15, P/FCF 16,6).
**Números.** EV/EBITDA 9,5; EV/EBIT 12,4; dív.líq./EBITDA 3,24 (limite 4); capital próprio negativo (P/TBV não aplicável); Piotroski 6 (FMP); Altman Z 2,5. T3 2026: receita 19,85 mil M (vs 19,16), EBITDA aj. 3,92 mil M; recompras de 2,97 mil M no trimestre (7,23M ações), 4,24 mil M por usar; guidance EBITDA 15,4–16,1 mil M reafirmado.
**Forense.** OCF/NI 1,65; capex 47% do OCF; SBC ~0. Impacto de ~400 M no T3 pela mudança do mix de pagadores (perda de cobertura de exchanges).
**Riscos.** Política (subsídios ACA), mix de pagadores, alavancagem 3,2x, recompras financiadas com dívida.
**Zonas (estimativa).** Normal <=410 (P/E ~13,4 sobre EPS ~30,5); forte <=365 (12); excelente <=320 (10,5).
**Fontes.** FMP (API, 2026-11-22); https://www.sec.gov/Archives/edgar/data/0000860730/000119312526432665/hca-ex99_1.htm ; https://www.beckershospitalreview.com/finance/hca-absorbs-400m-payer-mix-hit-in-q3-8-things-to-know/

## 5. VZ — Verizon (NYSE) — Slow grower — nota 5,6
**Tese.** P/E 11,8, FCF yield 11%, FCF guiado +12% em 2026, mas ROIC 5,9%, crescimento baixo, capex 13% da receita. É um "yield play", não qualidade excelente. Preço de fecho não obtido (rate limit); mcap 192,6 mil M.
**Números.** EV/EBITDA 7,7; ROE 15,7%; dív.líq./EBITDA 3,77 pela FMP (empresa: 2,3x para dívida não garantida líquida / EBITDA aj.). T3 2026: FCF 7,8 mil M (+12,1%); 9M FCF 18,0 mil M; guiado EPS aj. 5,04–5,06; recompras até 4,5 mil M no ano.
**Riscos.** Dívida elevada, concorrência, capex, retorno sobre capital baixo. Sem zonas (preço em falta).
**Fontes.** FMP key-metrics-ttm (API, 2026-11-22); https://finviz.com/news/407810/verizon-beats-third-quarter-profit-estimates-and-raises-2026-earnings-guidance ; https://quartr.com/events/verizon-communications-inc-vz-q3-2026_3sRFaYvy

---
## Restantes triados (ver CSV)
MSFT 5,8; META 5,5; T 5,2; UNH 5,1; TGT 5,0; NKE 4,8 (múltiplos acima dos critérios Value). Sem dados: CTSH, QCOM, ELV, CF, MO.

## Para a tua decisão / carteira
Fiscalidade (28%) e Trading 212: ADBE e PYPL são ações dos EUA (CFD/ações fracionadas disponíveis normalmente; confirmar). Nenhum é ADR. GOOGL e a tua carteira de IA: correlação alta. ADBE tem resultados T4 ~mid-dez: pode comprar-se agora uma primeira tranche ou esperar pelos resultados (fora da janela ≤10 dias, por isso não é "ESPERAR" formal).
