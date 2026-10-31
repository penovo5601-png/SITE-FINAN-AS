# TickerLab · ChartLens

Motor de avaliação técnica de ações para **61.589 ações de 34 mercados**, com análise
automática de fotografias de gráficos por visão computacional.

Dois modos de apresentação do mesmo código:

| Modo | Variável | Página inicial |
|---|---|---|
| **TickerLab** — avaliação de ações | `SITE_MODE=main` (default) | `/` |
| **ChartLens** — foto do gráfico | `SITE_MODE=chart` | redireciona para `/grafico` |

## Funcionalidades

- **Universo**: 61.589 ações indexadas (Euronext Lisboa, Madrid, Paris, Amesterdão,
  Bruxelas, Milão, Frankfurt, Viena, Londres, NASDAQ/NYSE/AMEX, B3, BMV, TSX, Tóquio,
  Hong Kong, Xangai, Shenzhen, NSE/BSE, ASX, KRX, TWSE, SIX, Oslo, Estocolmo,
  Copenhaga, JSE, Tadawul, MOEX, NZX, SGX, ATHEX, Bursa e mais). Só ações — ETFs filtrados.
- **Análise**: RSI, MACD, ADX/+DI/−DI, SMA 10/20/30/50/100/200, EMA, Bollinger + %B,
  Estocástico, CCI, Williams %R, MFI, OBV, ATR, volatilidade anualizada, volume relativo,
  regressão linear (inclinação e R²), drawdown, pivôs e suportes/resistências por
  clustering, padrões de velas (martelo, estrela cadente, envolvimento, doji, marubozu,
  golden/death cross, ruturas).
- **Saída**: veredicto SUBIR/DESCER/NEUTRO, pontuação −100…+100, % de confiança,
  probabilidade de subida, 3 horizontes temporais, plano com entrada/alvos/stop e
  rácio risco-recompensa, fundamentais e consenso técnico.
- **Foto do gráfico**: reconstrói a série de preços píxel a píxel (tema claro e escuro),
  mede inclinação, R², rácio de velas verdes/vermelhas, posição no intervalo,
  volatilidade residual e níveis horizontais. Cruza com os dados reais quando indicas o símbolo.

## Fornecedores de dados (sem chave de API)

1. **TradingView** — scanner global (78 colunas) para indicadores, cotação e fundamentais.
2. **Nasdaq.com** — histórico diário OHLCV de ~3 anos para símbolos dos EUA e ADRs.
3. **Yahoo Finance** — histórico global OHLCV.

## Base de dados opcional

O PostgreSQL acelera a pesquisa e guarda o histórico de análises. **Não é obrigatório**:
sem `DATABASE_URL` (ou se o servidor estiver inacessível) o universo é servido por um
índice em memória carregado de `public/data/universe.tsv.gz` (607 KB).

Com base de dados:

```bash
npx drizzle-kit push --force
node scripts/seed-db.mjs        # carrega as 61.589 ações
```

## Desenvolvimento

```bash
npm install
npm run dev          # http://localhost:3000
SITE_MODE=chart npm run dev   # modo ChartLens
```

## Deploy na Vercel

Importa o repositório e faz *Deploy*. O `vercel.json` já cria e semeia a base de dados
durante o build se existir `DATABASE_URL`; caso contrário o site funciona na mesma.
Para os dois sites, cria dois projetos Vercel a partir do mesmo repositório e define
`SITE_MODE=chart` no segundo.

## Aviso

Leituras geradas automaticamente a partir de indicadores técnicos sobre dados diferidos.
Não constituem recomendação de investimento. O capital está em risco.


## Atualização 2.0 — confluência e notícias por ação

A pontuação agora cruza famílias (tendência 36%, momento 28%, volume 18%,
volatilidade 10%, padrões 8%) e não uma soma indiscriminada de médias correlacionadas.
Consensos agregados do TradingView não recebem um segundo voto. Inclui VWMA,
Hull MA, Ichimoku com deslocamento sem look-ahead, Supertrend, Stochastic RSI,
Ultimate Oscillator, Chaikin Money Flow, Donchian, Keltner, Aroon, Elder Ray, Parabolic SAR, VWAP móvel, Fibonacci e divergências RSI confirmadas.
Indicadores sem dados suficientes aparecem como indisponíveis e não são inventados.

Cada ação abre automaticamente um painel de notícias com títulos, publicadores,
datas e links. Fontes: RSS público Yahoo Finance e Google News, com cache de dez
minutos, atualização periódica, filtro por idioma, deduplicação e tratamento de
indisponibilidade. Notícias são contexto, não ordens de compra/venda automáticas.

Os percentuais de viés e confiança são heurísticos (convergência e cobertura),
não probabilidades calibradas nem taxas de acerto. A previsão pode falhar.

- `GET /api/news?symbol=BCP.LS` — manchetes e estado das fontes.
- `GET /api/analysis?symbol=AAPL` — análise com `confluence` e versão.
- `GET /api/health` — inclui a versão implantada.
- Testes: `node --import tsx --test scripts/research.test.ts`.


## Protocolo v3 — notícias ≤72h, cenários e diagnóstico histórico

A política agora usa a publicação original e filtra notícias com mais de 72 horas,
inclusive cache válida, cache de emergência e a página aberta. O utilizador pode
selecionar 24/48/72h. Datas futuras/inválidas são rejeitadas. Atualidade não comprova
impacto e manchetes não recebem votos automáticos na direção do preço.

A página da ação contém cenários altista, baixista e lateral com confirmação,
invalidação e pesos de hipótese (não probabilidades). A direção requer pelo menos
duas famílias alinhadas e score absoluto ≥12. Sem critérios, o veredicto é aguardar;
sem evidência histórica suficiente, o sinal fica explicitamente provisório.

Há um walk-forward de regras fixas: 320 barras de informação anterior, execução
na abertura seguinte, horizonte 20 sessões, janelas de resultados sem sobreposição,
custo assumido 20 bps, referência comparável, Wilson 95%, amostra, métricas por
sentido e retorno líquido. Não usa notícias atuais ou scanner atual no passado.
Os limites do teste são visíveis: não certifica uma taxa de acerto nem rentabilidade.

O zoom do gráfico não muda a janela do modelo. É possível descarregar o registo
com dados usados, hashes, versão, notícias admissíveis e operações do diagnóstico.

**Regras completas:** [docs/DECISION-METHODOLOGY.md](docs/DECISION-METHODOLOGY.md).

**Testes:** `node --import tsx --test scripts/research.test.ts scripts/rigor.test.ts`.
