import { NextResponse } from "next/server";
import { ensureSeeded, searchTickers } from "@/lib/universe";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 25), 60);
  await ensureSeeded();
  try {
    const rows = await searchTickers(q, limit);
    return NextResponse.json({
      count: rows.length,
      results: rows.map((r) => ({
        symbol: r.symbol,
        name: r.name,
        exchange: r.exchange ?? "",
        market: r.market ?? "",
        countryCode: r.countryCode ?? "",
        sector: r.sector ?? "",
      })),
    });
  } catch (err) {
    return NextResponse.json({ count: 0, results: [], error: String(err) }, { status: 500 });
  }
}
