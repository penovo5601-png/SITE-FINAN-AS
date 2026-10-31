import { NextResponse } from "next/server";
import { fetchStockNews } from "@/lib/news";
import { ensureSeeded, getTicker } from "@/lib/universe";
import { RESEARCH_VERSION } from "@/lib/analyze-market";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9.\-]{0,23}$/.test(symbol)) {
    return NextResponse.json({ error: "Indica um símbolo de ação válido." }, { status: 400 });
  }
  await ensureSeeded();
  const ticker = await getTicker(symbol);
  const feed = await fetchStockNews({ symbol: ticker?.symbol ?? symbol, name: ticker?.name, countryCode: ticker?.countryCode }, url.searchParams.get("refresh") === "1");
  return NextResponse.json({ ...feed, version: RESEARCH_VERSION }, { headers: { "Cache-Control": "no-store" } });
}
