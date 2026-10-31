"use client";

import { useState } from "react";
import type { ScenarioResult } from "@/lib/scenarios";
import type { NewsImpact } from "@/lib/news-impact";
import { SectionTitle } from "./ui";

const f = (n: number | null | undefined, d = 2) => (n == null || !isFinite(n) ? "—" : n.toFixed(d));
const sgn = (n: number) => (n > 0 ? "+" : "");

export default function ScenarioPanel({ scenario, newsImpact, currency }: { scenario: ScenarioResult; newsImpact: NewsImpact | null; currency: string }) {
  const [open, setOpen] = useState(true);
  const { monteCarlo: mc, backtest: bt, validation: v, final } = scenario;
  const gradeTone = v.grade === "Validação Forte" ? "border-bull-500/50 bg-bull-500/10 text-bull-300" : v.grade === "Validação Razoável" ? "border-amber-400/50 bg-amber-500/10 text-amber-300" : "border-bear-500/50 bg-bear-500/10 text-bear-300";
  const relTone = bt.reliability === "A" ? "text-bull-400" : bt.reliability === "B" ? "text-amber-300" : bt.reliability === "C" ? "text-bear-400" : "text-ink-400";

  return (
    <div className="space-y-6">
      {/* CENÁRIOS */}
      <div className="panel p-6">
        <SectionTitle right={<span className={`rounded-lg border px-3 py-1 text-[11px] font-bold ${gradeTone}`}>{v.grade} · {v.passed}/{v.total} · confiança {final.confidence}%</span>}>
          Previsão de cenários a {scenario.horizonDays} sessões (Monte Carlo com retornos reais)
        </SectionTitle>
        {scenario.dataQuality !== "OK" && (
          <div className={`mb-3 rounded-lg border p-3 text-[12px] ${scenario.dataQuality === "SEM_HISTORICO" ? "border-bear-500/40 bg-bear-500/10 text-ink-100" : "border-amber-400/40 bg-amber-500/10 text-ink-100"}`}>
            <strong>Qualidade dos dados: {scenario.dataQuality.replace("_", " ")}.</strong> {scenario.dataQualityNote}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          {scenario.scenarios.map((sc) => {
            const tone = sc.key === "BULL" ? "bull" : sc.key === "BEAR" ? "bear" : "amber";
            const dominant = sc.probability === Math.max(...scenario.scenarios.map((x) => x.probability));
            return (
              <div key={sc.key} className={`rounded-xl border p-4 ${dominant ? (tone === "bull" ? "border-bull-500/60 bg-bull-500/10" : tone === "bear" ? "border-bear-500/60 bg-bear-500/10" : "border-amber-400/60 bg-amber-500/10") : "border-ink-800 bg-ink-950/60"}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-[12px] font-bold ${tone === "bull" ? "text-bull-400" : tone === "bear" ? "text-bear-400" : "text-amber-300"}`}>{sc.name}</span>
                  {dominant && <span className="rounded bg-ink-100/10 px-1.5 py-0.5 text-[9px] font-bold text-ink-100">MAIS PROVÁVEL</span>}
                </div>
                <div className="tnum mt-2 flex items-baseline gap-2"><span className="text-3xl font-bold text-ink-100">{sc.probability}%</span><span className="text-[13px] font-semibold text-ink-300">{f(sc.targetPrice)} {currency} ({sgn(sc.targetPct)}{sc.targetPct}%)</span></div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-800"><div className={`h-full ${tone === "bull" ? "bg-bull-500" : tone === "bear" ? "bg-bear-500" : "bg-amber-400"}`} style={{ width: `${sc.probability}%` }} /></div>
                <div className="mt-3 text-[11.5px] text-ink-300"><strong className="text-ink-200">Gatilho:</strong> {sc.trigger}</div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink-400">{sc.narrative}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 p-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">Simulação Monte Carlo · {mc.paths.toLocaleString("pt-PT")} trajetórias</div>
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <div className="rounded-lg bg-ink-900 p-3"><div className="text-ink-400">Fecha acima do preço atual</div><div className="tnum text-xl font-bold text-ink-100">{mc.pUpEnd}%</div><div className="text-[10px] text-ink-500">só estatística: {mc.pUpEndNeutral}%</div></div>
              <div className="rounded-lg bg-ink-900 p-3"><div className="text-ink-400">Retorno esperado</div><div className={`tnum text-xl font-bold ${mc.expectedReturnPct >= 0 ? "text-bull-400" : "text-bear-400"}`}>{sgn(mc.expectedReturnPct)}{mc.expectedReturnPct}%</div></div>
              <div className="rounded-lg bg-ink-900 p-3"><div className="text-ink-400">Toca alvo ({f(mc.target)}) antes do stop</div><div className="tnum text-xl font-bold text-bull-400">{mc.pHitTargetFirst}%</div></div>
              <div className="rounded-lg bg-ink-900 p-3"><div className="text-ink-400">Toca stop ({f(mc.stop)}) antes do alvo</div><div className="tnum text-xl font-bold text-bear-400">{mc.pHitStopFirst}%</div></div>
            </div>
            <div className="tnum mt-3 flex justify-between text-[10px] text-ink-400"><span>P10 {f(mc.p10)}</span><span>P25 {f(mc.p25)}</span><span className="font-bold text-ink-100">Mediana {f(mc.p50)}</span><span>P75 {f(mc.p75)}</span><span>P90 {f(mc.p90)}</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-gradient-to-r from-bear-500 via-ink-600 to-bull-500" />
            <div className="tnum mt-2 text-[10px] text-ink-500">vol. diária {scenario.stats.dailyVolPct}% · anual {scenario.stats.annualVolPct}% · drawdown máx. {scenario.stats.maxDrawdownPct}% · {scenario.stats.bars} sessões</div>
          </div>

          <div className="rounded-xl border border-ink-800 bg-ink-950/60 p-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">Backtest walk-forward do modelo neste título</div>
            <div className="flex items-center gap-3"><span className={`text-4xl font-bold ${relTone}`}>{bt.reliability}</span><span className="text-[12px] text-ink-300">{bt.reliabilityLabel}</span></div>
            <div className="tnum mt-3 grid grid-cols-2 gap-2 text-[12px]">
              <div className="rounded-lg bg-ink-900 p-3"><div className="text-ink-400">Quando disse “SUBIR”</div><div className="text-lg font-bold text-ink-100">{bt.bullishAccuracy != null ? `${bt.bullishAccuracy}%` : "—"}</div><div className="text-[10px] text-ink-500">{bt.bullishHits}/{bt.bullishSamples} · retorno médio {bt.bullishAvgFwdPct != null ? `${sgn(bt.bullishAvgFwdPct)}${bt.bullishAvgFwdPct}%` : "—"}</div></div>
              <div className="rounded-lg bg-ink-900 p-3"><div className="text-ink-400">Quando disse “DESCER”</div><div className="text-lg font-bold text-ink-100">{bt.bearishAccuracy != null ? `${bt.bearishAccuracy}%` : "—"}</div><div className="text-[10px] text-ink-500">{bt.bearishHits}/{bt.bearishSamples} · retorno médio {bt.bearishAvgFwdPct != null ? `${sgn(bt.bearishAvgFwdPct)}${bt.bearishAvgFwdPct}%` : "—"}</div></div>
              <div className="rounded-lg bg-ink-900 p-3"><div className="text-ink-400">Acerto global</div><div className="text-lg font-bold text-ink-100">{bt.overallAccuracy != null ? `${bt.overallAccuracy}%` : "—"}</div><div className="text-[10px] text-ink-500">edge {bt.edgePct != null ? `${sgn(bt.edgePct)}${bt.edgePct} pts` : "—"}</div></div>
              <div className="rounded-lg bg-ink-900 p-3"><div className="text-ink-400">Janelas em alta (base)</div><div className="text-lg font-bold text-ink-100">{bt.baselineUpPct != null ? `${bt.baselineUpPct}%` : "—"}</div><div className="text-[10px] text-ink-500">{bt.samples} janelas testadas</div></div>
            </div>
          </div>
        </div>

        {/* CHECKLIST */}
        <div className="mt-5">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">Checklist de validação da decisão</div>
          <div className="grid gap-2 md:grid-cols-3">
            {v.checks.map((c) => (
              <div key={c.name} className={`flex gap-2 rounded-lg border p-3 text-[12px] ${c.passed ? "border-bull-500/30 bg-bull-500/5" : c.critical ? "border-bear-500/40 bg-bear-500/10" : "border-amber-400/30 bg-amber-500/5"}`}>
                <span className={c.passed ? "text-bull-400" : c.critical ? "text-bear-400" : "text-amber-300"}>{c.passed ? "✔" : "✖"}</span>
                <div><div className="font-semibold text-ink-100">{c.name}{c.critical && <span className="ml-1 text-[9px] text-ink-500">(crítica)</span>}</div><div className="text-[11px] text-ink-400">{c.detail}</div></div>
              </div>
            ))}
          </div>
          {v.contradictions.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-[12px]">
              <div className="font-bold text-amber-300">⚠ Contradições detetadas (reduzem a confiança)</div>
              <ul className="mt-1 list-inside list-disc text-ink-200">{v.contradictions.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </div>
          )}
        </div>

        {/* NOTÍCIAS COM IMPACTO */}
        {newsImpact && (
          <div className="mt-5 rounded-xl border border-ink-800 bg-ink-950/60 p-4 text-[12px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold uppercase tracking-[0.14em] text-ink-400 text-[11px]">Impacto das notícias no veredito</span>
              <span className={`tnum font-bold ${newsImpact.score >= 12 ? "text-bull-400" : newsImpact.score <= -12 ? "text-bear-400" : "text-ink-300"}`}>{newsImpact.label} · {sgn(newsImpact.score)}{newsImpact.score}</span>
            </div>
            <div className="mt-1 text-ink-400">Só notícias das últimas <strong className="text-ink-200">72h</strong> contam (≤24h 100% · ≤48h 75% · ≤72h 40%). {newsImpact.freshCount} com impacto · {newsImpact.staleCount} antigas ignoradas · ▲ {newsImpact.positive} positivas · ▼ {newsImpact.negative} negativas.</div>
            {newsImpact.articles.filter((a) => !a.isStale).slice(0, 5).map((a) => (
              <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-2 rounded-lg bg-ink-900 px-3 py-2 hover:bg-ink-800">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${a.sentiment === "POSITIVA" ? "bg-bull-500/15 text-bull-400" : a.sentiment === "NEGATIVA" ? "bg-bear-500/15 text-bear-400" : "bg-ink-800 text-ink-300"}`}>{a.sentiment}</span>
                <span className="line-clamp-1 flex-1 text-ink-100">{a.title}</span>
                <span className="tnum text-[10px] text-ink-500">há {a.ageHours}h · peso {Math.round(a.impactWeight * 100)}%</span>
              </a>
            ))}
          </div>
        )}

        {/* RACIOCÍNIO */}
        <div className="mt-5 rounded-xl border border-ink-800 bg-ink-950/60 p-4">
          <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-ink-300">
            <span>Raciocínio passo a passo que levou ao veredito</span><span>{open ? "▲" : "▼"}</span>
          </button>
          {open && <ol className="mt-3 space-y-1.5 text-[12px] text-ink-200">{final.reasoning.map((r, i) => <li key={i} className={`rounded-lg px-3 py-2 ${r.startsWith("⇒") ? "bg-ink-800 font-bold text-ink-100" : "bg-ink-900"}`}>{r}</li>)}</ol>}
          <div className="tnum mt-3 flex flex-wrap gap-2 text-[10px] text-ink-400">
            <span className="rounded bg-ink-900 px-2 py-0.5">técnico {Math.round(final.weights.technical * 100)}%</span>
            <span className="rounded bg-ink-900 px-2 py-0.5">notícias ≤72h {Math.round(final.weights.news * 100)}%</span>
            <span className="rounded bg-ink-900 px-2 py-0.5">Monte Carlo {Math.round(final.weights.monteCarlo * 100)}%</span>
            <span className="rounded bg-ink-900 px-2 py-0.5">backtest {Math.round(final.weights.backtest * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
