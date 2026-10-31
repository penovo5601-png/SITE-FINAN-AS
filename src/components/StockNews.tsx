"use client";

import { useCallback, useEffect, useState } from "react";
import type { StockNewsFeed } from "@/lib/news";

function relativeDate(iso: string): string {
  const hours = Math.max(0, (Date.now() - Date.parse(iso)) / 3_600_000);
  return hours < 1 ? "há menos de 1 hora" : hours < 24 ? `há ${Math.floor(hours)} h` : `há ${Math.floor(hours / 24)} dias`;
}

export default function StockNews({ symbol }: { symbol: string }) {
  const [feed, setFeed] = useState<StockNewsFeed | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [limit, setLimit] = useState(6);
  const [language, setLanguage] = useState("all");
  const load = useCallback(async (signal?: AbortSignal, refresh = false) => {
    setBusy(true); setError(false);
    try {
      const res = await fetch(`/api/news?symbol=${encodeURIComponent(symbol)}${refresh ? "&refresh=1" : ""}`, { signal, cache: "no-store" });
      if (!res.ok) throw new Error("news unavailable");
      const data = await res.json() as StockNewsFeed;
      if (!signal?.aborted) setFeed(data);
    } catch {
      if (!signal?.aborted) setError(true);
    } finally { if (!signal?.aborted) setBusy(false); }
  }, [symbol]);
  useEffect(() => {
    const controller = new AbortController();
    setFeed(null); setLimit(6); setLanguage("all");
    void load(controller.signal);
    const timer = window.setInterval(() => void load(controller.signal), 300_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [load]);
  const relevant = (feed?.articles ?? []).filter(a => language === "all" || a.language === language);
  const filtered = relevant.slice(0, limit);
  const unavailable = error || feed?.status === "unavailable";
  return (
    <section aria-label={`Notícias de ${symbol}`} className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900/80 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700/60 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-sky-400/25 bg-sky-400/10 text-sky-300">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h13v16H4zM17 9h3v9a2 2 0 0 1-2 2"/><path d="M7 8h7M7 12h3M7 16h7"/></svg>
          </div>
          <div><h2 className="text-sm font-bold tracking-tight text-slate-100">Notícias da ação <span className="ml-1 font-mono text-sky-300">{symbol}</span></h2><p className="mt-0.5 text-[11px] text-slate-400">Contexto da empresa · fontes identificadas · atualização automática</p></div>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`news-language-${symbol}`}>Idioma das notícias</label>
          <select id={`news-language-${symbol}`} value={language} onChange={e => { setLanguage(e.target.value); setLimit(6); }} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-300">
            <option value="all">Todos os idiomas</option><option value="pt">Português</option><option value="en">Inglês</option>
          </select>
          <button type="button" disabled={busy} onClick={() => void load(undefined, true)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-sky-400/50 disabled:opacity-40">{busy ? "A procurar…" : "↻ Atualizar"}</button>
        </div>
      </div>
      {busy && !feed ? (
        <div className="space-y-3 px-6 py-5" aria-live="polite"><p className="text-xs text-slate-400">A procurar notícias relacionadas com {symbol}…</p>{[0, 1, 2].map(i => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-800/70" />)}</div>
      ) : (
        <>
          {(unavailable || feed?.stale) && <p role="status" className="mx-5 mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{feed?.stale ? feed.message : "Não foi possível atualizar as notícias neste momento. Tenta novamente; a análise técnica continua disponível."}</p>}
          {filtered.length ? (
            <div className="grid divide-y divide-slate-800 md:grid-cols-2 md:divide-y-0">
              {filtered.map((article, i) => <a key={article.id} href={article.url} target="_blank" rel="noopener noreferrer" className="group border-b border-slate-800/70 px-5 py-4 transition hover:bg-slate-800/45 sm:px-6 md:odd:border-r">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-slate-500"><span className="text-sky-300/90">{article.source}</span><span>·</span><time dateTime={article.publishedAt} title={new Date(article.publishedAt).toLocaleString("pt-PT")}>{relativeDate(article.publishedAt)}</time><span className="ml-auto rounded border border-slate-700 px-1">{article.language.toUpperCase()}</span></div>
                <h3 className="text-[13px] font-semibold leading-relaxed text-slate-200 group-hover:text-white">{article.title}<span className="ml-2 inline-block text-sky-400 transition group-hover:translate-x-0.5" aria-hidden="true">↗</span></h3>
                <div className="mt-2 font-mono text-[10px] text-slate-500">{new Date(article.publishedAt).toLocaleDateString("pt-PT")} · {article.via}</div>
              </a>)}
            </div>
          ) : !unavailable && <p className="px-6 py-6 text-sm text-slate-400">{language !== "all" && feed?.articles.length ? "Sem notícias neste idioma. Seleciona todos os idiomas para ver os restantes resultados." : feed?.message ?? "Ainda não há notícias disponíveis para esta empresa."}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[11px] text-slate-500 sm:px-6">
            <span>{feed?.fetchedAt ? `Consultado ${new Date(feed.fetchedAt).toLocaleString("pt-PT")}` : "Feed temporariamente indisponível"}{feed?.stale ? " · cache anterior" : ""}</span>
            <div className="flex items-center gap-4">{relevant.length > limit && <button onClick={() => setLimit(n => n + 6)} className="font-semibold text-sky-300 hover:text-sky-200">Ver mais notícias ↓</button>}<a href={feed?.searchUrl ?? `https://news.google.com/search?q=${encodeURIComponent(symbol)}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-300 hover:text-white">Pesquisa externa ↗</a></div>
          </div>
        </>
      )}
      <div className="border-t border-slate-800 bg-slate-950/40 px-5 py-3 text-[10.5px] leading-relaxed text-slate-500 sm:px-6">Manchetes de feeds públicos, sem leitura do artigo completo. Confirma a empresa e o contexto na fonte. As notícias não são usadas como votos automáticos na previsão técnica.</div>
    </section>
  );
}
