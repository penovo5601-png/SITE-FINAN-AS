"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Quote = { symbol: string; name: string; price: number; changePct: number; currency: string; ok: boolean };

export default function TickerTape({ symbols }: { symbols: string[] }) {
  const [quotes, setQuotes] = useState<Quote[]>([]);

  useEffect(() => {
    if (!symbols.length) return;
    let alive = true;
    const list = symbols.slice(0, 16).join(",");
    fetch(`/api/quotes?symbols=${encodeURIComponent(list)}`)
      .then((r) => r.json())
      .then((j: { quotes?: Quote[] }) => {
        if (alive) setQuotes((j.quotes ?? []).filter((q) => q.ok));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!quotes.length) return null;
  const doubled = [...quotes, ...quotes];

  return (
    <div className="relative overflow-hidden rounded-xl border border-ink-800 bg-ink-900/60 py-2.5">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-ink-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-ink-950 to-transparent" />
      <div className="ticker-tape flex w-max items-center gap-7 px-4">
        {doubled.map((q, i) => (
          <Link
            key={`${q.symbol}-${i}`}
            href={`/acao/${encodeURIComponent(q.symbol)}`}
            className="flex shrink-0 items-baseline gap-2 text-[12px] transition hover:opacity-80"
          >
            <span className="tnum font-bold text-ink-200">{q.symbol}</span>
            <span className="tnum text-ink-300">
              {q.price.toFixed(2)}
              <span className="ml-1 text-[10px] text-ink-500">{q.currency}</span>
            </span>
            <span className={`tnum font-semibold ${q.changePct >= 0 ? "text-bull-400" : "text-bear-400"}`}>
              {q.changePct >= 0 ? "▲" : "▼"} {Math.abs(q.changePct).toFixed(2)}%
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
