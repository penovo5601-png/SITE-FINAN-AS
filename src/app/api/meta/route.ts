import { NextResponse } from "next/server";
import { countTickers, ensureSeeded, featuredTickers, isDbAvailable, marketStats, recentAnalyses } from "@/lib/universe";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeeded();
  const [total, markets, featured, recent] = await Promise.all([
    countTickers(),
    marketStats(),
    featuredTickers(18),
    recentAnalyses(14),
  ]);
  return NextResponse.json({
    total,
    marketCount: markets.length,
    database: isDbAvailable() ? "postgresql" : "índice em memória",
    markets,
    featured: featured.map((f) => ({
      symbol: f.symbol,
      name: f.name,
      market: f.market ?? "",
      countryCode: f.countryCode ?? "",
      sector: f.sector ?? "",
    })),
    recent: recent.map((r) => ({
      id: r.id,
      symbol: r.symbol,
      name: r.name,
      verdict: r.verdict,
      score: r.score,
      confidence: r.confidence,
      price: r.price,
      currency: r.currency,
      createdAt: r.createdAt,
    })),
  });
}
