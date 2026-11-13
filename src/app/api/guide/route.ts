import { NextResponse } from "next/server";
import { getCandles } from "@/lib/candles";
import { fetchTradingView } from "@/lib/providers/tradingview";
import { fetchPeers } from "@/lib/peers";
import { buildGuideAnalysis } from "@/lib/guide";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: "Indica um símbolo." }, { status: 400 });
  const [cr, tv] = await Promise.all([getCandles(symbol, "2y"), fetchTradingView(symbol).catch(() => null)]);
  if (!cr.candles.length) return NextResponse.json({ error: "Sem velas disponíveis para este símbolo." }, { status: 404 });
  const price = num(tv?.close) ?? cr.candles[cr.candles.length - 1].c;
  const currency = String(tv?.currency ?? cr.meta?.currency ?? "EUR");
  const peers = await fetchPeers(tv?.__tv ?? null, tv?.industry ? String(tv.industry) : null, tv?.sector ? String(tv.sector) : null, tv?.country ? String(tv.country) : null).catch(() => []);
  const guide = buildGuideAnalysis({
    symbol, name: String(tv?.description ?? cr.meta?.longName ?? cr.meta?.shortName ?? symbol), price, currency,
    candles: cr.candles,
    fundamentals: { per: num(tv?.price_earnings_ttm), pbv: num(tv?.price_book_fq), roe: num(tv?.return_on_equity), dy: num(tv?.dividends_yield), payout: num(tv?.dividend_payout_ratio_ttm) },
    peers, sector: tv?.sector ? String(tv.sector) : null,
  });
  return NextResponse.json({ symbol, price, currency, candleSource: cr.source, guide });
}
