"use client";

import type { ConfluenceReport } from "@/lib/confluence";

const tone = (value: number) => value >= 12 ? "text-emerald-400" : value <= -12 ? "text-rose-400" : "text-amber-300";
export default function ConfluencePanel({ report }: { report: ConfluenceReport | undefined }) {
  if (!report) return null;
  const total = report.votes.bullish + report.votes.bearish + report.votes.neutral || 1;
  const totalWeight = report.families.reduce((n, f) => n + f.weight, 0) || 1;
  return (
    <section className="rounded-2xl border border-slate-700/70 bg-slate-900/80 p-5 shadow-lg sm:p-6" aria-label="Confluência dos indicadores">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><span className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400">Motor de confluência · v2</span><h2 className="mt-1 text-lg font-bold tracking-tight text-slate-100">Mais indicadores. Uma leitura conjugada.</h2><p className="mt-1 text-xs leading-relaxed text-slate-400">Pesos por família, para que dez médias móveis não contem como dez confirmações independentes.</p></div>
        <div className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2 text-right"><span className="text-[10px] uppercase tracking-wider text-slate-500">Concordância entre famílias</span><div className="font-mono text-xl font-bold text-slate-100">{report.alignment}%</div></div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs"><span className="font-semibold text-emerald-400">▲ {report.votes.bullish} altistas</span><span className="font-semibold text-rose-400">▼ {report.votes.bearish} baixistas</span><span className="text-slate-400">◆ {report.votes.neutral} neutros</span><span className="ml-auto rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-300">{report.regime}</span></div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-800" aria-hidden="true"><div className="bg-emerald-500" style={{ width: `${report.votes.bullish / total * 100}%` }} /><div className="bg-rose-500" style={{ width: `${report.votes.bearish / total * 100}%` }} /><div className="bg-slate-500" style={{ width: `${report.votes.neutral / total * 100}%` }} /></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">{report.families.map(f => <div key={f.name} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><div className="flex justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500"><span>{f.name}</span><span>{(f.weight / totalWeight * 100).toFixed(0)}%</span></div><div className={`mt-2 font-mono text-2xl font-bold ${tone(f.score)}`}>{f.score > 0 ? "+" : ""}{f.score.toFixed(1)}</div><div className="mt-1 text-[10px] text-slate-500">{f.count} sinais · {f.bullish} alta / {f.bearish} baixa</div></div>)}</div>
      {report.conflicts.length > 0 && <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3"><h3 className="text-xs font-semibold text-amber-200">Nem todos os sinais concordam</h3><ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-400">{report.conflicts.map(c => <li key={c}>• {c}</li>)}</ul></div>}
      <details className="group mt-5 border-t border-slate-800 pt-4" open>
        <summary className="cursor-pointer text-xs font-bold text-slate-200">Novos indicadores disponíveis <span className="ml-1 font-mono text-emerald-400">{report.newSignals.length}</span><span className="float-right text-slate-500">expandir / recolher</span></summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{report.newSignals.map(s => <div key={s.id} className="rounded-xl border border-slate-800 bg-slate-950/30 p-3"><div className="flex items-start justify-between gap-2"><h3 className="text-xs font-semibold text-slate-200">{s.name}</h3><span className={`shrink-0 font-mono text-xs font-bold ${tone(s.bias)}`}>{s.bias > 0 ? "+" : ""}{s.bias.toFixed(0)}</span></div><div className="mt-1 font-mono text-xs text-sky-300">{s.value}</div><p className="mt-2 text-[11px] leading-relaxed text-slate-500">{s.detail}</p></div>)}</div>
      </details>
      <details className="mt-4 border-t border-slate-800 pt-3"><summary className="cursor-pointer text-[11px] font-semibold text-slate-400">Como se calcula · dados em falta · limitações</summary><p className="mt-2 text-[11px] leading-relaxed text-slate-500">{report.methodology}</p><p className="mt-2 font-mono text-[10px] text-slate-500">{report.observations} barras observadas · cobertura dos novos indicadores {report.coverage}%</p>{report.missing.map(m => <p key={m} className="mt-2 text-[11px] text-amber-300/80">{m}</p>)}</details>
    </section>
  );
}
