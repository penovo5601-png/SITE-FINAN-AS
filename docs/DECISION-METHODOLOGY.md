# Protocolo de decisão v3 — cenários e validação

## O que este sistema é (e o que não é)

É uma avaliação técnica determinística e auditável, com cenários condicionais e um
diagnóstico histórico. Não é uma certificação científica de vantagem, uma previsão
infalível, um consultor financeiro ou um executor de ordens. Mais indicadores não
implicam automaticamente mais precisão.

## Notícias: publicação original, máximo de 72 horas

- A pesquisa pede 3 dias, mas a seleção final usa a hora de publicação do RSS e o
  relógio do servidor, não apenas o filtro da fonte.
- Rejeitam-se datas inválidas, datas futuras e publicação há mais de 72 horas.
- A política é repetida em cada resposta, inclusive cache válida e cache de
  emergência. Uma notícia não ganha idade nova por ter sido consultada novamente.
- O browser volta a filtrar e expira conteúdos enquanto a página está aberta.
- Janelas disponíveis: 24, 48 e 72 horas. Não há preenchimento com artigos antigos.
- O decaimento de atualidade tem meia-vida de 24 horas, mas **não** é uma medida de
  impacto financeiro. A manchete não foi lida/confirmada como comunicado oficial.
- Uma notícia recente pode já estar refletida no preço; uma notícia mais antiga
  pode continuar materialmente relevante apesar de não pertencer ao feed recente.

## Modelo técnico e critérios

- Janela técnica fixa de 320 barras, independente do zoom do gráfico.
- Famílias ponderadas de tendência, momento, volume, volatilidade e padrões.
- Não se voltam a contar consensos que já agregam os mesmos indicadores.
- Direção exige |score| ≥ 12 e pelo menos duas famílias direcionais alinhadas.
- Dados incoerentes/futuros são rejeitados antes de calcular o sinal.
- Dados desatualizados bloqueiam uma conclusão direcional; data de cotação ausente
  e barra possivelmente aberta são limitações explícitas.
- As hipóteses de alta, baixa e lateralização mostram gatilho, confirmação,
  invalidação e níveis condicionais. Os pesos de hipótese **não são probabilidades**.
- Os níveis são derivados de volatilidade/estrutura, não intervalos estatísticos
  de confiança de preço. Um veredicto neutro não ativa um plano de operação.

## Teste cronológico de regras fixas

- Usa o mesmo cálculo OHLCV do sinal técnico atual, sem snapshots atuais do scanner,
  fundamentos ou notícias que não existiam no instante histórico.
- São usados até 5–5,5 anos de histórico, quando a fonte os disponibiliza.
- Cada origem usa apenas 320 barras anteriores, produz a decisão no fecho e simula
  entrada na abertura da sessão seguinte (não ao fecho já conhecido).
- Saída no fecho da 20.ª sessão. Origens separadas por 21 sessões, com uma sessão
  entre janelas de resultados: os retornos avaliados não se sobrepõem.
- Até 36 janelas. Não se escolhe a melhor janela nem se afinam pesos ao observar os
  resultados apresentados. Não há treino de um modelo ML neste protocolo.
- Custo assumido total por operação: 20 bps (0,20%) para comissões, spread e slippage.
  Os custos reais podem ser superiores. Financiamento/empréstimo de títulos não
  são modelados; simular uma perna de baixa não autoriza uma venda a descoberto.
- Referência: compra nas mesmas janelas onde houve um sinal direcional.
- Métricas: amostra, abstenções, acerto direcional, ganhos líquidos, Wilson 95%,
  retorno médio líquido, excesso vs referência, fator de lucro e drawdown por
  fechos de operações. Sem operações, as métricas são nulas, não 0% inventados.
- São separados os sinais de alta e baixa. Não se generaliza uma amostra de
  subidas para um sinal descendente sem dados nesse sentido.
- O rótulo de suporte histórico limitado exige pelo menos 20 operações, intervalo
  Wilson inferior > 50%, retorno médio líquido positivo e desempenho acima da
  referência. O sentido corrente também precisa de pelo menos 20 observações,
  Wilson inferior > 50% e retorno positivo. Caso contrário o sinal é provisório.

## Limitações importantes

Ações selecionadas atualmente introduzem viés de sobrevivência; séries do fornecedor
podem sofrer revisões/ajustes e não são uma base point-in-time certificada. Mesmo sem
janelas sobrepostas, os regimes podem ser serialmente dependentes; Wilson assume
ensaios independentes e é apenas um intervalo aproximado. O teste é de uma ação,
não validação externa multi-mercado. Stops/alvos intradiários não são testados por
este diagnóstico de direção a 20 sessões, e o drawdown por fechos subestima quedas
intradiárias. Resultados passados não garantem resultados futuros.

## Auditoria

Cada análise exporta versão das regras, timestamp, dados técnicos usados, notícias
admissíveis com data original, hashes SHA-256, verificações e operações históricas.
O registo pode ser descarregado como JSON. Se existe PostgreSQL, o TickerLab guarda
o relatório no payload da análise via Drizzle; sem base de dados o utilizador pode
guardar o JSON. Repetir com dados revistos da fonte pode gerar outro hash.

## Referências de método

- TimeSeriesSplit e separação cronológica: https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html
- Walk-forward e disciplina de informação: https://arxiv.org/html/2512.12924v1
- Fórmula Wilson implementada explicitamente com z=1,95996398454 e nível de 95%.

## Testes

`node --import tsx --test scripts/research.test.ts scripts/rigor.test.ts`

Incluem limites exatos de 72h, cache expirada, datas futuras/inválidas, não
sobreposição de resultados, execução seguinte, custos, resistência a alterações
futuras, amostra insuficiente, coerência de cenários e independência do zoom.
