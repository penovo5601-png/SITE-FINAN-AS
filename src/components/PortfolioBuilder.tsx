"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import type { PortfolioPlan } from "@/lib/portfolio";
import { SectionTitle } from "./ui";

const eur = (v: number) => v.toLocaleString("pt-PT", { maximumFractionDigits: 0 }) + " €";
const pc = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(d)}%`);

export default function PortfolioBuilder() {
  const [budget, setBudget] = useState(100000);
  const [data, setData] = useState<{ portfolios: PortfolioPlan[]; universeSize: number; note: string; generatedAt: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const load = async (b = budget) => { setLoading(true); setErr(null); try { const r = await fetch(`/api/portfolio?budget=${b}`); const j = await r.json(); if (!r.ok) throw new Error(j.error); setData(j); } catch (e) { setErr(String((e as Error).message ?? e)); } finally { setLoading(false); } };
  useEffect(() => { void load(100000); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const p = data?.portfolios[active];
  return (
    <div className="space-y-6">
      <div className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-300">Composição de carteiras · só ações · até 100.000 €</div>
            <h1 className="text-2xl font-bold tracking-tight text-ink-100">Três carteiras diversificadas, com rendibilidade esperada e justificação por ação</h1>
            <p className="mt-1 max-w-3xl text-[13px] text-ink-400">Universo real da Zona Euro (Euronext Lisboa/Paris/Amesterdão/Bruxelas, Madrid, Xetra, Milão). Seleção pelo método do guia: PER vs concorrentes, ROE, dividend yield, tendência de 6 meses; máx. 2 ações por setor, 1 por indústria, 40% por país; stop loss (−7%) e objetivo (+10%) definidos à partida.</p>
          </div>
          <div className="min-w-[260px] rounded-xl border border-ink-800 bg-ink-950/60 p-4">
            <div className="text-[11px] text-ink-400">Capital a investir: <span className="tnum text-base font-bold text-ink-100">{eur(budget)}</span></div>
            <input type="range" min={5000} max={100000} step={1000} value={budget} onChange={e => setBudget(Number(e.target.value))} className="mt-2 w-full accent-emerald-500" />
            <div className="mt-2 flex gap-2">{[25000, 50000, 100000].map(v => <button key={v} onClick={() => { setBudget(v); void load(v); }} className="flex-1 rounded-lg border border-ink-700 bg-ink-900 px-2 py-1 text-[11px] text-ink-300 hover:bg-ink-800">{v / 1000}k</button>)}</div>
            <button onClick={() => void load()} disabled={loading} className="mt-2 w-full rounded-lg bg-bull-500 px-4 py-2 text-[13px] font-bold text-ink-950 hover:brightness-110 disabled:opacity-50">{loading ? "A compor carteiras…" : "Gerar carteiras"}</button>
          </div>
        </div>
        {data && <div className="mt-3 text-[11px] text-ink-500">{data.note} Gerado às {new Date(data.generatedAt).toLocaleTimeString("pt-PT")}.</div>}
        {err && <div className="mt-3 rounded-lg border border-bear-500/40 bg-bear-500/10 p-3 text-[12px] text-ink-100">{err}</div>}
      </div>

      {data && (<>
        <div className="grid gap-3 md:grid-cols-3">
          {data.portfolios.map((pf, i) => (
            <button key={pf.profile} onClick={() => setActive(i)} className={`rounded-xl border p-4 text-left transition ${active === i ? "border-bull-500/60 bg-bull-500/10" : "border-ink-800 bg-ink-900/60 hover:border-ink-600"}`}>
              <div className="text-[12px] font-bold text-ink-200">{pf.title}</div>
              <div className="tnum mt-1 flex items-baseline gap-2"><span className={`text-2xl font-bold ${pf.expectedReturnPct >= 0 ? "text-bull-400" : "text-bear-400"}`}>{pc(pf.expectedReturnPct)}</span><span className="text-[11px] text-ink-400">esperado a 12 meses ≈ {eur(pf.expectedGain)}</span></div>
              <div className="tnum mt-1 text-[11px] text-ink-400">{pf.holdings.length} ações · {pf.sectors.length} setores · {pf.countries.length} países · vol. {pf.expectedVolPct}% · beta {pf.beta} · DY {pf.dividendYieldPct}%</div>
            </button>
          ))}
        </div>
        {p && (<div className="space-y-5">
          <div className="panel p-6">
            <h2 className="text-lg font-bold text-ink-100">{p.title}</h2><p className="mt-1 text-[12.5px] text-ink-300">{p.description}</p>
            <div className="tnum mt-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-3 lg:grid-cols-6">
              {[["Investido", eur(p.invested)], ["Caixa", eur(p.cash)], ["Rendibilidade esperada", pc(p.expectedReturnPct)], ["Ganho esperado", eur(p.expectedGain)], ["Intervalo provável", `${pc(p.expectedLowPct)} a ${pc(p.expectedHighPct)}`], ["Dividendos/ano", `${p.dividendYieldPct}%`]].map(([l, v]) => <div key={l} className="rounded-lg border border-ink-800 bg-ink-950/60 p-3"><div className="text-[10px] text-ink-500">{l}</div><div className="text-[13px] font-bold text-ink-100">{v}</div></div>)}
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-ink-800 bg-ink-950/60 p-4"><div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">Por setor</div>{p.sectors.map(s => <div key={s.name} className="mb-1.5"><div className="flex justify-between text-[11px] text-ink-300"><span>{s.name}</span><span className="tnum">{s.pct}%</span></div><div className="h-1.5 rounded-full bg-ink-800"><div className="h-full rounded-full bg-cyan-signal" style={{ width: `${s.pct}%` }} /></div></div>)}</div>
              <div className="rounded-xl border border-ink-800 bg-ink-950/60 p-4"><div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">Por país</div>{p.countries.map(s => <div key={s.name} className="mb-1.5"><div className="flex justify-between text-[11px] text-ink-300"><span>{s.name}</span><span className="tnum">{s.pct}%</span></div><div className="h-1.5 rounded-full bg-ink-800"><div className="h-full rounded-full bg-bull-500" style={{ width: `${s.pct}%` }} /></div></div>)}
                <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">Cenários de stress</div>
                <div className="tnum mt-1 grid grid-cols-5 gap-1 text-center text-[10px]">{p.stressScenarios.map(s => <div key={s.name} className="rounded bg-ink-900 p-1.5"><div className="text-ink-400">{s.name.split(" (")[0]}</div><div className={`font-bold ${s.portfolioMove >= 0 ? "text-bull-400" : "text-bear-400"}`}>{pc(s.portfolioMove)}</div><div className="text-ink-500">{eur(s.value)}</div></div>)}</div>
              </div>
            </div>
          </div>
          <div className="panel overflow-x-auto p-2">
            <table className="w-full text-[12px]">
              <thead className="text-ink-500"><tr><th className="px-3 py-2 text-left">Ação</th><th>Setor / País</th><th>Peso</th><th>Qtd × Preço</th><th>Investido</th><th>PER</th><th>ROE</th><th>DY</th><th>6M</th><th>Tend.</th><th>Esperado 12M</th><th>Stop / Alvo</th></tr></thead>
              <tbody>{p.holdings.map(h => (<Fragment key={h.symbol}>
                <tr className="tnum cursor-pointer border-t border-ink-800 text-center text-ink-300 hover:bg-ink-900/60" onClick={() => setOpen(open === h.symbol ? null : h.symbol)}>
                  <td className="px-3 py-2 text-left"><div className="font-bold text-ink-100">{h.name.slice(0, 30)}</div><Link href={`/acao/${encodeURIComponent(h.symbol)}`} onClick={e => e.stopPropagation()} className="font-mono text-[11px] text-cyan-signal hover:underline">{h.symbol} ↗</Link></td>
                  <td className="px-2 py-2 text-[11px]">{h.sector}<br /><span className="text-ink-500">{h.country}</span></td>
                  <td className="px-2 font-bold text-ink-100">{h.weightPct}%</td><td className="px-2">{h.shares} × {h.price.toFixed(2)}</td><td className="px-2">{eur(h.invested)}</td>
                  <td className="px-2">{h.per?.toFixed(1) ?? "—"}</td><td className="px-2">{h.roe?.toFixed(0) ?? "—"}%</td><td className="px-2">{h.dy?.toFixed(1) ?? "0"}%</td>
                  <td className={`px-2 ${(h.perf6m ?? 0) >= 0 ? "text-bull-400" : "text-bear-400"}`}>{pc(h.perf6m)}</td>
                  <td className={`px-2 font-semibold ${h.trend === "Bullish" ? "text-bull-400" : h.trend === "Bearish" ? "text-bear-400" : "text-amber-300"}`}>{h.trend}</td>
                  <td className={`px-2 font-bold ${h.expectedReturnPct >= 0 ? "text-bull-400" : "text-bear-400"}`}>{pc(h.expectedReturnPct)}<div className="text-[10px] font-normal text-ink-500">{eur(h.expectedGain)}</div></td>
                  <td className="px-2 text-[11px]"><span className="text-bear-300">{h.stopLoss}</span> / <span className="text-bull-300">{h.target}</span> {open === h.symbol ? "▲" : "▼"}</td>
                </tr>
                {open === h.symbol && <tr className="border-t border-ink-800 bg-ink-950/60"><td colSpan={12} className="px-4 py-3 text-left text-[12.5px] italic leading-relaxed text-ink-200">{h.justification}</td></tr>}
              </Fragment>))}</tbody>
            </table>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-bull-500/30 bg-bull-500/5 p-5"><SectionTitle>Porque esta carteira está bem construída</SectionTitle><ul className="list-inside list-disc space-y-1 text-[12.5px] text-ink-200">{p.rationale.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-5"><SectionTitle>Riscos e limites</SectionTitle><ul className="list-inside list-disc space-y-1 text-[12.5px] text-ink-200">{p.risks.map((r, i) => <li key={i}>{r}</li>)}</ul><p className="mt-2 text-[10px] text-ink-500">Clica numa linha para ver a justificação completa; clica no ticker para abrir a análise detalhada com o semáforo do guia.</p></div>
          </div>
        </div>)}
      </>)}
    </div>
  );
}
