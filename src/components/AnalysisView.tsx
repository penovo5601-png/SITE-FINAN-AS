"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { StockAnalysis } from "@/lib/engine";
import CandleChart from "./CandleChart";
import ConfluencePanel from "./ConfluencePanel";
import StockNews from "./StockNews";
import ScenarioPanel from "./ScenarioPanel";
import type { ScenarioResult } from "@/lib/scenarios";
import type { NewsImpact } from "@/lib/news-impact";
import { Meter, ScoreDial, SectionTitle, Stat, VerdictBadge, type Verdict } from "./ui";

const RANGES = [
  { value: "6mo", label: "6M" },
  { value: "1y", label: "1A" },
  { value: "2y", label: "2A" },
  { value: "5y", label: "5A" },
];
const INTERVALS = [
  { value: "1d", label: "Diário" },
  { value: "1wk", label: "Semanal" },
];

const fmt = (n: number | null | undefined, d = 2) => (n == null || !isFinite(n) ? "—" : n.toFixed(d));
const pctf = (n: number | null | undefined, d = 2) => (n == null || !isFinite(n) ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(d)}%`);
const toneOf = (n: number | null | undefined) => (n == null ? undefined : n > 0 ? ("bull" as const) : n < 0 ? ("bear" as const) : undefined);

function fmtCap(v: number | null) {
  if (v == null || !isFinite(v)) return "—";
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)} Bbi`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)} Bi`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)} M`;
  return v.toFixed(0);
}

function recLabel(v: number | null) {
  if (v == null) return "—";
  const p = v * 100;
  if (p >= 50) return "Compra forte";
  if (p >= 15) return "Compra";
  if (p > -15) return "Neutro";
  if (p > -50) return "Venda";
  return "Venda forte";
}

function recTone(v: number | null) {
  if (v == null) return undefined;
  return v > 0.05 ? ("bull" as const) : v < -0.05 ? ("bear" as const) : undefined;
}

export default function AnalysisView() {
  const params = useParams<{ symbol: string }>();
  const router = useRouter();
  const symbol = decodeURIComponent(params?.symbol ?? "").toUpperCase();
  const [range, setRange] = useState("2y");
  const [interval, setInterval] = useState("1d");
  const [data, setData] = useState<StockAnalysis | null>(null);
  const [scenario, setScenario] = useState<ScenarioResult | null>(null);
  const [newsImpact, setNewsImpact] = useState<NewsImpact | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!symbol) return;
    setLoading(true);
    setData(null);
    setError(null);
    try {
      const res = await fetch(`/api/analysis?symbol=${encodeURIComponent(symbol)}&range=${range}&interval=${interval}`, { signal });
      const json = await res.json();
      if (signal?.aborted) return;
      if (!res.ok || !json.analysis) {
        setError(json.error ?? "Não foi possível obter a análise.");
        setData(null);
      } else {
        setData(json.analysis as StockAnalysis);
        setWarnings(json.warnings ?? []);
        setScenario(json.scenario ?? null);
        setNewsImpact(json.newsImpact ?? null);
      }
    } catch (e) {
      if (!signal?.aborted) setError(String(e));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [symbol, range, interval]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (loading && !data) {
    return (
      <>
      <div className="flex min-h-[30vh] flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-ink-700 border-t-bull-400" />
        <p className="tnum text-[13px] text-ink-400">
          A cruzar indicadores por famílias e a procurar notícias de {symbol}…
        </p>
      </div>
      <StockNews key={symbol} symbol={symbol} />
      </>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-5">
        <div className="mx-auto max-w-2xl py-12 text-center">
        <div className="panel p-8">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-bear-500/40 bg-bear-500/10 text-xl text-bear-400">!</div>
          <h1 className="mt-4 text-xl font-bold text-ink-100">Sem dados para {symbol}</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-300">{error}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button onClick={() => void load()} className="rounded-lg border border-ink-700 bg-ink-900 px-4 py-2 text-[13px] font-semibold text-ink-200 hover:border-ink-600">
              Tentar novamente
            </button>
            <Link href="/universo" className="rounded-lg bg-bull-500 px-4 py-2 text-[13px] font-bold text-ink-950 hover:brightness-110">
              Procurar no universo
            </Link>
          </div>
        </div>
        </div>
        <StockNews key={symbol} symbol={symbol} />
      </div>
    );
  }

  const a = data;
  const groups = ["Tendência", "Momento", "Volume", "Volatilidade", "Padrões"] as const;

  return (
    <div className="space-y-6">
      {/* ---------------- CABEÇALHO ---------------- */}
      <div className="rise flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="tnum text-3xl font-bold tracking-tight text-ink-100 sm:text-4xl">{a.symbol}</h1>
            <VerdictBadge verdict={a.verdict as Verdict} label={a.verdictLabel} size="lg" />
          </div>
          <p className="mt-1.5 text-[14px] text-ink-300">{a.name}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] uppercase tracking-wide text-ink-500">
            <span>{a.exchange || a.market || "—"}</span>
            {a.sector && <><span className="text-ink-700">·</span><span>{a.sector}</span></>}
            <span className="text-ink-700">·</span>
            <span>{a.currency}</span>
            <span className="text-ink-700">·</span>
            <span>{a.confluence?.observations ?? a.bars} barras observadas · {a.signals.length} sinais</span>
          </p>
        </div>
        <div className="text-right">
          <div className="tnum text-4xl font-bold leading-none text-ink-100">{fmt(a.price)}</div>
          <div className={`tnum mt-1.5 text-[14px] font-semibold ${a.changePct >= 0 ? "text-bull-400" : "text-bear-400"}`}>
            {a.change >= 0 ? "▲" : "▼"} {fmt(Math.abs(a.change))} ({pctf(a.changePct)})
          </div>
          <div className="tnum mt-1 text-[11px] text-ink-500">
            atualizado {new Date(a.updatedAt).toLocaleString("pt-PT")}
          </div>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-signal/35 bg-amber-signal/8 px-4 py-3">
          {warnings.map((w, i) => (
            <p key={i} className="text-[12px] leading-relaxed text-amber-signal">⚠ {w}</p>
          ))}
        </div>
      )}

      {/* ---------------- VEREDICTO ---------------- */}
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="panel flex flex-col items-center justify-center gap-4 p-6">
          <ScoreDial score={a.score} confidence={a.confidence} verdict={a.verdict as Verdict} />
          <div className="w-full">
            <div className="mb-1.5 flex justify-between text-[11px] uppercase tracking-wider text-ink-500">
              <span>viés de subida · estimativa</span>
              <span className="tnum font-bold text-ink-200">{a.probabilityUp}%</span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-ink-800">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-bear-500 via-amber-signal to-bull-500 transition-all duration-700"
                style={{ width: `${a.probabilityUp}%` }}
              />
              <div className="absolute inset-y-0 w-0.5 bg-ink-100/70" style={{ left: "50%" }} />
            </div>
            <p className="mt-3 text-center text-[11px] text-ink-500">
              Estimativa heurística, não probabilidade calibrada. Confiança indica convergência dos sinais.
              <br />Horizonte de referência: <span className="font-semibold text-ink-300">{a.horizon}</span>
            </p>
          </div>
        </div>

        <div className="panel p-6">
          <SectionTitle>Leitura do motor</SectionTitle>
          <p className="text-[14px] leading-relaxed text-ink-200">{a.summary}</p>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {a.timeframes.map((t) => (
              <div key={t.label} className="rounded-xl border border-ink-800 bg-ink-950/50 p-3.5">
                <div className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-500">{t.label}</div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className={`tnum text-xl font-bold ${t.verdict === "SUBIR" ? "text-bull-400" : t.verdict === "DESCER" ? "text-bear-400" : "text-amber-signal"}`}>
                    {t.score > 0 ? "+" : ""}{t.score.toFixed(1)}
                  </span>
                  <VerdictBadge verdict={t.verdict as Verdict} size="sm" />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {a.rationale.map((r, i) => (
              <div key={i} className="flex gap-2.5 rounded-lg border border-ink-800 bg-ink-950/40 px-3 py-2.5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-bull-400" />
                <span className="text-[12.3px] leading-relaxed text-ink-300">{r}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ConfluencePanel report={a.confluence} />
      <StockNews key={symbol} symbol={symbol} />

      {/* ---------------- GRÁFICO ---------------- */}
        <div className="panel p-5">
        {!a.hasHistory && (
          <div className="mb-4 rounded-xl border border-amber-signal/40 bg-amber-signal/8 px-4 py-3">
            <p className="text-[12.8px] font-semibold text-amber-signal">
              Gráfico indisponível nesta consulta — o fornecedor de velas está a limitar pedidos.
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-300">
              A análise fica limitada aos indicadores que a fonte disponibilizou: foi construída com {a.signals.length} indicadores calculados pelo
              scanner TradingView (RSI, ADX, médias 10/20/30/50/100/200, MACD, Bollinger, Estocástico, CCI, Williams %R,
              ATR, volume relativo, pivôs e performance). Carrega em “Recalcular” para tentar novamente o histórico de velas.
            </p>
          </div>
        )}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionTitle>Gráfico técnico</SectionTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-ink-700 bg-ink-950/70 p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRange(r.value)}
                  className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition ${range === r.value ? "bg-ink-700 text-ink-100" : "text-ink-400 hover:text-ink-200"}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg border border-ink-700 bg-ink-950/70 p-0.5">
              {INTERVALS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setInterval(r.value)}
                  className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition ${interval === r.value ? "bg-ink-700 text-ink-100" : "text-ink-400 hover:text-ink-200"}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <Link
              href={`/grafico?symbol=${encodeURIComponent(a.symbol)}`}
              className="rounded-lg border border-cyan-signal/40 bg-cyan-signal/10 px-3 py-1.5 text-[11.5px] font-semibold text-cyan-signal transition hover:bg-cyan-signal/18"
            >
              Analisar foto deste gráfico →
            </Link>
          </div>
        </div>
        {a.hasHistory && a.candles.length > 0 ? (
          <CandleChart
            candles={a.candles}
            sma20={a.series.sma20}
            sma50={a.series.sma50}
            sma200={a.series.sma200}
            bbUpper={a.series.bbUpper}
            bbLower={a.series.bbLower}
            rsi={a.series.rsi14}
            levels={a.levels}
            currency={a.currency}
          />
        ) : (
          <div className="grid h-[220px] place-items-center rounded-xl border border-dashed border-ink-700 bg-ink-950/40 text-center">
            <div>
              <div className="tnum text-[13px] text-ink-400">Sem velas para desenhar</div>
              <div className="mt-1 text-[11.5px] text-ink-500">fonte do histórico: {a.historySource || "nenhuma"}</div>
            </div>
          </div>
        )}
      </div>

      {a.fundamentals && (
        <div className="panel p-6">
          <SectionTitle
            right={
              a.fundamentals.tvSymbol ? (
                <span className="tnum text-[11px] text-ink-500">fonte: {a.fundamentals.tvSymbol}</span>
              ) : null
            }
          >
            Contexto fundamental e consenso técnico
          </SectionTitle>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
            <Stat label="Cap. bolsista" value={a.fundamentals.marketCap ? fmtCap(a.fundamentals.marketCap) : "—"} />
            <Stat label="P/E (TTM)" value={fmt(a.fundamentals.pe, 1)} tone={(a.fundamentals.pe ?? 100) < 15 ? "bull" : (a.fundamentals.pe ?? 0) < 0 ? "bear" : undefined} />
            <Stat label="Dividendo" value={a.fundamentals.dividendYield != null ? `${a.fundamentals.dividendYield.toFixed(2)}%` : "—"} />
            <Stat label="Beta (1 ano)" value={fmt(a.fundamentals.beta, 2)} tone={(a.fundamentals.beta ?? 1) > 1.3 ? "bear" : undefined} />
            <Stat label="P/Book" value={fmt(a.fundamentals.priceBook, 2)} />
            <Stat label="P/Sales" value={fmt(a.fundamentals.priceSales, 2)} />
            <Stat label="EPS (TTM)" value={fmt(a.fundamentals.eps, 2)} />
            <Stat label="ROE" value={a.fundamentals.roe != null ? `${a.fundamentals.roe.toFixed(1)}%` : "—"} tone={(a.fundamentals.roe ?? 0) > 12 ? "bull" : undefined} />
            <Stat label="Vol. semanal" value={a.fundamentals.volatilityWeek != null ? `${a.fundamentals.volatilityWeek.toFixed(2)}%` : "—"} />
            <Stat label="Vol. mensal" value={a.fundamentals.volatilityMonth != null ? `${a.fundamentals.volatilityMonth.toFixed(2)}%` : "—"} />
            <Stat label="Consenso diário" value={recLabel(a.fundamentals.tvRecommendAll)} tone={recTone(a.fundamentals.tvRecommendAll)} />
            <Stat label="Consenso semanal" value={recLabel(a.fundamentals.tvRecommendWeekly)} tone={recTone(a.fundamentals.tvRecommendWeekly)} />
          </div>
          {a.fundamentals.industry && (
            <p className="mt-3 text-[12px] text-ink-400">
              Indústria: <span className="text-ink-200">{a.fundamentals.industry}</span>
              {a.fundamentals.nextEarnings && <> · Próximos resultados: <span className="tnum text-ink-200">{a.fundamentals.nextEarnings.slice(0, 10)}</span></>}
            </p>
          )}
        </div>
      )}

      {/* ---------------- PLANO ---------------- */}
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="panel p-6">
          <SectionTitle>Plano de operação sugerido</SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Entrada" value={fmt(a.plan.entry)} sub={a.currency} />
            <Stat label="Alvo 1" value={fmt(a.plan.target1)} tone={a.verdict === "DESCER" ? "bear" : "bull"} sub={pctf(((a.plan.target1 - a.plan.entry) / a.plan.entry) * 100)} />
            <Stat label="Alvo 2" value={fmt(a.plan.target2)} tone={a.verdict === "DESCER" ? "bear" : "bull"} sub={pctf(a.plan.upsidePct)} />
            <Stat label="Stop" value={fmt(a.plan.stop)} tone={a.verdict === "DESCER" ? "bull" : "bear"} sub={pctf(a.plan.downsidePct)} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-ink-800 bg-ink-950/50 px-4 py-3">
              <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-500">Rácio risco/recompensa</div>
              <div className={`tnum mt-1 text-2xl font-bold ${(a.plan.riskReward ?? 0) >= 2 ? "text-bull-400" : (a.plan.riskReward ?? 0) >= 1 ? "text-amber-signal" : "text-bear-400"}`}>
                {a.plan.riskReward ? `1 : ${a.plan.riskReward.toFixed(2)}` : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-ink-800 bg-ink-950/50 px-4 py-3">
              <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-500">Intervalo 52 semanas</div>
              <div className="tnum mt-1 text-[15px] font-bold text-ink-100">{fmt(a.low52)} — {fmt(a.high52)}</div>
              <div className="tnum mt-1 text-[11px] text-ink-400">{fmt(a.fromHigh, 1)}% do máx. · +{fmt(a.fromLow, 1)}% do mín.</div>
            </div>
          </div>
          {a.levels.length > 0 && (
            <>
              <SectionTitle right={null}>
                <span className="mt-5 block">Suportes e resistências</span>
              </SectionTitle>
              <div className="flex flex-wrap gap-2">
                {a.levels.map((l, i) => (
                  <span
                    key={i}
                    className={`tnum rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold ${
                      l.price < a.price
                        ? "border-bull-500/35 bg-bull-500/10 text-bull-300"
                        : "border-bear-500/35 bg-bear-500/10 text-bear-300"
                    }`}
                  >
                    {l.kind === "suporte" ? "S" : "R"} {fmt(l.price)} <span className="text-ink-500">·{l.touches}×</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="panel p-6">
          <SectionTitle>Riscos e avisos</SectionTitle>
          <ul className="space-y-2.5">
            {a.risks.map((r, i) => (
              <li key={i} className="flex gap-2.5 rounded-lg border border-bear-500/20 bg-bear-500/6 px-3 py-2.5">
                <span className="mt-0.5 shrink-0 text-bear-400">⚠</span>
                <span className="text-[12.3px] leading-relaxed text-ink-300">{r}</span>
              </li>
            ))}
          </ul>
          {a.patterns.length > 0 && (
            <>
              <h3 className="mb-3 mt-6 text-[13px] font-bold uppercase tracking-[0.16em] text-ink-400">Padrões detetados</h3>
              <ul className="space-y-2">
                {a.patterns.map((p, i) => (
                  <li key={i} className="flex gap-2.5 text-[12.3px] leading-relaxed text-ink-300">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-signal" />
                    {p}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* ---------------- CENÁRIOS / VALIDAÇÃO ---------------- */}
      {scenario && <ScenarioPanel scenario={scenario} newsImpact={newsImpact} currency={a.currency} />}

      {/* ---------------- SINAIS ---------------- */}
      <div className="panel p-6">
        <SectionTitle right={<span className="tnum text-[11px] text-ink-500">{a.signals.length} sinais ponderados</span>}>
          Sinais que compõem a pontuação
        </SectionTitle>
        <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => {
            const list = a.signals.filter((s) => s.group === g);
            if (!list.length) return null;
            return (
              <div key={g}>
                <h3 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-400">
                  {g}
                  <span className="h-px flex-1 bg-ink-800" />
                </h3>
                <div className="space-y-4">
                  {list.map((s) => (
                    <div key={s.id}>
                      <Meter value={s.bias} label={s.name} />
                      <div className="tnum mt-1 text-[10.5px] text-ink-500">
                        {s.value} · peso {(s.weight * 100).toFixed(0)}%
                      </div>
                      <div className="mt-1 text-[11.5px] leading-relaxed text-ink-400">{s.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------------- INDICADORES ---------------- */}
      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="panel p-6">
          <SectionTitle>Tabela de indicadores</SectionTitle>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {[
              ["RSI (14)", fmt(a.indicators.rsi14, 1), (a.indicators.rsi14 ?? 50) >= 70 ? "bear" : (a.indicators.rsi14 ?? 50) <= 30 ? "bull" : undefined],
              ["RSI (7)", fmt(a.indicators.rsi7, 1), undefined],
              ["MACD", fmt(a.indicators.macd, 3), toneOf(a.indicators.macdHist)],
              ["MACD sinal", fmt(a.indicators.macdSignal, 3), undefined],
              ["MACD hist.", fmt(a.indicators.macdHist, 4), toneOf(a.indicators.macdHist)],
              ["SMA 20", fmt(a.indicators.sma20), toneOf(a.price - (a.indicators.sma20 ?? a.price))],
              ["SMA 50", fmt(a.indicators.sma50), toneOf(a.price - (a.indicators.sma50 ?? a.price))],
              ["SMA 200", fmt(a.indicators.sma200), toneOf(a.price - (a.indicators.sma200 ?? a.price))],
              ["EMA 9", fmt(a.indicators.ema9), undefined],
              ["EMA 21", fmt(a.indicators.ema21), undefined],
              ["ADX (14)", fmt(a.indicators.adx14, 1), (a.indicators.adx14 ?? 0) >= 25 ? "bull" : undefined],
              ["+DI / −DI", `${fmt(a.indicators.plusDI, 1)} / ${fmt(a.indicators.minusDI, 1)}`, toneOf((a.indicators.plusDI ?? 0) - (a.indicators.minusDI ?? 0))],
              ["Estocástico %K", fmt(a.indicators.stochK, 1), undefined],
              ["Estocástico %D", fmt(a.indicators.stochD, 1), undefined],
              ["Williams %R", fmt(a.indicators.williamsR, 1), undefined],
              ["CCI (20)", fmt(a.indicators.cci20, 0), toneOf(a.indicators.cci20)],
              ["MFI (14)", fmt(a.indicators.mfi14, 1), undefined],
              ["ATR (14)", fmt(a.indicators.atr14), undefined],
              ["ATR %", `${fmt(a.indicators.atrPct, 2)}%`, undefined],
              ["Vol. anualizada", `${fmt(a.indicators.volatility30, 1)}%`, undefined],
              ["%B Bollinger", fmt(a.indicators.percentB, 2), undefined],
              ["Largura bandas", `${fmt((a.indicators.bandwidth ?? 0) * 100, 1)}%`, undefined],
              ["ROC (12)", pctf(a.indicators.roc12), toneOf(a.indicators.roc12)],
              ["ROC longo", pctf(a.indicators.roc60), toneOf(a.indicators.roc60)],
              ["Inclinação 20s", `${fmt(a.indicators.slope20, 3)}%/s`, toneOf(a.indicators.slope20)],
              ["Inclinação 60s", `${fmt(a.indicators.slope60, 3)}%/s`, toneOf(a.indicators.slope60)],
              ["R² tendência", fmt(a.indicators.trendR2, 2), undefined],
              ["Vol. relativo", `${fmt(a.indicators.volumeRatio, 2)}×`, undefined],
              ["Volume médio 20s", a.indicators.avgVolume20 ? `${(a.indicators.avgVolume20 / 1e6).toFixed(2)}M` : "—", undefined],
              ["OBV (inclinação)", a.indicators.obvSlope == null ? "—" : a.indicators.obvSlope > 0 ? "acumulação" : "distribuição", toneOf(a.indicators.obvSlope)],
              ["Máx. 52 sem.", fmt(a.high52), undefined],
              ["Mín. 52 sem.", fmt(a.low52), undefined],
            ].map(([label, value, tone]) => (
              <div key={String(label)} className="rounded-lg border border-ink-800 bg-ink-950/50 px-3 py-2.5">
                <div className="truncate text-[10px] font-medium uppercase tracking-[0.1em] text-ink-500">{label}</div>
                <div className={`tnum mt-1 text-[14px] font-bold ${tone === "bull" ? "text-bull-400" : tone === "bear" ? "text-bear-400" : "text-ink-100"}`}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-6">
          <SectionTitle>Rentabilidade</SectionTitle>
          <div className="space-y-2.5">
            {[
              ["1 sessão", a.performance.d1],
              ["1 semana", a.performance.w1],
              ["1 mês", a.performance.m1],
              ["3 meses", a.performance.m3],
              ["6 meses", a.performance.m6],
              ["1 ano", a.performance.y1],
            ].map(([label, value]) => {
              const v = value as number | null;
              return (
                <div key={String(label)} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-[12px] text-ink-400">{label}</span>
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-ink-800">
                    <div className="absolute left-1/2 top-0 h-full w-px bg-ink-600" />
                    {v != null && (
                      <div
                        className="absolute top-0 h-full rounded-full"
                        style={{
                          background: v >= 0 ? "#12b76a" : "#ef4056",
                          left: v >= 0 ? "50%" : `${50 - Math.min(50, Math.abs(v) / 1.6)}%`,
                          width: `${Math.min(50, Math.abs(v) / 1.6)}%`,
                        }}
                      />
                    )}
                  </div>
                  <span className={`tnum w-20 shrink-0 text-right text-[12.5px] font-bold ${v == null ? "text-ink-500" : v >= 0 ? "text-bull-400" : "text-bear-400"}`}>
                    {pctf(v)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-6 rounded-xl border border-ink-800 bg-ink-950/50 p-4">
            <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-500">Drawdown máximo (1 ano)</div>
            <div className="tnum mt-1 text-2xl font-bold text-bear-400">{fmt(a.indicators.maxDrawdown, 1)}%</div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-400">
              Maior queda desde um topo anterior. Mede o pior cenário histórico recente deste título.
            </p>
          </div>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <div className="rounded-xl border border-ink-800 bg-ink-950/50 px-4 py-3">
              <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-500">Sessão (mín–máx)</div>
              <div className="tnum mt-1 text-[14px] font-bold text-ink-100">{fmt(a.dayRange[0])} — {fmt(a.dayRange[1])}</div>
            </div>
            <div className="rounded-xl border border-ink-800 bg-ink-950/50 px-4 py-3">
              <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-500">Fecho anterior</div>
              <div className="tnum mt-1 text-[14px] font-bold text-ink-100">{fmt(a.previousClose)}</div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2.5">
            <button
              onClick={() => router.push(`/grafico?symbol=${encodeURIComponent(a.symbol)}`)}
              className="flex-1 rounded-xl border border-cyan-signal/40 bg-cyan-signal/10 px-4 py-2.5 text-[12.5px] font-bold text-cyan-signal transition hover:bg-cyan-signal/18"
            >
              📷 Analisar foto do gráfico
            </button>
            <button
              onClick={() => void load()}
              className="rounded-xl border border-ink-700 bg-ink-900 px-4 py-2.5 text-[12.5px] font-semibold text-ink-200 transition hover:border-ink-600"
            >
              ↻ Recalcular
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
