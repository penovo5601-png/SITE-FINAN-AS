import { NextResponse } from "next/server";
import { fetchFinancialStatements } from "@/lib/providers/financials";
import { attachCompanyResearch } from "@/lib/company-service";
import { fetchStockNews } from "@/lib/news";
import { analyzeMarket, RESEARCH_VERSION } from "@/lib/analyze-market";
import { COUNTRY_CURRENCY, getMarketData } from "@/lib/market-data";
import { ensureSeeded, getTicker, saveAnalysis } from "@/lib/universe";

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
  const [md, news, statements] = await Promise.all([
    getMarketData(target, range, interval, info?.countryCode ? COUNTRY_CURRENCY[info.countryCode] ?? null : null),
    fetchStockNews({symbol:target,name:info?.name,countryCode:info?.countryCode}).catch(() => null),
    fetchFinancialStatements(target),
  ]);

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

  const analysis = analyzeMarket(md, meta, news);

  if (!analysis) {
    return NextResponse.json({ error: `Sem dados suficientes para analisar "${symbol}".`, symbol }, { status: 404 });
  }

  await attachCompanyResearch(analysis,md,statements);

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
      decision: analysis.decision,
      company: analysis.company,
      version: RESEARCH_VERSION,
      range,
      interval,
    },
  });

  return NextResponse.json({ analysis, warnings, source: md.source, historySource: md.historySource, version: RESEARCH_VERSION });
}
