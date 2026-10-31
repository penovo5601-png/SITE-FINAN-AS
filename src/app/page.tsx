import Link from "next/link";
import { redirect } from "next/navigation";
import { countTickers, ensureSeeded, featuredTickers, marketStats, recentAnalyses } from "@/lib/universe";
import SearchBox from "@/components/SearchBox";
import { VerdictBadge, type Verdict } from "@/components/ui";
import TickerTape from "@/components/TickerTape";

export const dynamic = "force-dynamic";

/** No modo "chart" (site ChartLens) a entrada é diretamente o analisador de fotografias. */
const SITE_MODE = process.env.SITE_MODE ?? "main";

const FLAGS: Record<string, string> = {
  PT: "🇵🇹", ES: "🇪🇸", FR: "🇫🇷", DE: "🇩🇪", IT: "🇮🇹", NL: "🇳🇱", BE: "🇧🇪",
  GB: "🇬🇧", IE: "🇮🇪", US: "🇺🇸", CA: "🇨🇦", BR: "🇧🇷", MX: "🇲🇽", AR: "🇦🇷",
  JP: "🇯🇵", CN: "🇨🇳", HK: "🇭🇰", TW: "🇹🇼", KR: "🇰🇷", IN: "🇮🇳", AU: "🇦🇺",
  NZ: "🇳🇿", CH: "🇨🇭", AT: "🇦🇹", SE: "🇸🇪", NO: "🇳🇴", DK: "🇩🇰", FI: "🇫🇮",
  PL: "🇵🇱", GR: "🇬🇷", RU: "🇷🇺", ZA: "🇿🇦", SA: "🇸🇦", AE: "🇦🇪", SG: "🇸🇬",
};

export default async function Home() {
  if (SITE_MODE === "chart") redirect("/grafico");
  await ensureSeeded();
  const [total, markets, featured, recent] = await Promise.all([
    countTickers(),
    marketStats(),
    featuredTickers(16),
    recentAnalyses(10),
  ]);

  const topMarkets = markets.slice(0, 14);

  return (
    <div className="space-y-10">
      {/* ---------------- HERO ---------------- */}
      <section className="relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/50">
        <div className="grid-lines absolute inset-0 opacity-[0.35]" />
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-bull-500/18 blur-3xl" />
        <div className="absolute -bottom-32 right-0 h-80 w-80 rounded-full bg-cyan-signal/14 blur-3xl" />
        <div className="relative px-6 py-12 sm:px-10 sm:py-16">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-950/70 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-300">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-bull-400" />
            {total.toLocaleString("pt-PT")} ações indexadas · {markets.length} mercados
          </div>

          <h1 className="max-w-4xl text-4xl font-bold leading-[1.06] tracking-tight text-ink-100 sm:text-5xl lg:text-[58px]">
            Diz-me a ação.{" "}
            <span className="bg-gradient-to-r from-bull-400 via-cyan-signal to-bull-300 bg-clip-text text-transparent">
              Digo-te se sobe ou desce
            </span>{" "}
            — e porquê.
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-ink-300">
            Motor de avaliação técnica que cruza RSI, MACD, ADX, Bandas de Bollinger, Estocástico, MFI, OBV, CCI,
            Williams %R, médias móveis, estrutura de máximos/mínimos e níveis de suporte/resistência para produzir uma
            pontuação de −100 a +100, uma probabilidade de subida e um plano com alvos e stop.
          </p>

          <div className="mt-8 max-w-2xl">
            <SearchBox placeholder="Procurar em 61.000+ ações… ex.: BCP.LS, AAPL, SIE.DE, PETR4.SA, 7203.T" />
            <div className="mt-3 flex flex-wrap gap-2 text-[11.5px]">
              {["BCP.LS", "EDP.LS", "JMT.LS", "AAPL", "NVDA", "TSLA", "PETR4.SA", "SIE.DE", "MC.PA", "7203.T"].map((s) => (
                <Link
                  key={s}
                  href={`/acao/${s}`}
                  className="tnum rounded-md border border-ink-700 bg-ink-900/80 px-2 py-1 text-ink-300 transition hover:border-bull-500/50 hover:text-bull-300"
                >
                  {s}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { k: "Ações cobertas", v: total.toLocaleString("pt-PT") },
              { k: "Mercados", v: String(markets.length) },
              { k: "Indicadores por ação", v: "25+" },
              { k: "Análise de foto", v: "Sim" },
            ].map((s) => (
              <div key={s.k} className="rounded-xl border border-ink-800 bg-ink-950/60 px-4 py-3.5">
                <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-500">{s.k}</div>
                <div className="tnum mt-1 text-2xl font-bold text-ink-100">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <TickerTape symbols={featured.map((f) => f.symbol)} />

      {/* ---------------- ANÁLISE POR FOTO ---------------- */}
      <section className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="panel relative overflow-hidden p-7">
          <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full bg-cyan-signal/12 blur-3xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-signal/35 bg-cyan-signal/10 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-cyan-signal">
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M3 8h4l2-3h6l2 3h4v12H3z" /><circle cx="12" cy="14" r="3.4" /></svg>
              visão computacional
            </span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-ink-100 sm:text-[28px]">
              Manda-me uma foto do gráfico e eu leio-o
            </h2>
            <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-ink-300">
              Carrega uma captura do TradingView, do banco ou do telemóvel. Reconstruo a série de preços píxel a píxel,
              meço a inclinação da tendência, o R², o rácio de velas verdes/vermelhas, a posição do último preço no
              intervalo, a volatilidade residual e os níveis horizontais onde o preço reagiu. Se indicares também o
              símbolo, cruzo com os dados reais e digo-te se as duas leituras concordam ou divergem.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/grafico"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-bull-500 to-bull-600 px-5 py-3 text-[14px] font-bold text-ink-950 shadow-[0_10px_30px_-10px_rgba(18,183,106,0.9)] transition hover:brightness-110"
              >
                Enviar fotografia do gráfico
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
              <Link
                href="/universo"
                className="inline-flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-900/70 px-5 py-3 text-[14px] font-semibold text-ink-200 transition hover:border-ink-600 hover:text-ink-100"
              >
                Explorar os {total.toLocaleString("pt-PT")} tickers
              </Link>
            </div>
          </div>
        </div>

        <div className="panel p-6">
          <h3 className="text-[12px] font-bold uppercase tracking-[0.16em] text-ink-400">Como leio um gráfico</h3>
          <ol className="mt-4 space-y-3">
            {[
              "Identifico o fundo dominante e a área de plotagem (descarto eixos e legendas).",
              "Classifico cada píxel por matiz: verde = vela compradora, vermelho = vela vendedora.",
              "Reconstruo o centro de massa de cada coluna → série de preços normalizada.",
              "Regressão linear: inclinação global, inclinação recente e R² (qualidade da tendência).",
              "Deteto prateleiras horizontais de densidade → suportes e resistências.",
              "Pondero tudo num score −100…+100 e devolvo expectativa + probabilidade + confiança.",
            ].map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className="tnum mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border border-ink-700 bg-ink-850 text-[10.5px] font-bold text-bull-400">
                  {i + 1}
                </span>
                <span className="text-[12.8px] leading-relaxed text-ink-300">{t}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- MERCADOS ---------------- */}
      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.16em] text-ink-400">Cobertura por mercado</h2>
          <Link href="/universo" className="text-[12px] font-medium text-bull-400 hover:text-bull-300">
            ver todos →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {topMarkets.map((m) => {
            const code = Object.keys(FLAGS).find((k) => m.market.toLowerCase().includes(k.toLowerCase())) ?? "";
            return (
              <Link
                key={m.market}
                href={`/universo?market=${encodeURIComponent(m.market)}`}
                className="group rounded-xl border border-ink-800 bg-ink-900/50 p-3.5 transition hover:border-bull-500/40 hover:bg-ink-850"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg leading-none">{FLAGS[code] ?? "🌐"}</span>
                  <span className="truncate text-[12.5px] font-semibold text-ink-200 group-hover:text-ink-100">{m.market}</span>
                </div>
                <div className="tnum mt-2 text-xl font-bold text-ink-100">{m.count.toLocaleString("pt-PT")}</div>
                <div className="text-[10px] uppercase tracking-wider text-ink-500">ações</div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ---------------- DESTAQUES + RECENTES ---------------- */}
      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 className="mb-4 text-[13px] font-bold uppercase tracking-[0.16em] text-ink-400">Ações em destaque</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {featured.map((f) => (
              <Link
                key={f.symbol}
                href={`/acao/${encodeURIComponent(f.symbol)}`}
                className="group flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-900/50 px-4 py-3 transition hover:border-bull-500/40 hover:bg-ink-850"
              >
                <span className="text-xl leading-none">{FLAGS[f.countryCode ?? ""] ?? "🌐"}</span>
                <span className="min-w-0 flex-1">
                  <span className="tnum block text-[13.5px] font-bold text-ink-100">{f.symbol}</span>
                  <span className="block truncate text-[12px] text-ink-400">{f.name}</span>
                </span>
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-ink-600 transition group-hover:translate-x-0.5 group-hover:text-bull-400" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-[13px] font-bold uppercase tracking-[0.16em] text-ink-400">Últimas avaliações</h2>
          <div className="panel divide-y divide-ink-800/80 overflow-hidden">
            {recent.length === 0 && (
              <div className="px-4 py-8 text-center text-[12.5px] text-ink-500">
                Ainda não há avaliações. Procura uma ação acima para gerar a primeira.
              </div>
            )}
            {recent.map((r) => (
              <Link
                key={r.id}
                href={`/acao/${encodeURIComponent(r.symbol)}`}
                className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-ink-850"
              >
                <span className="min-w-0 flex-1">
                  <span className="tnum block truncate text-[12.5px] font-bold text-ink-100">{r.symbol}</span>
                  <span className="block truncate text-[11px] text-ink-500">{r.name ?? ""}</span>
                </span>
                <span className="tnum shrink-0 text-right">
                  <span className="block text-[11px] text-ink-400">
                    {r.price != null ? `${r.price.toFixed(2)} ${r.currency ?? ""}` : ""}
                  </span>
                  <span className="block text-[10px] text-ink-600">
                    {r.createdAt ? new Date(r.createdAt).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                  </span>
                </span>
                <VerdictBadge verdict={r.verdict as Verdict} size="sm" label={`${r.score > 0 ? "+" : ""}${r.score.toFixed(0)}`} />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
