/** Modelo legado preservado. A versão v4 ativa usa company-research.ts e CompanyResearchPanel.tsx com FX explícito e validação de períodos/denominadores. */
"use client";

import type { FundamentalReport, Pillar } from "@/lib/fundamentals";
import { SectionTitle } from "./ui";

const gradeTone = (g: string) => g === "A" ? "border-bull-500/50 bg-bull-500/10 text-bull-300" : g === "B" ? "border-bull-500/30 bg-bull-500/5 text-bull-400" : g === "C" ? "border-amber-400/40 bg-amber-500/10 text-amber-300" : g === "D" ? "border-orange-400/40 bg-orange-500/10 text-orange-300" : "border-bear-500/50 bg-bear-500/10 text-bear-300";
const bar = (s: number) => s >= 65 ? "bg-bull-500" : s >= 45 ? "bg-amber-400" : "bg-bear-500";
const f = (v: number | null, d = 2) => (v == null ? "—" : v.toFixed(d));

function PillarCard({ p }: { p: Pillar }) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-950/60 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-ink-100">{p.name}</span>
        <span className={`rounded-lg border px-2 py-0.5 text-[12px] font-bold ${gradeTone(p.grade)}`}>{p.grade} · {p.score}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-800"><div className={`h-full ${bar(p.score)}`} style={{ width: `${p.score}%` }} /></div>
      <p className="mt-2 text-[11.5px] text-ink-300">{p.summary}</p>
      <div className="mt-3 space-y-1">
        {p.items.map((it) => (
          <div key={it.label} className="flex items-start justify-between gap-3 rounded-lg bg-ink-900 px-2.5 py-1.5 text-[11.5px]">
            <div className="min-w-0"><div className="text-ink-300"><span className={it.good === true ? "text-bull-400" : it.good === false ? "text-bear-400" : "text-ink-600"}>{it.good === true ? "●" : it.good === false ? "●" : "○"}</span> {it.label}</div>{it.note && <div className="text-[10px] text-ink-500">{it.note}</div>}</div>
            <span className={`tnum shrink-0 font-bold ${it.good === true ? "text-bull-300" : it.good === false ? "text-bear-300" : "text-ink-100"}`}>{it.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FundamentalsPanel({ r, price, currency }: { r: FundamentalReport; price: number; currency: string }) {
  const pc = (v: number | null) => (v == null ? "text-ink-600" : v >= 0 ? "text-bull-400" : "text-bear-400");
  return (
    <div className="panel p-6 space-y-5">
      <SectionTitle right={<span className={`rounded-lg border px-3 py-1 text-[12px] font-bold ${gradeTone(r.overallGrade)}`}>Nota global {r.overallGrade} · {r.overallScore}/100 · viés {r.bias > 0 ? "+" : ""}{r.bias}</span>}>
        Fundamentais reais ({r.source}) — rentabilidade, crescimento, balanço, consistência, valor intrínseco
      </SectionTitle>
      <p className="text-[12.5px] text-ink-300">{r.summary}{r.nextEarnings && <span className="text-amber-300"> · Próximos resultados: {r.nextEarnings}</span>}</p>

      {/* Performance */}
      <div className="rounded-xl border border-ink-800 bg-ink-950/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">Como se tem comportado — rentabilidade por período</span>
          <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${r.behaviour.trend === "ASCENDENTE" ? "bg-bull-500/15 text-bull-400" : r.behaviour.trend === "DESCENDENTE" ? "bg-bear-500/15 text-bear-400" : "bg-amber-500/15 text-amber-300"}`}>{r.behaviour.trend}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
          {r.performance.map((p) => (
            <div key={p.label} className="rounded-lg border border-ink-800 bg-ink-900 p-2 text-center"><div className="text-[10px] text-ink-400">{p.label}</div><div className={`tnum text-[13px] font-bold ${pc(p.pct)}`}>{p.pct == null ? "—" : `${p.pct > 0 ? "+" : ""}${p.pct.toFixed(1)}%`}</div></div>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-ink-300">{r.behaviour.text}</p>
        {r.monthly.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {r.monthly.map((m) => (
              <div key={m.label} title={`${m.label}: ${m.pct.toFixed(1)}%`} className={`tnum flex h-9 w-[46px] flex-col items-center justify-center rounded text-[9px] font-bold ${m.pct >= 0 ? "bg-bull-500/15 text-bull-300" : "bg-bear-500/15 text-bear-300"}`}><span>{m.label.slice(2).replace("-", "/")}</span><span>{m.pct > 0 ? "+" : ""}{m.pct.toFixed(0)}%</span></div>
            ))}
          </div>
        )}
      </div>

      {/* Valor intrínseco */}
      <div className="rounded-xl border border-ink-800 bg-ink-950/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">Valor intrínseco (4 modelos + analistas)</span>
          <span className={`rounded-lg border px-3 py-1 text-[12px] font-bold ${r.intrinsic.status === "Subavaliada" ? "border-bull-500/50 bg-bull-500/10 text-bull-300" : r.intrinsic.status === "Sobreavaliada" ? "border-bear-500/50 bg-bear-500/10 text-bear-300" : "border-amber-400/40 bg-amber-500/10 text-amber-300"}`}>{r.intrinsic.status}{r.intrinsic.marginOfSafetyPct != null && ` · margem de segurança ${r.intrinsic.marginOfSafetyPct > 0 ? "+" : ""}${r.intrinsic.marginOfSafetyPct}%`}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[{ l: "Preço atual", v: price, hl: true }, { l: "Nº de Graham", v: r.intrinsic.graham }, { l: "Graham c/ crescimento", v: r.intrinsic.grahamGrowth }, { l: "DCF (5 anos)", v: r.intrinsic.dcf }, { l: "EV/EBITDA justo", v: r.intrinsic.evEbitdaFair }, { l: "Alvo analistas", v: r.intrinsic.analystTarget }].map((m) => (
            <div key={m.l} className={`rounded-lg border p-3 ${m.hl ? "border-ink-600 bg-ink-800/60" : "border-ink-800 bg-ink-900"}`}>
              <div className="text-[10px] text-ink-400">{m.l}</div>
              <div className={`tnum text-[14px] font-bold ${m.hl ? "text-ink-100" : m.v == null ? "text-ink-600" : m.v > price ? "text-bull-400" : "text-bear-400"}`}>{m.v == null ? "—" : `${f(m.v)} ${currency}`}</div>
              {!m.hl && m.v != null && <div className="tnum text-[10px] text-ink-500">{(m.v / price - 1) * 100 > 0 ? "+" : ""}{((m.v / price - 1) * 100).toFixed(0)}%</div>}
            </div>
          ))}
        </div>
        <div className="mt-2 text-[12px] text-ink-300">Valor justo médio: <strong className="text-ink-100">{r.intrinsic.average != null ? `${f(r.intrinsic.average)} ${currency}` : "—"}</strong>{r.analysts.consensus && <> · Consenso de analistas: <strong className="text-ink-100">{r.analysts.consensus}</strong>{r.analysts.target != null && ` (alvo ${f(r.analysts.target)}, ${r.analysts.upsidePct! > 0 ? "+" : ""}${r.analysts.upsidePct}%)`}</>}</div>
        {r.intrinsic.notes.length > 0 && <ul className="mt-1 list-inside list-disc text-[10px] text-ink-500">{r.intrinsic.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <PillarCard p={r.profitability} /><PillarCard p={r.growth} /><PillarCard p={r.balance} /><PillarCard p={r.consistency} /><PillarCard p={r.valuation} /><PillarCard p={r.dividends} />
      </div>
    </div>
  );
}
