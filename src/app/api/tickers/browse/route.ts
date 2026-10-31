import { NextResponse } from "next/server";
import { browseTickers, ensureSeeded, listSectors, marketStats } from "@/lib/universe";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  await ensureSeeded();
  const mode = url.searchParams.get("mode") ?? "browse";
  try {
    if (mode === "markets") {
      const markets = await marketStats();
      const sectors = await listSectors();
      const total = markets.reduce((a, b) => a + b.count, 0);
      return NextResponse.json({ total, markets, sectors });
    }
    const { rows, total } = await browseTickers({
      market: url.searchParams.get("market") ?? undefined,
      sector: url.searchParams.get("sector") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      offset: Number(url.searchParams.get("offset") ?? 0),
      limit: Number(url.searchParams.get("limit") ?? 40),
    });
    return NextResponse.json({
      total,
      rows: rows.map((r) => ({
        symbol: r.symbol,
        name: r.name,
        exchange: r.exchange ?? "",
        market: r.market ?? "",
        countryCode: r.countryCode ?? "",
        sector: r.sector ?? "",
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err), rows: [], total: 0 }, { status: 500 });
  }
}
