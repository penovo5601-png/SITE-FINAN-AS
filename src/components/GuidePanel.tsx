"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { GuideAnalysis, Light } from "@/lib/guide";
import { SectionTitle } from "./ui";

const dot = (l: Light) => l === "VERDE" ? "bg-bull-500" : l === "AMARELO" ? "bg-amber-400" : "bg-bear-500";
const txt = (l: Light) => l === "VERDE" ? "text-bull-400" : l === "AMARELO" ? "text-amber-300" : "text-bear-400";
const box = (l: Light) => l === "VERDE" ? "border-bull-500/40 bg-bull-500/5" : l === "AMARELO" ? "border-amber-400/40 bg-amber-500/5" : "border-bear-500/40 bg-bear-500/10";
const f = (v: number | null | undefined, d = 1) => (v == null ? "—" : v.toFixed(d));

export default function GuidePanel({ symbol }: { symbol: string }) {
  const [g, setG] = useState<GuideAnalysis | null>(null);
  const [currency, setCurrency] = useState("EUR");
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"buy" | "wait">("buy");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const c = new AbortController(); setG(null); setErr(null);
    fetch(`/api/guide?symbol=${encodeURIComponent(symbol)}`, { signal: c.signal }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setG(j.guide); setCurrency(j.currency); setTab(j.guide.semaforo.decision === "COMPRAR" ? "buy" : "wait"); }).catch(e => { if (!c.signal.aborted) setErr(String(e.message ?? e)); });
    return () => c.abort();
  }, [symbol]);
  if (err) return <div className="panel p-6 text-[13px] text-ink-400">Método do guia indisponível: {err}</div>;
  if (!g) return <div className="panel p-6 text-[13px] text-ink-400">A aplicar o método do guia (fundamentais vs concorrentes, tendência 6M, S/R, MM20/50, ADX→MACD/RSI)…</div>;
  const just = tab === "buy" ? g.justification.buy : g.justification.wait;
  return (
    <div className="space-y-5">
      <div className={`panel border p-6 ${box(g.semaforo.decisionLight)}`}>
        <SectionTitle right={<div className="flex gap-1.5">{g.semaforo.rows.map(r => <span key={r.n} title={`${r.question}: ${r.reading}`} className={`grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold text-ink-950 ${dot(r.light)}`}>{r.n}</span>)}</div>}>
          Método do guia prático — tabela-semáforo
        </SectionTitle>
        <div className="text-xl font-bold text-ink-100">Decisão: <span className={txt(g.semaforo.decisionLight)}>{g.semaforo.decision}</span></div>
        <p className="mt-1 text-[12px] text-ink-400">{g.semaforo.greens} verdes · {g.semaforo.yellows} amarelos · {g.semaforo.reds} vermelhos — 4–5 verdes = comprar; mistura = comprar menos/esperar; 2+ vermelhos = não comprar.</p>
        <table className="mt-3 w-full text-[12px]"><tbody>{g.semaforo.rows.map(r => <tr key={r.n} className="border-t border-ink-800"><td className="py-1.5 font-semibold text-ink-200">{r.n}. {r.question}</td><td className="py-1.5 text-ink-300">{r.reading}</td><td className="py-1.5 text-right"><span className={`inline-block h-3 w-3 rounded-full ${dot(r.light)}`} /></td></tr>)}</tbody></table>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 text-[12px]">
          <div className="rounded-lg bg-ink-950/70 p-3"><div className="text-[10px] text-ink-500">Stop loss</div><div className="tnum text-lg font-bold text-bear-400">{g.exitPlan.stopLoss} {currency}</div><div className="text-bear-300">{g.exitPlan.stopPct}%</div></div>
          <div className="rounded-lg bg-ink-950/70 p-3"><div className="text-[10px] text-ink-500">Objetivo de ganho</div><div className="tnum text-lg font-bold text-bull-400">{g.exitPlan.target} {currency}</div><div className="text-bull-300">+{g.exitPlan.targetPct}%</div></div>
          <div className="rounded-lg bg-ink-950/70 p-3 text-ink-300">{g.exitPlan.rationale}</div>
        </div>
      </div>

      <div className="panel p-6">
        <SectionTitle right={<span className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold ${box(g.fundamentals.light)} ${txt(g.fundamentals.light)}`}>{g.fundamentals.verdict}</span>}>1. A empresa está bem? — comparação com concorrentes</SectionTitle>
        <p className="text-[12.5px] text-ink-300">{g.fundamentals.text}</p>
        {g.fundamentals.peers.length > 0 && (
          <div className="mt-3 overflow-x-auto"><table className="w-full text-[12px]">
            <thead className="text-ink-500"><tr><th className="py-1 text-left">Empresa</th><th>País</th><th>PER</th><th>PBV</th><th>ROE</th><th>DY</th><th>Pay-out</th><th>6M</th><th>1A</th></tr></thead>
            <tbody>{[...g.fundamentals.peers].sort((a, b) => (b.isSelf ? 1 : 0) - (a.isSelf ? 1 : 0)).map(p => (
              <tr key={p.symbol} className={`tnum border-t border-ink-800 text-center ${p.isSelf ? "bg-ink-800/60 font-bold text-ink-100" : "text-ink-300"}`}>
                <td className="py-1 text-left">{p.isSelf ? "★ " : ""}<Link href={`/acao/${encodeURIComponent(p.symbol)}`} className="hover:underline">{p.name.slice(0, 26)}</Link> <span className="text-ink-500">({p.symbol})</span></td><td>{p.country}</td>
                <td className={g.fundamentals.peerMedian.per != null && p.per != null ? (p.per < g.fundamentals.peerMedian.per ? "text-bull-400" : "text-bear-300") : ""}>{f(p.per)}</td><td>{f(p.pbv, 2)}</td>
                <td className={g.fundamentals.peerMedian.roe != null && p.roe != null ? (p.roe > g.fundamentals.peerMedian.roe ? "text-bull-400" : "text-bear-300") : ""}>{f(p.roe)}%</td><td>{f(p.dy, 2)}%</td><td>{f(p.payout, 0)}%</td>
                <td className={(p.perf6m ?? 0) >= 0 ? "text-bull-400" : "text-bear-300"}>{f(p.perf6m)}%</td><td className={(p.perf1y ?? 0) >= 0 ? "text-bull-400" : "text-bear-300"}>{f(p.perf1y)}%</td>
              </tr>))}
              <tr className="tnum border-t border-ink-700 text-center text-ink-400"><td className="py-1 text-left font-semibold">Mediana dos concorrentes</td><td /><td>{f(g.fundamentals.peerMedian.per)}</td><td>{f(g.fundamentals.peerMedian.pbv, 2)}</td><td>{f(g.fundamentals.peerMedian.roe)}%</td><td>{f(g.fundamentals.peerMedian.dy, 2)}%</td><td>{f(g.fundamentals.peerMedian.payout, 0)}%</td><td /><td /></tr>
            </tbody></table></div>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className={`rounded-xl border p-4 ${box(g.trend.light)}`}><div className="flex justify-between"><span className="text-[13px] font-bold text-ink-100">2. Tendência (6 meses)</span><span className={`font-bold ${txt(g.trend.light)}`}>{g.trend.label}</span></div><div className="mt-1 text-[11px] text-ink-400">{g.trend.contacts} pontos de contacto {g.trend.confirmed ? "✔ confirmada" : "(precisa de 3)"} · 6M {g.trend.change6mPct > 0 ? "+" : ""}{g.trend.change6mPct}%</div><p className="mt-2 text-[12px] text-ink-300">{g.trend.text}</p><p className="mt-1 text-[12px] font-semibold text-ink-100">O que fazer: {g.trend.action}</p></div>
        <div className={`rounded-xl border p-4 ${box(g.levels.light)}`}><span className="text-[13px] font-bold text-ink-100">3. Chão e teto (suporte / resistência)</span><div className="tnum mt-2 grid grid-cols-3 gap-2 text-center text-[12px]"><div className="rounded bg-ink-950/70 p-2"><div className="text-[10px] text-ink-500">Suporte</div><div className="font-bold text-bear-300">{g.levels.support}</div></div><div className="rounded bg-ink-950/70 p-2"><div className="text-[10px] text-ink-500">52 sem.</div><div className="font-bold text-ink-100">{g.levels.range52.positionPct}%</div><div className="text-[9px] text-ink-500">{g.levels.range52.low}–{g.levels.range52.high}</div></div><div className="rounded bg-ink-950/70 p-2"><div className="text-[10px] text-ink-500">Resistência</div><div className="font-bold text-bull-300">{g.levels.resistance}</div></div></div><p className="mt-2 text-[12px] text-ink-300">{g.levels.text}</p></div>
        <div className={`rounded-xl border p-4 ${box(g.movingAverages.light)}`}><span className="text-[13px] font-bold text-ink-100">4. Velas e médias móveis (MM20 / MM50)</span><p className="mt-2 text-[12px] text-ink-300">{g.candles.text}</p><p className="mt-1 text-[12px] text-ink-300">{g.movingAverages.text}</p></div>
        <div className={`rounded-xl border p-4 ${box(g.oscillator.light)}`}><span className="text-[13px] font-bold text-ink-100">5. ADX → {g.oscillator.chosen}</span><div className="tnum mt-1 text-[11px] text-ink-400">ADX {g.oscillator.adx} · RSI {g.oscillator.rsi} · MACD {g.oscillator.macd.line}/{g.oscillator.macd.signal} (hist {g.oscillator.macd.hist})</div><p className="mt-2 text-[12px] text-ink-300">{g.oscillator.text}</p>{g.patterns.map(p => <div key={p.name} className="mt-1 rounded bg-ink-950/70 px-2 py-1 text-[11px]"><span className={`font-bold ${p.bias === "COMPRA" ? "text-bull-400" : p.bias === "VENDA" ? "text-bear-400" : "text-amber-300"}`}>Padrão: {p.name} ({p.bias})</span> — <span className="text-ink-300">{p.description}</span></div>)}</div>
      </div>

      <div className="panel p-6">
        <SectionTitle right={<div className="flex gap-1 rounded-lg bg-ink-950 p-1 text-[11px]"><button onClick={() => setTab("buy")} className={`rounded px-2 py-1 font-semibold ${tab === "buy" ? "bg-bull-500 text-ink-950" : "text-ink-400"}`}>Se compro</button><button onClick={() => setTab("wait")} className={`rounded px-2 py-1 font-semibold ${tab === "wait" ? "bg-amber-400 text-ink-950" : "text-ink-400"}`}>Se espero</button></div>}>Justificação para o relatório (Ficha de Fundamentação)</SectionTitle>
        <div className="rounded-xl border border-ink-800 bg-ink-950/70 p-4 text-[12.5px] italic leading-relaxed text-ink-200">{just}</div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-ink-500"><span>Os ___ são para preencheres com quantidade e peso na carteira.</span><button onClick={() => { navigator.clipboard?.writeText(just); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="rounded border border-ink-700 bg-ink-900 px-2 py-1 text-[11px] text-ink-200 hover:bg-ink-800">{copied ? "Copiado ✔" : "Copiar"}</button></div>
        <div className="mt-3 grid gap-1 sm:grid-cols-2 text-[11px] text-ink-300">{g.checklist.map(c => <div key={c.item}><span className={c.done ? "text-bull-400" : "text-ink-600"}>{c.done ? "☑" : "☐"}</span> {c.item}</div>)}</div>
      </div>
    </div>
  );
}
