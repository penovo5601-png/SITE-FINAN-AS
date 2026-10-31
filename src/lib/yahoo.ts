import { getCandles } from "./candles";
export type Candle = {
  t: number; // epoch ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type QuoteMeta = {
  symbol: string;
  currency: string;
  exchangeName: string;
  fullExchangeName: string;
  instrumentType: string;
  regularMarketPrice: number;
  previousClose: number;
  regularMarketTime: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  longName?: string;
  shortName?: string;
  timezone?: string;
};

export type ChartBundle = {
  meta: QuoteMeta;
  candles: Candle[];
  interval: string;
  range: string;
  fetchedAt: number;
};

const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const cache = new Map<string, { at: number; data: ChartBundle }>();
const TTL = 8 * 60 * 1000;

function cleanCandles(raw: {
  timestamp?: number[];
  quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] };
  adjclose?: { adjclose?: (number | null)[] }[];
}): Candle[] {
  const ts = raw.timestamp ?? [];
  const q = raw.quote ?? {};
  const adj = raw.adjclose?.[0]?.adjclose;
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i];
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    if (c == null || o == null || h == null || l == null || !isFinite(c)) continue;
    const a = adj?.[i];
    const factor = a && isFinite(a) && a > 0 && c > 0 ? a / c : 1;
    out.push({
      t: ts[i] * 1000,
      o: o * factor,
      h: h * factor,
      l: l * factor,
      c: c * factor,
      v: q.volume?.[i] ?? 0,
    });
  }
  return out;
}

/** Descarrega histórico OHLCV com múltiplos fornecedores (Yahoo c/ retries → WSJ → Nasdaq). Nunca depende de um único serviço. */
export async function fetchChart(
  symbol: string,
  range = "2y",
  interval = "1d",
  force = false,
): Promise<ChartBundle | null> {
  const key = `${symbol}|${range}|${interval}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL) return hit.data;
  const r = (range === "5y" || range === "max") ? "5y" : range === "1y" || range === "6mo" || range === "3mo" || range === "1mo" ? "1y" : "2y";
  const res = await getCandles(symbol, r as "1y" | "2y" | "5y");
  if (!res.candles.length) return hit?.data ?? null;
  const candles: Candle[] = res.candles.map((c) => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v }));
  const m = res.meta ?? {};
  const meta: QuoteMeta = {
    symbol,
    currency: String(m.currency ?? "USD"),
    exchangeName: String(m.exchangeName ?? ""),
    fullExchangeName: String(m.exchangeName ?? ""),
    instrumentType: String(m.instrumentType ?? "EQUITY"),
    regularMarketPrice: Number(m.regularMarketPrice ?? candles[candles.length - 1].c),
    previousClose: Number(m.previousClose ?? candles[candles.length - 2]?.c ?? candles[candles.length - 1].c),
    regularMarketTime: Math.round(candles[candles.length - 1].t / 1000),
    fiftyTwoWeekHigh: m.fiftyTwoWeekHigh ? Number(m.fiftyTwoWeekHigh) : undefined,
    fiftyTwoWeekLow: m.fiftyTwoWeekLow ? Number(m.fiftyTwoWeekLow) : undefined,
    longName: m.longName ? String(m.longName) : undefined,
    shortName: m.shortName ? String(m.shortName) : undefined,
    timezone: undefined,
  };
  const bundle: ChartBundle & { source?: string; notes?: string[] } = { meta, candles, interval, range, fetchedAt: Date.now(), source: res.source, notes: res.notes };
  cache.set(key, { at: Date.now(), data: bundle });
  return bundle;
}

export const RANGE_OPTIONS = [
  { value: "3mo", label: "3 meses" },
  { value: "6mo", label: "6 meses" },
  { value: "1y", label: "1 ano" },
  { value: "2y", label: "2 anos" },
  { value: "5y", label: "5 anos" },
] as const;

export const INTERVAL_OPTIONS = [
  { value: "1d", label: "Diário" },
  { value: "1wk", label: "Semanal" },
] as const;
