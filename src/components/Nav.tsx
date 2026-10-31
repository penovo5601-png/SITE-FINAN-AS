"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SearchBox from "./SearchBox";

const LINKS_MAIN = [
  { href: "/", label: "Início" },
  { href: "/universo", label: "Universo de ações" },
  { href: "/grafico", label: "Analisar gráfico (foto)" },
];

const LINKS_CHART = [
  { href: "/grafico", label: "Início · Analisar foto" },
  { href: "/universo", label: "Universo de ações" },
  { href: "/", label: "Avaliação de ações" },
];

export type NavVariant = "main" | "chart";

export default function Nav({ variant = "main" }: { variant?: NavVariant }) {
  const pathname = usePathname();
  const LINKS = variant === "chart" ? LINKS_CHART : LINKS_MAIN;
  const home = variant === "chart" ? "/grafico" : "/";
  return (
    <header className="sticky top-0 z-50 border-b border-ink-800/80 bg-ink-950/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 sm:px-6">
        <Link href={home} className="group flex shrink-0 items-center gap-2.5">
          <span
            className={`relative grid h-9 w-9 place-items-center rounded-lg shadow-[0_0_22px_-4px_rgba(18,183,106,0.75)] ${
              variant === "chart"
                ? "bg-gradient-to-br from-cyan-signal to-bull-500"
                : "bg-gradient-to-br from-bull-500 to-cyan-signal/80"
            }`}
          >
            {variant === "chart" ? (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#04121a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8h4l2-3h6l2 3h4v12H3z" />
                <circle cx="12" cy="14" r="3.4" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#04120b" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 17l5-6 4 4 5-8" />
                <path d="M17 7h4v4" />
              </svg>
            )}
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-bold tracking-tight text-ink-100">
              {variant === "chart" ? "ChartLens" : "TickerLab"}
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-ink-400">
              {variant === "chart" ? "foto do gráfico → veredicto" : "avaliação técnica global"}
            </span>
          </span>
        </Link>

        <nav className="order-3 flex w-full items-center gap-1 sm:order-2 sm:w-auto sm:flex-1">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
                  active
                    ? "bg-ink-800 text-ink-100 shadow-inner shadow-black/40"
                    : "text-ink-300 hover:bg-ink-850 hover:text-ink-100"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="order-2 ml-auto w-full max-w-xs sm:order-3 sm:w-72">
          <SearchBox compact />
        </div>
      </div>
    </header>
  );
}
