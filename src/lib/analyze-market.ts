import { analyzeFromScanner, analyzeStock, type StockAnalysis } from "./engine";
import { applyConfluence } from "./confluence";
import type { MarketData } from "./market-data";

export const RESEARCH_VERSION = "2026.11-news-confluence-v2";

export function analyzeMarket(
  md: MarketData,
  info: { name?: string; exchange?: string; market?: string; sector?: string } = {},
): StockAnalysis | null {
  const scanner = md.interval === "1d" ? md.scanner : null;
  const analysis = md.candles && md.candles.length >= 40 && md.bundle
    ? analyzeStock(md.bundle, { ...info, scanner, historySource: md.historySource, sourceNotes: md.notes })
    : scanner
      ? analyzeFromScanner({ symbol: md.symbol, scanner, currency: md.currency, range: md.range, interval: md.interval, historySource: md.historySource, notes: md.notes }, info)
      : null;
  return analysis ? applyConfluence(analysis, scanner, md.candles ?? []) : null;
}
