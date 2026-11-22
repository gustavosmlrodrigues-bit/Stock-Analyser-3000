# Quedas de qualidade: análise de 2026-11-22 (preços: fecho de sexta 2026-11-20)

Feito pela Anthropic (declaração obrigatória: nenhuma das empresas analisadas é a Anthropic, mas o pânico de IA que gerou as quedas envolve o setor em que a Anthropic opera).

## Limitações de dados (ler primeiro)
- A quota da API FMP esgotou-se (rate limit) logo após as cotações. Sem demonstrações financeiras, rácios históricos nem calendário de resultados via FMP.
- Dados fundamentais vêm de pesquisa web (comunicados/resumos). Alguns pontos são secundários e estão marcados "(estimativa)" ou "não verificado".
- Forense completa (SBC % receita, contas a receber e inventário vs receita, dívida exata) só parcial: confirmar nos 10-Q antes de comprar.
- Só ~35 tickers foram cotados (o plano FMP bloqueia muitos símbolos). A triagem NÃO é exaustiva (ex.: LULU, NVO, ASML, AVGO, TMO, ISRG sem cotação).
- Datas de resultados futuros são estimativas por padrão histórico. Nenhuma das 5 deverá reportar até 2026-12-02, mas por confirmar.
- Ordem do mercado: VIX 35,9. Em todas as análises, "esperar 2–3 dias" = sim, salvo indicação.

## Ranking das 5 (nota 0–10, pesos Q20/C20/V25/F10/B15/R10)

| # | Ticker | Preço (2026-11-20) | vs máx. 52s | Nota | Esperar? |
|---|---|---|---|---|---|
| 1 | NFLX | $56,73 | -48,3% | 7,4 | Sim, 2–3 dias, entrada escalonada |
| 2 | ADBE | $217,71 | -40,0% | 7,3 | Sim, 2–3 dias |
| 3 | UNH | $339,85 | -26,4% | 6,6 | Não necessário (defensiva) |
| 4 | META | $560,84 | -28,1% | 6,4 | Sim, e abaixo de ~$459 |
| 5 | NKE | $32,92 | -52,4% | 5,6 | Sim; resultados ~17 dez |

Preços e máximos: FMP quote, fecho 2026-11-20 (https://financialmodelingprep.com).

### 1. Netflix (NFLX, NASDAQ), Stalwart
1. **Porque caiu:** crescimento a abrandar (receita 2026 ~$51,1bn, +13%), corte da previsão de publicidade 2026 para ~$2,7bn (de ~$3bn), guia Q4 EPS $0,67 abaixo do consenso $0,73, saída de Reed Hastings, FCF 2026 aparado para ~$12bn. Em parte beta (-3,0% sexta), mas a queda de -48% é sobretudo específica. Fontes: https://s22.q4cdn.com/959853165/files/doc_financials/2026/q3/FINAL-Q3-26-Shareholder-Letter.pdf ; https://247wallst.com/cards/netflix-q3-2026-earnings-nflx-01m5deq0f119rjb4fjrht5sjde
2. **Custo no EPS (estimativa, Python):** EPS Q1 $1,23 inclui ganho não recorrente (net income $5,28bn vs ~$3,1bn normal, ~$0,51/ação, estimativa; origem não confirmada). EPS 2026 declarado ~$3,57 (1,23+0,80+0,87+0,67; o Q2 de $0,80 é leitura ambígua) e subjacente ~$3,06. Base (anúncios -$0,3bn): -$0,05/ação. Pessimista (anúncios, receita -3pp, margem -2pp): -$0,43/ação.
3. **Desconta o pior?** P/E ~18,6x subjacente (15,7x 2027e) vs média 5a ~38x (estimativa). FCF yield ~5,2% ($12bn / $233bn). Parcialmente.
4. **Esperar?** Sim: VIX alto, estimar 3 tranches.
5. **Forense:** dívida bruta $15,3bn, caixa $8,2bn, dívida líquida $7,1bn (fonte secundária) = <0,5x EBITDA. Ganho não operacional no Q1 (a excluir). Margem Q4 guiada 26%. Ações diluídas 4.195M (Q3) vs 4.261M (Q2) (não verificado). SBC e contas a receber: não verificados.
6. **Nota:** Q8,5 C7,0 V7,5 F6,5 B7,5 R6,0 = **7,4**. Zonas (estimativa, valor intrínseco ~$72 = 20x EPS 2027e $3,6): normal ≤$61, forte ≤$51, excelente ≤$43.

### 2. Adobe (ADBE, NASDAQ), Stalwart / value
1. **Porque caiu:** receios de IA generativa (compressão de licenças, concorrência), ARR a desacelerar (alvo FY26 +10,2%), transição de liderança em 1 dez. Queda específica de longo prazo: só -1,8% sexta. Fontes: https://www.morningstar.com/news/business-wire/20260910832552/adobe-reports-record-q3-results ; https://www.sec.gov/Archives/edgar/data/0000796343/000079634326000147/adbeex991q326.htm
2. **Custo no EPS (estimativa, Python):** guia FY26 EPS n-GAAP $24,45–24,50, GAAP $18,12–18,17, ~400M ações, margem op. ~45%. Consenso FY27 $26,4 (Yahoo, sem data). Base (receita +6%, margem 44%, recompras 2,5%): $26,08, -$0,32. Pessimista (receita +2%, margem 41%): $23,39, -$3,01.
3. **Desconta o pior?** 8,9x n-GAAP (12,0x GAAP), ~8,4x cash-flow operacional anualizado ($2,52bn x4 vs mcap $84,7bn), vs ~30x médio (estimativa). Em grande parte sim.
4. **Esperar?** Sim, 2–3 dias. Resultados Q4 ~10 dez (estimativa, fora da janela de 10 dias).
5. **Forense:** gap GAAP/n-GAAP 25,9% (<40%, ok). Caixa $5,64bn; recompras ~9,5M ações no trimestre (diluição negativa), $24,55bn de autorização. RPO $22,16bn. SBC e dívida total: não verificados (estimativa: dívida líquida ~0).
6. **Nota:** Q8,5 C6,0 V8,0 F6,5 B8,0 R5,5 = **7,3**. Zonas (estimativa, IV $272 = 14x EPS GAAP 2027e $19,4): normal ≤$231, forte ≤$190, excelente ≤$163. Preço atual está na zona normal.

### 3. UnitedHealth (UNH, NYSE), Turnaround / Stalwart
1. **Porque caiu:** custos médicos (tendência comercial >11%), Medicaid sub-financiado, Medicare Advantage. Específica; hoje já recupera (+2,8% sexta, defensiva). Fonte: https://finviz.com/news/401499/unitedhealth-group-reports-third-quarter-2026-results
2. **Custo no EPS (estimativa, Python):** guia 2026 EPS adj. ≥$20,50 (subiu de $19,50–20). Receita anualizada ~$451bn, ~901M ações (derivado). +50pb de racio médico: -$1,95; +100pb: -$3,90.
3. **Desconta o pior?** 16,6x (14,7x 2027e a +13%) vs ~19x (estimativa). Parcial.
4. **Esperar?** Não é essencial; baixo beta. Catalisador: outlook 2027 antes do fim do ano.
5. **Forense:** GAAP $4,56 vs adj. $4,69 (ok); OCF 1,2x lucro líquido; MCR 88,4% inclui $610M de reservas favoráveis (qualidade inferior). Dívida/capital 41,7%; recompras $5,0bn e dividendos $6,2bn YTD. Investigações/risco político: não verificados.
6. **Nota:** Q7,0 C6,5 V7,0 F6,5 B6,5 R5,0 = **6,6**. Zonas (estimativa, IV $383 = 17x EPS 2027e $22,6): normal ≤$326, forte ≤$268, excelente ≤$230.

### 4. Meta (META, NASDAQ), Stalwart / Fast grower
1. **Porque caiu:** capex 2026 $135–145bn, FCF Q3 negativo (-$2,12bn, OCF $32,79bn vs capex $34,91bn), encargo de $9,89bn (EPS -$3,57) e juízo de $25bn no Novo México (recurso possível), nova ação Classe C para financiar IA; sem recompras no Q3. Mista: -5,9% sexta (beta + IA). Fontes: https://seekingalpha.com/pr/20695263 ; https://fourweekmba.com/ai-ai-metas-q3-explained-capex-outran-its-cash-by-2-1-billion/
2. **Custo no EPS (estimativa, Python):** base -$3,57 (encargo único já registado); pessimista -$11,90 (se perder o juízo de $25bn, ~2,52bn ações, estimativa). EPS adj Q3 $7,40; receita Q4 guiada $73–76bn.
3. **Desconta o pior?** ~18,9x run-rate (estimativa otimista) vs ~22x. Não: capex e litígios por quantificar.
4. **Esperar?** Sim. Preço (pré-split 2:1 via Classe C) abaixo de ~$459 daria zona normal.
5. **Forense:** FCF negativo, litígios, diluição potencial (Classe C), caixa $82,45bn; dívida e ações: não verificadas.
6. **Nota:** Q8,5 C7,0 V5,5 F4,5 B7,0 R4,5 = **6,4**. Zonas (estimativa, IV $540 = 20x EPS ~$27): normal ≤$459, forte ≤$378, excelente ≤$324. Atenção ao split.

### 5. NIKE (NKE, NYSE), Turnaround
1. **Porque caiu:** receita a cair high-single digits no FY27, EPS ajustado guiado $1,15–1,35 (abaixo do esperado), tarifas (~$1,5bn, dado mais antigo), reestruturação Pace (~$1bn de encargos, ~$2,5bn de poupanças só até FY31, maioria FY29–30). Específica (-4,1% sexta). Fonte: https://about.nike.com/en/newsroom/releases/nike-inc-reports-fiscal-2027-first-quarter-results (via pesquisa; página não acessível diretamente)
2. **Custo no EPS (estimativa, Python):** tarifas ~-$0,83/ação (1,48bn ações, imposto 18%, estimativas); a $2bn, -$1,11. Base EPS FY27 $1,25 (guia); pessimista ~$0,85 (receita -3pp adicionais, margem bruta -50pb).
3. **Desconta o pior?** Não: 26,3x EPS em mínimos (18x sobre EPS normalizado $1,80, estimativa).
4. **Esperar?** Sim. Resultados ~17 dez (estimativa).
5. **Forense:** inventário $7,8bn (-3% a/a) mas receita a cair mais (stock não acompanha); caixa+inv. CP ~$8,4bn; margem bruta 42,8% (+60pb); dividendo ~$610M/trimestre superior ao FCF no trimestre. Dívida e recompras: não verificadas.
6. **Nota:** Q7,0 C3,5 V5,0 F6,0 B8,0 R4,5 = **5,6**. Zonas (estimativa, IV $36 = 20x EPS $1,80): normal ≤$30,6, forte ≤$25,2, excelente ≤$21,6. Preço acima da zona normal.

## Facas a cair / evitar (triagem)
- **INTC** (-64% vs máx., $51,28): execução de foundry e capex; queda específica, sem prova de viragem.
- **BA** (-38,7%, $155,89, mínimo 52s no fecho): prejuízos e execução industrial.
- **BABA** (-55%, mínimo 52s): China, limite de 5% e risco regulatório.
- **PLTR** (-32,6%): ainda com valuation extremo; só quedas de múltiplo, sem margem de segurança.
- **TSLA** (-30,7%), **SHOP** (-31,6%): múltiplos altos, sem desconto suficiente.
- **AMD** (-35,6%), **NVDA** (-48,4%, já em carteira): limite Chips/IA do investidor quase cheio (≤16%); NVDA com exame da SEC à contabilidade (imprensa), por confirmar.
- **PYPL** (-16,6%): abaixo do limiar de 25%.

## Não analisadas em profundidade (revisitar)
GOOGL (-35%, mínimo 52s, $265,29) e CSCO (-30%, $90,64): quedas relevantes mas sem dados fundamentais recolhidos (quota FMP esgotada). Candidatas para a próxima ronda.

## Resumo de abordagem
Quedas de mercado (beta): AMD, TSLA, SHOP, GOOGL, parte de META e NFLX. Específicas: ADBE, UNH, NKE, INTC, BA, BABA.
