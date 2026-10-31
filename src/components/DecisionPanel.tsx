"use client";

import type { DecisionAudit } from "@/lib/decision-audit";

const number = (n: number | null, digits = 2) => n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("pt-PT", { maximumFractionDigits: digits, minimumFractionDigits: digits });
const percent = (n: number | null) => n == null ? "—" : `${number(n)}%`;

export default function DecisionPanel({ audit, currency }: { audit: DecisionAudit | undefined; currency: string }) {
  if (!audit) return null;
  const v = audit.validation;
  const gradeTone = audit.grade === "historical_support" ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300" : audit.grade === "blocked" ? "border-rose-500/30 bg-rose-500/10 text-rose-200" : "border-amber-500/35 bg-amber-500/10 text-amber-200";
  function download() {
    const blob = new Blob([JSON.stringify(audit, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `auditoria-${audit!.snapshot.symbol}-${audit!.id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900/85 shadow-xl" aria-label="Cenários e validação da decisão">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 px-5 py-5 sm:px-6">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300">Protocolo de decisão · regras fixas</p><h2 className="mt-1 text-xl font-bold tracking-tight text-slate-100">Cenários, confirmação e validação</h2><p className="mt-1 text-xs leading-relaxed text-slate-400">Horizonte: {audit.horizonBars} {audit.horizonUnit}. São hipóteses condicionais, não uma promessa do preço futuro.</p></div>
        <button onClick={download} className="rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-sky-400/50">↓ Descarregar auditoria</button>
      </div>
      <div className="space-y-5 p-5 sm:p-6">
        <div className={`rounded-xl border px-4 py-3 ${gradeTone}`}><div className="text-xs font-bold">{audit.gradeLabel}</div><p className="mt-1 text-[11px] leading-relaxed">Inclinação técnica: <strong>{audit.rawVerdict}</strong> · veredicto após verificações: <strong>{audit.finalVerdict}</strong>. Suporte num teste histórico não transforma este sinal numa decisão garantida.</p></div>

        <div className="grid gap-3 lg:grid-cols-3">{audit.scenarios.map(s => {
          const up = s.id === "bull", down = s.id === "bear";
          const tone = up ? "text-emerald-400" : down ? "text-rose-400" : "text-amber-300";
          return <article key={s.id} className="rounded-xl border border-slate-700/70 bg-slate-950/55 p-4">
            <div className="flex items-baseline justify-between gap-3"><h3 className={`text-sm font-bold ${tone}`}>{up ? "▲ " : down ? "▼ " : "◆ "}{s.label}</h3><span className={`font-mono text-xl font-bold ${tone}`}>{s.weight}%</span></div>
            <p className="mt-1 text-[10px] text-slate-500">Peso heurístico da hipótese · NÃO é probabilidade</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${up ? "bg-emerald-500" : down ? "bg-rose-500" : "bg-amber-400"}`} style={{ width: `${s.weight}%` }} /></div>
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-[11px]">
              <div><dt className="text-slate-500">{s.trigger == null ? "Limite inferior" : "Gatilho a confirmar"}</dt><dd className="mt-1 font-mono font-bold text-slate-200">{number(s.trigger ?? s.lowerBound, (s.trigger ?? s.lowerBound) < 1 ? 4 : 2)} {currency}</dd></div>
              <div><dt className="text-slate-500">{s.target == null ? "Limite superior" : "Alvo condicional"}</dt><dd className="mt-1 font-mono font-bold text-slate-200">{number(s.target ?? s.upperBound, (s.target ?? s.upperBound) < 1 ? 4 : 2)} {currency}</dd></div>
              {s.invalidation != null && <div><dt className="text-slate-500">Invalidação</dt><dd className="mt-1 font-mono text-slate-300">{number(s.invalidation, s.invalidation < 1 ? 4 : 2)} {currency}</dd></div>}
              {s.riskReward != null && <div><dt className="text-slate-500">Risco / retorno planeado</dt><dd className="mt-1 font-mono text-slate-300">1 : {number(s.riskReward)}</dd></div>}
            </dl>
            <h4 className="mt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Para confirmar</h4><p className="mt-1 text-[11px] leading-relaxed text-slate-400">{s.confirmation}</p>
            <h4 className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Deixa de valer se…</h4><p className="mt-1 text-[11px] leading-relaxed text-slate-500">{s.invalidatedIf}</p>
            <p className="mt-3 border-t border-slate-800 pt-2 text-[10px] text-slate-500">Apoios atuais: {s.supporting.length ? s.supporting.join(" · ") : "não há famílias direcionais a confirmar este cenário"}</p>
          </article>;
        })}</div>

        <div><h3 className="mb-3 text-sm font-bold text-slate-100">Verificações no instante do veredicto</h3><div className="grid gap-2 sm:grid-cols-2">{audit.checks.map(c => <div key={c.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"><div className="flex gap-2"><span className={c.result === "pass" ? "text-emerald-400" : c.result === "fail" ? "text-rose-400" : "text-amber-300"}>{c.result === "pass" ? "✓" : c.result === "fail" ? "✕" : "!"}</span><span className="text-xs font-semibold text-slate-200">{c.label}</span><span className="ml-auto text-[9px] uppercase tracking-wider text-slate-500">{c.result === "pass" ? "passou" : c.result === "fail" ? "não passou" : "limitação"}</span></div><p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{c.evidence}</p></div>)}</div></div>

        <div className="rounded-xl border border-slate-700/70 bg-slate-950/45 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-100">Diagnóstico histórico walk-forward</h3><p className="mt-1 text-xs text-slate-400">{v.label}</p></div><span className="rounded-lg border border-slate-700 px-2 py-1 font-mono text-[10px] text-slate-400">20 sessões · custo {v.costBps} bps</span></div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Janelas / operações", `${v.windows} / ${v.trades}`],
              ["Acerto direcional observado", percent(v.directionalAccuracyPct)],
              ["IC Wilson 95% · aproximado", v.wilson95Pct ? `${number(v.wilson95Pct[0], 1)}–${number(v.wilson95Pct[1], 1)}%` : "—"],
              ["Retorno médio líquido / operação", percent(v.meanNetReturnPct)],
              ["Referência compra · mesmas janelas", percent(v.baselineActiveMeanNetPct)],
              ["Excesso médio vs referência", percent(v.meanExcessNetPct)],
              ["Fator de lucro", number(v.profitFactor)],
              ["Drawdown por fechos de operação", percent(v.maxDrawdownPct)],
            ].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3"><p className="text-[10px] leading-relaxed text-slate-500">{label}</p><p className="mt-1 font-mono text-sm font-bold text-slate-200">{value}</p></div>)}
          </div>
          {v.byDirection.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{v.byDirection.map(d => <div key={d.direction} className="rounded-lg border border-slate-800 p-3 text-[11px] text-slate-500"><strong className="text-slate-300">Sinais {d.direction}</strong> · {d.trades} operações · acerto {percent(d.directionalAccuracyPct)} · média líquida {percent(d.meanNetReturnPct)}{d.wilson95Pct && <span className="block mt-1">Wilson 95%: {number(d.wilson95Pct[0], 1)}–{number(d.wilson95Pct[1], 1)}%</span>}</div>)}</div>}
          <p className="mt-3 text-[10.5px] leading-relaxed text-slate-500">Estes resultados descrevem o passado, não a probabilidade do próximo sinal. Mínimo exigido: {v.minimumTrades} operações; abstenções: {v.abstentions}. Não é feito um ajuste de parâmetros para melhorar os números mostrados.</p>
          <details className="mt-4 border-t border-slate-800 pt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-300">Protocolo, operações e limitações do teste</summary><p className="mt-3 text-[11px] leading-relaxed text-slate-500">{v.methodology}</p>
            {v.recentBlocks.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2">{v.recentBlocks.map(b => <div key={b.label} className="rounded-lg border border-slate-800 p-2 text-[10px] text-slate-500">{b.label}<div className="mt-1 font-mono text-slate-300">{b.trades} operações · {percent(b.meanNetPct)}</div></div>)}</div>}
            {v.folds.length > 0 && <div className="mt-4 max-w-full overflow-x-auto"><table className="w-full min-w-[600px] text-left text-[10px]"><thead className="text-slate-400"><tr><th className="p-2">Sinal no fecho</th><th className="p-2">Entrada seguinte</th><th className="p-2">Saída</th><th className="p-2">Direção</th><th className="p-2">Líquido</th><th className="p-2">Referência</th></tr></thead><tbody>{v.folds.map(row => <tr key={row.predictionAt} className="border-t border-slate-800 font-mono text-slate-500"><td className="p-2">{row.predictionAt.slice(0, 10)}</td><td className="p-2">{row.entryAt.slice(0, 10)}</td><td className="p-2">{row.exitAt.slice(0, 10)}</td><td className="p-2">{row.direction}</td><td className="p-2">{percent(row.netReturnPct)}</td><td className="p-2">{percent(row.baselineNetPct)}</td></tr>)}</tbody></table></div>}
            <ul className="mt-3 space-y-1.5">{v.limitations.map(l => <li key={l} className="text-[10.5px] leading-relaxed text-slate-500">• {l}</li>)}</ul>
          </details>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><div className="rounded-xl border border-slate-800 bg-slate-950/35 p-3"><h3 className="text-xs font-semibold text-slate-300">Notícias admissíveis no instante registado</h3><p className="mt-1 text-[11px] text-slate-400">≤24h: {audit.news.last24Hours} · ≤48h: {audit.news.last48Hours} · ≤72h: {audit.news.last72Hours} · publicadores: {audit.news.publishers}</p><p className="mt-1 text-[10.5px] leading-relaxed text-slate-500">{audit.news.impact} Uma manchete recente pode já estar refletida no preço. Este é o contexto selado em {new Date(audit.createdAt).toLocaleString("pt-PT")}; o feed acima é filtrado novamente com o relógio atual.</p></div><div className="rounded-xl border border-slate-800 p-3 text-[10px] text-slate-500"><p>Registo <span className="font-mono text-sky-300">{audit.id}</span></p><p className="mt-1">{new Date(audit.createdAt).toLocaleString("pt-PT")}</p><p className="mt-1 font-mono">{audit.modelVersion}</p></div></div>
        <p className="text-[10.5px] leading-relaxed text-slate-500">{audit.limitations[0]} Não usar este painel como única base de uma decisão de investimento.</p>
      </div>
    </section>
  );
}
