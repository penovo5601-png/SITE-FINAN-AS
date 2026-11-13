# Guia, pares e carteiras de ações — v5

## Base documental

Implementação baseada nas páginas visíveis do guia do professor fornecidas como
imagens na conversa. Não se afirma ter recebido/lido outro PDF completo. Os preços
do exemplo Galp de 12/11/2026 não foram copiados como cotações atuais.

O guia é aplicado em `/guia` e nas páginas das ações. O comparador usa ações
ordinárias/listagem primária da mesma indústria TradingView, com preferência por
país/moeda e deduplicação de emitentes. Não compara bancos e seguradoras como se
fossem a mesma indústria. Sem pares suficientes, o critério fica em falta.

PER/PBV negativos ou indefinidos não são pechinchas. ROE com capital próprio
negativo fica sem interpretação. Yield alto pode refletir queda do preço;
payout 40–70% é uma referência pedagógica, não uma regra universal. Os períodos
financeiros e a fonte estão visíveis.

## Tendências e semáforo

- Até 126 barras diárias; exclui o dia UTC corrente (aproximação conservadora,
  não calendário oficial da bolsa).
- Pivôs com duas barras de confirmação à direita; mínimos/máximos crescentes ou
  decrescentes, MM20/50 e linha ajustada com pelo menos três contactos.
- Uma classificação preliminar de alta/baixa pelas médias não é chamada de
  confirmação estrutural se faltarem contactos/pivôs.
- ADX >30 forte, 25–30 tendência, 20–25 transição, <20 lateral. ADX não dá direção.
- MACD preferido em tendência; RSI em lateral; transição não força confirmação.
- Duplo topo/fundo e ombro–cabeça–ombro são candidatos até existir a condição de
  rutura por preço. Volume/risco de falso sinal continuam a exigir verificação.
- O semáforo pedagógico é separado do veredicto técnico auditado de 20 sessões.
  Não modifica retroativamente esse backtest com fundamentos correntes.

## Universo e seleção das carteiras

- Só ações ordinárias long-only EUR/USD de um universo declarado de 35 emitentes.
  Não é uma otimização exaustiva de todas as ações globais.
- Sem ETF, fundos, obrigações, derivados, cripto, ADR não reconciliado, crédito ou
  vendas a descoberto. FX é referência de avaliação em EUR, não uma posição.
- 12 emitentes, quantidades inteiras, pelo menos cinco setores e quatro países.
- Limites iniciais: emitente 12,5%, setor 25%, país 40% do capital.
- Metadados são verificados com tipo `stock`; históricos sem ajuste, desatualizados,
  com moeda/ticker incompatível ou sem 36 meses conjuntos são excluídos.
- Diversidade primeiro; ranking por qualidade observada, volatilidade relativa ou
  dividendos conforme o perfil. Não promete ótimo global nem melhor carteira.
- Custos e arredondamentos são incluídos; sobra operacional fica separada e tem
  retorno assumido zero. Um orçamento inviável não é completado com frações,
  alavancagem, preços inventados ou ativos de outra classe.

## Estimativa de rendibilidade

1. Preços mensais completos em EUR. Para USD, multiplica pelo USD/EUR do mês
   correspondente. Exclui o mês corrente parcial e não alinha arrays por índice.
2. Usa até 60 meses comuns e contínuos, mínimo 36.
3. Alvo anual: 75% da hipótese explícita do formulário (por omissão 6%) e 25% do
   crescimento geométrico histórico limitado a −8%/+12%. Não é previsão oficial.
4. Retira a média dos retornos logarítmicos e reamostra blocos circulares conjuntos
   de três meses (mesmos meses para todas as ações), preservando a dependência
   observada entre ativos e parte da dependência temporal.
5. A normalização do momento dos blocos impede que volatilidade seja confundida
   com rendimento médio gratuito. Não é uma afinação para melhorar o teste.
6. 2.500 trajetórias por composição, seed registada a partir do histórico completo e hipóteses (não da hora da cotação intradiária), horizonte 6/12/24 meses. Usa números aleatórios comuns, com seed por trajetória, para reduzir ruído de comparação entre carteiras, capitais, custos e hipóteses de retorno. Mostra o erro Monte Carlo da média, sem o confundir com incerteza de previsão.
7. Evolução buy-and-hold sem rebalanceamento; inclui entrada, saída e saldo. Não
   soma dividendos outra vez a preços já ajustados.

Mostra média/mediana, P10/P90, fração de trajetórias com perda, média das 5% piores,
volatilidade/correlação e choques determinísticos de mercado/câmbio. Os percentis
não são intervalos de confiança calibrados nem probabilidades reais garantidas.
A hipótese anual, todos os custos, as datas e as exclusões são inspecionáveis.

## Passado e controlo temporal

O histórico da composição atual é retrospetivo, sujeito a seleção/sobrevivência.
Se existem pelo menos 48 meses, separa os últimos 12 meses para um diagnóstico do
modelo de cenário estimado nos meses anteriores. Não se chama a isto validação
fora da amostra da estratégia de seleção: as empresas foram selecionadas hoje.
Uma única janela também não calibra probabilidades futuras.

Não inclui impostos pessoais, inflação, custos reais variáveis, impacto de mercado,
financiamento ou execução garantida de stops. Limites são iniciais e podem desviar
com o mercado. País de referência não é a exposição geográfica das receitas.
Carteiras só de ações podem sofrer perdas muito elevadas em conjunto.

## Utilização e dados guardados

- `/carteiras`: alterar capital/horizonte, conferir hipóteses/custos e simular.
- `POST /api/portfolios`: calcula o relatório no servidor, limite de 100.000 €.
- `GET /api/research/guide?symbol=GALP.LS`: guia e concorrentes.
- Guardar no dispositivo usa armazenamento local, sem conta. Relatórios podem
  ser exportados como JSON e composição/justificações em CSV.
- Reabrir um relatório não o torna atual: o timestamp original permanece.
- Não há execução de ordens nem avaliação de adequação financeira pessoal.

## Testes

`node --import tsx --test scripts/guide-portfolios.test.ts`

Cobre capital, ações inteiras/custos, concentração por emitente, falhas de orçamento,
meses/FX, seed reproduzível, normalização do retorno, separação temporal, três
contactos/pivôs, ADX, múltiplos em falta e payout elevado. Os testes de software não
comprovam rentabilidade da estratégia.

## Referências de método

- Guia fornecido pelo utilizador: oito páginas visíveis, tópicos 1–6 e checklist.
- Bootstrap conjunto/blocos e dependência: https://www.bogleheads.org/forum/viewtopic.php?t=171785
- Separação temporal e leakage: https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html
