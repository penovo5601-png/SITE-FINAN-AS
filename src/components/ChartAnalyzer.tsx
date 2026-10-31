"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { ChartImageReport } from "@/lib/chart-image";
import { Meter, ScoreDial, SectionTitle, Stat, VerdictBadge, type Verdict } from "./ui";
import SearchBox from "./SearchBox";

type Live = {
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

type Combined = { verdict: string; score: number; confidence: number; probabilityUp: number; summary: string };
type HistoryItem = {
  id: number;
  symbol: string | null;
  name: string | null;
  verdict: string;
  score: number;
  confidence: number;
  headline: string;
  bytes: number | null;
  createdAt: string | Date | null;
};

function ReconstructedLine({ points }: { points: { x: number; y: number }[] }) {
  if (points.length < 3) return null;
  const W = 640;
  const H = 150;
  const max = Math.max(...points.map((p) => p.y));
  const min = Math.min(...points.map((p) => p.y));
  const span = Math.max(0.0001, max - min);
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * W;
      const y = H - ((p.y - min) / span) * (H - 12) - 6;
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join("");
  const up = points[points.length - 1].y >= points[0].y;
  const color = up ? "#12b76a" : "#ef4056";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[150px] w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="reconFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="#1b2338" strokeWidth="1" />
      ))}
      <path d={`${d}L${W},${H}L0,${H}Z`} fill="url(#reconFill)" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Analyzer() {
  const sp = useSearchParams();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [symbol, setSymbol] = useState(sp.get("symbol") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ChartImageReport | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [combined, setCombined] = useState<Combined | null>(null);
  const [agreement, setAgreement] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(() => {
    fetch("/api/chart-analysis")
      .then((r) => r.json())
      .then((j: { reports?: HistoryItem[] }) => setHistory(j.reports ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // colar imagem com Ctrl+V
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const f = item?.getAsFile();
      if (f) { e.preventDefault(); accept(f); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function accept(f: File) {
    if (!f.type.startsWith("image/")) {
      setError("Esse ficheiro não é uma imagem.");
      return;
    }
    setError(null);
    setReport(null);
    setLive(null);
    setCombined(null);
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p);
      return url;
    });
  }

  async function submit() {
    if (!file) {
      setError("Escolhe primeiro uma imagem do gráfico.");
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("image", file);
    if (symbol.trim()) fd.append("symbol", symbol.trim().toUpperCase());
    try {
      const res = await fetch("/api/chart-analysis", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Falha na análise.");
      } else {
        setReport(json.report as ChartImageReport);
        setLive(json.live ?? null);
        setCombined(json.combined ?? null);
        setAgreement(json.agreement ?? null);
        loadHistory();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const finalVerdict = (combined?.verdict ?? report?.verdict ?? "NEUTRO") as Verdict;
  const finalScore = combined?.score ?? report?.score ?? 0;
  const finalConf = combined?.confidence ?? report?.confidence ?? 0;
  const finalProb = combined?.probabilityUp ?? report?.probabilityUp ?? 50;

  return (
    <div className="space-y-6">
      <div className="rise">
        <h1 className="text-3xl font-bold tracking-tight text-ink-100 sm:text-4xl">Análise de fotografia de gráfico</h1>
        <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-ink-300">
          Envia uma captura ou foto do gráfico (TradingView, banco, corretora, telemóvel). O motor reconstrói a série de
          preços píxel a píxel e devolve a expectativa — sobe ou desce — com pontuação, confiança e probabilidade.
          Se indicares também o símbolo, cruzo com os dados reais e digo-te se as duas leituras batem certo.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        {/* -------- UPLOAD -------- */}
        <div className="panel p-5">
          <SectionTitle>1 · Imagem</SectionTitle>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) accept(f);
            }}
            onClick={() => inputRef.current?.click()}
            className={`relative flex min-h-[260px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition ${
              dragging ? "border-bull-400 bg-bull-500/10" : "border-ink-700 bg-ink-950/50 hover:border-ink-600"
            }`}
          >
            {preview ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Pré-visualização do gráfico" className="max-h-[380px] w-full object-contain" />
                <span className="absolute bottom-2 right-2 rounded-md bg-ink-950/85 px-2 py-1 text-[10.5px] font-medium text-ink-300">
                  clica para trocar
                </span>
              </>
            ) : (
              <div className="px-6 py-10 text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-ink-700 bg-ink-900 text-cyan-signal">
                  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8h4l2-3h6l2 3h4v12H3z" />
                    <circle cx="12" cy="14" r="3.6" />
                  </svg>
                </div>
                <p className="mt-4 text-[13.5px] font-semibold text-ink-200">Arrasta para aqui ou clica para escolher</p>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-500">
                  PNG · JPG · WEBP · GIF · BMP — até 12 MB<br />Também podes colar com <span className="tnum text-ink-300">Ctrl/⌘ + V</span>
                </p>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) accept(f);
              }}
            />
          </div>

          <div className="mt-5">
            <SectionTitle>2 · Símbolo (opcional, melhora muito a leitura)</SectionTitle>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <div className="flex-1">
                <SearchBox
                  placeholder="Ex.: BCP.LS, AAPL, TSLA, PETR4.SA"
                  onSelect={(h) => setSymbol(h.symbol)}
                />
              </div>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="OU escreve o ticker"
                className="tnum w-full rounded-xl border border-ink-700 bg-ink-900/90 px-3 py-2.5 text-[13px] font-bold text-ink-100 placeholder:font-normal placeholder:text-ink-600 focus:border-bull-500/60 focus:outline-none sm:w-52"
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-bear-500/40 bg-bear-500/10 px-4 py-3 text-[12.5px] leading-relaxed text-bear-300">
              {error}
            </div>
          )}

          <button
            onClick={() => void submit()}
            disabled={busy || !file}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-bull-500 to-bull-600 px-5 py-3.5 text-[14px] font-bold text-ink-950 shadow-[0_12px_34px_-12px_rgba(18,183,106,0.95)] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-950/40 border-t-ink-950" />
                A analisar píxel a píxel…
              </>
            ) : (
              <>🔍 Analisar gráfico</>
            )}
          </button>

          <ul className="mt-5 space-y-1.5 text-[11.5px] leading-relaxed text-ink-500">
            <li>• Funciona melhor com velas verdes/vermelhas bem contrastadas e o gráfico direito (sem rotação).</li>
            <li>• Corta menus, teclados e margens: quanto maior o gráfico na imagem, melhor a reconstrução.</li>
            <li>• A escala de preços é normalizada (0–100) porque os números do eixo não são lidos por OCR.</li>
          </ul>
        </div>

        {/* -------- RESULTADO -------- */}
        <div className="space-y-5">
          {!report && !busy && (
            <div className="panel grid min-h-[420px] place-items-center p-8 text-center">
              <div>
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-ink-700 bg-ink-900 text-2xl">📈</div>
                <h3 className="mt-4 text-[16px] font-bold text-ink-100">À espera de uma imagem</h3>
                <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-relaxed text-ink-400">
                  Assim que enviares a foto, aqui aparece o veredicto (sobe/desce/lateral), a pontuação de −100 a +100,
                  a confiança, a probabilidade de subida, a série reconstruída e todos os sinais que sustentam a leitura.
                </p>
              </div>
            </div>
          )}

          {busy && !report && (
            <div className="panel grid min-h-[420px] place-items-center p-8">
              <div className="text-center">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-ink-700 border-t-cyan-signal" />
                <p className="mt-4 text-[13px] text-ink-400">A reconstruir a série e a pontuar os sinais…</p>
              </div>
            </div>
          )}

          {report && (
            <>
              <div className="panel rise p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <VerdictBadge verdict={finalVerdict} label={combined ? "Leitura combinada" : report.verdictLabel} size="lg" />
                    <h2 className="mt-3 text-[19px] font-bold leading-snug tracking-tight text-ink-100">{report.headline}</h2>
                    {symbol && (
                      <p className="tnum mt-1 text-[12px] text-ink-400">
                        símbolo indicado: {symbol.toUpperCase()}
                        {live ? ` · ${live.name} · ${live.price.toFixed(2)} ${live.currency}` : ""}
                      </p>
                    )}
                  </div>
                  <ScoreDial score={finalScore} confidence={finalConf} verdict={finalVerdict} size={146} />
                </div>

                <div className="mt-5">
                  <div className="mb-1.5 flex justify-between text-[11px] uppercase tracking-wider text-ink-500">
                    <span>probabilidade de subida estimada</span>
                    <span className="tnum font-bold text-ink-200">{finalProb}%</span>
                  </div>
                  <div className="relative h-2.5 overflow-hidden rounded-full bg-ink-800">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-bear-500 via-amber-signal to-bull-500 transition-all duration-700" style={{ width: `${finalProb}%` }} />
                    <div className="absolute inset-y-0 w-0.5 bg-ink-100/70" style={{ left: "50%" }} />
                  </div>
                </div>

                <p className="mt-5 text-[13.5px] leading-relaxed text-ink-200">{report.summary}</p>

                {combined && (
                  <div className={`mt-4 rounded-xl border px-4 py-3 text-[12.8px] leading-relaxed ${
                    agreement === "concordam"
                      ? "border-bull-500/35 bg-bull-500/8 text-bull-200"
                      : agreement === "divergem"
                        ? "border-amber-signal/40 bg-amber-signal/8 text-amber-signal"
                        : "border-ink-700 bg-ink-950/50 text-ink-300"
                  }`}>
                    <strong className="font-bold">
                      {agreement === "concordam" ? "✓ Imagem e dados reais concordam. " : agreement === "divergem" ? "⚠ Imagem e dados reais divergem. " : "◐ Concordância parcial. "}
                    </strong>
                    {combined.summary}
                  </div>
                )}
              </div>

              <div className="panel p-6">
                <SectionTitle right={<span className="tnum text-[11px] text-ink-500">{report.metrics.candleColumns} colunas reconstruídas</span>}>
                  Série reconstruída a partir da imagem
                </SectionTitle>
                <div className="overflow-hidden rounded-xl border border-ink-800 bg-ink-950/60 p-2">
                  <ReconstructedLine points={report.metrics.reconstructed} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <Stat label="Tendência global" value={`${report.metrics.trendSlopePct > 0 ? "+" : ""}${report.metrics.trendSlopePct.toFixed(1)}%`} tone={toneOf(report.metrics.trendSlopePct)} />
                  <Stat label="Momento recente" value={`${report.metrics.recentSlopePct > 0 ? "+" : ""}${report.metrics.recentSlopePct.toFixed(1)}%`} tone={toneOf(report.metrics.recentSlopePct)} />
                  <Stat label="R² da tendência" value={report.metrics.trendR2.toFixed(2)} sub={report.metrics.trendR2 > 0.7 ? "muito limpa" : report.metrics.trendR2 > 0.4 ? "moderada" : "ruidosa"} />
                  <Stat label="Posição no intervalo" value={`${(report.metrics.positionInRange * 100).toFixed(0)}%`} sub="último ponto" />
                  <Stat label="Velas verdes" value={`${(report.metrics.greenRatio * 100).toFixed(0)}%`} tone="bull" />
                  <Stat label="Velas vermelhas" value={`${(report.metrics.redRatio * 100).toFixed(0)}%`} tone="bear" />
                  <Stat label="Verdes no 1/3 final" value={`${(report.metrics.greenShareRecent * 100).toFixed(0)}%`} tone={report.metrics.greenShareRecent >= 0.5 ? "bull" : "bear"} />
                  <Stat label="Volatilidade residual" value={`${report.metrics.volatilityPct.toFixed(1)}%`} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-ink-500">
                  <span className="rounded-md border border-ink-800 bg-ink-950/60 px-2 py-1">tipo: {report.metrics.chartType}</span>
                  <span className="rounded-md border border-ink-800 bg-ink-950/60 px-2 py-1">{report.metrics.width}×{report.metrics.height}px</span>
                  <span className="rounded-md border border-ink-800 bg-ink-950/60 px-2 py-1">plotagem {report.metrics.plotArea.x1 - report.metrics.plotArea.x0}×{report.metrics.plotArea.y1 - report.metrics.plotArea.y0}px</span>
                  <span className="rounded-md border border-ink-800 bg-ink-950/60 px-2 py-1">cobertura de cor {(report.metrics.colorCoverage * 100).toFixed(1)}%</span>
                </div>
              </div>

              <div className="panel p-6">
                <SectionTitle>Sinais extraídos da imagem</SectionTitle>
                <div className="grid gap-5 md:grid-cols-2">
                  {report.signals.map((s) => (
                    <div key={s.id}>
                      <Meter value={s.bias} label={s.name} />
                      <div className="tnum mt-1 text-[10.5px] text-ink-500">{s.value} · peso {(s.weight * 100).toFixed(0)}%</div>
                      <div className="mt-1 text-[11.5px] leading-relaxed text-ink-400">{s.detail}</div>
                    </div>
                  ))}
                  {!report.signals.length && (
                    <p className="text-[12.5px] text-ink-500">Sem sinais suficientes para pontuar.</p>
                  )}
                </div>

                {report.metrics.levels.length > 0 && (
                  <div className="mt-6">
                    <h3 className="mb-2.5 text-[13px] font-bold uppercase tracking-[0.16em] text-ink-400">Níveis horizontais detetados</h3>
                    <div className="flex flex-wrap gap-2">
                      {report.metrics.levels.map((l, i) => (
                        <span key={i} className={`tnum rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold ${l.kind === "suporte" ? "border-bull-500/35 bg-bull-500/10 text-bull-300" : "border-bear-500/35 bg-bear-500/10 text-bear-300"}`}>
                          {l.kind === "suporte" ? "S" : "R"} {l.price.toFixed(0)} <span className="text-ink-500">·{l.touches}×</span>
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-ink-500">Escala normalizada 0–100 sobre a altura do gráfico.</p>
                  </div>
                )}
              </div>

              {live && (
                <div className="panel p-6">
                  <SectionTitle right={<Link href={`/acao/${encodeURIComponent(live.symbol)}`} className="text-[12px] font-medium text-bull-400 hover:text-bull-300">abrir análise completa →</Link>}>
                    Dados reais de {live.symbol}
                  </SectionTitle>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <Stat label="Preço" value={live.price.toFixed(2)} sub={live.currency} />
                    <Stat label="Variação" value={`${live.changePct > 0 ? "+" : ""}${live.changePct.toFixed(2)}%`} tone={toneOf(live.changePct)} />
                    <Stat label="Score dados reais" value={`${live.score > 0 ? "+" : ""}${live.score.toFixed(1)}`} tone={live.score > 0 ? "bull" : live.score < 0 ? "bear" : undefined} />
                    <Stat label="Prob. subida" value={`${live.probabilityUp}%`} />
                    <Stat label="RSI 14" value={live.rsi14?.toFixed(1) ?? "—"} />
                    <Stat label="ADX 14" value={live.adx14?.toFixed(1) ?? "—"} />
                    <Stat label="SMA 50" value={live.sma50?.toFixed(2) ?? "—"} />
                    <Stat label="SMA 200" value={live.sma200?.toFixed(2) ?? "—"} />
                  </div>
                  <p className="mt-4 text-[12.8px] leading-relaxed text-ink-300">{live.summary}</p>
                </div>
              )}

              {(report.qualityWarnings.length > 0 || report.risks.length > 0) && (
                <div className="panel p-6">
                  <SectionTitle>Limitações desta leitura</SectionTitle>
                  <ul className="space-y-2">
                    {[...report.qualityWarnings, ...report.risks].map((r, i) => (
                      <li key={i} className="flex gap-2.5 rounded-lg border border-amber-signal/25 bg-amber-signal/6 px-3 py-2.5">
                        <span className="mt-0.5 shrink-0 text-amber-signal">⚠</span>
                        <span className="text-[12.2px] leading-relaxed text-ink-300">{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {history.length > 0 && (
        <div className="panel overflow-hidden">
          <div className="border-b border-ink-800 px-5 py-3">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.16em] text-ink-400">
              Histórico de gráficos analisados ({history.length})
            </h2>
          </div>
          <ul className="divide-y divide-ink-850">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <VerdictBadge verdict={h.verdict as Verdict} size="sm" label={`${h.score > 0 ? "+" : ""}${h.score.toFixed(1)}`} />
                <span className="min-w-0 flex-1">
                  <span className="tnum block truncate text-[12.5px] font-bold text-ink-100">
                    {h.symbol ?? "sem símbolo"}
                    {h.name ? <span className="ml-2 font-sans text-[11.5px] font-normal text-ink-400">{h.name}</span> : null}
                  </span>
                  <span className="block truncate text-[11.5px] text-ink-500">{h.headline}</span>
                </span>
                <span className="tnum shrink-0 text-right text-[10.5px] text-ink-500">
                  {h.bytes ? `${(h.bytes / 1024).toFixed(0)} KB` : ""}
                  {h.createdAt ? <span className="block">{new Date(h.createdAt).toLocaleString("pt-PT")}</span> : null}
                </span>
                {h.symbol && (
                  <Link href={`/acao/${encodeURIComponent(h.symbol)}`} className="shrink-0 rounded-md border border-ink-700 px-2 py-1 text-[11px] font-semibold text-ink-300 hover:border-bull-500/50 hover:text-bull-300">
                    ver ação
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function toneOf(n: number | null | undefined) {
  return n == null ? undefined : n > 0 ? ("bull" as const) : n < 0 ? ("bear" as const) : undefined;
}

export default function ChartAnalyzer() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-ink-400">A carregar…</div>}>
      <Analyzer />
    </Suspense>
  );
}
