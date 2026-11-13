import { PeerRow } from "./guide";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
export const PEER_COLUMNS = ["name", "description", "exchange", "country", "close", "currency", "price_earnings_ttm", "price_book_fq", "return_on_equity", "dividends_yield", "dividend_payout_ratio_ttm", "Perf.6M", "Perf.Y", "market_cap_basic", "sector", "industry", "beta_1_year", "price_target_average", "Perf.1M", "Perf.3M", "debt_to_equity", "total_revenue_yoy_growth_ttm", "earnings_per_share_diluted_yoy_growth_ttm", "net_margin", "Volatility.M", "fundamental_currency_code", "total_shares_outstanding_fundamental"] as const;

export const TV_TO_YAHOO_SUFFIX: Record<string, string> = { EURONEXT: "", BME: ".MC", XETR: ".DE", FWB: ".F", MIL: ".MI", LSE: ".L", SIX: ".SW", OMXSTO: ".ST", STO: ".ST", OSL: ".OL", OSE: ".OL", OMXCOP: ".CO", CPH: ".CO", OMXHEL: ".HE", HEL: ".HE", ATHEX: ".AT", VIE: ".VI", GPW: ".WA", NASDAQ: "", NYSE: "", AMEX: "", BMFBOVESPA: ".SA", TSE: ".T", HKEX: ".HK", TSX: ".TO", ASX: ".AX", NSE: ".NS", KRX: ".KS", TWSE: ".TW", SSE: ".SS", SZSE: ".SZ" };
const EURONEXT_COUNTRY_SUFFIX: Record<string, string> = { Portugal: ".LS", France: ".PA", Netherlands: ".AS", Belgium: ".BR", Ireland: ".IR", Norway: ".OL" };

export function tvToYahoo(tv: string, country: string): string {
  const [ex, tk] = tv.split(":");
  if (ex === "EURONEXT") return tk + (EURONEXT_COUNTRY_SUFFIX[country] ?? ".PA");
  const suf = TV_TO_YAHOO_SUFFIX[ex];
  if (suf === undefined) return tk;
  if (ex === "LSE") return tk.replace(/\.$/, "") + ".L";
  if (ex === "BMFBOVESPA" || ex === "TSE" || ex === "HKEX") return tk + suf;
  return tk.replace(/\./g, "-") + suf;
}

export function rowToPeer(s: string, d: (number | string | null)[], selfTv?: string): PeerRow & { tv: string; sector: string | null; industry: string | null; beta: number | null; analystTarget: number | null; perf1m: number | null; perf3m: number | null; de: number | null; revG: number | null; epsG: number | null; nm: number | null; volM: number | null; fccy: string | null; shares: number | null } {
  const g = (i: number) => (typeof d[i] === "number" && isFinite(d[i] as number) ? (d[i] as number) : null);
  const country = String(d[3] ?? "");
  // Fundamentais do TV vêm em USD: converter PER/PBV/ROE não precisa (rácios); alvo de analistas precisa (por ação)
  return {
    tv: s, symbol: tvToYahoo(s, country), name: String(d[1] ?? d[0] ?? s), country, exchange: String(d[2] ?? ""), price: g(4), currency: d[5] ? String(d[5]) : null,
    per: g(6), pbv: g(7), roe: g(8), dy: g(9), payout: g(10), perf6m: g(11), perf1y: g(12), marketCap: g(13), sector: d[14] ? String(d[14]) : null, industry: d[15] ? String(d[15]) : null,
    beta: g(16), analystTarget: g(17), perf1m: g(18), perf3m: g(19), de: g(20), revG: g(21), epsG: g(22), nm: g(23), volM: g(24), fccy: d[25] ? String(d[25]) : null, shares: g(26), isSelf: selfTv === s,
  };
}

async function scan(body: unknown): Promise<{ s: string; d: (number | string | null)[] }[]> {
  try {
    const res = await fetch("https://scanner.tradingview.com/global/scan", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": UA, Origin: "https://www.tradingview.com", Referer: "https://www.tradingview.com/" }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000), cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json())?.data ?? [];
  } catch { return []; }
}

const EU_COUNTRIES = ["Portugal", "Spain", "France", "Italy", "Germany", "Netherlands", "Belgium", "United Kingdom", "Switzerland", "Austria", "Ireland", "Norway", "Sweden", "Denmark", "Finland", "Poland", "Luxembourg"];
const peerCache = new Map<string, { at: number; data: PeerRow[] }>();

/** Concorrentes reais: mesma indústria, preferencialmente mesma região (Europa p/ europeias, mesmo país c.c.). */
export async function fetchPeers(selfTv: string | null, industry: string | null, sector: string | null, country: string | null, limit = 8): Promise<PeerRow[]> {
  if (!industry && !sector) return [];
  const key = `${selfTv}|${industry}|${country}`;
  const hit = peerCache.get(key); if (hit && Date.now() - hit.at < 15 * 60 * 1000) return hit.data;
  const isEU = country ? EU_COUNTRIES.includes(country) : false;
  const regionFilter = isEU ? [{ left: "country", operation: "in_range", right: EU_COUNTRIES }] : country ? [{ left: "country", operation: "equal", right: country }] : [];
  const base = [{ left: "type", operation: "equal", right: "stock" }, { left: "is_primary", operation: "equal", right: true }, { left: "market_cap_basic", operation: "greater", right: 300_000_000 }];
  let rows = await scan({ filter: [...base, { left: "industry", operation: "equal", right: industry }, ...regionFilter], columns: PEER_COLUMNS, sort: { sortBy: "market_cap_basic", sortOrder: "desc" }, range: [0, limit + 2] });
  if (rows.length < 3 && sector) rows = await scan({ filter: [...base, { left: "sector", operation: "equal", right: sector }, ...regionFilter], columns: PEER_COLUMNS, sort: { sortBy: "market_cap_basic", sortOrder: "desc" }, range: [0, limit + 2] });
  if (rows.length < 3 && industry) rows = await scan({ filter: [...base, { left: "industry", operation: "equal", right: industry }], columns: PEER_COLUMNS, sort: { sortBy: "market_cap_basic", sortOrder: "desc" }, range: [0, limit + 2] });
  const peers = rows.map(r => rowToPeer(r.s, r.d, selfTv ?? undefined)).filter((p, i, a) => a.findIndex(x => x.name === p.name) === i).slice(0, limit + 1);
  const out: PeerRow[] = peers.map(({ symbol, name, country, exchange, price, currency, per, pbv, roe, dy, payout, perf6m, perf1y, marketCap, isSelf }) => ({ symbol, name, country, exchange, price, currency, per, pbv, roe, dy, payout, perf6m, perf1y, marketCap, isSelf }));
  peerCache.set(key, { at: Date.now(), data: out });
  return out;
}

/** Universo para carteiras: ações líquidas da Zona Euro (sem FX), por setor, com fundamentais. */
export async function fetchEuroUniverse(): Promise<ReturnType<typeof rowToPeer>[]> {
  const rows = await scan({
    filter: [
      { left: "type", operation: "equal", right: "stock" }, { left: "is_primary", operation: "equal", right: true },
      { left: "currency", operation: "equal", right: "EUR" },
      { left: "country", operation: "in_range", right: ["Portugal", "Spain", "France", "Italy", "Germany", "Netherlands", "Belgium", "Austria", "Ireland", "Finland"] },
      { left: "market_cap_basic", operation: "greater", right: 2_000_000_000 },
      { left: "average_volume_10d_calc", operation: "greater", right: 100_000 },
      { left: "price_earnings_ttm", operation: "greater", right: 0 },
    ],
    columns: PEER_COLUMNS, sort: { sortBy: "market_cap_basic", sortOrder: "desc" }, range: [0, 220],
  });
  return rows.map(r => rowToPeer(r.s, r.d));
}
