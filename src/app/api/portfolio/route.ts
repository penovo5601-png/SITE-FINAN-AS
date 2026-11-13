import { NextResponse } from "next/server";
import { buildAllPortfolios } from "@/lib/portfolio";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req: Request) {
  const budget = Number(new URL(req.url).searchParams.get("budget") ?? 100000);
  try { return NextResponse.json(await buildAllPortfolios(Number.isFinite(budget) ? budget : 100000)); }
  catch (e) { return NextResponse.json({ error: "Erro ao construir carteiras", details: String(e) }, { status: 500 }); }
}
