import { analyzeStock, type StockAnalysis } from "./engine";
import { applyConfluence } from "./confluence";
import type { Candle } from "./yahoo";
import { TECHNICAL_LOOKBACK, DIRECTION_THRESHOLD, MIN_SUPPORTING_FAMILIES } from "./research-policy";

export function supportingFamilies(a: StockAnalysis): number {
  return a.confluence?.families.filter(f => Math.abs(f.score) >= DIRECTION_THRESHOLD && Math.sign(f.score) === Math.sign(a.score)).length ?? 0;
}

/** O MESMO modelo técnico para a previsão corrente e cada origem histórica.
 * Não recebe notícias, consensos atuais ou fundamentais que não existiam nessa data.
 */
export function technicalFromHistory(
  history: Candle[],
  identity: { symbol?: string; name?: string; currency?: string; exchange?: string; market?: string; sector?: string } = {},
  interval = "1d",
  range = "2y",
): StockAnalysis | null {
  const candles = history.slice(-TECHNICAL_LOOKBACK);
  if (candles.length < 40) return null;
  const latest = candles[candles.length - 1], previous = candles[candles.length - 2];
  const analysis = analyzeStock({
    meta: { symbol: identity.symbol ?? "HISTORICAL", currency: identity.currency ?? "USD", exchangeName: identity.exchange ?? "", fullExchangeName: identity.exchange ?? "", instrumentType: "EQUITY", regularMarketPrice: latest.c, previousClose: previous?.c ?? latest.c, regularMarketTime: latest.t / 1000 },
    candles, interval, range, fetchedAt: latest.t,
  }, { name: identity.name, exchange: identity.exchange, market: identity.market, sector: identity.sector });
  return applyConfluence(analysis, null, candles);
}

export function historicalSignal(history: Candle[]): { score: number; eligible: boolean } {
  const a = technicalFromHistory(history);
  return a ? { score: a.score, eligible: Math.abs(a.score) >= DIRECTION_THRESHOLD && supportingFamilies(a) >= MIN_SUPPORTING_FAMILIES } : { score: 0, eligible: false };
}
