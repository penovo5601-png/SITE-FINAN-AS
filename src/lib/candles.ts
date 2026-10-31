/**
 * Velas OHLCV à prova de falha.
 * Cadeia: Yahoo (query1/query2 × 2 user-agents × retry + spark) → WSJ/MarketWatch (todas as bolsas) → Nasdaq (EUA) → cache em memória (stale).
 */
export interface OhlcCandle { t: number; o: number; h: number; l: number; c: number; v: number }
export interface CandleMeta { currency?: string; exchangeName?: string; regularMarketPrice?: number; previousClose?: number; fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number; shortName?: string; longName?: string; instrumentType?: string }
export interface CandleResult { candles: OhlcCandle[]; source: "yahoo" | "wsj" | "nasdaq" | "cache" | "nenhuma"; meta: CandleMeta | null; notes: string[] }

const UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const memo = new Map<string, { at: number; data: CandleResult }>();
const FRESH_TTL = 5 * 60 * 1000;

function baseAndSuffix(symbol: string) {
  const s = symbol.toUpperCase();
  const dot = s.lastIndexOf(".");
  return dot > 0 ? { base: s.slice(0, dot), suffix: s.slice(dot + 1) } : { base: s, suffix: "" };
}

// ---------------- Yahoo ----------------
async function yahooChart(symbol: string, range: string): Promise<{ candles: OhlcCandle[]; meta: CandleMeta } | null> {
  const hosts = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
  const attempts: { url: string; ua: string; kind: "chart" | "spark" }[] = [];
  for (let i = 0; i < 2; i++) for (const h of hosts) attempts.push({ url: `${h}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false&events=div%2Csplit`, ua: UAS[(i + attempts.length) % UAS.length], kind: "chart" });
  attempts.push({ url: `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(symbol)}&range=${range}&interval=1d`, ua: UAS[2], kind: "spark" });

  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    try {
      const res = await fetch(a.url, { headers: { "User-Agent": a.ua, Accept: "application/json,text/plain,*/*", "Accept-Language": "en-US,en;q=0.9" }, signal: AbortSignal.timeout(7000), cache: "no-store" });
      if (res.status === 429 || res.status >= 500) { await sleep(350 * (i + 1)); continue; }
      if (!res.ok) { if (res.status === 404) return null; continue; }
      const json = await res.json();
      if (a.kind === "spark") {
        const r = json?.[symbol] ?? json?.spark?.result?.[0]?.response?.[0];
        const ts: number[] = r?.timestamp ?? []; const cl: (number | null)[] = r?.close ?? r?.indicators?.quote?.[0]?.close ?? [];
        const candles: OhlcCandle[] = [];
        for (let k = 0; k < ts.length; k++) { const c = cl[k]; if (c == null || !isFinite(c)) continue; candles.push({ t: ts[k] * 1000, o: c, h: c, l: c, c, v: 0 }); }
        if (candles.length >= 5) return { candles, meta: { regularMarketPrice: candles[candles.length - 1].c } };
        continue;
      }
      const result = json?.chart?.result?.[0];
      if (!result) continue;
      const ts: number[] = result.timestamp ?? []; const q = result.indicators?.quote?.[0] ?? {};
      const candles: OhlcCandle[] = [];
      for (let k = 0; k < ts.length; k++) {
        const c = q.close?.[k]; if (c == null || !isFinite(c)) continue;
        const o = q.open?.[k] ?? c, h = q.high?.[k] ?? Math.max(o, c), l = q.low?.[k] ?? Math.min(o, c);
        candles.push({ t: ts[k] * 1000, o, h, l, c, v: q.volume?.[k] ?? 0 });
      }
      if (candles.length < 5) continue;
      const m = result.meta ?? {};
      return { candles, meta: { currency: m.currency, exchangeName: m.fullExchangeName ?? m.exchangeName, regularMarketPrice: m.regularMarketPrice, previousClose: m.previousClose ?? m.chartPreviousClose, fiftyTwoWeekHigh: m.fiftyTwoWeekHigh, fiftyTwoWeekLow: m.fiftyTwoWeekLow, shortName: m.shortName, longName: m.longName, instrumentType: m.instrumentType } };
    } catch { await sleep(200); }
  }
  return null;
}

// ---------------- WSJ / MarketWatch ----------------
const WSJ_MAP: Record<string, { country: string; mics: string[] }> = {
  "": { country: "US", mics: ["XNAS", "XNYS", "XASE"] }, LS: { country: "PT", mics: ["XLIS"] }, SA: { country: "BR", mics: ["BVMF"] },
  DE: { country: "XE", mics: ["XETR"] }, F: { country: "DE", mics: ["XFRA"] }, PA: { country: "FR", mics: ["XPAR"] }, AS: { country: "NL", mics: ["XAMS"] },
  BR: { country: "BE", mics: ["XBRU"] }, MC: { country: "ES", mics: ["XMAD"] }, MI: { country: "IT", mics: ["XMIL"] }, L: { country: "UK", mics: ["XLON"] },
  SW: { country: "CH", mics: ["XSWX"] }, VX: { country: "CH", mics: ["XSWX"] }, T: { country: "JP", mics: ["XTKS"] }, HK: { country: "HK", mics: ["XHKG"] },
  TO: { country: "CA", mics: ["XTSE"] }, V: { country: "CA", mics: ["XTSX"] }, AX: { country: "AU", mics: ["XASX"] }, ST: { country: "SE", mics: ["XSTO"] },
  OL: { country: "NO", mics: ["XOSL"] }, CO: { country: "DK", mics: ["XCSE"] }, HE: { country: "FI", mics: ["XHEL"] }, VI: { country: "AT", mics: ["XWBO"] },
  WA: { country: "PL", mics: ["XWAR"] }, MX: { country: "MX", mics: ["XMEX"] }, JO: { country: "ZA", mics: ["XJSE"] }, SI: { country: "SG", mics: ["XSES"] },
  TW: { country: "TW", mics: ["XTAI"] }, SS: { country: "CN", mics: ["XSHG"] }, SZ: { country: "CN", mics: ["XSHE"] }, NS: { country: "IN", mics: ["XNSE"] },
  BO: { country: "IN", mics: ["XBOM"] }, KS: { country: "KR", mics: ["XKRX"] }, KQ: { country: "KR", mics: ["XKOS"] }, IR: { country: "IE", mics: ["XDUB"] },
  AT: { country: "GR", mics: ["XATH"] }, NZ: { country: "NZ", mics: ["XNZE"] }, BA: { country: "AR", mics: ["XBUE"] }, SN: { country: "CL", mics: ["XSGO"] },
  IS: { country: "TR", mics: ["XIST"] }, TA: { country: "IL", mics: ["XTAE"] }, BK: { country: "TH", mics: ["XBKK"] }, JK: { country: "ID", mics: ["XIDX"] }, KL: { country: "MY", mics: ["XKLS"] },
};

export async function wsjHistory(symbol: string, years = 2): Promise<{ candles: OhlcCandle[]; meta: CandleMeta } | null> {
  const { base, suffix } = baseAndSuffix(symbol);
  const map = WSJ_MAP[suffix]; if (!map) return null;
  const tickerVariants = [base.replace(/-/g, "."), base.replace(/\./g, "-"), base];
  for (const mic of map.mics) for (const tk of [...new Set(tickerVariants)]) {
    const key = `STOCK/${map.country}/${mic}/${tk}`;
    const body = { Step: "P1D", TimeFrame: `P${years}Y`, EntitlementToken: "cecc4267a0194af89ca343805a3e57af", IncludeMockTick: true, FilterNullSlots: false, FilterClosedPoints: true, IncludeClosedSlots: false, IncludeOfficialClose: true, InjectOpen: false, ShowPreMarket: false, ShowAfterHours: false, UseExtendedTimeFrame: true, WantPriorClose: false, IncludeCurrentQuotes: false, ResetTodaysAfterHoursPercentChange: false, Series: [{ Key: key, Dialect: "Charting", Kind: "Ticker", SeriesId: "s1", DataTypes: ["Open", "High", "Low", "Last"], Indicators: [{ Parameters: [], Kind: "Volume", SeriesId: "i2" }] }] };
    try {
      const url = `https://api.wsj.net/api/michelangelo/timeseries/history?json=${encodeURIComponent(JSON.stringify(body))}&ckey=cecc4267a0`;
      const res = await fetch(url, { headers: { "User-Agent": UAS[0], "Dylan2010.EntitlementToken": "cecc4267a0194af89ca343805a3e57af", Accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (!res.ok) continue;
      const json = await res.json();
      const ticks: number[] = json?.TimeInfo?.Ticks ?? [];
      const series = json?.Series ?? [];
      const px = series.find((s: any) => s.SeriesId === "s1")?.DataPoints ?? [];
      const vol = series.find((s: any) => s.SeriesId === "i2")?.DataPoints ?? [];
      const candles: OhlcCandle[] = [];
      for (let i = 0; i < ticks.length; i++) {
        const p = px[i]; if (!p || p[3] == null) continue;
        const [o, h, l, c] = p; if (c == null || !isFinite(c) || c <= 0) continue;
        candles.push({ t: ticks[i], o: o ?? c, h: h ?? Math.max(o ?? c, c), l: l ?? Math.min(o ?? c, c), c, v: vol[i]?.[0] ?? 0 });
      }
      if (candles.length >= 20) {
        const last = candles[candles.length - 1], prev = candles[candles.length - 2];
        const yr = candles.slice(-252);
        return { candles, meta: { regularMarketPrice: last.c, previousClose: prev?.c, fiftyTwoWeekHigh: Math.max(...yr.map(c => c.h)), fiftyTwoWeekLow: Math.min(...yr.map(c => c.l)), exchangeName: mic } };
      }
    } catch { /* próximo */ }
  }
  return null;
}

// ---------------- Nasdaq (EUA) ----------------
async function nasdaqHistory(base: string, years = 2): Promise<OhlcCandle[] | null> {
  try {
    const to = new Date(); const from = new Date(); from.setFullYear(from.getFullYear() - years);
    const f = (d: Date) => d.toISOString().slice(0, 10);
    const res = await fetch(`https://api.nasdaq.com/api/quote/${encodeURIComponent(base)}/historical?assetclass=stocks&fromdate=${f(from)}&limit=9999&todate=${f(to)}`, { headers: { "User-Agent": UAS[0], Accept: "application/json", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok) return null;
    const rows: any[] = (await res.json())?.data?.tradesTable?.rows ?? [];
    const num = (s: string) => Number(String(s ?? "").replace(/[$,]/g, ""));
    const out: OhlcCandle[] = rows.map(r => ({ t: new Date(r.date).getTime(), o: num(r.open), h: num(r.high), l: num(r.low), c: num(r.close), v: num(r.volume) })).filter(c => isFinite(c.c) && c.c > 0).sort((a, b) => a.t - b.t);
    return out.length >= 20 ? out : null;
  } catch { return null; }
}

/** Sanitiza velas: OHLC coerente, sem valores inválidos, datas únicas e ordenadas, sem datas futuras. */
export function sanitizeCandles(input: OhlcCandle[]): OhlcCandle[] {
  const now = Date.now() + 36 * 3600 * 1000;
  const byDay = new Map<number, OhlcCandle>();
  for (const c of input) {
    if (![c.t, c.c].every(Number.isFinite) || c.c <= 0 || c.t > now) continue;
    const o = Number.isFinite(c.o) && c.o > 0 ? c.o : c.c;
    let h = Number.isFinite(c.h) && c.h > 0 ? c.h : Math.max(o, c.c);
    let l = Number.isFinite(c.l) && c.l > 0 ? c.l : Math.min(o, c.c);
    h = Math.max(h, o, c.c, l); l = Math.min(l, o, c.c, h);
    const v = Number.isFinite(c.v) && c.v >= 0 ? c.v : 0;
    const day = Math.floor(c.t / 86400000);
    byDay.set(day, { t: c.t, o, h, l, c: c.c, v });
  }
  return [...byDay.values()].sort((a, b) => a.t - b.t);
}

/** Obtém velas com múltiplos fornecedores. Nunca lança; devolve source "nenhuma" só se tudo falhar e não houver cache. */
export async function getCandles(symbol: string, range: "1y" | "2y" | "5y" = "2y"): Promise<CandleResult> {
  const key = `${symbol.toUpperCase()}|${range}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < FRESH_TTL) return hit.data;
  const notes: string[] = [];
  const years = range === "5y" ? 5 : range === "1y" ? 1 : 2;
  const { base, suffix } = baseAndSuffix(symbol);

  // 1) Yahoo + 2) WSJ em paralelo (o WSJ é independente e evita esperar pelo rate-limit do Yahoo)
  const [y0, w0] = await Promise.all([yahooChart(symbol, range), wsjHistory(symbol, years)]);
  const y = y0 ? { ...y0, candles: sanitizeCandles(y0.candles) } : null;
  const w = w0 ? { ...w0, candles: sanitizeCandles(w0.candles) } : null;
  let out: CandleResult | null = null;
  if (y && y.candles.length >= 20) out = { candles: y.candles, source: "yahoo", meta: y.meta, notes };
  else if (w) { notes.push("Velas obtidas via WSJ/MarketWatch (Yahoo Finance indisponível ou a limitar pedidos)."); out = { candles: w.candles, source: "wsj", meta: { ...(y?.meta ?? {}), ...w.meta }, notes }; }
  else if (!suffix) {
    const n0 = await nasdaqHistory(base, years);
    const n = n0 ? sanitizeCandles(n0) : null;
    if (n) { notes.push("Velas obtidas via Nasdaq.com (fornecedores globais indisponíveis)."); out = { candles: n, source: "nasdaq", meta: { regularMarketPrice: n[n.length - 1].c, previousClose: n[n.length - 2]?.c }, notes }; }
  }
  if (!out && y && y.candles.length) out = { candles: y.candles, source: "yahoo", meta: y.meta, notes };
  if (!out && hit) { notes.push(`A usar velas em cache (${Math.round((Date.now() - hit.at) / 60000)} min).`); return { ...hit.data, source: "cache", notes }; }
  if (!out) return { candles: [], source: "nenhuma", meta: null, notes: ["Nenhum fornecedor de velas respondeu."] };
  memo.set(key, { at: Date.now(), data: out });
  return out;
}
