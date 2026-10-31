import type { Candle, ChartBundle, QuoteMeta } from "./yahoo";
import { fetchChart } from "./yahoo";
import { fetchNasdaqHistory } from "./providers/nasdaq";
import { baseTicker, fetchTradingView, num, type TvSnapshot } from "./providers/tradingview";

export type DataSource = "yahoo" | "nasdaq" | "tradingview" | "nenhuma";

export type MarketData = {
  symbol: string;
  candles: Candle[] | null;
  bundle: ChartBundle | null;
  scanner: (TvSnapshot & { __tv: string }) | null;
  meta: QuoteMeta | null;
  source: DataSource;
  historySource: DataSource;
  currency: string;
  range: string;
  interval: string;
  notes: string[];
};

const RANGE_DAYS: Record<string, number> = { "1mo": 31, "3mo": 93, "6mo": 186, "1y": 370, "2y": 740, "5y": 1860, max: 40000 };
const RANGE_YEARS: Record<string, number> = { "1mo": 1, "3mo": 1, "6mo": 1, "1y": 1.4, "2y": 2.4, "5y": 5.4, max: 6 };

export function sliceByRange(candles: Candle[], range: string): Candle[] {
  const days = RANGE_DAYS[range] ?? 740;
  const cut = Date.now() - days * 24 * 3600 * 1000;
  const out = candles.filter((c) => c.t >= cut);
  return out.length > 30 ? out : candles;
}

/** Agrega velas diárias em semanais. */
export function toWeekly(candles: Candle[]): Candle[] {
  const weeks = new Map<number, Candle>();
  for (const c of candles) {
    const d = new Date(c.t);
    const day = (d.getUTCDay() + 6) % 7;
    const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
    const prev = weeks.get(monday);
    if (!prev) weeks.set(monday, { t: monday, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v });
    else {
      prev.h = Math.max(prev.h, c.h);
      prev.l = Math.min(prev.l, c.l);
      prev.c = c.c;
      prev.v += c.v;
    }
  }
  return [...weeks.values()].sort((a, b) => a.t - b.t);
}

export const COUNTRY_CURRENCY: Record<string, string> = {
  PT: "EUR", ES: "EUR", FR: "EUR", DE: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", IE: "EUR", AT: "EUR", FI: "EUR", GR: "EUR",
  GB: "GBP", US: "USD", CA: "CAD", BR: "BRL", MX: "MXN", AR: "ARS", JP: "JPY", CN: "CNY", HK: "HKD", TW: "TWD",
  KR: "KRW", IN: "INR", AU: "AUD", NZ: "NZD", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", RU: "RUB",
  ZA: "ZAR", SA: "SAR", AE: "AED", SG: "SGD",
};

export async function getMarketData(
  symbol: string,
  range = "2y",
  interval = "1d",
  currencyHint?: string | null,
): Promise<MarketData> {
  const notes: string[] = [];
  const aliases: Record<string, string> = { "GAL.LS": "GALP.LS", "MCP.LS": "EGL.LS" };
  symbol = aliases[symbol] ?? symbol;
  const { base, suffix } = baseTicker(symbol);
  const isUs = !suffix;

  const [bundle, scanner] = await Promise.all([
    fetchChart(symbol, range === "5y" ? "5y" : "5y", "1d").catch(() => null),
    fetchTradingView(symbol).catch(() => null),
  ]);

  let candles: Candle[] | null = bundle?.candles ?? null;
  let historySource: DataSource = bundle ? "yahoo" : "nenhuma";

  if (!candles || candles.length < 40) {
    if (isUs) {
      const nasdaq = await fetchNasdaqHistory(base, RANGE_YEARS[range] ?? 3);
      if (nasdaq && nasdaq.length > 40) {
        candles = nasdaq;
        historySource = "nasdaq";
        notes.push("Histórico obtido no Nasdaq.com (o fornecedor global estava indisponível).");
      }
    }
    // Nunca retirar o sufixo de uma ação estrangeira para procurar um homónimo americano.
  }

  if (candles) {
    candles = sliceByRange(candles, range);
    if (interval === "1wk") candles = toWeekly(candles);
  }

  if (!bundle && candles?.length) {
    notes.push("Metadados do fornecedor global indisponíveis; usou-se o scanner TradingView para o contexto.");
  }
  if (!candles && scanner) {
    notes.push(
      "Sem série histórica disponível neste momento (o fornecedor de velas está a limitar pedidos). A análise usa os indicadores calculados pelo scanner TradingView.",
    );
  }
  if (!candles && !scanner) {
    notes.push("Nenhuma fonte de dados respondeu para este símbolo.");
  }

  const price = num(scanner?.close) ?? bundle?.meta.regularMarketPrice ?? candles?.[candles.length - 1]?.c ?? 0;
  const changePct = num(scanner?.change) ?? (bundle?.meta.previousClose ? ((price - bundle.meta.previousClose) / bundle.meta.previousClose) * 100 : 0);

  const meta: QuoteMeta | null = bundle
    ? bundle.meta
    : scanner
      ? {
          symbol,
          currency: String(scanner.currency ?? currencyHint ?? "USD"),
          exchangeName: String(scanner.exchange ?? ""),
          fullExchangeName: String(scanner.exchange ?? ""),
          instrumentType: String(scanner.type ?? "stock").toUpperCase(),
          regularMarketPrice: price,
          previousClose: price / (1 + changePct / 100 || 1),
          regularMarketTime: Math.floor(Date.now() / 1000),
          fiftyTwoWeekHigh: num(scanner.price_52_week_high) ?? undefined,
          fiftyTwoWeekLow: num(scanner.price_52_week_low) ?? undefined,
          longName: String(scanner.description ?? symbol),
          shortName: String(scanner.name ?? symbol),
        }
      : null;

  const source: DataSource = candles && historySource === "yahoo" ? "yahoo" : candles ? historySource : scanner ? "tradingview" : "nenhuma";

  // Sem bundle Yahoo mas com velas (Nasdaq) -> sintetiza um bundle compatível.
  const effectiveBundle: ChartBundle | null = bundle && candles
    ? { ...bundle, candles, interval, range }
    : candles && candles.length > 20
      ? {
          meta: meta ?? {
            symbol,
            currency: String(scanner?.currency ?? currencyHint ?? "USD"),
            exchangeName: String(scanner?.exchange ?? ""),
            fullExchangeName: String(scanner?.exchange ?? ""),
            instrumentType: String(scanner?.type ?? "EQUITY").toUpperCase(),
            regularMarketPrice: price,
            previousClose: price / (1 + changePct / 100 || 1),
            regularMarketTime: Math.floor(Date.now() / 1000),
            fiftyTwoWeekHigh: num(scanner?.price_52_week_high) ?? undefined,
            fiftyTwoWeekLow: num(scanner?.price_52_week_low) ?? undefined,
            longName: String(scanner?.description ?? symbol),
            shortName: String(scanner?.name ?? symbol),
          },
          candles,
          interval,
          range,
          fetchedAt: Date.now(),
        }
      : null;

  return {
    symbol,
    candles,
    bundle: effectiveBundle,
    scanner,
    meta,
    source,
    historySource,
    currency: meta?.currency ?? String(scanner?.currency ?? currencyHint ?? ""),
    range,
    interval,
    notes,
  };
}
