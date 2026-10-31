"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type Hit = {
  symbol: string;
  name: string;
  exchange: string;
  market: string;
  countryCode: string;
  sector: string;
};

const FLAGS: Record<string, string> = {
  PT: "🇵🇹", ES: "🇪🇸", FR: "🇫🇷", DE: "🇩🇪", IT: "🇮🇹", NL: "🇳🇱", BE: "🇧🇪",
  GB: "🇬🇧", IE: "🇮🇪", US: "🇺🇸", CA: "🇨🇦", BR: "🇧🇷", MX: "🇲🇽", AR: "🇦🇷",
  JP: "🇯🇵", CN: "🇨🇳", HK: "🇭🇰", TW: "🇹🇼", KR: "🇰🇷", IN: "🇮🇳", AU: "🇦🇺",
  NZ: "🇳🇿", CH: "🇨🇭", AT: "🇦🇹", SE: "🇸🇪", NO: "🇳🇴", DK: "🇩🇰", FI: "🇫🇮",
  PL: "🇵🇱", GR: "🇬🇷", RU: "🇷🇺", ZA: "🇿🇦", SA: "🇸🇦", AE: "🇦🇪", SG: "🇸🇬",
};

export default function SearchBox({
  compact = false,
  placeholder = "Procurar ação… (AAPL, BCP.LS, PETR4.SA)",
  onSelect,
}: {
  compact?: boolean;
  placeholder?: string;
  onSelect?: (hit: Hit) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tickers/search?q=${encodeURIComponent(q)}&limit=12`);
        const json = (await res.json()) as { results: Hit[] };
        setHits(json.results ?? []);
        setActive(0);
        setOpen(true);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(hit: Hit) {
    setOpen(false);
    setQ("");
    if (onSelect) onSelect(hit);
    else router.push(`/acao/${encodeURIComponent(hit.symbol)}`);
  }

  return (
    <div ref={boxRef} className="relative">
      <div
        className={`flex items-center gap-2 rounded-xl border bg-ink-900/90 transition focus-within:border-bull-500/60 focus-within:shadow-[0_0_0_3px_rgba(18,183,106,0.12)] ${
          compact ? "border-ink-700 px-2.5 py-1.5" : "border-ink-600 px-4 py-3"
        }`}
      >
        <svg viewBox="0 0 24 24" className={compact ? "h-3.5 w-3.5 shrink-0 text-ink-400" : "h-4 w-4 shrink-0 text-ink-400"} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => hits.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") {
              e.preventDefault();
              if (hits[active]) choose(hits[active]);
              else if (q.trim()) router.push(`/acao/${encodeURIComponent(q.trim().toUpperCase())}`);
            } else if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          className={`w-full bg-transparent font-mono text-ink-100 placeholder:text-ink-500 focus:outline-none ${compact ? "text-[12px]" : "text-sm"}`}
          autoComplete="off"
          spellCheck={false}
        />
        {loading && <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-ink-600 border-t-bull-400" />}
      </div>

      {open && hits.length > 0 && (
        <ul className="absolute left-0 right-0 z-50 mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-ink-700 bg-ink-900/98 p-1.5 shadow-2xl shadow-black/70 backdrop-blur-xl">
          {hits.map((h, i) => (
            <li key={h.symbol}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(h)}
                className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition ${
                  i === active ? "bg-ink-800" : "hover:bg-ink-850"
                }`}
              >
                <span className="text-base leading-none">{FLAGS[h.countryCode] ?? "🌐"}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="font-mono text-[13px] font-bold text-ink-100">{h.symbol}</span>
                    <span className="truncate text-[12px] text-ink-300">{h.name}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[10.5px] uppercase tracking-wide text-ink-500">
                    {h.market || h.exchange || "—"}
                    {h.sector ? ` · ${h.sector}` : ""}
                  </span>
                </span>
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-ink-500" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
