"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import SearchBox from "./SearchBox";

type Row = { symbol: string; name: string; exchange: string; market: string; countryCode: string; sector: string };
type Meta = { total: number; markets: { market: string; count: number }[]; sectors: string[] };

const PAGE = 40;

const FLAGS: Record<string, string> = {
  PT: "🇵🇹", ES: "🇪🇸", FR: "🇫🇷", DE: "🇩🇪", IT: "🇮🇹", NL: "🇳🇱", BE: "🇧🇪",
  GB: "🇬🇧", IE: "🇮🇪", US: "🇺🇸", CA: "🇨🇦", BR: "🇧🇷", MX: "🇲🇽", AR: "🇦🇷",
  JP: "🇯🇵", CN: "🇨🇳", HK: "🇭🇰", TW: "🇹🇼", KR: "🇰🇷", IN: "🇮🇳", AU: "🇦🇺",
  NZ: "🇳🇿", CH: "🇨🇭", AT: "🇦🇹", SE: "🇸🇪", NO: "🇳🇴", DK: "🇩🇰", FI: "🇫🇮",
  PL: "🇵🇱", GR: "🇬🇷", RU: "🇷🇺", ZA: "🇿🇦", SA: "🇸🇦", AE: "🇦🇪", SG: "🇸🇬",
};

function Browser() {
  const sp = useSearchParams();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [market, setMarket] = useState(sp.get("market") ?? "");
  const [sector, setSector] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/tickers/browse?mode=markets")
      .then((r) => r.json())
      .then((j: Meta) => alive && setMeta(j))
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams({ mode: "browse", limit: String(PAGE), offset: String(page * PAGE) });
    if (market) p.set("market", market);
    if (sector) p.set("sector", sector);
    if (q.trim()) p.set("q", q.trim());
    return p.toString();
  }, [market, sector, q, page]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tickers/browse?${query}`);
      const j = (await res.json()) as { rows: Row[]; total: number };
      setRows(j.rows ?? []);
      setTotal(j.total ?? 0);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void loadRows(); }, [loadRows]);

  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="space-y-5">
      <div className="rise">
        <h1 className="text-3xl font-bold tracking-tight text-ink-100 sm:text-4xl">Universo de ações</h1>
        <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-ink-300">
          {meta ? `${meta.total.toLocaleString("pt-PT")}` : "…"} ações de {meta?.markets.length ?? 0} mercados,
          indexadas localmente em PostgreSQL. Filtra por mercado e setor ou usa a pesquisa — clica num símbolo para
          abrir a análise técnica completa.
        </p>
      </div>

      <div className="panel flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[240px] flex-1">
          <label className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-500">Pesquisa rápida</label>
          <SearchBox placeholder="Símbolo ou nome…" onSelect={(h) => setQ("")} />
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-500">Filtrar por texto</label>
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder="ex.: energy, banco, tech"
            className="w-full rounded-xl border border-ink-700 bg-ink-900/90 px-3 py-2.5 text-[13px] text-ink-100 placeholder:text-ink-600 focus:border-bull-500/60 focus:outline-none"
          />
        </div>
        <div className="min-w-[190px] flex-1">
          <label className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-500">Mercado</label>
          <select
            value={market}
            onChange={(e) => { setMarket(e.target.value); setPage(0); }}
            className="w-full rounded-xl border border-ink-700 bg-ink-900/90 px-3 py-2.5 text-[13px] text-ink-100 focus:border-bull-500/60 focus:outline-none"
          >
            <option value="">Todos os mercados</option>
            {meta?.markets.map((m) => (
              <option key={m.market} value={m.market}>{m.market} ({m.count.toLocaleString("pt-PT")})</option>
            ))}
          </select>
        </div>
        <div className="min-w-[190px] flex-1">
          <label className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-500">Setor</label>
          <select
            value={sector}
            onChange={(e) => { setSector(e.target.value); setPage(0); }}
            className="w-full rounded-xl border border-ink-700 bg-ink-900/90 px-3 py-2.5 text-[13px] text-ink-100 focus:border-bull-500/60 focus:outline-none"
          >
            <option value="">Todos os setores</option>
            {meta?.sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button
          onClick={() => { setMarket(""); setSector(""); setQ(""); setPage(0); }}
          className="rounded-xl border border-ink-700 bg-ink-900 px-4 py-2.5 text-[12.5px] font-semibold text-ink-300 transition hover:border-ink-600 hover:text-ink-100"
        >
          Limpar
        </button>
      </div>

      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 px-4 py-3">
          <span className="tnum text-[12px] text-ink-400">
            {total.toLocaleString("pt-PT")} resultados · página {page + 1} de {pages.toLocaleString("pt-PT")}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 0 || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-1.5 text-[12px] font-semibold text-ink-200 transition disabled:opacity-35 enabled:hover:border-ink-600"
            >
              ← Anterior
            </button>
            <button
              disabled={page + 1 >= pages || loading}
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
              className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-1.5 text-[12px] font-semibold text-ink-200 transition disabled:opacity-35 enabled:hover:border-ink-600"
            >
              Seguinte →
            </button>
          </div>
        </div>

        <div className={`transition-opacity ${loading ? "opacity-45" : "opacity-100"}`}>
          <div className="hidden grid-cols-[minmax(110px,140px)_minmax(0,1fr)_150px_120px_40px] gap-3 border-b border-ink-800 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500 sm:grid">
            <span>Símbolo</span><span>Nome</span><span>Mercado</span><span>Setor</span><span />
          </div>
          <ul className="divide-y divide-ink-850">
            {rows.map((r) => (
              <li key={r.symbol}>
                <Link
                  href={`/acao/${encodeURIComponent(r.symbol)}`}
                  className="grid grid-cols-[minmax(110px,140px)_minmax(0,1fr)_40px] items-center gap-3 px-4 py-2.5 transition hover:bg-ink-850 sm:grid-cols-[minmax(110px,140px)_minmax(0,1fr)_150px_120px_40px]"
                >
                  <span className="tnum truncate text-[12.5px] font-bold text-bull-300">{r.symbol}</span>
                  <span className="truncate text-[12.5px] text-ink-200">{r.name}</span>
                  <span className="hidden truncate text-[11.5px] text-ink-400 sm:block">{r.market || r.exchange}</span>
                  <span className="hidden truncate text-[11px] text-ink-500 sm:block">{r.sector || "—"}</span>
                  <span className="justify-self-end text-base leading-none">{FLAGS[r.countryCode] ?? "🌐"}</span>
                </Link>
              </li>
            ))}
            {!rows.length && !loading && (
              <li className="px-4 py-12 text-center text-[13px] text-ink-500">Nenhum resultado com estes filtros.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function UniverseBrowser() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-ink-400">A carregar universo…</div>}>
      <Browser />
    </Suspense>
  );
}
