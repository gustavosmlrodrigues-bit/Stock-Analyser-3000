# Stock Analyser 3000 — Analista de ações em tempo real (PT/EN)

App web bilingue (português de Portugal por omissão, inglês opcional) que funciona como analista de investimentos para um investidor particular de longo prazo (10+ anos, aguenta quedas de 40%, investe pelo Trading 212, em euros).

Junta três escolas: **investimento em valor** (Buffett), **análise forense dos números** (hedge funds) e **research profissional**. Nunca responde de memória: cada pedido recolhe dados novos e o analista (Claude) faz pesquisa web no momento.

## Como funciona

```
browser ──POST /api/analyze──► servidor Node
                                 │
                                 ├─ 1. Dossier (dados frescos, com proveniência)
                                 │     • Cotação: Yahoo Finance → Stooq (fallback)          ≈
                                 │     • Câmbio EUR: BCE                                     ✓
                                 │     • SEC EDGAR: 8-K, 10-Q, 10-K, 6-K, Form 4…; XBRL      ✓
                                 │     • Notícias: Google News RSS (EN + PT)                 ≈
                                 │     • Macro (modo profundo): FRED, BCE                    ✓
                                 │     • Cálculos: FCF, EV, P/E, dívida líquida, diluição,
                                 │       cobertura do dividendo, alertas forenses           🧮
                                 │
                                 └─ 2. Analista Claude (claude-opus-5-5)
                                       • web_search + web_fetch ao vivo
                                       • confirma factos importantes em 2 fontes
                                       • escreve o relatório (⚡ rápido ou 🔬 profundo)
                                       • notas Manter / Comprar agora (0-10) e ação em €
◄── stream (SSE): progresso, pesquisas, relatório ao vivo ──┘
```

### Regra de ouro (secção 1 do caderno de encargos)
- **Sem dados guardados entre pedidos.** A única cache é a de cotações com menos de 15 minutos (`lib/market.js`). O mapa ticker→CIK da SEC é dado de referência (24 h), nunca mostrado como facto.
- **Cada número tem fonte, data/hora e selo**: ✓ fonte primária · ≈ agregador · 🧮 cálculo da app (fórmula visível) · ⚠️ não verificado. No código, `fact()` (`lib/sources.js`) recusa um valor 🧮 sem fórmula.
- **Falhas são ditas, nunca preenchidas.** Cada fonte que falha entra em `dossier.errors` e aparece na app e no relatório.
- **O preço da corretora tem prioridade**: se o indicares, é usado em todos os cálculos por ação (convertido de EUR para a moeda de cotação pelo câmbio do BCE).

### Modos
- **⚡ Rápido** (1-2 min): preço, porque mexeu hoje (2 fontes), P/E contabilístico e ajustado, FCF/EV, dívida líquida, alvo dos analistas, próximos resultados, notas, veredicto em 5 linhas e uma ação concreta em euros.
- **🔬 Profundo**: as 17 secções (negócio, histórico 5-10 anos, resultados e guidance, forense, gestão, uso do dinheiro, valuation com concorrentes + DCF 3 cenários + DCF inverso, macro, política, disrupção, ciclo, mercado, árvore de cenários, pré-mortem, advogado do diabo, calendário, veredicto e plano).

As regras completas que o analista segue estão em `lib/prompts.js`.

## Instalação

Requer Node.js ≥ 22.9.

```bash
npm install
cp .env.example .env     # preencher ANTHROPIC_API_KEY e SEC_USER_AGENT
npm start                # http://localhost:3000
```

| Variável | Para quê |
|---|---|
| `ANTHROPIC_API_KEY` | Obrigatória. Chave da API da Anthropic. |
| `SEC_USER_AGENT` | A SEC exige um User-Agent com contacto real, p. ex. `Maria Silva maria@exemplo.pt`. Sem ele a SEC pode recusar. |
| `CLAUDE_MODEL` | Opcional (por omissão `claude-opus-5-5`). |
| `PORT` | Opcional (por omissão 3000). |

Os pedidos usam o *fallback* do lado do servidor da Anthropic (`fallbacks: "default"`): se o modelo principal recusar um pedido por um classificador de segurança, a API repete-o automaticamente noutro modelo e a app mostra isso no registo de progresso.

### Tickers
- EUA: `AAPL`, `MSFT`, `BRK-B`
- Europa e Ásia (formato Yahoo): `ASML.AS`, `EDP.LS`, `SAP.DE`, `MC.PA`, `005930.KS`, `0700.HK`
- Empresas fora da SEC não têm dados XBRL automáticos: o analista vai buscá-los aos reguladores locais e ao site de investidores (selo ✓ ou ⚠️ conforme a fonte).

## Testes

```bash
npm test
```

Testes unitários dos parsers (Yahoo, Stooq, BCE, SEC submissions e XBRL incluindo TTM, Google News RSS, FRED), dos cálculos e alertas forenses, da cache de 15 minutos, da validação de pedidos e do renderizador de Markdown (incluindo XSS).

## Estrutura

```
server.js          servidor HTTP, SSE, ficheiros estáticos
lib/sources.js     fact() + selos, fetch sem cache, CSV
lib/market.js      cotação (Yahoo/Stooq), câmbio BCE, cache ≤ 15 min
lib/sec.js         SEC EDGAR: filings, Form 4, XBRL (anual, TTM)
lib/news.js        Google News RSS, deteção de artigos pagos
lib/macro.js       FRED (yields, Fed funds, desemprego, CPI, Brent), BCE
lib/metrics.js     cálculos 🧮 e alertas forenses
lib/dossier.js     junta tudo e regista falhas
lib/prompts.js     regras do analista (modos, fontes, forense, formato)
lib/analyst.js     Claude + pesquisa web, streaming, pause_turn
public/            interface (PT/EN, modo claro/escuro, mobile)
```

## Limitações conhecidas
- **P/E ajustado, consenso de analistas, data de resultados, short interest, 13F, opções**: vêm da pesquisa web do analista (fontes citadas no relatório), não de APIs estruturadas gratuitas estáveis.
- **ADR**: se a cotação e as contas estão em moedas diferentes, a app não calcula valuation por ação (rácio do ADR desconhecido); o analista faz o cálculo com o rácio citado.
- A dívida líquida não inclui locações (*leases*).
- Ferramenta de apoio à decisão, não é aconselhamento financeiro.
