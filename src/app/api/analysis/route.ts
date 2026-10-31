import { NextResponse } from "next/server";
import { analyzeMarket, RESEARCH_VERSION } from "@/lib/analyze-market";
import { COUNTRY_CURRENCY, getMarketData } from "@/lib/market-data";
import { ensureSeeded, getTicker, saveAnalysis } from "@/lib/universe";
import { fetchStockNews } from "@/lib/news";
import { scoreNewsImpact } from "@/lib/news-impact";
import { runScenarioEngine } from "@/lib/scenarios";
import { analyzeStock } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
  const range = url.searchParams.get("range") ?? "2y";
  const interval = url.searchParams.get("interval") ?? "1d";

  if (!symbol) {
    return NextResponse.json({ error: "Indica um símbolo (ex.: AAPL, BCP.LS, PETR4.SA)." }, { status: 400 });
  }
  if (!/^[\w.\-^=]{1,24}$/.test(symbol)) {
    return NextResponse.json({ error: "Símbolo inválido." }, { status: 400 });
  }

  await ensureSeeded();
  const info = await getTicker(symbol);
  const target = info?.symbol ?? symbol;
  const md = await getMarketData(
    target,
    range,
    interval,
    info?.countryCode ? COUNTRY_CURRENCY[info.countryCode] ?? null : null,
  );

  if (!md.candles && !md.scanner) {
    return NextResponse.json(
      {
        error: `Não consegui obter dados de mercado para "${symbol}". Verifica se o símbolo existe e se usa o sufixo do mercado (ex.: EDP.LS, SIE.DE, PETR4.SA, 7203.T).`,
        symbol,
        known: Boolean(info),
      },
      { status: 404 },
    );
  }

  const instrument = String(md.scanner?.type ?? md.meta?.instrumentType ?? "EQUITY").toUpperCase();
  if (!["EQUITY", "STOCK", "DR"].includes(instrument)) {
    return NextResponse.json({ error: "Esta plataforma analisa exclusivamente ações; este símbolo não é uma ação." }, { status: 400 });
  }

  const meta = {
    name: info?.name ?? undefined,
    exchange: info?.exchange ?? undefined,
    market: info?.market ?? undefined,
    sector: info?.sector ?? undefined,
  };

  const analysis = analyzeMarket(md, meta);

  if (!analysis) {
    return NextResponse.json({ error: `Sem dados suficientes para analisar "${symbol}".`, symbol }, { status: 404 });
  }

  // ---------- Notícias (só <=72h pesam) + motor de cenários / Monte Carlo / backtest ----------
  let newsImpact = scoreNewsImpact(null);
  try {
    const feed = await fetchStockNews({ symbol: target, name: info?.name ?? analysis.name, countryCode: info?.countryCode ?? null });
    newsImpact = scoreNewsImpact(feed);
  } catch { /* notícias indisponíveis: impacto 0 */ }

  const candles = md.candles ?? [];
  const lastCandle = candles[candles.length - 1];
  const bullishVotes = analysis.signals.filter((x) => x.bias >= 12).length;
  const bearishVotes = analysis.signals.filter((x) => x.bias <= -12).length;
  const nearSup = analysis.levels.filter((l) => l.price < analysis.price).sort((a, b) => b.price - a.price)[0]?.price ?? analysis.plan.stop;
  const nearRes = analysis.levels.filter((l) => l.price > analysis.price).sort((a, b) => a.price - b.price)[0]?.price ?? analysis.plan.target1;
  const bundle = md.bundle;
  const scenario = runScenarioEngine({
    candles,
    currentPrice: analysis.price,
    atr: analysis.indicators.atr14 ?? analysis.price * 0.02,
    support: nearSup,
    resistance: nearRes,
    technicalBias: analysis.score,
    newsBias: newsImpact.freshCount > 0 ? newsImpact.score : 0,
    newsFreshCount: newsImpact.freshCount,
    bullishSignals: bullishVotes,
    bearishSignals: bearishVotes,
    horizonDays: interval === "1wk" ? 8 : 20,
    lastCandleTime: lastCandle?.t,
    scoreAt: (window) => {
      if (!bundle || window.length < 60) return null;
      const w = window as typeof candles;
      const last = w[w.length - 1];
      const sub = analyzeStock({ ...bundle, candles: w, meta: { ...bundle.meta, regularMarketPrice: last.c, previousClose: w[w.length - 2]?.c ?? last.c, fiftyTwoWeekHigh: undefined, fiftyTwoWeekLow: undefined } as typeof bundle.meta }, { scanner: null });
      return sub ? sub.score : null;
    },
  });

  // O motor de cenários valida e, se necessário, corrige o veredito
  const fin = scenario.final;
  analysis.verdict = fin.direction === "SOBE" ? "SUBIR" : fin.direction === "DESCE" ? "DESCER" : "NEUTRO";
  analysis.probabilityUp = fin.direction === "SOBE" ? fin.probability : fin.direction === "DESCE" ? 100 - fin.probability : 50;
  analysis.confidence = fin.confidence;
  analysis.score = fin.bias;
  analysis.verdictEmoji = analysis.verdict === "SUBIR" ? "▲" : analysis.verdict === "DESCER" ? "▼" : "◆";
  analysis.verdictLabel = analysis.verdict === "SUBIR" ? (fin.confidence >= 68 ? "Forte expectativa de subida (validada)" : "Expectativa de subida") : analysis.verdict === "DESCER" ? (fin.confidence >= 68 ? "Forte expectativa de descida (validada)" : "Expectativa de descida") : scenario.validation.contradictions.length ? "Neutro / sinais contraditórios — aguardar" : "Neutro / aguardar";
  analysis.summary = fin.reasoning[fin.reasoning.length - 1].replace(/^⇒\s*/, "") + ` Cenários: Bull ${scenario.scenarios[0].probability}% · Base ${scenario.scenarios[1].probability}% · Bear ${scenario.scenarios[2].probability}%. ${scenario.backtest.reliabilityLabel}.`;
  analysis.risks = [...scenario.validation.contradictions, ...analysis.risks];

  const warnings: string[] = [...(analysis.sourceNotes ?? [])];
  if (!info) warnings.push(`"${symbol}" não consta do universo indexado; a análise usou apenas os dados dos fornecedores.`);
  if (analysis.hasHistory && analysis.bars < 120) warnings.push(`Histórico curto (${analysis.bars} sessões): os indicadores de longo prazo são menos fiáveis.`);

  await saveAnalysis({
    symbol: analysis.symbol,
    name: analysis.name,
    verdict: analysis.verdict,
    score: analysis.score,
    confidence: analysis.confidence,
    price: analysis.price,
    currency: analysis.currency,
    targetUp: analysis.plan.target2,
    targetDown: analysis.plan.stop,
    payload: {
      exchange: analysis.exchange,
      market: analysis.market,
      sector: analysis.sector,
      probabilityUp: analysis.probabilityUp,
      rsi: analysis.indicators.rsi14,
      adx: analysis.indicators.adx14,
      macdHist: analysis.indicators.macdHist,
      hasHistory: analysis.hasHistory,
      historySource: analysis.historySource,
      confluence: analysis.confluence,
      version: RESEARCH_VERSION,
      range,
      interval,
    },
  });

  return NextResponse.json({ analysis, scenario, newsImpact: { ...newsImpact, articles: newsImpact.articles.slice(0, 20) }, warnings, source: md.source, historySource: md.historySource, version: RESEARCH_VERSION });
}
