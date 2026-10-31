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
  priceBasis?: "adjusted" | "unadjusted";
  cached?: boolean;
  discardedBars?: number;
};

const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
const UA = "Mozilla/5.0";

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
    if (c == null || o == null || h == null || l == null || ![c,o,h,l].every(Number.isFinite) || Math.min(c,o,h,l)<=0 || h+1e-8<Math.max(o,c,l) || l-1e-8>Math.min(o,c,h)) continue;
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

/** Descarrega histórico OHLCV do Yahoo Finance (sem chave de API). */
export async function fetchChart(
  symbol: string,
  range = "2y",
  interval = "1d",
  force = false,
): Promise<ChartBundle | null> {
  const key = `${symbol}|${range}|${interval}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL) return {...hit.data,cached:true};

  const url = (host: string) =>
    `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;

  for (const host of HOSTS) {
    try {
      const res = await fetch(url(host), {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        chart?: { error?: { code?: string; description?: string } | null; result?: Array<{ meta?: Record<string, unknown>; timestamp?: number[]; indicators?: { quote?: unknown[]; adjclose?: unknown[] } }> };
      };
      const result = json.chart?.result?.[0];
      if (!result || !result.meta) continue;
      const m = result.meta as Record<string, unknown>;
      const candles = cleanCandles({
        timestamp: result.timestamp,
        quote: (result.indicators?.quote?.[0] ?? {}) as never,
        adjclose: (result.indicators?.adjclose ?? []) as never,
      });
      if (candles.length < 2) continue;
      if (String(m.symbol ?? symbol).toUpperCase() !== symbol.toUpperCase()) continue;
      if (String(m.instrumentType ?? "EQUITY").toUpperCase() !== "EQUITY") continue;
      const meta: QuoteMeta = {
        symbol: String(m.symbol ?? symbol),
        currency: String(m.currency ?? "USD"),
        exchangeName: String(m.exchangeName ?? ""),
        fullExchangeName: String(m.fullExchangeName ?? m.exchangeName ?? ""),
        instrumentType: String(m.instrumentType ?? "EQUITY"),
        regularMarketPrice: Number(m.regularMarketPrice ?? candles[candles.length - 1].c),
        previousClose: Number(m.previousClose ?? candles[candles.length - 2]?.c ?? candles[candles.length - 1]?.c ?? 0),
        regularMarketTime: Number(m.regularMarketTime ?? candles[candles.length - 1].t / 1000),
        fiftyTwoWeekHigh: m.fiftyTwoWeekHigh ? Number(m.fiftyTwoWeekHigh) : undefined,
        fiftyTwoWeekLow: m.fiftyTwoWeekLow ? Number(m.fiftyTwoWeekLow) : undefined,
        longName: m.longName ? String(m.longName) : undefined,
        shortName: m.shortName ? String(m.shortName) : undefined,
        timezone: m.exchangeTimezoneName ? String(m.exchangeTimezoneName) : undefined,
      };
      const bundle: ChartBundle = { meta, candles, interval, range, fetchedAt: Date.now(), priceBasis: result.indicators?.adjclose?.length ? "adjusted" : "unadjusted", discardedBars: Math.max(0,(result.timestamp?.length??0)-candles.length) };
      cache.set(key, { at: Date.now(), data: bundle });
      return bundle;
    } catch {
      // tenta o host seguinte
    }
  }
  return hit ? {...hit.data,cached:true} : null;
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
