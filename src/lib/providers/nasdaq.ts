import type { Candle } from "../yahoo";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const historyCache = new Map<string, { at: number; candles: Candle[] }>();

type Row = { date: string; close: string; volume: string; open: string; high: string; low: string };

function cleanNum(s: string | null | undefined): number {
  if (!s) return 0;
  return Number(String(s).replace(/[$,\s]/g, "")) || 0;
}

/**
 * Histórico diário OHLCV do Nasdaq.com (sem chave de API).
 * Cobre símbolos cotados nos EUA, incluindo ADRs.
 */
export async function fetchNasdaqHistory(symbol: string, years = 3): Promise<Candle[] | null> {
  const cacheKey = `${symbol}:${years}`;
  const cached = historyCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.candles;
  const to = new Date();
  const from = new Date(to.getTime() - years * 365 * 24 * 3600 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const url =
    `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/historical` +
    `?assetclass=stocks&fromdate=${iso(from)}&todate=${iso(to)}&limit=9999`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          Origin: "https://www.nasdaq.com",
          Referer: "https://www.nasdaq.com/",
        },
        signal: AbortSignal.timeout(11000),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { data?: { tradesTable?: { rows?: Row[] } } };
      const rows = json?.data?.tradesTable?.rows;
      if (!rows?.length) return null;
      const candles: Candle[] = rows
        .map((r) => {
          const [mm, dd, yyyy] = String(r.date).split("/");
          const t = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd));
          const c = cleanNum(r.close);
          const o = cleanNum(r.open);
          const h = cleanNum(r.high);
          const l = cleanNum(r.low);
          const v = cleanNum(r.volume);
          if (!c || !o || !h || !l) return null;
          return { t, o, h: Math.max(h, o, c), l: Math.min(l, o, c), c, v };
        })
        .filter((x): x is Candle => x !== null)
        .sort((a, b) => a.t - b.t);
      if (candles.length > 20) {
        if (historyCache.size >= 80) historyCache.delete(historyCache.keys().next().value!);
        historyCache.set(cacheKey, {at:Date.now(), candles});
        return candles;
      }
      return null;
    } catch {
      if (attempt === 0) await new Promise((r) => setTimeout(r, 700));
    }
  }
  return null;
}
