import { NextResponse } from "next/server";
import { fetchTradingViewBatch, num } from "@/lib/providers/tradingview";
import { fetchChart } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type QuoteLite = {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  currency: string;
  ok: boolean;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("symbols") ?? "";
  const symbols = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[\w.\-^=]{1,24}$/.test(s))
    .slice(0, 30);

  const tv = await fetchTradingViewBatch(symbols);
  const quotes: QuoteLite[] = [];

  for (const s of symbols) {
    const snap = tv.get(s);
    if (snap) {
      quotes.push({
        symbol: s,
        name: String(snap.description ?? snap.name ?? s),
        price: num(snap.close) ?? 0,
        changePct: num(snap.change) ?? 0,
        currency: String(snap.currency_code ?? ""),
        ok: true,
      });
      continue;
    }
    const bundle = await fetchChart(s, "5d", "1d");
    if (bundle) {
      const price = bundle.meta.regularMarketPrice;
      const prev = bundle.meta.previousClose || price;
      quotes.push({
        symbol: s,
        name: bundle.meta.shortName || bundle.meta.longName || s,
        price,
        changePct: prev ? ((price - prev) / prev) * 100 : 0,
        currency: bundle.meta.currency,
        ok: true,
      });
    } else {
      quotes.push({ symbol: s, name: s, price: 0, changePct: 0, currency: "", ok: false });
    }
  }

  return NextResponse.json({ quotes });
}
