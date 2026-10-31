const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Colunas pedidas ao scanner do TradingView (a ordem define o índice de leitura). */
export const TV_COLUMNS = [
  "name", "description", "close", "change", "change_abs", "volume", "currency", "type", "exchange", "sector", "industry", "country", "high", "low", "open",
  "RSI", "ADX", "SMA10", "SMA20", "SMA30", "SMA50", "SMA100", "SMA200",
  "EMA10", "EMA20", "EMA30", "EMA50", "EMA100", "EMA200",
  "MACD.macd", "MACD.signal", "BB.upper", "BB.lower", "Stoch.K", "Stoch.D", "CCI20", "W.R", "Mom", "ATR", "AO",
  "Volatility.D", "Volatility.W", "Volatility.M",
  "Perf.W", "Perf.1M", "Perf.3M", "Perf.6M", "Perf.Y", "Perf.YTD",
  "price_52_week_high", "price_52_week_low", "high_1M", "low_1M",
  "Recommend.All", "Recommend.MA", "Recommend.Other",
  "relative_volume_10d_calc", "average_volume_10d_calc", "market_cap_basic",
  "price_earnings_ttm", "dividends_yield", "beta_1_year", "price_book_fq", "price_sales_fq",
  "earnings_per_share_basic_ttm", "return_on_equity", "earnings_release_date",
  "Pivot.M.Classic.S1", "Pivot.M.Classic.R1", "Pivot.M.Classic.S2", "Pivot.M.Classic.R2",
  "Pivot.M.Classic.S3", "Pivot.M.Classic.R3",
  "RSI|1W", "ADX|1W", "Recommend.All|1W", "RSI|1M", "Recommend.All|1M",
  "ADX+DI", "ADX-DI", "Ichimoku.BLine", "VWMA", "HullMA9", "Stoch.RSI.K", "Stoch.RSI.D", "UO", "BBPower",
  // ---- fundamentais (rentabilidade, crescimento, balanço, dividendos, valor intrínseco) ----
  "fundamental_currency_code", "Perf.3Y", "Perf.5Y", "Perf.10Y",
  "return_on_assets", "return_on_invested_capital", "gross_margin", "operating_margin", "net_margin", "free_cash_flow_margin_ttm", "free_cash_flow_ttm",
  "earnings_per_share_diluted_ttm", "revenue_per_share_ttm", "book_value_per_share_fq",
  "total_revenue_yoy_growth_ttm", "earnings_per_share_diluted_yoy_growth_ttm", "net_income_yoy_growth_ttm", "free_cash_flow_yoy_growth_ttm", "ebitda_yoy_growth_ttm",
  "debt_to_equity", "current_ratio", "quick_ratio", "total_debt", "net_debt", "cash_n_short_term_invest_fq", "total_assets",
  "enterprise_value_ebitda_ttm", "enterprise_value_fq", "ebitda", "total_revenue", "net_income",
  "dividends_yield_fy", "dividend_payout_ratio_ttm", "continuous_dividend_growth", "continuous_dividend_payout", "dps_common_stock_prim_issue_yoy_growth_fy",
  "price_target_average", "price_target_high", "price_target_low", "recommendation_mark", "earnings_release_next_date",
  "eps_surprise_percent_fq", "revenue_surprise_percent_fq", "total_shares_outstanding_fundamental", "price_book_fq",
] as const;

export type TvSnapshot = Record<string, number | string | null>;

/** Mapeia o sufixo Yahoo Finance para as exchanges possíveis no TradingView. */
const SUFFIX_TO_TV: Record<string, string[]> = {
  LS: ["EURONEXT"], PA: ["EURONEXT"], AS: ["EURONEXT"], BR: ["EURONEXT"],
  MI: ["MIL"], DE: ["XETRA", "FWB"], F: ["FWB", "XETRA"], DU: ["FWB"], HM: ["FWB"], MU: ["FWB"], BE: ["FWB"],
  VI: ["VIE"], L: ["LSE"], SA: ["BMFBOVESPA"], MC: ["BME"], T: ["TSE"], HK: ["HKEX"],
  SS: ["SSE"], SZ: ["SZSE"], BO: ["BSE"], NS: ["NSE"], AX: ["ASX"], ST: ["STO", "OMXSTO"],
  OL: ["OSE"], CO: ["OMXCOP", "CPH"], TO: ["TSX"], V: ["TSXV"], SW: ["SIX"],
  KS: ["KRX"], KQ: ["KRX"], TW: ["TWSE"], BA: ["BCBA"], JO: ["JSE"], ME: ["MOEX"],
  SR: ["TASI"], NZ: ["NZX"], AE: ["ADX", "DFM"], SI: ["SGX"], AT: ["ATHEX"], HE: ["OMXHEL"],
  WA: ["GPW"], IR: ["EURONEXT", "ISE"], MX: ["BMV"], SN: ["SANTIAGO"], BK: ["SET"],
  JK: ["IDX"], IS: ["BIST"], TA: ["TASE"], OL2: ["OSE"],
};

const US_EXCHANGES = ["NASDAQ", "NYSE", "NYSEAMERICAN", "AMEX", "BATS", "OTC"];

const resolutionCache = new Map<string, string | null>();

export function baseTicker(symbol: string) {
  const dot = symbol.lastIndexOf(".");
  const suffix = dot > 0 ? symbol.slice(dot + 1).toUpperCase() : "";
  return { base: dot > 0 ? symbol.slice(0, dot) : symbol, suffix };
}

export function candidatesFor(symbol: string): string[] {
  const canonical: Record<string, string> = { "GAL.LS": "GALP.LS", "MCP.LS": "EGL.LS" };
  const { base, suffix } = baseTicker(canonical[symbol] ?? symbol);
  const known = resolutionCache.get(symbol);
  if (known) return [known];
  const ex = SUFFIX_TO_TV[suffix];
  const list = ex ? ex.map((e) => `${e}:${base}`) : US_EXCHANGES.map((e) => `${e}:${base}`);
  if (!list.some((t) => t === `EURONEXT:${base}`) && suffix === "IR") list.push(`EURONEXT:${base}`);
  return list;
}

export function rememberResolution(symbol: string, tv: string | null) {
  resolutionCache.set(symbol, tv);
}

async function post(body: unknown): Promise<{ totalCount: number; data: { s: string; d: (number | string | null)[] }[] } | null> {
  try {
    const res = await fetch("https://scanner.tradingview.com/global/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA, Origin: "https://www.tradingview.com", Referer: "https://www.tradingview.com/" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(14000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as never;
  } catch {
    return null;
  }
}

function toSnapshot(s: string, d: (number | string | null)[]): TvSnapshot & { __tv: string } {
  const snap: Record<string, number | string | null> = { __tv: s };
  TV_COLUMNS.forEach((c, i) => { snap[c] = d[i] ?? null; });
  return snap as TvSnapshot & { __tv: string };
}

const snapCache = new Map<string, { at: number; data: TvSnapshot & { __tv: string } }>();
const TTL = 5 * 60 * 1000;

/** Devolve o snapshot técnico/fundamental do TradingView para um símbolo do universo. */
export async function fetchTradingView(symbol: string, force = false): Promise<(TvSnapshot & { __tv: string }) | null> {
  const upper = symbol.toUpperCase();
  const cached = snapCache.get(upper);
  if (!force && cached && Date.now() - cached.at < TTL) return cached.data;

  const tickers = candidatesFor(upper);
  const { base } = baseTicker(upper);
  const json = await post({ symbols: { tickers }, columns: [...TV_COLUMNS] });
  if (!json?.data?.length) return cached?.data ?? null;

  const { suffix } = baseTicker(upper);
  const scored = json.data
    .map((row) => ({ row, snap: toSnapshot(row.s, row.d) }))
    .filter((x) => Number(x.snap.close) > 0);
  if (!scored.length) return cached?.data ?? null;

  const preferred =
    scored.find((x) => String(x.snap.name ?? "").toUpperCase() === base.toUpperCase()) ??
    scored.find((x) => String(x.snap.type ?? "").toLowerCase() === "stock") ??
    scored[0];

  // Para símbolos sem sufixo (EUA) exige-se correspondência exata do ticker.
  if (!suffix && String(preferred.snap.name ?? "").toUpperCase() !== base.toUpperCase()) {
    return cached?.data ?? null;
  }

  rememberResolution(upper, preferred.snap.__tv);
  snapCache.set(upper, { at: Date.now(), data: preferred.snap });
  return preferred.snap;
}

/** Cotações em lote para a fita de mercados (uma única chamada para vários símbolos). */
export async function fetchTradingViewBatch(symbols: string[]): Promise<Map<string, TvSnapshot & { __tv: string }>> {
  const out = new Map<string, TvSnapshot & { __tv: string }>();
  const tickers: string[] = [];
  const owner = new Map<string, string>(); // tv ticker -> symbol
  for (const s of symbols) {
    const cached = snapCache.get(s.toUpperCase());
    if (cached && Date.now() - cached.at < TTL) { out.set(s.toUpperCase(), cached.data); continue; }
    for (const t of candidatesFor(s)) {
      tickers.push(t);
      if (!owner.has(t)) owner.set(t, s.toUpperCase());
    }
  }
  if (!tickers.length) return out;
  const chunks: string[][] = [];
  for (let i = 0; i < tickers.length; i += 120) chunks.push(tickers.slice(i, i + 120));
  for (const chunk of chunks) {
    const json = await post({ symbols: { tickers: chunk }, columns: [...TV_COLUMNS] });
    if (!json?.data) continue;
    for (const row of json.data) {
      const sym = owner.get(row.s);
      if (!sym || out.has(sym)) continue;
      const snap = toSnapshot(row.s, row.d);
      if (!(Number(snap.close) > 0)) continue;
      const base = baseTicker(sym).base;
      if (String(snap.name ?? "").toUpperCase() !== base.toUpperCase()) continue;
      rememberResolution(sym, snap.__tv);
      snapCache.set(sym, { at: Date.now(), data: snap });
      out.set(sym, snap);
    }
  }
  return out;
}

export const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);

/** Converte a recomendação agregada do TradingView (-1..+1) em viés -100..+100. */
export function recommendBias(v: unknown): number | null {
  const n = num(v);
  if (n == null) return null;
  return Math.max(-100, Math.min(100, n * 100));
}
