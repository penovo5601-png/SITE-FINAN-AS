import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { chartReports } from "@/db/schema";
import { analyzeChartImage } from "@/lib/chart-image";
import { analyzeFromScanner, analyzeStock } from "@/lib/engine";
import { COUNTRY_CURRENCY, getMarketData } from "@/lib/market-data";
import { ensureSeeded, getTicker, isDbAvailable } from "@/lib/universe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Pedido inválido. Envia um formulário multipart com o campo 'image'." }, { status: 400 });
  }

  const file = form.get("image");
  const symbolRaw = String(form.get("symbol") ?? "").trim().toUpperCase();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhuma imagem recebida (campo 'image')." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `Imagem demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo 12 MB.` }, { status: 413 });
  }
  if (!/image\/(png|jpeg|jpg|webp|gif|bmp|tiff)/i.test(file.type || "")) {
    return NextResponse.json({ error: `Formato não suportado: ${file.type || "desconhecido"}. Usa PNG, JPG, WEBP, GIF ou BMP.` }, { status: 415 });
  }

  await ensureSeeded();
  const buf = Buffer.from(await file.arrayBuffer());

  let report;
  try {
    report = await analyzeChartImage(buf, file.name);
  } catch (err) {
    return NextResponse.json({ error: `Falha ao descodificar a imagem: ${String(err)}` }, { status: 422 });
  }

  // Combina com dados reais quando o utilizador indica o símbolo.
  let live = null as null | {
    symbol: string;
    name: string;
    verdict: string;
    verdictLabel: string;
    score: number;
    confidence: number;
    probabilityUp: number;
    price: number;
    currency: string;
    changePct: number;
    rsi14: number | null;
    adx14: number | null;
    macdHist: number | null;
    sma50: number | null;
    sma200: number | null;
    summary: string;
    targets: { target1: number; target2: number; stop: number };
  };
  let combined: null | { verdict: string; score: number; confidence: number; probabilityUp: number; summary: string } = null;
  let agreement: "concordam" | "divergem" | "parcial" | null = null;

  if (symbolRaw) {
    const info = await getTicker(symbolRaw);
    const target = info?.symbol ?? symbolRaw;
    const md = await getMarketData(
      target,
      "2y",
      "1d",
      info?.countryCode ? COUNTRY_CURRENCY[info.countryCode] ?? null : null,
    );
    const bundle = md.bundle;
    const metaInfo = {
      name: info?.name,
      exchange: info?.exchange ?? undefined,
      market: info?.market ?? undefined,
      sector: info?.sector ?? "",
    };
    const a =
      md.candles && md.candles.length >= 40 && bundle
        ? analyzeStock(bundle, { ...metaInfo, scanner: md.scanner, historySource: md.historySource, sourceNotes: md.notes })
        : analyzeFromScanner(
            {
              symbol: md.symbol,
              scanner: md.scanner,
              currency: md.currency,
              range: "2y",
              interval: "1d",
              historySource: md.historySource,
              notes: md.notes,
            },
            metaInfo,
          );
    if (a) {
      live = {
        symbol: a.symbol,
        name: a.name,
        verdict: a.verdict,
        verdictLabel: a.verdictLabel,
        score: a.score,
        confidence: a.confidence,
        probabilityUp: a.probabilityUp,
        price: a.price,
        currency: a.currency,
        changePct: a.changePct,
        rsi14: a.indicators.rsi14,
        adx14: a.indicators.adx14,
        macdHist: a.indicators.macdHist,
        sma50: a.indicators.sma50,
        sma200: a.indicators.sma200,
        summary: a.summary,
        targets: { target1: a.plan.target1, target2: a.plan.target2, stop: a.plan.stop },
      };
      const imgW = 0.45;
      const liveW = 0.55;
      const score = Math.round((report.score * imgW + a.score * liveW) * 10) / 10;
      const verdict = score >= 12 ? "SUBIR" : score <= -12 ? "DESCER" : "NEUTRO";
      const confidence = Math.round(
        Math.min(96, (report.confidence * imgW + a.confidence * liveW) + (Math.sign(report.score) === Math.sign(a.score) && report.score !== 0 ? 6 : -8)),
      );
      agreement =
        report.verdict === a.verdict
          ? "concordam"
          : report.verdict === "NEUTRO" || a.verdict === "NEUTRO"
            ? "parcial"
            : "divergem";
      combined = {
        verdict,
        score,
        confidence,
        probabilityUp: Math.round((report.probabilityUp * imgW + a.probabilityUp * liveW)),
        summary:
          `Leitura combinada (imagem ${Math.round(imgW * 100)}% + dados reais ${Math.round(liveW * 100)}%): ` +
          (agreement === "concordam"
            ? `as duas fontes CONCORDAM numa expectativa de ${verdict === "SUBIR" ? "subida" : verdict === "DESCER" ? "descida" : "lateralização"}. `
            : agreement === "divergem"
              ? `as duas fontes DIVERGEM — a imagem sugere "${report.verdictLabel}" enquanto os dados reais sugerem "${a.verdictLabel}". Nestes casos o peso maior vai para os dados reais. `
              : `as fontes estão parcialmente alinhadas. `) +
          `Pontuação final ${score > 0 ? "+" : ""}${score.toFixed(1)}/100, confiança ${confidence}%, probabilidade de subida ${combinedProb(report.probabilityUp, a.probabilityUp)}%.`,
      };
      combined.probabilityUp = combinedProb(report.probabilityUp, a.probabilityUp);
    }
  }

  try {
    await db.insert(chartReports).values({
      symbol: live?.symbol ?? symbolRaw ?? null,
      name: live?.name ?? null,
      fileName: file.name || null,
      bytes: file.size,
      verdict: combined?.verdict ?? report.verdict,
      score: combined?.score ?? report.score,
      confidence: combined?.confidence ?? report.confidence,
      headline: report.headline,
      metrics: report.metrics as never,
      signals: report.signals as never,
      notes: [...report.notes, ...report.qualityWarnings] as never,
    });
  } catch (err) {
    console.error("[chart-analysis] falha ao gravar relatório:", err);
  }

  return NextResponse.json({ report, live, combined, agreement });
}

function combinedProb(a: number, b: number) {
  return Math.round(a * 0.45 + b * 0.55);
}

export async function GET() {
  await ensureSeeded();
  if (!isDbAvailable()) return NextResponse.json({ count: 0, reports: [], database: "índice em memória" });
  try {
  const rows = await db
    .select({
      id: chartReports.id,
      symbol: chartReports.symbol,
      name: chartReports.name,
      verdict: chartReports.verdict,
      score: chartReports.score,
      confidence: chartReports.confidence,
      headline: chartReports.headline,
      bytes: chartReports.bytes,
      createdAt: chartReports.createdAt,
    })
    .from(chartReports)
    .orderBy(desc(chartReports.id))
    .limit(50);
  return NextResponse.json({ count: rows.length, reports: rows });
  } catch {
    return NextResponse.json({ count: 0, reports: [], database: "indisponível" });
  }
}
