# Análise empresarial e resiliência de velas — v4

## Desempenho da ação não é rentabilidade do negócio

A página separa retornos da cotação (1 sessão, semana, meses, YTD, 1/3/5 anos),
CAGR, anos positivos/negativos, meses positivos e drawdown dos rácios empresariais
ROE/ROA/ROIC, margens, crescimento de receitas/EPS, dívida, caixa e consistência FY.
Anos incompletos são assinalados. Sem observação inicial não se mostra 0% inventado.
Ajustes de dividendos/splits são os da fonte; retorno sem ajuste não é chamado de
retorno total. Não inclui impostos e custos da carteira pessoal.

## Fontes e moedas

- Histórico OHLC: Yahoo Finance em dois hosts; fallback Nasdaq apenas para tickers
  dos EUA, sem retirar o sufixo de ações estrangeiras.
- Snapshot financeiro: TradingView, com período FQ/TTM e moeda financeira explícita.
  O scanner pode fornecer montantes em USD para uma ação cotada noutra moeda.
- Demonstrações FY: Yahoo fundamentals timeseries, com moeda e data por exercício.
- FX: cotação Yahoo identificada, até sete dias; identidade monetária e conversões
  de unidade (GBp/GBP, ZAc/ZAR, ILA/ILS) não são confundidas com uma nova taxa cambial.

As datas de fim de período não são datas de publicação. A revisão de demonstrações
não é tratada como uma base point-in-time. Os fundamentos atuais não entram no
backtest técnico histórico nem são usados para alterar artificialmente a previsão
curta de 20 sessões.

## Notas dos quatro pilares

As notas 0–100 são heurísticas descritivas com cobertura explícita. Não são ratings
oficiais, probabilidades ou recomendações. Dados ausentes não são zeros. Bancos e
seguradoras não recebem uma classificação de solidez pelos rácios industriais de
liquidez ou dívida líquida/EBITDA; precisam de CET1 e outras métricas regulatórias.
FCF não entra na nota de consistência de financeiras. Menos de três exercícios de
lucros não é apresentado como consistência plurianual estabelecida.

## Valor intrínseco condicional

- DCF de cinco anos de FCF por ação como proxy do fluxo para o acionista. Não se
  subtrai dívida uma segunda vez. Não é FCFE certificado e não modela novo crédito.
- Cenários conservador/base/otimista com crescimento, desconto e terminal visíveis.
- Hipóteses editáveis, sensibilidade e percentagem do valor derivada do terminal.
- Exige FCF positivo, denominador de ações identificável, moeda alinhada, taxa de
  desconto superior à taxa terminal e período de referência suficientemente recente.
- Não se troca um TTM negativo por um FY positivo apenas para produzir um DCF.
- Divergência de mais de 25% entre números de ações exige reconciliação. ADRs/ADS
  sem rácio verificado não são assumidos como uma unidade da ação subjacente.
- DCF não é aplicado a bancos/seguradoras por esta aproximação.
- Graham é uma referência histórica sqrt(22,5 × EPS × BVPS), não método universal.
- Desconto para o valor usa valor no denominador; potencial para o preço usa preço.

Uma estimativa indisponível não significa valor zero. Um valor calculado não é
preço garantido, nem um intervalo de confiança estatístico.

## Camadas de recuperação das velas

1. Pedido Yahoo corrigido, dois hosts, cache em memória e deduplicação.
2. Nasdaq para instrumentos dos EUA, mantendo identidade do ticker/bolsa.
3. PostgreSQL via Drizzle quando DATABASE_URL está configurada.
4. Arquivo de emergência de 42 instrumentos globais com OHLC efetivamente obtido.
5. Cópia real do navegador, até 16 instrumentos, conservando a data da fonte.
6. Gráfico externo TradingView independente da recuperação OHLC do servidor.

Símbolos REN.LS/CORT.LS são corrigidos para RENE.LS/COR.LS; a Shell tinha uma barra
incoerente na origem. Barras incompletas/incoerentes são omitidas com contagem, não
reparadas criando preços. Não se faz forward-fill de dias nem se avança a data
original de cache. Séries antigas podem manter o desenho visível, mas não passam
pelas verificações de atualidade da previsão como se fossem cotações novas.

Nenhuma aplicação pode garantir que todos os fornecedores externos, redes e
mercados responderão sempre. O objetivo é não abandonar o gráfico à primeira falha
nem esconder a proveniência. Não são usadas velas simuladas como dados reais.

Para renovar o arquivo factual: `node --import tsx scripts/seed-history.ts`.
A atualização de código é publicada nos dois repositórios ligados à Vercel.

## Testes

`node --import tsx --test scripts/research.test.ts scripts/rigor.test.ts scripts/company-history.test.ts`

Inclui fórmulas DCF/Graham, moedas, pence, denominadores de ações, bancos, ADRs,
consistência insuficiente, rentabilidade negativa, aliases e recuperação de arquivo
real com todas as chamadas de rede em falha simulada.
