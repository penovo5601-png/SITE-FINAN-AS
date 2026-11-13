import { fetchEuroUniverse, rowToPeer } from "./peers";
import { expectedReturn12m } from "./guide";

type U = ReturnType<typeof rowToPeer>;
export type PortfolioProfile = "CONSERVADORA" | "EQUILIBRADA" | "CRESCIMENTO";

export interface Holding {
  symbol: string; tv: string; name: string; country: string; sector: string; industry: string; price: number; currency: string;
  weightPct: number; amount: number; shares: number; invested: number;
  expectedReturnPct: number; expectedLow: number; expectedHigh: number; expectedGain: number;
  per: number | null; pbv: number | null; roe: number | null; dy: number | null; perf6m: number | null; perf1y: number | null; beta: number | null;
  score: number; trend: "Bullish" | "Bearish" | "Lateral"; stopLoss: number; target: number;
  justification: string;
}
export interface PortfolioPlan {
  profile: PortfolioProfile; title: string; description: string; budget: number; invested: number; cash: number;
  holdings: Holding[];
  expectedReturnPct: number; expectedGain: number; expectedLowPct: number; expectedHighPct: number; expectedVolPct: number; dividendYieldPct: number; beta: number;
  sectors: { name: string; pct: number }[]; countries: { name: string; pct: number }[];
  rationale: string[]; risks: string[];
  stressScenarios: { name: string; marketMove: number; portfolioMove: number; value: number }[];
}

const SECTOR_PT: Record<string, string> = { "Finance": "Banca & Seguros", "Energy Minerals": "Energia (Petróleo & Gás)", "Utilities": "Utilities (Eletricidade & Gás)", "Retail Trade": "Retalho", "Consumer Non-Durables": "Consumo Básico & Luxo", "Consumer Durables": "Bens Duradouros & Automóvel", "Health Technology": "Saúde & Farmacêutica", "Technology Services": "Tecnologia (Software)", "Electronic Technology": "Tecnologia (Hardware & Semicondutores)", "Producer Manufacturing": "Indústria", "Industrial Services": "Serviços Industriais & Construção", "Non-Energy Minerals": "Materiais & Construção", "Process Industries": "Química & Processos", "Communications": "Telecomunicações", "Transportation": "Transportes", "Consumer Services": "Serviços ao Consumidor", "Commercial Services": "Serviços Empresariais", "Distribution Services": "Distribuição", "Health Services": "Serviços de Saúde", "Miscellaneous": "Diversos" };
const COUNTRY_PT: Record<string, string> = { Portugal: "Portugal", Spain: "Espanha", France: "França", Italy: "Itália", Germany: "Alemanha", Netherlands: "Países Baixos", Belgium: "Bélgica", Austria: "Áustria", Ireland: "Irlanda", Finland: "Finlândia" };
const r1 = (v: number) => Math.round(v * 10) / 10;

function scoreStock(u: U, profile: PortfolioProfile): number {
  const per = u.per ?? 25, roe = u.roe ?? 8, dy = u.dy ?? 0, p6 = u.perf6m ?? 0, p1y = u.perf1y ?? 0, beta = u.beta ?? 1, de = u.de ?? 1, revG = u.revG ?? 0, epsG = u.epsG ?? 0, vol = u.volM ?? 2;
  const valueS = Math.max(0, Math.min(100, (30 - per) * 4));           // PER baixo
  const qualityS = Math.max(0, Math.min(100, roe * 4));                 // ROE alto
  const incomeS = Math.max(0, Math.min(100, dy * 16));                  // dividendos
  const momS = Math.max(0, Math.min(100, 50 + p6 * 1.5 + p1y * 0.5));   // tendência 6M/1A
  const growthS = Math.max(0, Math.min(100, 50 + revG * 2 + epsG * 0.8));
  const safetyS = Math.max(0, Math.min(100, 100 - Math.max(0, beta - 0.8) * 60 - Math.max(0, de - 1) * 15 - Math.max(0, vol - 1.5) * 10));
  if (profile === "CONSERVADORA") return valueS * 0.2 + qualityS * 0.2 + incomeS * 0.25 + momS * 0.1 + growthS * 0.05 + safetyS * 0.2;
  if (profile === "CRESCIMENTO") return valueS * 0.1 + qualityS * 0.2 + incomeS * 0.05 + momS * 0.3 + growthS * 0.3 + safetyS * 0.05;
  return valueS * 0.2 + qualityS * 0.2 + incomeS * 0.15 + momS * 0.2 + growthS * 0.15 + safetyS * 0.1;
}

function selectDiversified(universe: U[], profile: PortfolioProfile, n: number): U[] {
  const pool = universe.filter(u => u.price && u.price > 0 && u.sector && u.per != null && u.per > 0 && u.per < (profile === "CRESCIMENTO" ? 60 : 35) && (u.roe ?? 0) > (profile === "CONSERVADORA" ? 6 : 3) && (profile !== "CONSERVADORA" || (u.beta ?? 1) < 1.25) && (profile !== "CONSERVADORA" || (u.perf1y ?? 0) > -20));
  const ranked = pool.map(u => ({ u, s: scoreStock(u, profile) })).sort((a, b) => b.s - a.s);
  const picked: U[] = []; const perSector = new Map<string, number>(); const perCountry = new Map<string, number>(); const perIndustry = new Set<string>();
  const maxPerSector = 2, maxPerCountry = Math.ceil(n * 0.4);
  for (const { u } of ranked) {
    if (picked.length >= n) break;
    const sec = u.sector!, cty = u.country, ind = u.industry ?? sec;
    if ((perSector.get(sec) ?? 0) >= maxPerSector || (perCountry.get(cty) ?? 0) >= maxPerCountry || perIndustry.has(ind)) continue;
    picked.push(u); perSector.set(sec, (perSector.get(sec) ?? 0) + 1); perCountry.set(cty, (perCountry.get(cty) ?? 0) + 1); perIndustry.add(ind);
  }
  // Garantir pelo menos uma portuguesa se existir no pool e ainda não entrou (contexto Euronext Lisboa)
  if (!picked.some(p => p.country === "Portugal")) {
    const pt = ranked.find(r => r.u.country === "Portugal" && !picked.includes(r.u));
    if (pt && picked.length) {
      const sameSector = picked.map((u, i) => ({ u, i })).filter(x => x.u.sector === pt.u.sector);
      const victim = (perSector.get(pt.u.sector!) ?? 0) >= maxPerSector && sameSector.length ? sameSector[sameSector.length - 1].i : picked.length - 1;
      picked[victim] = pt.u;
    }
  }
  return picked;
}

export function buildPortfolio(universe: U[], profile: PortfolioProfile, budget: number): PortfolioPlan {
  const n = profile === "CONSERVADORA" ? 10 : profile === "CRESCIMENTO" ? 8 : 9;
  const picks = selectDiversified(universe, profile, n);
  const scores = picks.map(u => scoreStock(u, profile));
  const minS = Math.min(...scores), maxS = Math.max(...scores);
  // Pesos: base igual + inclinação por score, limitado a 8–16%
  let raw = scores.map(s => 1 + (maxS > minS ? (s - minS) / (maxS - minS) : 0) * 0.8);
  let weights = raw.map(w => w / raw.reduce((a, b) => a + b, 0));
  weights = weights.map(w => Math.max(0.08, Math.min(0.16, w)));
  const wsum = weights.reduce((a, b) => a + b, 0); weights = weights.map(w => w / wsum);
  const investable = budget * 0.98; // 2% de caixa para comissões/arredondamentos

  const holdings: Holding[] = picks.map((u, i) => {
    const amount = investable * weights[i];
    const shares = Math.max(1, Math.floor(amount / u.price!));
    const invested = shares * u.price!;
    const fx = u.fccy && u.currency && u.fccy !== u.currency && u.price && u.per && u.shares ? null : 1; // alvo analistas em USD → ignorar se moeda difere e não há conversão fiável
    const analystUpside = fx === 1 && u.analystTarget && u.price ? (u.analystTarget / u.price - 1) * 100 : null;
    const er = expectedReturn12m({ perf1y: u.perf1y, perf6m: u.perf6m, dy: u.dy, per: u.per, roe: u.roe, analystUpside: analystUpside != null && Math.abs(analystUpside) < 60 ? analystUpside : null, beta: u.beta });
    const trend: Holding["trend"] = (u.perf6m ?? 0) > 4 && (u.perf3m ?? 0) > -3 ? "Bullish" : (u.perf6m ?? 0) < -4 && (u.perf3m ?? 0) < 3 ? "Bearish" : "Lateral";
    const sectorPt = SECTOR_PT[u.sector!] ?? u.sector!;
    const justification = `${u.name} (${COUNTRY_PT[u.country] ?? u.country}, ${sectorPt}): PER ${u.per?.toFixed(1) ?? "—"}${u.per != null && u.per < 15 ? " (barata face ao mercado)" : u.per != null && u.per > 25 ? " (prémio justificado pelo crescimento)" : ""}, ROE ${u.roe?.toFixed(1) ?? "—"}%${(u.roe ?? 0) >= 15 ? " (muito rentável)" : ""}, dividend yield ${u.dy?.toFixed(2) ?? "0"}%${(u.dy ?? 0) >= 3 ? " (bom rendimento)" : ""}. Tendência 6 meses ${trend.toLowerCase()} (${(u.perf6m ?? 0) > 0 ? "+" : ""}${u.perf6m?.toFixed(1) ?? "—"}%; 1 ano ${(u.perf1y ?? 0) > 0 ? "+" : ""}${u.perf1y?.toFixed(1) ?? "—"}%)${u.revG != null ? `; receitas ${u.revG > 0 ? "+" : ""}${u.revG.toFixed(1)}% YoY` : ""}. Beta ${u.beta?.toFixed(2) ?? "—"}. Papel na carteira: ${profile === "CONSERVADORA" ? "estabilidade e rendimento" : profile === "CRESCIMENTO" ? "motor de crescimento" : "equilíbrio entre valor e momentum"}; diversifica o setor ${sectorPt} e o país ${COUNTRY_PT[u.country] ?? u.country}. Rendibilidade esperada a 12 meses ≈ ${er.expected > 0 ? "+" : ""}${er.expected}% (intervalo ${er.low}% a ${er.high}%). Stop loss ${(u.price! * 0.93).toFixed(2)} € (−7%), objetivo ${(u.price! * 1.1).toFixed(2)} € (+10%).`;
    return {
      symbol: u.symbol, tv: u.tv, name: u.name, country: COUNTRY_PT[u.country] ?? u.country, sector: sectorPt, industry: u.industry ?? "", price: u.price!, currency: u.currency ?? "EUR",
      weightPct: 0, amount: Math.round(amount), shares, invested: Math.round(invested * 100) / 100,
      expectedReturnPct: er.expected, expectedLow: er.low, expectedHigh: er.high, expectedGain: Math.round(invested * er.expected / 100),
      per: u.per, pbv: u.pbv, roe: u.roe, dy: u.dy, perf6m: u.perf6m, perf1y: u.perf1y, beta: u.beta, score: Math.round(scores[i]), trend,
      stopLoss: Math.round(u.price! * 0.93 * 100) / 100, target: Math.round(u.price! * 1.1 * 100) / 100, justification,
    };
  });
  const invested = holdings.reduce((a, h) => a + h.invested, 0);
  holdings.forEach(h => { h.weightPct = r1((h.invested / budget) * 100); });
  const cash = Math.round((budget - invested) * 100) / 100;
  const w = holdings.map(h => h.invested / invested);
  const expectedReturnPct = r1(holdings.reduce((a, h, i) => a + h.expectedReturnPct * w[i], 0));
  const beta = r1(holdings.reduce((a, h, i) => a + (h.beta ?? 1) * w[i], 0));
  const dividendYieldPct = r1(holdings.reduce((a, h, i) => a + (h.dy ?? 0) * w[i], 0));
  // Volatilidade da carteira: vol média ponderada × fator de diversificação (correlação média 0.45 entre ações europeias)
  const avgVol = holdings.reduce((a, h, i) => a + (18 + Math.max(0, ((h.beta ?? 1) - 1) * 10)) * w[i], 0);
  const nH = holdings.length; const rho = 0.45;
  const expectedVolPct = r1(avgVol * Math.sqrt(1 / nH + (1 - 1 / nH) * rho));
  const sectors = Object.entries(holdings.reduce<Record<string, number>>((m, h) => { m[h.sector] = (m[h.sector] ?? 0) + h.invested; return m; }, {})).map(([name, v]) => ({ name, pct: r1((v / invested) * 100) })).sort((a, b) => b.pct - a.pct);
  const countries = Object.entries(holdings.reduce<Record<string, number>>((m, h) => { m[h.country] = (m[h.country] ?? 0) + h.invested; return m; }, {})).map(([name, v]) => ({ name, pct: r1((v / invested) * 100) })).sort((a, b) => b.pct - a.pct);
  const marketBeta = beta;
  const stressScenarios = [
    { name: "Mercado +15% (ano bom)", marketMove: 15 }, { name: "Mercado +5% (ano normal)", marketMove: 5 }, { name: "Mercado 0%", marketMove: 0 }, { name: "Correção −10%", marketMove: -10 }, { name: "Crise −25%", marketMove: -25 },
  ].map(s => { const pm = r1(s.marketMove * marketBeta + dividendYieldPct * 0.5); return { ...s, portfolioMove: pm, value: Math.round(invested * (1 + pm / 100) + cash) }; });
  const titles: Record<PortfolioProfile, [string, string]> = {
    CONSERVADORA: ["Carteira 1 — Conservadora (rendimento e estabilidade)", "Ações de grande capitalização com dividendos sólidos, PER moderado, beta baixo e balanço robusto. Objetivo: preservar capital e receber rendimento."],
    EQUILIBRADA: ["Carteira 2 — Equilibrada (valor + tendência)", "Mistura de empresas rentáveis a preço razoável com tendência de 6 meses favorável. Objetivo: crescer acima do mercado com risco controlado."],
    CRESCIMENTO: ["Carteira 3 — Crescimento (momentum)", "Empresas com receitas e lucros em expansão e tendência bullish confirmada. Objetivo: maximizar rendibilidade aceitando maior volatilidade."],
  };
  const rationale = [
    `Só ações cotadas em euros (Euronext Lisboa/Paris/Amesterdão/Bruxelas, Madrid, Xetra, Milão) — sem risco cambial e compatível com a plataforma de simulação.`,
    `${nH} posições com pesos entre ${Math.min(...holdings.map(h => h.weightPct))}% e ${Math.max(...holdings.map(h => h.weightPct))}%: nenhuma ação domina a carteira.`,
    `Diversificação: ${sectors.length} setores (máx. 2 ações por setor, 1 por indústria) e ${countries.length} países (máx. 40% por país). Maior setor: ${sectors[0]?.name} (${sectors[0]?.pct}%).`,
    `Seleção pelo método do guia: PER vs concorrentes, ROE, dividend yield, tendência de 6 meses e médias móveis; cada ação tem stop loss (−7%) e objetivo (+10%) definidos à partida.`,
    `Rendibilidade esperada a 12 meses: ${expectedReturnPct > 0 ? "+" : ""}${expectedReturnPct}% (≈ ${Math.round(invested * expectedReturnPct / 100).toLocaleString("pt-PT")} €), com dividendos de ${dividendYieldPct}%/ano incluídos. Volatilidade estimada ${expectedVolPct}% (beta ${beta}).`,
    `Caixa residual de ${cash.toLocaleString("pt-PT")} € para comissões e arredondamento de lotes.`,
  ];
  const risks = [
    `Intervalo provável a 12 meses: ${r1(expectedReturnPct - expectedVolPct)}% a ${r1(expectedReturnPct + expectedVolPct)}% (±1 desvio-padrão). Em crise (−25% no mercado) a carteira perderia ≈ ${stressScenarios[4].portfolioMove}%.`,
    `Concentração geográfica na Zona Euro: sensível a decisões do BCE e à economia europeia.`,
    `As estimativas usam dados atuais (TradingView) e não garantem resultados; reavaliar semanalmente com a tabela-semáforo.`,
  ];
  return { profile, title: titles[profile][0], description: titles[profile][1], budget, invested: Math.round(invested * 100) / 100, cash, holdings, expectedReturnPct, expectedGain: Math.round(invested * expectedReturnPct / 100), expectedLowPct: r1(expectedReturnPct - expectedVolPct), expectedHighPct: r1(expectedReturnPct + expectedVolPct), expectedVolPct, dividendYieldPct, beta, sectors, countries, rationale, risks, stressScenarios };
}

let universeCache: { at: number; data: U[] } | null = null;
export async function buildAllPortfolios(budget: number): Promise<{ budget: number; generatedAt: string; universeSize: number; portfolios: PortfolioPlan[]; note: string }> {
  const b = Math.max(1000, Math.min(100000, Math.round(budget)));
  if (!universeCache || Date.now() - universeCache.at > 20 * 60 * 1000) {
    const u = await fetchEuroUniverse();
    if (u.length) universeCache = { at: Date.now(), data: u };
  }
  const universe = universeCache?.data ?? [];
  const portfolios = (["CONSERVADORA", "EQUILIBRADA", "CRESCIMENTO"] as PortfolioProfile[]).map(p => buildPortfolio(universe, p, b));
  return { budget: b, generatedAt: new Date().toISOString(), universeSize: universe.length, portfolios, note: universe.length ? `Universo: ${universe.length} ações da Zona Euro com capitalização > 2 mM€, liquidez e lucros positivos (TradingView, agora).` : "Fornecedor de dados indisponível neste momento — tenta novamente dentro de minutos." };
}
