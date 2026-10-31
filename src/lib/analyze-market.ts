import { analyzeFromScanner, buildFundamentals, type StockAnalysis } from "./engine";
import { applyConfluence } from "./confluence";
import { toWeekly, type MarketData } from "./market-data";
import { technicalFromHistory } from "./technical-model";
import { validateCandleHistory } from "./validation";
import { attachDecisionAudit } from "./decision-audit";
import type { StockNewsFeed } from "./news";
export { RESEARCH_VERSION } from "./research-policy";

export function analyzeMarket(
  md: MarketData,
  info: { name?: string; exchange?: string; market?: string; sector?: string } = {},
  news: StockNewsFeed | null = null,
): StockAnalysis | null {
  const fullDaily = md.validationCandles ?? md.candles ?? [];
  const researchHistory = md.interval === "1wk" ? toWeekly(fullDaily) : fullDaily;
  if (researchHistory.length && (validateCandleHistory(researchHistory).length || researchHistory.at(-1)!.t > Date.now())) return null;
  const scanner = md.interval === "1d" ? md.scanner : null;
  let analysis: StockAnalysis | null;
  if (researchHistory.length >= 40) {
    // O sinal OHLCV é o mesmo usado no walk-forward; metadados atuais não alteram os fatores.
    analysis = technicalFromHistory(researchHistory, { ...info, symbol: md.symbol, currency: md.currency }, md.interval, md.range);
    if (analysis) {
      analysis.fundamentals = buildFundamentals(md.scanner);
      analysis.historySource = md.historySource;
      analysis.sourceNotes = md.notes;
      // O zoom só altera o desenho, não o período fixo usado pelo modelo.
      const visible = Math.min(180, md.candles?.length ?? 180);
      analysis.candles = analysis.candles.slice(-visible);
      analysis.bars = analysis.candles.length;
      for (const key of Object.keys(analysis.series) as (keyof StockAnalysis["series"])[]) analysis.series[key] = analysis.series[key].slice(-visible) as never;
    }
  } else {
    analysis = scanner ? analyzeFromScanner({ symbol: md.symbol, scanner, currency: md.currency, range: md.range, interval: md.interval, historySource: md.historySource, notes: md.notes }, info) : null;
    if (analysis) analysis = applyConfluence(analysis, scanner, []);
  }
  if (!analysis) return null;
  analysis.historyEvidence=md.historyEvidence;
  analysis.chartCandles=md.candles??analysis.candles;
  if(analysis.candles.length<2&&md.candles&&md.candles.length>=2){analysis.candles=md.candles.slice(-180);analysis.bars=analysis.candles.length;}
  analysis.updatedAt = Date.now();
  return attachDecisionAudit(analysis, { history: researchHistory, source: md.historySource === "nenhuma" ? md.source : md.historySource, scanner: md.scanner, quoteAsOf: md.quoteAsOf, news });
}
