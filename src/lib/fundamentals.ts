/** Modelo legado preservado. A versão v4 ativa usa company-research.ts e CompanyResearchPanel.tsx com FX explícito e validação de períodos/denominadores. */
/**
 * Relatório fundamental partilhado (AçõesRadar + TickerLab)
 * Fonte: scanner TradingView (dados reais) + velas (consistência).
 * Pilares: Rentabilidade · Crescimento · Saúde do Balanço · Consistência · Valor Intrínseco · Dividendos
 */

export const FUNDAMENTAL_COLUMNS = [
  "close", "currency", "fundamental_currency_code", "sector", "industry", "description", "market_cap_basic", "beta_1_year", "number_of_employees",
  "Perf.W", "Perf.1M", "Perf.3M", "Perf.6M", "Perf.YTD", "Perf.Y", "Perf.3Y", "Perf.5Y", "Perf.10Y",
  "return_on_equity", "return_on_assets", "return_on_invested_capital", "gross_margin", "operating_margin", "net_margin", "free_cash_flow_margin_ttm", "free_cash_flow_ttm",
  "earnings_per_share_basic_ttm", "earnings_per_share_diluted_ttm", "revenue_per_share_ttm", "book_value_per_share_fq",
  "total_revenue_yoy_growth_ttm", "earnings_per_share_diluted_yoy_growth_ttm", "net_income_yoy_growth_ttm", "free_cash_flow_yoy_growth_ttm", "ebitda_yoy_growth_ttm",
  "debt_to_equity", "current_ratio", "quick_ratio", "total_debt", "net_debt", "cash_n_short_term_invest_fq", "total_assets",
  "price_earnings_ttm", "price_book_fq", "enterprise_value_ebitda_ttm", "enterprise_value_fq", "ebitda", "total_revenue", "net_income",
  "dividends_yield", "dividends_yield_fy", "dividend_payout_ratio_ttm", "continuous_dividend_growth", "continuous_dividend_payout", "dps_common_stock_prim_issue_yoy_growth_fy",
  "price_target_average", "price_target_high", "price_target_low", "recommendation_mark", "earnings_release_next_date",
  "eps_surprise_percent_fq", "revenue_surprise_percent_fq", "total_shares_outstanding_fundamental",
] as const;

export type FundamentalRaw = Record<string, number | string | null | undefined>;

export interface PillarItem { label: string; value: string; raw: number | null; good: boolean | null; note: string }
export interface Pillar { key: string; name: string; score: number; grade: "A" | "B" | "C" | "D" | "F"; items: PillarItem[]; summary: string }

export interface PerformanceRow { label: string; pct: number | null }

export interface FundamentalReport {
  available: boolean;
  source: "TradingView" | "estimado";
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  performance: PerformanceRow[];
  behaviour: { positive: number; total: number; text: string; trend: "ASCENDENTE" | "DESCENDENTE" | "MISTO" };
  monthly: { label: string; pct: number }[];
  profitability: Pillar;
  growth: Pillar;
  balance: Pillar;
  consistency: Pillar;
  valuation: Pillar;
  dividends: Pillar;
  intrinsic: {
    graham: number | null;
    grahamGrowth: number | null;
    dcf: number | null;
    evEbitdaFair: number | null;
    analystTarget: number | null;
    average: number | null;
    marginOfSafetyPct: number | null;
    status: "Subavaliada" | "Preço Justo" | "Sobreavaliada" | "N/D";
    notes: string[];
  };
  analysts: { target: number | null; high: number | null; low: number | null; upsidePct: number | null; consensus: string | null };
  nextEarnings: string | null;
  overallScore: number;
  overallGrade: "A" | "B" | "C" | "D" | "F";
  bias: number; // -100..100 para o motor de cenários
  summary: string;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const grade = (s: number): Pillar["grade"] => (s >= 80 ? "A" : s >= 65 ? "B" : s >= 50 ? "C" : s >= 35 ? "D" : "F");
const pct = (v: number | null, d = 1) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(d)}%`);
const fx = (v: number | null, d = 2) => (v == null ? "—" : v.toFixed(d));
export const fmtBig = (v: number | null): string => {
  if (v == null) return "—";
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(2)} bi`;
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)} mM`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)} M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(0)} k`;
  return v.toFixed(0);
};

/** Pontuação linear entre dois limiares (lo → 0, hi → 100). Inverte se hi < lo. */
function lin(v: number | null, lo: number, hi: number): number | null {
  if (v == null) return null;
  if (hi > lo) return clamp(((v - lo) / (hi - lo)) * 100);
  return clamp(((lo - v) / (lo - hi)) * 100);
}
function avg(vals: (number | null)[], weights?: number[]): number | null {
  let s = 0, w = 0;
  vals.forEach((v, i) => { if (v != null) { const ww = weights?.[i] ?? 1; s += v * ww; w += ww; } });
  return w ? s / w : null;
}

const USD_FIELDS_PER_SHARE = ["earnings_per_share_basic_ttm", "earnings_per_share_diluted_ttm", "revenue_per_share_ttm", "book_value_per_share_fq", "price_target_average", "price_target_high", "price_target_low"];
const USD_FIELDS_TOTAL = ["free_cash_flow_ttm", "total_debt", "net_debt", "cash_n_short_term_invest_fq", "total_assets", "enterprise_value_fq", "ebitda", "total_revenue", "net_income", "market_cap_basic"];

/** Converte os fundamentais (USD no TradingView) para a moeda de cotação usando a taxa implícita. */
export function normalizeFundamentalCurrency(raw: FundamentalRaw | null, price: number): { raw: FundamentalRaw | null; fx: number; converted: boolean } {
  if (!raw) return { raw, fx: 1, converted: false };
  const ccy = String(raw.currency ?? ""), fccy = String(raw.fundamental_currency_code ?? "USD");
  if (!ccy || ccy === fccy) return { raw, fx: 1, converted: false };
  const close = num(raw.close) ?? price, shares = num(raw.total_shares_outstanding_fundamental), mcap = num(raw.market_cap_basic), pe = num(raw.price_earnings_ttm), eps = num(raw.earnings_per_share_diluted_ttm) ?? num(raw.earnings_per_share_basic_ttm);
  const pb = num(raw.price_book_fq), bvps = num(raw.book_value_per_share_fq);
  let fx: number | null = null;
  // 1) via P/E (por ação — robusto a empresas com várias classes de ações)
  if (close && pe && eps && eps > 0 && pe > 0) fx = close / pe / eps;
  // 2) via P/B
  if ((!fx || !isFinite(fx) || fx <= 0) && close && pb && bvps && bvps > 0 && pb > 0) fx = close / pb / bvps;
  // 3) via capitalização bolsista
  if ((!fx || !isFinite(fx) || fx <= 0) && close && shares && mcap && mcap > 0) fx = (close * shares) / mcap;
  if (!fx || !isFinite(fx) || fx <= 0) return { raw, fx: 1, converted: false };
  // Moedas cotadas em cêntimos (GBp, ZAc, ILA) produzem fx ~100× — mantém-se, pois o preço também está nessa unidade.
  const out: FundamentalRaw = { ...raw };
  for (const k of [...USD_FIELDS_PER_SHARE, ...USD_FIELDS_TOTAL]) { const v = num(raw[k]); if (v != null) out[k] = v * fx; }
  return { raw: out, fx, converted: true };
}

export function buildFundamentalReport(rawInput: FundamentalRaw | null, price: number, candles: { t: number; c: number }[] = []): FundamentalReport {
  const { raw, fx: fxRate, converted } = normalizeFundamentalCurrency(rawInput, price);
  const g = (k: string) => num(raw?.[k]);
  const available = !!raw && (g("return_on_equity") != null || g("price_earnings_ttm") != null || g("total_revenue") != null);

  // ---------- Performance ----------
  const perfRows: PerformanceRow[] = [
    { label: "1 semana", pct: g("Perf.W") }, { label: "1 mês", pct: g("Perf.1M") }, { label: "3 meses", pct: g("Perf.3M") },
    { label: "6 meses", pct: g("Perf.6M") }, { label: "YTD", pct: g("Perf.YTD") }, { label: "1 ano", pct: g("Perf.Y") },
    { label: "3 anos", pct: g("Perf.3Y") }, { label: "5 anos", pct: g("Perf.5Y") }, { label: "10 anos", pct: g("Perf.10Y") },
  ];
  // Se não houver TV, calcular com velas
  if (!available && candles.length > 20) {
    const last = candles[candles.length - 1];
    const at = (days: number) => { const cut = last.t - days * 86400000; const c = candles.find(x => x.t >= cut); return c ? (last.c / c.c - 1) * 100 : null; };
    const ytdStart = Date.UTC(new Date(last.t).getUTCFullYear(), 0, 1);
    const ytdC = candles.find(x => x.t >= ytdStart);
    perfRows[0].pct = at(7); perfRows[1].pct = at(30); perfRows[2].pct = at(91); perfRows[3].pct = at(182);
    perfRows[4].pct = ytdC ? (last.c / ytdC.c - 1) * 100 : null; perfRows[5].pct = at(365); perfRows[6].pct = candles.length > 700 ? at(1095) : null; perfRows[7].pct = candles.length > 1200 ? at(1825) : null;
  }
  const known = perfRows.filter(r => r.pct != null);
  const positive = known.filter(r => (r.pct as number) > 0).length;
  const shortUp = [perfRows[1].pct, perfRows[2].pct].filter((v): v is number => v != null);
  const longUp = [perfRows[5].pct, perfRows[6].pct].filter((v): v is number => v != null);
  const trend: FundamentalReport["behaviour"]["trend"] = shortUp.every(v => v > 0) && longUp.every(v => v > 0) ? "ASCENDENTE" : shortUp.every(v => v < 0) && longUp.every(v => v < 0) ? "DESCENDENTE" : "MISTO";
  const behaviourText = known.length === 0 ? "Sem histórico de desempenho disponível." :
    `Subiu em ${positive} de ${known.length} horizontes analisados. ${perfRows[5].pct != null ? `No último ano ${(perfRows[5].pct as number) >= 0 ? "valorizou" : "desvalorizou"} ${Math.abs(perfRows[5].pct as number).toFixed(1)}%` : ""}${perfRows[7].pct != null ? `; em 5 anos ${(perfRows[7].pct as number) >= 0 ? "ganhou" : "perdeu"} ${Math.abs(perfRows[7].pct as number).toFixed(0)}%` : ""}. Comportamento recente ${trend === "ASCENDENTE" ? "consistentemente ascendente" : trend === "DESCENDENTE" ? "consistentemente descendente" : "misto (curto e longo prazo divergem)"}.`;

  // ---------- Consistência (velas) ----------
  const monthly: { label: string; pct: number }[] = [];
  if (candles.length > 40) {
    const byMonth = new Map<string, { first: number; last: number }>();
    for (const c of candles) { const d = new Date(c.t); const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; const e = byMonth.get(k); if (!e) byMonth.set(k, { first: c.c, last: c.c }); else e.last = c.c; }
    const keys = [...byMonth.keys()].sort();
    for (let i = 1; i < keys.length; i++) { const prev = byMonth.get(keys[i - 1])!.last; const cur = byMonth.get(keys[i])!.last; monthly.push({ label: keys[i], pct: (cur / prev - 1) * 100 }); }
  }
  const m24 = monthly.slice(-24);
  const posMonths = m24.filter(m => m.pct > 0).length;
  const posMonthPct = m24.length ? (posMonths / m24.length) * 100 : null;
  let worstStreak = 0, cur = 0; for (const m of m24) { cur = m.pct < 0 ? cur + 1 : 0; worstStreak = Math.max(worstStreak, cur); }
  const closes = candles.map(c => c.c);
  const rets: number[] = []; for (let i = Math.max(1, closes.length - 252); i < closes.length; i++) rets.push(closes[i] / closes[i - 1] - 1);
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const sd = rets.length > 1 ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1)) : 0;
  const annVol = sd * Math.sqrt(252) * 100;
  const sharpe = sd ? (mean * 252) / (sd * Math.sqrt(252)) : null;
  let peak = -Infinity, mdd = 0; for (const c of closes.slice(-504)) { peak = Math.max(peak, c); mdd = Math.min(mdd, (c - peak) / peak); }
  const beta = g("beta_1_year");
  const consistency: Pillar = {
    key: "consistency", name: "Consistência", score: 50, grade: "C", summary: "", items: [
      { label: "Meses positivos (24M)", value: posMonthPct != null ? `${posMonths}/${m24.length} (${posMonthPct.toFixed(0)}%)` : "—", raw: posMonthPct, good: posMonthPct == null ? null : posMonthPct >= 55, note: "≥55% é consistente; <45% é errático." },
      { label: "Pior sequência de meses negativos", value: m24.length ? `${worstStreak} meses` : "—", raw: m24.length ? worstStreak : null, good: m24.length ? worstStreak <= 3 : null, note: "Sequências longas indicam tendências de baixa persistentes." },
      { label: "Volatilidade anualizada", value: rets.length ? `${annVol.toFixed(0)}%` : "—", raw: rets.length ? annVol : null, good: rets.length ? annVol < 35 : null, note: "<25% baixa · 25–45% média · >45% elevada." },
      { label: "Drawdown máximo (2A)", value: closes.length ? `${(mdd * 100).toFixed(1)}%` : "—", raw: closes.length ? mdd * 100 : null, good: closes.length ? mdd > -0.3 : null, note: "Queda máxima do pico ao vale." },
      { label: "Sharpe (1A, rf=0)", value: sharpe != null ? sharpe.toFixed(2) : "—", raw: sharpe, good: sharpe == null ? null : sharpe > 0.8, note: ">1 bom · <0 destrói valor ajustado ao risco." },
      { label: "Beta (1A)", value: fx(beta), raw: beta, good: beta == null ? null : beta >= 0.6 && beta <= 1.3, note: "Sensibilidade ao mercado; ~1 acompanha o índice." },
      { label: "Horizontes positivos", value: known.length ? `${positive}/${known.length}` : "—", raw: known.length ? (positive / known.length) * 100 : null, good: known.length ? positive / known.length >= 0.6 : null, note: "1S, 1M, 3M, 6M, YTD, 1A, 3A, 5A, 10A." },
    ]
  };
  consistency.score = Math.round(avg([lin(posMonthPct, 40, 70), lin(m24.length ? worstStreak : null, 6, 1), lin(rets.length ? annVol : null, 70, 20), lin(closes.length ? mdd * 100 : null, -60, -10), lin(sharpe, -0.5, 1.5), lin(known.length ? (positive / known.length) * 100 : null, 20, 90)], [1.2, 0.8, 1, 1, 1, 1]) ?? 50);
  consistency.grade = grade(consistency.score);
  consistency.summary = consistency.score >= 65 ? "Comportamento regular, com subidas distribuídas no tempo e quedas controladas." : consistency.score >= 45 ? "Consistência média: alterna períodos bons e maus." : "Comportamento errático ou em tendência de baixa persistente — exige stops apertados.";

  // ---------- Rentabilidade ----------
  const roe = g("return_on_equity"), roa = g("return_on_assets"), roic = g("return_on_invested_capital");
  const gm = g("gross_margin"), om = g("operating_margin"), nm = g("net_margin"), fcfm = g("free_cash_flow_margin_ttm"), fcf = g("free_cash_flow_ttm");
  const eps = g("earnings_per_share_diluted_ttm") ?? g("earnings_per_share_basic_ttm");
  const profitability: Pillar = {
    key: "profitability", name: "Rentabilidade", score: 50, grade: "C", summary: "", items: [
      { label: "ROE (retorno s/ capital próprio)", value: pct(roe), raw: roe, good: roe == null ? null : roe >= 12, note: ">15% excelente · 8–15% bom · <5% fraco." },
      { label: "ROA (retorno s/ ativos)", value: pct(roa), raw: roa, good: roa == null ? null : roa >= 5, note: ">5% eficiente na utilização dos ativos." },
      { label: "ROIC", value: pct(roic), raw: roic, good: roic == null ? null : roic >= 8, note: "Deve superar o custo do capital (~8%)." },
      { label: "Margem bruta", value: pct(gm), raw: gm, good: gm == null ? null : gm >= 30, note: "Poder de preço e vantagem competitiva." },
      { label: "Margem operacional", value: pct(om), raw: om, good: om == null ? null : om >= 12, note: "Eficiência do negócio principal." },
      { label: "Margem líquida", value: pct(nm), raw: nm, good: nm == null ? null : nm >= 8, note: "Lucro final por cada 100 de receita." },
      { label: "Margem de free cash flow", value: pct(fcfm), raw: fcfm, good: fcfm == null ? null : fcfm >= 5, note: "Caixa real gerada após investimento." },
      { label: "Free cash flow (TTM)", value: fmtBig(fcf), raw: fcf, good: fcf == null ? null : fcf > 0, note: "FCF negativo = queima de caixa." },
      { label: "EPS (lucro por ação, TTM)", value: fx(eps), raw: eps, good: eps == null ? null : eps > 0, note: "Base de todos os múltiplos de lucro." },
    ]
  };
  profitability.score = Math.round(avg([lin(roe, 0, 25), lin(roa, 0, 12), lin(roic, 0, 20), lin(gm, 10, 60), lin(om, 0, 30), lin(nm, -5, 25), lin(fcfm, -10, 25)], [1.5, 1, 1.2, 0.7, 1, 1.2, 1]) ?? 50);
  profitability.grade = grade(profitability.score);
  profitability.summary = profitability.score >= 65 ? "Negócio altamente rentável: margens e retornos sobre capital acima da média." : profitability.score >= 45 ? "Rentabilidade aceitável, sem vantagem competitiva evidente." : "Rentabilidade fraca ou negativa — a empresa não converte receita em lucro de forma eficiente.";

  // ---------- Crescimento ----------
  const revG = g("total_revenue_yoy_growth_ttm"), epsG = g("earnings_per_share_diluted_yoy_growth_ttm"), niG = g("net_income_yoy_growth_ttm"), fcfG = g("free_cash_flow_yoy_growth_ttm"), ebitdaG = g("ebitda_yoy_growth_ttm");
  const epsSurp = g("eps_surprise_percent_fq"), revSurp = g("revenue_surprise_percent_fq");
  const growth: Pillar = {
    key: "growth", name: "Crescimento", score: 50, grade: "C", summary: "", items: [
      { label: "Receita (YoY, TTM)", value: pct(revG), raw: revG, good: revG == null ? null : revG >= 5, note: ">10% forte · 0–5% maduro · <0 contração." },
      { label: "EPS (YoY, TTM)", value: pct(epsG), raw: epsG, good: epsG == null ? null : epsG >= 8, note: "Crescimento do lucro por ação." },
      { label: "Lucro líquido (YoY)", value: pct(niG), raw: niG, good: niG == null ? null : niG >= 5, note: "" },
      { label: "EBITDA (YoY)", value: pct(ebitdaG), raw: ebitdaG, good: ebitdaG == null ? null : ebitdaG >= 5, note: "" },
      { label: "Free cash flow (YoY)", value: pct(fcfG), raw: fcfG, good: fcfG == null ? null : fcfG >= 0, note: "" },
      { label: "Surpresa de EPS (último trim.)", value: pct(epsSurp), raw: epsSurp, good: epsSurp == null ? null : epsSurp > 0, note: "Acima das estimativas dos analistas = positivo." },
      { label: "Surpresa de receita (último trim.)", value: pct(revSurp), raw: revSurp, good: revSurp == null ? null : revSurp > 0, note: "" },
    ]
  };
  growth.score = Math.round(avg([lin(revG, -10, 25), lin(epsG, -20, 40), lin(niG, -20, 40), lin(ebitdaG, -15, 30), lin(fcfG, -40, 40), lin(epsSurp, -10, 15), lin(revSurp, -5, 5)], [1.5, 1.4, 0.8, 0.8, 0.7, 0.6, 0.4]) ?? 50);
  growth.grade = grade(growth.score);
  growth.summary = growth.score >= 65 ? "Em expansão: receitas e lucros a crescer a bom ritmo." : growth.score >= 45 ? "Crescimento moderado/maduro." : "Estagnação ou contração de receitas e lucros.";

  // ---------- Saúde do balanço ----------
  const de = g("debt_to_equity"), cr = g("current_ratio"), qr = g("quick_ratio"), debt = g("total_debt"), netDebt = g("net_debt"), cash = g("cash_n_short_term_invest_fq"), ebitda = g("ebitda"), assets = g("total_assets");
  const netDebtEbitda = netDebt != null && ebitda && ebitda > 0 ? netDebt / ebitda : null;
  const balance: Pillar = {
    key: "balance", name: "Saúde do Balanço", score: 50, grade: "C", summary: "", items: [
      { label: "Dívida / Capital próprio", value: fx(de), raw: de, good: de == null ? null : de < 1, note: "<0.5 conservador · 0.5–1.5 moderado · >2 alavancado." },
      { label: "Dívida líquida / EBITDA", value: netDebtEbitda != null ? `${netDebtEbitda.toFixed(1)}x` : "—", raw: netDebtEbitda, good: netDebtEbitda == null ? null : netDebtEbitda < 3, note: "<2x confortável · >4x pressão financeira." },
      { label: "Liquidez corrente", value: fx(cr), raw: cr, good: cr == null ? null : cr >= 1.2, note: "Ativos correntes / passivos correntes; >1 cumpre obrigações." },
      { label: "Liquidez imediata (quick)", value: fx(qr), raw: qr, good: qr == null ? null : qr >= 1, note: "Sem contar inventários." },
      { label: "Dívida total", value: fmtBig(debt), raw: debt, good: null, note: "" },
      { label: "Caixa e equivalentes", value: fmtBig(cash), raw: cash, good: null, note: "" },
      { label: "Dívida líquida", value: fmtBig(netDebt), raw: netDebt, good: netDebt == null ? null : netDebt <= 0 ? true : null, note: "Negativa = mais caixa do que dívida." },
      { label: "Ativos totais", value: fmtBig(assets), raw: assets, good: null, note: "" },
    ]
  };
  balance.score = Math.round(avg([lin(de, 3, 0.2), lin(netDebtEbitda, 6, 0), lin(cr, 0.6, 2.2), lin(qr, 0.4, 1.8), fcf != null ? (fcf > 0 ? 75 : 25) : null], [1.5, 1.5, 1, 0.8, 0.8]) ?? 50);
  balance.grade = grade(balance.score);
  balance.summary = balance.score >= 65 ? "Balanço sólido: endividamento controlado e boa liquidez." : balance.score >= 45 ? "Balanço razoável; endividamento a vigiar." : "Balanço frágil: alavancagem elevada ou liquidez apertada — risco em cenários adversos.";

  // ---------- Valuation & valor intrínseco ----------
  const pe = g("price_earnings_ttm"), pb = g("price_book_fq"), evEbitda = g("enterprise_value_ebitda_ttm"), bvps = g("book_value_per_share_fq"), shares = g("total_shares_outstanding_fundamental"), ev = g("enterprise_value_fq"), mcap = g("market_cap_basic");
  const notes: string[] = [];
  if (converted) notes.push(`Fundamentais convertidos de ${String(rawInput?.fundamental_currency_code ?? "USD")} para ${String(rawInput?.currency ?? "")} (taxa implícita ${fxRate.toFixed(4)}).`);
  const graham = eps != null && bvps != null && eps > 0 && bvps > 0 ? Math.sqrt(22.5 * eps * bvps) : null;
  if (graham == null) notes.push("Número de Graham indisponível (EPS ou valor contabilístico ≤ 0).");
  // Fórmula de crescimento de Graham: V = EPS × (8.5 + 2g) × 4.4 / Y  (g limitado a 0–15%, Y = 4.5% yield AAA)
  const sectorLower = String(raw?.sector ?? "").toLowerCase();
  const gCap = /energy|mineral|process|utilit|finance|transport/.test(sectorLower) ? 6 : 15;
  const gEst = epsG != null && revG != null ? clamp((epsG * 0.4 + revG * 0.6), -5, gCap) : revG != null ? clamp(revG, -5, gCap) : null;
  const grahamGrowth = eps != null && eps > 0 && gEst != null ? (eps * (8.5 + 2 * Math.max(0, gEst)) * 4.4) / 4.5 : null;
  // DCF simplificado 5 anos sobre EPS: crescimento gEst (decrescente), desconto 9%, terminal 12x
  let dcf: number | null = null;
  if (eps != null && eps > 0) {
    const gr = clamp(gEst ?? 4, 0, gCap) / 100; let e = eps, sum = 0;
    for (let y = 1; y <= 5; y++) { e *= 1 + gr * (1 - (y - 1) * 0.12); sum += e / Math.pow(1.09, y); }
    dcf = sum + (e * 12) / Math.pow(1.09, 5);
  } else notes.push("DCF indisponível (lucros negativos).");
  // EV/EBITDA justo por setor → equity value por ação (ações implícitas = capitalização / preço, robusto a multi-classe)
  const sectorName = String(raw?.sector ?? "").toLowerCase();
  const cyclical = /energy|mineral|process|utilit|transport|industrial|finance|real estate|retail|distribution/.test(sectorName);
  const premium = /technology|health|software|electronic|communications|consumer non-durables/.test(sectorName);
  const fairMultiple = premium ? 14 : cyclical ? 7 : 10;
  const impliedShares = mcap && price > 0 ? mcap / price : shares;
  let evEbitdaFair: number | null = null;
  if (ebitda && ebitda > 0 && impliedShares && impliedShares > 0) { const fairEv = ebitda * fairMultiple; const equity = fairEv - (netDebt ?? 0); evEbitdaFair = equity > 0 ? equity / impliedShares : null; }
  notes.push(`EV/EBITDA justo assumido: ${fairMultiple}x (${premium ? "setor de crescimento" : cyclical ? "setor cíclico/regulado" : "média de mercado"}).`);
  let analystTarget = g("price_target_average");
  if (analystTarget != null && price > 0 && (analystTarget > price * 3 || analystTarget < price / 3)) { notes.push("Alvo de analistas descartado por incoerência de unidades."); analystTarget = null; }
  const rawModels = [graham, grahamGrowth, dcf, evEbitdaFair];
  const models = rawModels.filter((v): v is number => v != null && v > 0 && price > 0 && v <= price * 3 && v >= price / 4);
  const dropped = rawModels.filter((v): v is number => v != null && v > 0 && price > 0 && (v > price * 3 || v < price / 4)).length;
  if (dropped) notes.push(`${dropped} modelo(s) descartado(s) por desvio extremo face ao preço (provável distorção de unidades ou lucros atípicos).`);
  const weightsModels = [graham, grahamGrowth, dcf, evEbitdaFair].map(v => (v != null && v > 0 ? 1 : 0));
  let average = models.length ? models.reduce((a, b) => a + b, 0) / models.length : null;
  if (average != null && analystTarget != null) average = average * 0.7 + analystTarget * 0.3;
  else if (average == null && analystTarget != null) { average = analystTarget; notes.push("Valor intrínseco baseado apenas no consenso de analistas."); }
  const mos = average != null && price > 0 ? (average / price - 1) * 100 : null;
  const status: FundamentalReport["intrinsic"]["status"] = mos == null ? "N/D" : mos >= 15 ? "Subavaliada" : mos <= -15 ? "Sobreavaliada" : "Preço Justo";
  void weightsModels;

  const valuation: Pillar = {
    key: "valuation", name: "Valuation", score: 50, grade: "C", summary: "", items: [
      { label: "P/E (preço / lucro, TTM)", value: pe != null ? `${pe.toFixed(1)}x` : "—", raw: pe, good: pe == null ? null : pe > 0 && pe < 20, note: "<15 barato · 15–25 razoável · >30 caro (depende do crescimento)." },
      { label: "P/B (preço / valor contabilístico)", value: pb != null ? `${pb.toFixed(2)}x` : "—", raw: pb, good: pb == null ? null : pb < 3, note: "<1 abaixo do valor contabilístico." },
      { label: "EV / EBITDA", value: evEbitda != null ? `${evEbitda.toFixed(1)}x` : "—", raw: evEbitda, good: evEbitda == null ? null : evEbitda < 12, note: "<8 barato · 8–14 normal · >18 caro." },
      { label: "PEG (P/E ÷ crescimento EPS)", value: pe != null && epsG != null && epsG > 0 ? (pe / epsG).toFixed(2) : "—", raw: pe != null && epsG != null && epsG > 0 ? pe / epsG : null, good: pe != null && epsG != null && epsG > 0 ? pe / epsG < 1.5 : null, note: "<1 crescimento barato · >2 caro." },
      { label: "Capitalização bolsista", value: fmtBig(mcap), raw: mcap, good: null, note: "" },
      { label: "Enterprise value", value: fmtBig(ev), raw: ev, good: null, note: "" },
      { label: "Margem de segurança (valor intrínseco)", value: pct(mos), raw: mos, good: mos == null ? null : mos > 10, note: "Desconto do preço face ao valor justo médio dos modelos." },
    ]
  };
  valuation.score = Math.round(avg([lin(pe != null && pe > 0 ? pe : null, 45, 8), lin(pb, 8, 0.8), lin(evEbitda != null && evEbitda > 0 ? evEbitda : null, 25, 5), lin(mos, -40, 40)], [1, 0.6, 1, 2]) ?? 50);
  valuation.grade = grade(valuation.score);
  valuation.summary = status === "Subavaliada" ? `Negoceia com desconto de ${Math.abs(mos ?? 0).toFixed(0)}% face ao valor intrínseco estimado.` : status === "Sobreavaliada" ? `Negoceia com prémio de ${Math.abs(mos ?? 0).toFixed(0)}% face ao valor intrínseco — o mercado já desconta muito crescimento.` : status === "Preço Justo" ? "Preço alinhado com o valor intrínseco estimado." : "Sem dados suficientes para estimar o valor intrínseco.";

  // ---------- Dividendos ----------
  const dy = g("dividends_yield") ?? g("dividends_yield_fy"), payout = g("dividend_payout_ratio_ttm"), dGrowthYears = g("continuous_dividend_growth"), dPayYears = g("continuous_dividend_payout"), dpsG = g("dps_common_stock_prim_issue_yoy_growth_fy");
  const dividends: Pillar = {
    key: "dividends", name: "Dividendos", score: 50, grade: "C", summary: "", items: [
      { label: "Dividend yield", value: pct(dy, 2), raw: dy, good: dy == null ? null : dy >= 2, note: "" },
      { label: "Payout ratio", value: pct(payout, 0), raw: payout, good: payout == null ? null : payout > 0 && payout < 75, note: ">90% insustentável; 0 = não paga." },
      { label: "Anos consecutivos a pagar", value: dPayYears != null ? `${dPayYears}` : "—", raw: dPayYears, good: dPayYears == null ? null : dPayYears >= 5, note: "" },
      { label: "Anos consecutivos a aumentar", value: dGrowthYears != null ? `${dGrowthYears}` : "—", raw: dGrowthYears, good: dGrowthYears == null ? null : dGrowthYears >= 3, note: "" },
      { label: "Crescimento do dividendo (YoY)", value: pct(dpsG), raw: dpsG, good: dpsG == null ? null : dpsG > 0, note: "" },
    ]
  };
  dividends.score = dy == null || dy === 0 ? 40 : Math.round(avg([lin(dy, 0, 6), lin(payout, 110, 30), lin(dPayYears, 0, 15), lin(dGrowthYears, 0, 10), lin(dpsG, -10, 15)], [1.5, 1, 1, 1, 0.7]) ?? 50);
  dividends.grade = grade(dividends.score);
  dividends.summary = dy == null || dy === 0 ? "Não distribui dividendos (reinveste os lucros)." : dividends.score >= 65 ? "Pagador de dividendos fiável e sustentável." : dividends.score >= 45 ? "Dividendo moderado." : "Dividendo frágil ou pouco sustentável.";

  // ---------- Analistas, próximos resultados ----------
  const tHigh = analystTarget != null ? g("price_target_high") : null, tLow = analystTarget != null ? g("price_target_low") : null, rec = g("recommendation_mark");
  const consensus = rec == null ? null : rec <= 1.5 ? "Compra forte" : rec <= 2.5 ? "Compra" : rec <= 3.5 ? "Manter" : rec <= 4.5 ? "Venda" : "Venda forte";
  const nextE = g("earnings_release_next_date");
  const nextEarnings = nextE ? new Date(nextE * 1000).toLocaleDateString("pt-PT") : null;

  // ---------- Score global ----------
  const pillars = [profitability, growth, balance, consistency, valuation, dividends];
  const overallScore = Math.round(avg(pillars.map(p => p.score), [1.3, 1.2, 1.2, 1, 1.4, 0.5]) ?? 50);
  const overallGrade = grade(overallScore);
  const bias = Math.round(clamp((overallScore - 50) * 2 + (mos != null ? clamp(mos, -30, 30) * 0.5 : 0), -100, 100));
  const summary = !available
    ? "Fundamentais indisponíveis para este título; a avaliação usa apenas técnica, consistência de preço e notícias."
    : `Qualidade fundamental ${overallGrade} (${overallScore}/100): rentabilidade ${profitability.grade}, crescimento ${growth.grade}, balanço ${balance.grade}, consistência ${consistency.grade}, valuation ${valuation.grade}. ${valuation.summary}`;

  return {
    available, source: available ? "TradingView" : "estimado",
    sector: (raw?.sector as string) ?? null, industry: (raw?.industry as string) ?? null, marketCap: mcap,
    performance: perfRows,
    behaviour: { positive, total: known.length, text: behaviourText, trend },
    monthly: monthly.slice(-24),
    profitability, growth, balance, consistency, valuation, dividends,
    intrinsic: { graham: graham != null ? +graham.toFixed(2) : null, grahamGrowth: grahamGrowth != null ? +grahamGrowth.toFixed(2) : null, dcf: dcf != null ? +dcf.toFixed(2) : null, evEbitdaFair: evEbitdaFair != null ? +evEbitdaFair.toFixed(2) : null, analystTarget, average: average != null ? +average.toFixed(2) : null, marginOfSafetyPct: mos != null ? +mos.toFixed(1) : null, status, notes },
    analysts: { target: analystTarget, high: tHigh, low: tLow, upsidePct: analystTarget != null && price > 0 ? +((analystTarget / price - 1) * 100).toFixed(1) : null, consensus },
    nextEarnings,
    overallScore, overallGrade, bias, summary,
  };
}
