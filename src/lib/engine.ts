import type { Candle, ChartBundle } from "./yahoo";
import type { ConfluenceReport } from "./confluence";
import type { CompanyResearch } from "./company-research";
import type { HistoryEvidence } from "./history-types";
import type { DecisionAudit } from "./decision-audit";
import {
  adx,
  annualizedVolatility,
  atr,
  bollinger,
  cci,
  crossAbove,
  crossBelow,
  ema,
  last,
  linregR2,
  linregSlope,
  macd,
  maxDrawdown,
  mfi,
  obv,
  normalizedObvSlope,
  roc,
  rsi,
  sma,
  stochastic,
  supportResistance,
  williamsR,
  type Level,
  type Series,
} from "./indicators";

export type Verdict = "SUBIR" | "DESCER" | "NEUTRO";

/** Snapshot genérico do scanner TradingView. */
export type TvLike = Record<string, number | string | null>;

const tvNum = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);
const tvStr = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

export function buildFundamentals(s: TvLike | null | undefined): Fundamentals | null {
  if (!s) return null;
  return {
    marketCap: tvNum(s.market_cap_basic),
    pe: tvNum(s.price_earnings_ttm),
    dividendYield: tvNum(s.dividends_yield),
    beta: tvNum(s.beta_1_year),
    priceBook: tvNum(s.price_book_fq),
    priceSales: tvNum(s.price_sales_fq),
    eps: tvNum(s.earnings_per_share_basic_ttm),
    roe: tvNum(s.return_on_equity),
    industry: tvStr(s.industry),
    tvSymbol: tvStr(s.__tv),
    tvRecommendAll: tvNum(s["Recommend.All"]),
    tvRecommendMa: tvNum(s["Recommend.MA"]),
    tvRecommendOther: tvNum(s["Recommend.Other"]),
    tvRsiWeekly: tvNum(s["RSI|1W"]),
    tvRsiMonthly: tvNum(s["RSI|1M"]),
    tvRecommendWeekly: tvNum(s["Recommend.All|1W"]),
    tvRecommendMonthly: tvNum(s["Recommend.All|1M"]),
    volatilityWeek: tvNum(s["Volatility.W"]),
    volatilityMonth: tvNum(s["Volatility.M"]),
    nextEarnings: tvStr(s.earnings_release_date),
    pivots: {
      s1: tvNum(s["Pivot.M.Classic.S1"]),
      r1: tvNum(s["Pivot.M.Classic.R1"]),
      s2: tvNum(s["Pivot.M.Classic.S2"]),
      r2: tvNum(s["Pivot.M.Classic.R2"]),
      s3: tvNum(s["Pivot.M.Classic.S3"]),
      r3: tvNum(s["Pivot.M.Classic.R3"]),
    },
  };
}

export type Signal = {
  id: string;
  group: "Tendência" | "Momento" | "Volume" | "Volatilidade" | "Padrões";
  name: string;
  value: string;
  bias: number; // -100 (muito baixista) .. +100 (muito altista)
  weight: number; // 0..1
  detail: string;
};

export type IndicatorSnapshot = {
  rsi14: number | null;
  rsi7: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema9: number | null;
  ema21: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  bbUpper: number | null;
  bbMid: number | null;
  bbLower: number | null;
  percentB: number | null;
  bandwidth: number | null;
  stochK: number | null;
  stochD: number | null;
  williamsR: number | null;
  cci20: number | null;
  mfi14: number | null;
  adx14: number | null;
  plusDI: number | null;
  minusDI: number | null;
  atr14: number | null;
  atrPct: number | null;
  volatility30: number | null;
  roc12: number | null;
  roc60: number | null;
  avgVolume20: number | null;
  volumeRatio: number | null;
  obvSlope: number | null;
  slope20: number | null;
  slope60: number | null;
  trendR2: number | null;
  maxDrawdown: number | null;
};

export type Performance = {
  d1: number | null;
  w1: number | null;
  m1: number | null;
  m3: number | null;
  m6: number | null;
  y1: number | null;
};

export type Fundamentals = {
  marketCap: number | null;
  pe: number | null;
  dividendYield: number | null;
  beta: number | null;
  priceBook: number | null;
  priceSales: number | null;
  eps: number | null;
  roe: number | null;
  industry: string | null;
  tvSymbol: string | null;
  tvRecommendAll: number | null;
  tvRecommendMa: number | null;
  tvRecommendOther: number | null;
  tvRsiWeekly: number | null;
  tvRsiMonthly: number | null;
  tvRecommendWeekly: number | null;
  tvRecommendMonthly: number | null;
  volatilityWeek: number | null;
  volatilityMonth: number | null;
  nextEarnings: string | null;
  pivots: { s1: number | null; r1: number | null; s2: number | null; r2: number | null; s3: number | null; r3: number | null };
};

export type StockAnalysis = {
  company?: CompanyResearch;
  historyEvidence?: HistoryEvidence;
  chartCandles?: Candle[];
  decision?: DecisionAudit;
  confluence?: ConfluenceReport;
  hasHistory: boolean;
  historySource: string;
  sourceNotes: string[];
  fundamentals: Fundamentals | null;
  symbol: string;
  name: string;
  exchange: string;
  market: string;
  sector: string;
  currency: string;
  interval: string;
  range: string;
  price: number;
  previousClose: number;
  change: number;
  changePct: number;
  dayRange: [number, number];
  high52: number;
  low52: number;
  fromHigh: number;
  fromLow: number;
  verdict: Verdict;
  verdictLabel: string;
  verdictEmoji: string;
  score: number;
  confidence: number;
  probabilityUp: number;
  horizon: string;
  summary: string;
  rationale: string[];
  risks: string[];
  plan: {
    entry: number;
    target1: number;
    target2: number;
    stop: number;
    riskReward: number | null;
    upsidePct: number | null;
    downsidePct: number | null;
  };
  timeframes: { label: string; score: number; verdict: Verdict }[];
  signals: Signal[];
  indicators: IndicatorSnapshot;
  performance: Performance;
  levels: Level[];
  patterns: string[];
  candles: Candle[];
  series: {
    sma20: Series;
    sma50: Series;
    sma200: Series;
    bbUpper: Series;
    bbLower: Series;
    rsi14: Series;
    volume: number[];
    obvSeries: number[];
  };
  bars: number;
  updatedAt: number;
};

const fmt = (n: number | null, digits = 2) => (n == null || !isFinite(n) ? "—" : n.toFixed(digits));
const pct = (n: number | null, digits = 2) => (n == null || !isFinite(n) ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`);

function clamp(n: number, lo = -100, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function pctChange(values: number[], bars: number): number | null {
  if (values.length <= bars) return null;
  const prev = values[values.length - 1 - bars];
  if (!prev) return null;
  return ((values[values.length - 1] - prev) / prev) * 100;
}

function detectPatterns(candles: Candle[], closes: number[], ind: IndicatorSnapshot): { patterns: string[]; bias: number } {
  const patterns: string[] = [];
  let bias = 0;
  const n = candles.length;
  if (n < 5) return { patterns, bias };
  const c = candles[n - 1];
  const p = candles[n - 2];
  const body = Math.abs(c.c - c.o);
  const range = c.h - c.l || 1e-9;
  const upperWick = c.h - Math.max(c.c, c.o);
  const lowerWick = Math.min(c.c, c.o) - c.l;
  const bodyRatio = body / range;

  if (bodyRatio < 0.12) {
    patterns.push("Doji — indecisão total entre compradores e vendedores");
  } else if (lowerWick > body * 2 && upperWick < body * 0.6 && c.c > c.o) {
    patterns.push("Hammer (martelo) — rejeição de preços baixos, sinal de reversão altista");
    bias += 25;
  } else if (upperWick > body * 2 && lowerWick < body * 0.6 && c.c < c.o) {
    patterns.push("Estrela cadente — rejeição de preços altos, sinal de reversão baixista");
    bias -= 25;
  } else if (bodyRatio > 0.85 && c.c > c.o) {
    patterns.push("Marubozu altista — barra quase sem sombras, pressão compradora dominante");
    bias += 18;
  } else if (bodyRatio > 0.85 && c.c < c.o) {
    patterns.push("Marubozu baixista — barra quase sem sombras, pressão vendedora dominante");
    bias -= 18;
  }

  // Envolvimento (engulfing)
  const pBody = Math.abs(p.c - p.o);
  if (p.c < p.o && c.c > c.o && c.c > p.o && c.o < p.c && body > pBody) {
    patterns.push("Envolvimento altista — vela verde cobre totalmente a vela vermelha anterior");
    bias += 30;
  }
  if (p.c > p.o && c.c < c.o && c.o > p.c && c.c < p.o && body > pBody) {
    patterns.push("Envolvimento baixista — vela vermelha cobre totalmente a vela verde anterior");
    bias -= 30;
  }

  // Cruzamentos de médias
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  if (crossAbove(s50, s200)) {
    patterns.push("Golden Cross — SMA50 cruzou acima da SMA200");
    bias += 35;
  }
  if (crossBelow(s50, s200)) {
    patterns.push("Death Cross — SMA50 cruzou abaixo da SMA200");
    bias -= 35;
  }

  // Estrutura de máximos/mínimos
  const seg = candles.slice(-40);
  if (seg.length >= 20) {
    const half = Math.floor(seg.length / 2);
    const h1 = Math.max(...seg.slice(0, half).map((x) => x.h));
    const h2 = Math.max(...seg.slice(half).map((x) => x.h));
    const l1 = Math.min(...seg.slice(0, half).map((x) => x.l));
    const l2 = Math.min(...seg.slice(half).map((x) => x.l));
    if (h2 > h1 && l2 > l1) patterns.push("Estrutura ascendente — máximos e mínimos crescentes (tendência de alta)");
    else if (h2 < h1 && l2 < l1) patterns.push("Estrutura descendente — máximos e mínimos decrescentes (tendência de baixa)");
  }

  // Breakouts
  const look = closes.slice(-60, -1);
  if (look.length > 20) {
    const hi = Math.max(...look);
    const lo = Math.min(...look);
    if (c.c > hi) {
      patterns.push("Rutura de máximos de 60 sessões — breakout de alta");
      bias += 28;
    } else if (c.c < lo) {
      patterns.push("Rutura de mínimos de 60 sessões — breakdown de baixa");
      bias -= 28;
    }
  }

  if (ind.percentB != null && ind.percentB > 1) patterns.push("Preço acima da banda de Bollinger superior — extensão de alta");
  if (ind.percentB != null && ind.percentB < 0) patterns.push("Preço abaixo da banda de Bollinger inferior — extensão de baixa");

  return { patterns, bias: clamp(bias) };
}

export function analyzeStock(
  bundle: ChartBundle,
  info: {
    name?: string;
    exchange?: string;
    market?: string;
    sector?: string;
    scanner?: TvLike | null;
    historySource?: string;
    sourceNotes?: string[];
  } = {},
): StockAnalysis {
  const candles = bundle.candles;
  const closes = candles.map((c) => c.c);
  const n = closes.length;
  const price = bundle.meta.regularMarketPrice || closes[n - 1];
  const prevClose = bundle.meta.previousClose || closes[n - 2] || price;
  const change = price - prevClose;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;

  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const r14 = rsi(closes, 14);
  const r7 = rsi(closes, 7);
  const macdRes = macd(closes);
  const bb = bollinger(closes, 20, 2);
  const st = stochastic(candles, 14, 3);
  const at = atr(candles, 14);
  const ad = adx(candles, 14);
  const wr = williamsR(candles, 14);
  const cc = cci(candles, 20);
  const mf = mfi(candles, 14);
  const rc = roc(closes, 12);
  const rc60 = roc(closes, Math.min(60, Math.max(10, Math.floor(n / 3))));
  const obvSeries = obv(candles);

  const volumes = candles.map((c) => c.v);
  const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length);
  const lastVol = volumes[n - 1] ?? 0;

  const window = candles.slice(-252);
  const high52 = bundle.meta.fiftyTwoWeekHigh ?? Math.max(...window.map((c) => c.h));
  const low52 = bundle.meta.fiftyTwoWeekLow ?? Math.min(...window.map((c) => c.l));

  const ind: IndicatorSnapshot = {
    rsi14: last(r14),
    rsi7: last(r7),
    sma20: last(s20),
    sma50: last(s50),
    sma200: last(s200),
    ema9: last(e9),
    ema21: last(e21),
    macd: last(macdRes.line),
    macdSignal: last(macdRes.signal),
    macdHist: last(macdRes.hist),
    bbUpper: last(bb.upper),
    bbMid: last(bb.mid),
    bbLower: last(bb.lower),
    percentB: last(bb.percentB),
    bandwidth: last(bb.bandwidth),
    stochK: last(st.k),
    stochD: last(st.d),
    williamsR: last(wr),
    cci20: last(cc),
    mfi14: last(mf),
    adx14: last(ad.adx),
    plusDI: last(ad.plusDI),
    minusDI: last(ad.minusDI),
    atr14: last(at),
    atrPct: last(at) != null ? ((last(at) as number) / price) * 100 : null,
    volatility30: annualizedVolatility(closes, 30),
    roc12: last(rc),
    roc60: last(rc60),
    avgVolume20: avgVol20,
    volumeRatio: avgVol20 ? lastVol / avgVol20 : null,
    obvSlope: normalizedObvSlope(candles, 25),
    slope20: linregSlope(closes, Math.min(20, n)),
    slope60: linregSlope(closes, Math.min(60, n)),
    trendR2: linregR2(closes, Math.min(60, n)),
    maxDrawdown: maxDrawdown(closes.slice(-252)),
  };

  const { patterns, bias: patternBias } = detectPatterns(candles, closes, ind);
  const levels = supportResistance(candles, Math.min(200, n));

  const signals: Signal[] = [];
  const add = (s: Signal) => {
    s.bias = clamp(s.bias);
    signals.push(s);
  };

  // ---------------- TENDÊNCIA ----------------
  if (ind.sma50 != null) {
    const above = price > ind.sma50;
    add({
      id: "sma50",
      group: "Tendência",
      name: "Preço vs SMA50",
      value: `${fmt(price)} / ${fmt(ind.sma50)}`,
      bias: above ? 55 : -55,
      weight: 0.9,
      detail: above
        ? `A ação negoceia ${fmt(((price / ind.sma50 - 1) * 100))}% acima da média de 50 sessões — território de alta de médio prazo.`
        : `A ação negoceia ${fmt(((price / ind.sma50 - 1) * 100))}% abaixo da média de 50 sessões — território de baixa de médio prazo.`,
    });
  }
  if (ind.sma200 != null && n >= 200) {
    const above = price > ind.sma200;
    add({
      id: "sma200",
      group: "Tendência",
      name: "Preço vs SMA200",
      value: `${fmt(price)} / ${fmt(ind.sma200)}`,
      bias: above ? 60 : -60,
      weight: 1,
      detail: above
        ? "Acima da média de 200 sessões: o regime estrutural é de alta."
        : "Abaixo da média de 200 sessões: o regime estrutural é de baixa.",
    });
  }
  if (ind.sma20 != null && ind.sma50 != null) {
    const up = ind.sma20 > ind.sma50;
    add({
      id: "sma20x50",
      group: "Tendência",
      name: "SMA20 vs SMA50",
      value: up ? "cruzamento altista" : "cruzamento baixista",
      bias: up ? 40 : -40,
      weight: 0.7,
      detail: up
        ? "A média curta está acima da média intermédia, confirmando tração positiva recente."
        : "A média curta está abaixo da média intermédia, confirmando perda de tração.",
    });
  }
  if (ind.adx14 != null) {
    const strong = ind.adx14 >= 25;
    const dir = (ind.plusDI ?? 0) > (ind.minusDI ?? 0) ? 1 : -1;
    add({
      id: "adx",
      group: "Tendência",
      name: "ADX (força da tendência)",
      value: fmt(ind.adx14, 1),
      bias: strong ? dir * Math.min(70, 25 + ind.adx14) : dir * 15,
      weight: 0.85,
      detail: strong
        ? `ADX de ${fmt(ind.adx14, 1)} indica tendência forte (${dir > 0 ? "compradora" : "vendedora"}). +DI ${fmt(ind.plusDI, 1)} vs −DI ${fmt(ind.minusDI, 1)}.`
        : `ADX de ${fmt(ind.adx14, 1)} indica mercado lateral/sem tendência definida. Sinais de momento valem menos aqui.`,
    });
  }
  if (ind.slope60 != null) {
    add({
      id: "slope60",
      group: "Tendência",
      name: "Inclinação da regressão (60 sessões)",
      value: `${fmt(ind.slope60, 3)}%/sessão`,
      bias: clamp(ind.slope60 * 260),
      weight: 0.8,
      detail: `Regressão linear de 60 sessões com inclinação de ${fmt(ind.slope60, 3)}% por sessão (R² ${fmt(ind.trendR2, 2)}).`,
    });
  }

  // ---------------- MOMENTO ----------------
  if (ind.rsi14 != null) {
    let bias = (ind.rsi14 - 50) * 2;
    let detail = `RSI(14) em ${fmt(ind.rsi14, 1)} — momento ${ind.rsi14 > 50 ? "positivo" : "negativo"}.`;
    if (ind.rsi14 >= 70) {
      bias = -35;
      detail = `RSI(14) em ${fmt(ind.rsi14, 1)}: zona de sobrecompra. Risco elevado de correção técnica no curto prazo.`;
    } else if (ind.rsi14 <= 30) {
      bias = 35;
      detail = `RSI(14) em ${fmt(ind.rsi14, 1)}: zona de sobrevenda. Probabilidade elevada de repique técnico.`;
    }
    add({ id: "rsi14", group: "Momento", name: "RSI (14)", value: fmt(ind.rsi14, 1), bias, weight: 0.95, detail });
  }
  if (ind.macd != null && ind.macdSignal != null) {
    const bull = ind.macd > ind.macdSignal;
    const histRising = (last(macdRes.hist, 0) ?? 0) > (last(macdRes.hist, 1) ?? 0);
    const bias = (bull ? 45 : -45) + (histRising ? 15 : -15);
    add({
      id: "macd",
      group: "Momento",
      name: "MACD (12,26,9)",
      value: `${fmt(ind.macd, 3)} / ${fmt(ind.macdSignal, 3)}`,
      bias,
      weight: 0.9,
      detail: `MACD ${bull ? "acima" : "abaixo"} da linha de sinal e histograma ${histRising ? "a expandir" : "a contrair"} — ${bull ? "impulso comprador" : "impulso vendedor"}.`,
    });
  }
  if (ind.stochK != null && ind.stochD != null) {
    let bias = ind.stochK > ind.stochD ? 30 : -30;
    let detail = `Estocástico %K ${fmt(ind.stochK, 1)} ${ind.stochK > ind.stochD ? "acima" : "abaixo"} de %D ${fmt(ind.stochD, 1)}.`;
    if (ind.stochK > 80) { bias = -25; detail = `Estocástico em ${fmt(ind.stochK, 1)} (sobrecompra) — curto prazo esticado.`; }
    else if (ind.stochK < 20) { bias = 25; detail = `Estocástico em ${fmt(ind.stochK, 1)} (sobrevenda) — curto prazo comprimido.`; }
    add({ id: "stoch", group: "Momento", name: "Estocástico (14,3)", value: `${fmt(ind.stochK, 1)}/${fmt(ind.stochD, 1)}`, bias, weight: 0.55, detail });
  }
  if (ind.cci20 != null) {
    add({
      id: "cci",
      group: "Momento",
      name: "CCI (20)",
      value: fmt(ind.cci20, 0),
      bias: clamp(ind.cci20 / 2),
      weight: 0.5,
      detail:
        ind.cci20 > 100
          ? "CCI acima de +100: momento forte de alta, mas potencialmente esticado."
          : ind.cci20 < -100
            ? "CCI abaixo de −100: momento forte de baixa, potencialmente esticado."
            : "CCI em zona neutra.",
    });
  }
  if (ind.williamsR != null) {
    add({
      id: "williams",
      group: "Momento",
      name: "Williams %R (14)",
      value: fmt(ind.williamsR, 1),
      bias: ind.williamsR > -20 ? -30 : ind.williamsR < -80 ? 30 : (ind.williamsR + 50) * 0.6,
      weight: 0.4,
      detail: `Williams %R em ${fmt(ind.williamsR, 1)} (${ind.williamsR > -20 ? "sobrecomprado" : ind.williamsR < -80 ? "sobrevendido" : "neutro"}).`,
    });
  }
  if (ind.percentB != null) {
    add({
      id: "percentB",
      group: "Volatilidade",
      name: "%B de Bollinger",
      value: fmt(ind.percentB, 2),
      bias: clamp((0.5 - ind.percentB) * 90),
      weight: 0.5,
      detail: `Preço em ${fmt(ind.percentB * 100, 0)}% da amplitude das bandas. ${ind.percentB > 1 ? "Acima da banda superior — extensão." : ind.percentB < 0 ? "Abaixo da banda inferior — extensão." : "Dentro das bandas."}`,
    });
  }

  // ---------------- VOLUME ----------------
  if (ind.volumeRatio != null) {
    const upDay = change >= 0;
    const heavy = ind.volumeRatio > 1.4;
    add({
      id: "volume",
      group: "Volume",
      name: "Volume relativo (20 sessões)",
      value: `${fmt(ind.volumeRatio, 2)}×`,
      bias: heavy ? (upDay ? 40 : -40) : (upDay ? 8 : -8),
      weight: 0.7,
      detail: heavy
        ? `Volume ${fmt(ind.volumeRatio, 2)}× a média de 20 sessões num dia ${upDay ? "de subida — confirmação compradora" : "de descida — distribuição"}.`
        : `Volume ${fmt(ind.volumeRatio, 2)}× a média: sem convicção especial.`,
    });
  }
  if (ind.obvSlope != null) {
    add({
      id: "obv",
      group: "Volume",
      name: "On-Balance Volume (inclinação 25s)",
      value: ind.obvSlope > 0 ? "acumulação" : "distribuição",
      bias: clamp(ind.obvSlope * 1.5),
      weight: 0.6,
      detail: ind.obvSlope > 0
        ? "OBV com inclinação positiva: volume assinado compatível com acumulação; não identifica os investidores."
        : "OBV a cair: fluxo vendedor dominante nas últimas sessões.",
    });
  }
  if (ind.mfi14 != null) {
    add({
      id: "mfi",
      group: "Volume",
      name: "Money Flow Index (14)",
      value: fmt(ind.mfi14, 1),
      bias: ind.mfi14 > 80 ? -30 : ind.mfi14 < 20 ? 30 : (ind.mfi14 - 50) * 1.1,
      weight: 0.5,
      detail: `MFI em ${fmt(ind.mfi14, 1)} — pressão de capital ${ind.mfi14 > 50 ? "compradora" : "vendedora"}.`,
    });
  }

  // ---------------- VOLATILIDADE ----------------
  if (ind.bandwidth != null) {
    add({
      id: "bandwidth",
      group: "Volatilidade",
      name: "Largura das bandas de Bollinger",
      value: `${fmt(ind.bandwidth * 100, 1)}%`,
      bias: 0,
      weight: 0.25,
      detail:
        ind.bandwidth < 0.08
          ? "Bandas muito comprimidas (squeeze): uma rutura direcional forte costuma estar próxima."
          : ind.bandwidth > 0.25
            ? "Bandas muito alargadas: volatilidade elevada, movimentos podem ser bruscos."
            : "Volatilidade em regime normal.",
    });
  }
  if (ind.atrPct != null) {
    add({
      id: "atr",
      group: "Volatilidade",
      name: "ATR (14)",
      value: `${fmt(ind.atr14)} (${fmt(ind.atrPct, 2)}%)`,
      bias: 0,
      weight: 0.2,
      detail: `Amplitude média diária de ${fmt(ind.atrPct, 2)}% — usada para dimensionar alvos e stops.`,
    });
  }

  // ---------------- PADRÕES ----------------
  if (patterns.length) {
    add({
      id: "patterns",
      group: "Padrões",
      name: "Padrões de velas / estrutura",
      value: `${patterns.length} detetados`,
      bias: patternBias,
      weight: 0.85,
      detail: patterns.join(" • "),
    });
  }

  // ---------------- 52 semanas ----------------
  const fromHigh = high52 ? ((price - high52) / high52) * 100 : 0;
  const fromLow = low52 ? ((price - low52) / low52) * 100 : 0;
  add({
    id: "range52",
    group: "Tendência",
    name: "Posição no intervalo de 52 semanas",
    value: `${fmt(fromHigh, 1)}% do máx. / ${fmt(fromLow, 1)}% do mín.`,
    bias: clamp(fromLow > 400 ? -10 : fromHigh > -8 ? 20 : fromHigh < -35 ? 15 : -10),
    weight: 0.45,
    detail:
      fromHigh > -8
        ? "A negociar perto do máximo de 52 semanas — força relativa evidente."
        : fromHigh < -35
          ? `A ${fmt(fromHigh, 1)}% do máximo anual: título profundamente castigado, potencial de mean-reversion mas também de value trap.`
          : `A ${fmt(fromHigh, 1)}% do máximo anual, numa zona intermédia.`,
  });

  // ---------------- CONSENSO TRADINGVIEW ----------------
  const fnd = buildFundamentals(info.scanner);
  if (fnd?.tvRecommendAll != null) {
    const rec = fnd.tvRecommendAll * 100;
    add({
      id: "tvrec",
      group: "Momento",
      name: "Consenso técnico (TradingView)",
      value: rec.toFixed(0),
      bias: clamp(rec),
      weight: 0.75,
      detail: `Agregado de 26 regras técnicas do TradingView: ${rec > 15 ? "compra" : rec < -15 ? "venda" : "neutro"} (${rec.toFixed(0)} em −100…+100). Médias móveis ${fnd.tvRecommendMa != null ? (fnd.tvRecommendMa * 100).toFixed(0) : "—"}, osciladores ${fnd.tvRecommendOther != null ? (fnd.tvRecommendOther * 100).toFixed(0) : "—"}.`,
    });
  }
  if (fnd?.tvRsiWeekly != null) {
    add({
      id: "rsiweek",
      group: "Tendência",
      name: "RSI semanal",
      value: fmt(fnd.tvRsiWeekly, 1),
      bias: fnd.tvRsiWeekly >= 70 ? -30 : fnd.tvRsiWeekly <= 30 ? 30 : (fnd.tvRsiWeekly - 50) * 1.6,
      weight: 0.6,
      detail: `RSI no timeframe semanal em ${fmt(fnd.tvRsiWeekly, 1)} — filtra o ruído do diário e confirma (ou contradiz) a leitura de curto prazo.`,
    });
  }

  // ---------------- PONTUAÇÃO ----------------
  let weighted = 0;
  let totalWeight = 0;
  let agreement = 0;
  for (const s of signals) {
    weighted += s.bias * s.weight;
    totalWeight += s.weight;
  }
  const rawScore = totalWeight ? weighted / totalWeight : 0;
  for (const s of signals) {
    if (Math.sign(s.bias) === Math.sign(rawScore) && s.bias !== 0) agreement += s.weight;
  }
  const score = clamp(Math.round(rawScore * 10) / 10);
  const confidence = Math.round(
    Math.min(
      97,
      (totalWeight ? (agreement / totalWeight) * 100 : 0) * 0.55 +
        Math.min(Math.abs(score), 100) * 0.35 +
        Math.min(n / 250, 1) * 10,
    ),
  );
  const probabilityUp = Math.round(50 + Math.tanh(score / 55) * 32);

  let verdict: Verdict = "NEUTRO";
  if (score >= 12) verdict = "SUBIR";
  else if (score <= -12) verdict = "DESCER";

  const verdictLabel =
    verdict === "SUBIR"
      ? score >= 45
        ? "Comprar / Forte expectativa de subida"
        : "Expectativa de subida"
      : verdict === "DESCER"
        ? score <= -45
          ? "Vender / Forte expectativa de descida"
          : "Expectativa de descida"
        : "Neutro / Aguardar";
  const verdictEmoji = verdict === "SUBIR" ? "▲" : verdict === "DESCER" ? "▼" : "◆";

  // ---------------- HORIZONTES ----------------
  const shortScore = scoreOf(signals, ["rsi14", "stoch", "cci", "volume", "patterns", "percentB", "williams"]);
  const midScore = scoreOf(signals, ["macd", "sma50", "sma20x50", "adx", "slope60", "obv", "mfi", "range52"]);
  const longScore = scoreOf(signals, ["sma200", "slope60", "adx", "range52", "obv"]);
  const timeframes = [
    { label: "Curto prazo (1–4 semanas)", score: Math.round(shortScore * 10) / 10, verdict: verdictFor(shortScore) },
    { label: "Médio prazo (1–6 meses)", score: Math.round(midScore * 10) / 10, verdict: verdictFor(midScore) },
    { label: "Longo prazo (6–18 meses)", score: Math.round(longScore * 10) / 10, verdict: verdictFor(longScore) },
  ];

  // ---------------- PLANO ----------------
  const atrVal = ind.atr14 ?? price * 0.02;
  const bullish = verdict !== "DESCER";
  const nearSupport = levels.filter((l) => l.price < price).sort((a, b) => b.price - a.price)[0];
  const nearResistance = levels.filter((l) => l.price > price).sort((a, b) => a.price - b.price)[0];
  const entry = price;
  const stop = bullish
    ? Math.max(price - 2 * atrVal, nearSupport ? nearSupport.price * 0.985 : price - 2 * atrVal)
    : price + 2 * atrVal;
  const target1 = bullish
    ? Math.min(price + 2 * atrVal, nearResistance ? nearResistance.price : price + 2 * atrVal)
    : Math.max(price - 2 * atrVal, nearSupport ? nearSupport.price : price - 2 * atrVal);
  const target2 = bullish ? price + 4 * atrVal : price - 4 * atrVal;
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target2 - entry);
  const riskReward = risk > 0 ? reward / risk : null;

  // ---------------- TEXTO ----------------
  const strongest = [...signals].sort((a, b) => Math.abs(b.bias) * b.weight - Math.abs(a.bias) * a.weight).slice(0, 5);
  const rationale = strongest.map((s) => `${s.name}: ${s.detail}`);
  const risks: string[] = [];
  if ((ind.volatility30 ?? 0) > 45) risks.push(`Volatilidade anualizada elevada (${fmt(ind.volatility30, 0)}%) — dimensiona a posição em conformidade.`);
  if ((ind.atrPct ?? 0) > 4) risks.push(`Amplitude média diária de ${fmt(ind.atrPct, 1)}%: ruído elevado, stops apertados serão atingidos.`);
  if ((ind.maxDrawdown ?? 0) < -30) risks.push(`Drawdown máximo de ${fmt(ind.maxDrawdown, 1)}% no último ano — este título já provou que pode cair muito.`);
  if (ind.adx14 != null && ind.adx14 < 20) risks.push("ADX fraco: mercado sem tendência. Sinais de momento têm baixa fiabilidade aqui.");
  if ((ind.volumeRatio ?? 1) < 0.6) risks.push("Volume abaixo da média: pouca liquidez/convicção, movimentos pouco sustentáveis.");
  if (n < 120) risks.push(`Histórico curto (${n} sessões). Médias de 200 sessões indisponíveis — análise menos robusta.`);
  if (fromHigh > -5) risks.push("Preço colado ao máximo de 52 semanas: entrar aqui implica pagar o consenso otimista.");
  if (!risks.length) risks.push("Nenhum risco técnico extremo detetado, mas mantém gestão de risco disciplinada.");

  const summary = buildSummary({
    name: info.name ?? bundle.meta.shortName ?? bundle.meta.symbol,
    price,
    currency: bundle.meta.currency,
    changePct,
    verdict,
    verdictLabel,
    score,
    confidence,
    probabilityUp,
    ind,
    fromHigh,
    fromLow,
    patterns,
    timeframes,
  });

  const bars = Math.min(180, n);
  return {
    hasHistory: true,
    historySource: info.historySource || "yahoo",
    sourceNotes: info.sourceNotes || [],
    fundamentals: fnd,
    symbol: bundle.meta.symbol,
    name: info.name || bundle.meta.longName || bundle.meta.shortName || bundle.meta.symbol,
    exchange: info.exchange || tvStr(info.scanner?.exchange) || bundle.meta.fullExchangeName || bundle.meta.exchangeName,
    market: info.market || bundle.meta.fullExchangeName || "",
    sector: info.sector || tvStr(info.scanner?.sector) || "",
    currency: bundle.meta.currency,
    interval: bundle.interval,
    range: bundle.range,
    price,
    previousClose: prevClose,
    change,
    changePct,
    dayRange: [candles[n - 1].l, candles[n - 1].h],
    high52,
    low52,
    fromHigh,
    fromLow,
    verdict,
    verdictLabel,
    verdictEmoji,
    score,
    confidence,
    probabilityUp,
    horizon: "3 a 6 meses",
    summary,
    rationale,
    risks,
    plan: {
      entry,
      target1,
      target2,
      stop,
      riskReward,
      upsidePct: ((target2 - entry) / entry) * 100,
      downsidePct: ((stop - entry) / entry) * 100,
    },
    timeframes,
    signals: signals.sort((a, b) => b.weight * Math.abs(b.bias) - a.weight * Math.abs(a.bias)),
    indicators: ind,
    performance: {
      d1: pctChange(closes, 1),
      w1: pctChange(closes, 5),
      m1: pctChange(closes, 21),
      m3: pctChange(closes, 63),
      m6: pctChange(closes, 126),
      y1: pctChange(closes, 252),
    },
    levels,
    patterns,
    candles: candles.slice(-bars),
    series: {
      sma20: s20.slice(-bars),
      sma50: s50.slice(-bars),
      sma200: s200.slice(-bars),
      bbUpper: bb.upper.slice(-bars),
      bbLower: bb.lower.slice(-bars),
      rsi14: r14.slice(-bars),
      volume: volumes.slice(-bars),
      obvSeries: obvSeries.slice(-bars),
    },
    bars,
    updatedAt: Date.now(),
  };
}

function scoreOf(signals: Signal[], ids: string[]): number {
  const sel = signals.filter((s) => ids.includes(s.id));
  if (!sel.length) return 0;
  let w = 0;
  let t = 0;
  for (const s of sel) {
    w += s.bias * s.weight;
    t += s.weight;
  }
  return t ? clamp(w / t) : 0;
}

function verdictFor(score: number): Verdict {
  if (score >= 12) return "SUBIR";
  if (score <= -12) return "DESCER";
  return "NEUTRO";
}

function buildSummary(p: {
  name: string;
  price: number;
  currency: string;
  changePct: number;
  verdict: Verdict;
  verdictLabel: string;
  score: number;
  confidence: number;
  probabilityUp: number;
  ind: IndicatorSnapshot;
  fromHigh: number;
  fromLow: number;
  patterns: string[];
  timeframes: { label: string; score: number; verdict: Verdict }[];
}): string {
  const dir =
    p.verdict === "SUBIR"
      ? "a minha expectativa é de SUBIDA"
      : p.verdict === "DESCER"
        ? "a minha expectativa é de DESCIDA"
        : "a minha leitura é NEUTRA";
  const trendTxt =
    p.ind.sma200 != null
      ? p.price > p.ind.sma200
        ? "regime estrutural de alta (preço acima da SMA200)"
        : "regime estrutural de baixa (preço abaixo da SMA200)"
      : "regime estrutural indeterminado (histórico insuficiente para a SMA200)";
  const momTxt =
    p.ind.rsi14 != null
      ? p.ind.rsi14 >= 70
        ? `RSI em sobrecompra (${fmt(p.ind.rsi14, 0)})`
        : p.ind.rsi14 <= 30
          ? `RSI em sobrevenda (${fmt(p.ind.rsi14, 0)})`
          : `RSI neutro (${fmt(p.ind.rsi14, 0)})`
      : "RSI indisponível";
  const macdTxt =
    p.ind.macd != null && p.ind.macdSignal != null
      ? `MACD ${p.ind.macd > p.ind.macdSignal ? "positivo acima do sinal" : "negativo abaixo do sinal"}`
      : "";
  return [
    `A ${p.name} negoceia a ${fmt(p.price)} ${p.currency} (${pct(p.changePct)} na última sessão).`,
    `Com base em ${p.timeframes.length} horizontes e mais de uma dezena de indicadores, ${dir} com uma pontuação de ${p.score > 0 ? "+" : ""}${fmt(p.score, 1)}/100 e ${p.confidence}% de confiança — probabilidade estimada de subida: ${p.probabilityUp}%.`,
    `O quadro técnico mostra ${trendTxt}, ${momTxt}${macdTxt ? ", " + macdTxt : ""}.`,
    `Posição no intervalo anual: ${fmt(p.fromHigh, 1)}% face ao máximo e +${fmt(p.fromLow, 1)}% face ao mínimo de 52 semanas.`,
    p.patterns.length ? `Padrões detetados: ${p.patterns.slice(0, 3).join("; ")}.` : "Sem padrões de velas relevantes na última sessão.",
  ].join(" ");
}

/**
 * Análise construída apenas com o snapshot do TradingView — usada quando nenhuma
 * fonte devolve série histórica (ex.: fornecedor de velas a limitar pedidos).
 * Continua a ser uma leitura técnica real: RSI, ADX, médias, MACD, Bollinger,
 * Estocástico, CCI, Williams %R, ATR, volatilidade, performance e pivôs.
 */
export function analyzeFromScanner(
  md: {
    symbol: string;
    scanner: TvLike | null;
    currency: string;
    range: string;
    interval: string;
    historySource: string;
    notes: string[];
    metaName?: string | null;
    metaExchange?: string | null;
  },
  info: { name?: string; exchange?: string; market?: string; sector?: string } = {},
): StockAnalysis | null {
  const s = md.scanner;
  if (!s) return null;
  const price = tvNum(s.close);
  if (price == null || price <= 0) return null;

  const changePct = tvNum(s.change) ?? 0;
  const previousClose = changePct !== -100 ? price / (1 + changePct / 100) : price;
  const fnd = buildFundamentals(s);

  const get = (k: string) => tvNum(s[k]);
  const sma20 = get("SMA20");
  const sma50 = get("SMA50");
  const sma100 = get("SMA100");
  const sma200 = get("SMA200");
  const ema10 = get("EMA10");
  const ema20 = get("EMA20");
  const ema30 = get("EMA30");
  const ema50 = get("EMA50");
  const ema100 = get("EMA100");
  const ema200 = get("EMA200");
  const rsi14 = get("RSI");
  const adx14 = get("ADX");
  const macdLine = get("MACD.macd");
  const macdSignal = get("MACD.signal");
  const macdHist = macdLine != null && macdSignal != null ? macdLine - macdSignal : null;
  const bbUpper = get("BB.upper");
  const bbLower = get("BB.lower");
  const bbMid = bbUpper != null && bbLower != null ? (bbUpper + bbLower) / 2 : null;
  const percentB = bbUpper != null && bbLower != null && bbUpper !== bbLower ? (price - bbLower) / (bbUpper - bbLower) : null;
  const bandwidth = bbMid && bbUpper != null && bbLower != null ? (bbUpper - bbLower) / bbMid : null;
  const stochK = get("Stoch.K");
  const stochD = get("Stoch.D");
  const cci20 = get("CCI20");
  const willR = get("W.R");
  const atrV = get("ATR");
  const relVol = get("relative_volume_10d_calc");
  const high52 = get("price_52_week_high") ?? get("high_1M") ?? price;
  const low52 = get("price_52_week_low") ?? get("low_1M") ?? price;

  const ind: IndicatorSnapshot = {
    rsi14,
    rsi7: null,
    sma20,
    sma50,
    sma200,
    ema9: ema10,
    ema21: ema20,
    macd: macdLine,
    macdSignal,
    macdHist,
    bbUpper,
    bbMid,
    bbLower,
    percentB,
    bandwidth,
    stochK,
    stochD,
    williamsR: willR,
    cci20,
    mfi14: null,
    adx14,
    plusDI: null,
    minusDI: null,
    atr14: atrV,
    atrPct: atrV != null ? (atrV / price) * 100 : null,
    volatility30: get("Volatility.M") != null ? (get("Volatility.M") as number) * Math.sqrt(12) : get("Volatility.W") != null ? (get("Volatility.W") as number) * Math.sqrt(52) : null,
    roc12: get("Mom"),
    roc60: get("Perf.3M"),
    avgVolume20: get("average_volume_10d_calc"),
    volumeRatio: relVol,
    obvSlope: null,
    slope20: null,
    slope60: null,
    trendR2: null,
    maxDrawdown: null,
  };

  const signals: Signal[] = [];
  const add = (x: Signal) => { x.bias = clamp(x.bias); signals.push(x); };

  const maAbove = (v: number | null, label: string, weight: number, bias: number, id: string) => {
    if (v == null) return;
    const above = price > v;
    add({
      id,
      group: "Tendência",
      name: `Preço vs ${label}`,
      value: `${fmt(price)} / ${fmt(v)}`,
      bias: above ? bias : -bias,
      weight,
      detail: above
        ? `Acima da ${label} (${fmt(v)}) por ${fmt((price / v - 1) * 100)}% — estrutura de alta.`
        : `Abaixo da ${label} (${fmt(v)}) por ${fmt((price / v - 1) * 100)}% — estrutura de baixa.`,
    });
  };
  maAbove(sma20, "SMA20", 0.7, 45, "sma20");
  maAbove(sma50, "SMA50", 0.9, 55, "sma50");
  maAbove(sma100, "SMA100", 0.8, 55, "sma100");
  maAbove(sma200, "SMA200", 1, 60, "sma200");
  maAbove(ema20, "EMA20", 0.6, 40, "ema20");
  maAbove(ema50, "EMA50", 0.6, 40, "ema50");
  maAbove(ema200, "EMA200", 0.7, 45, "ema200");

  if (sma20 != null && sma50 != null) {
    add({
      id: "sma20x50",
      group: "Tendência",
      name: "SMA20 vs SMA50",
      value: sma20 > sma50 ? "cruzamento altista" : "cruzamento baixista",
      bias: sma20 > sma50 ? 40 : -40,
      weight: 0.7,
      detail: sma20 > sma50 ? "Média curta acima da intermédia: tração positiva." : "Média curta abaixo da intermédia: perda de tração.",
    });
  }
  if (adx14 != null) {
    add({
      id: "adx",
      group: "Tendência",
      name: "ADX (força da tendência)",
      value: fmt(adx14, 1),
      bias: 0,
      weight: 0.4,
      detail: adx14 >= 25 ? `ADX ${fmt(adx14, 1)}: tendência forte instalada — os sinais direcionais valem mais.` : `ADX ${fmt(adx14, 1)}: mercado sem tendência clara — sinais direcionais valem menos.`,
    });
  }
  if (rsi14 != null) {
    let bias = (rsi14 - 50) * 2;
    let detail = `RSI(14) em ${fmt(rsi14, 1)} — momento ${rsi14 > 50 ? "positivo" : "negativo"}.`;
    if (rsi14 >= 70) { bias = -35; detail = `RSI(14) em ${fmt(rsi14, 1)}: sobrecompra. Risco elevado de correção técnica.`; }
    else if (rsi14 <= 30) { bias = 35; detail = `RSI(14) em ${fmt(rsi14, 1)}: sobrevenda. Probabilidade elevada de repique.`; }
    add({ id: "rsi14", group: "Momento", name: "RSI (14)", value: fmt(rsi14, 1), bias, weight: 0.95, detail });
  }
  if (fnd?.tvRsiWeekly != null) {
    const w = fnd.tvRsiWeekly;
    add({
      id: "rsiweek",
      group: "Tendência",
      name: "RSI semanal",
      value: fmt(w, 1),
      bias: w >= 70 ? -30 : w <= 30 ? 30 : (w - 50) * 1.6,
      weight: 0.65,
      detail: `RSI semanal em ${fmt(w, 1)} — timeframe superior, filtra o ruído diário.`,
    });
  }
  if (fnd?.tvRsiMonthly != null) {
    const m = fnd.tvRsiMonthly;
    add({
      id: "rsimonth",
      group: "Tendência",
      name: "RSI mensal",
      value: fmt(m, 1),
      bias: m >= 70 ? -22 : m <= 30 ? 22 : (m - 50) * 1.2,
      weight: 0.5,
      detail: `RSI mensal em ${fmt(m, 1)} — leitura estrutural de longo prazo.`,
    });
  }
  if (macdLine != null && macdSignal != null) {
    const bull = macdLine > macdSignal;
    add({
      id: "macd",
      group: "Momento",
      name: "MACD (12,26,9)",
      value: `${fmt(macdLine, 3)} / ${fmt(macdSignal, 3)}`,
      bias: bull ? 50 : -50,
      weight: 0.9,
      detail: `MACD ${bull ? "acima" : "abaixo"} da linha de sinal (histograma ${fmt(macdHist, 3)}) — impulso ${bull ? "comprador" : "vendedor"}.`,
    });
  }
  if (stochK != null && stochD != null) {
    let bias = stochK > stochD ? 30 : -30;
    let detail = `Estocástico %K ${fmt(stochK, 1)} ${stochK > stochD ? "acima" : "abaixo"} de %D ${fmt(stochD, 1)}.`;
    if (stochK > 80) { bias = -25; detail = `Estocástico em ${fmt(stochK, 1)} (sobrecompra) — curto prazo esticado.`; }
    else if (stochK < 20) { bias = 25; detail = `Estocástico em ${fmt(stochK, 1)} (sobrevenda) — curto prazo comprimido.`; }
    add({ id: "stoch", group: "Momento", name: "Estocástico (14,3)", value: `${fmt(stochK, 1)}/${fmt(stochD, 1)}`, bias, weight: 0.55, detail });
  }
  if (cci20 != null) {
    add({ id: "cci", group: "Momento", name: "CCI (20)", value: fmt(cci20, 0), bias: clamp(cci20 / 2), weight: 0.5, detail: cci20 > 100 ? "CCI acima de +100: momento forte de alta." : cci20 < -100 ? "CCI abaixo de −100: momento forte de baixa." : "CCI em zona neutra." });
  }
  if (willR != null) {
    add({ id: "williams", group: "Momento", name: "Williams %R (14)", value: fmt(willR, 1), bias: willR > -20 ? -30 : willR < -80 ? 30 : (willR + 50) * 0.6, weight: 0.4, detail: `Williams %R em ${fmt(willR, 1)}.` });
  }
  if (get("AO") != null) {
    const ao = get("AO") as number;
    add({ id: "ao", group: "Momento", name: "Awesome Oscillator", value: fmt(ao, 3), bias: clamp(ao / Math.max(0.0001, price) * 900), weight: 0.4, detail: ao > 0 ? "AO positivo: momentum de alta." : "AO negativo: momentum de baixa." });
  }
  if (percentB != null) {
    add({ id: "percentB", group: "Volatilidade", name: "%B de Bollinger", value: fmt(percentB, 2), bias: clamp((0.5 - percentB) * 90), weight: 0.5, detail: `Preço em ${fmt(percentB * 100, 0)}% da amplitude das bandas.` });
  }
  if (relVol != null) {
    const up = changePct >= 0;
    add({
      id: "volume",
      group: "Volume",
      name: "Volume relativo (10 sessões)",
      value: `${fmt(relVol, 2)}×`,
      bias: relVol > 1.4 ? (up ? 40 : -40) : up ? 8 : -8,
      weight: 0.7,
      detail: relVol > 1.4
        ? `Volume ${fmt(relVol, 2)}× a média num dia ${up ? "de subida — confirmação" : "de descida — distribuição"}.`
        : `Volume ${fmt(relVol, 2)}× a média de 10 sessões.`,
    });
  }
  if (fnd?.tvRecommendAll != null) {
    const rec = fnd.tvRecommendAll * 100;
    add({
      id: "tvrec",
      group: "Momento",
      name: "Consenso técnico (TradingView)",
      value: rec.toFixed(0),
      bias: clamp(rec),
      weight: 0.8,
      detail: `Agregado de 26 regras técnicas: ${rec > 15 ? "compra" : rec < -15 ? "venda" : "neutro"} (${rec.toFixed(0)}). Médias ${fnd.tvRecommendMa != null ? (fnd.tvRecommendMa * 100).toFixed(0) : "—"}, osciladores ${fnd.tvRecommendOther != null ? (fnd.tvRecommendOther * 100).toFixed(0) : "—"}.`,
    });
  }
  if (fnd?.tvRecommendWeekly != null) {
    const rec = fnd.tvRecommendWeekly * 100;
    add({ id: "tvrecw", group: "Tendência", name: "Consenso técnico semanal", value: rec.toFixed(0), bias: clamp(rec), weight: 0.65, detail: `Agregado semanal do TradingView em ${rec.toFixed(0)} — confirma ou contradiz o diário.` });
  }
  if (fnd?.tvRecommendMonthly != null) {
    const rec = fnd.tvRecommendMonthly * 100;
    add({ id: "tvrecm", group: "Tendência", name: "Consenso técnico mensal", value: rec.toFixed(0), bias: clamp(rec * 0.9), weight: 0.55, detail: `Agregado mensal do TradingView em ${rec.toFixed(0)} — visão estrutural.` });
  }

  const fromHigh = high52 ? ((price - high52) / high52) * 100 : 0;
  const fromLow = low52 ? ((price - low52) / low52) * 100 : 0;
  add({
    id: "range52",
    group: "Tendência",
    name: "Posição no intervalo de 52 semanas",
    value: `${fmt(fromHigh, 1)}% do máx. / ${fmt(fromLow, 1)}% do mín.`,
    bias: clamp(fromHigh > -8 ? 20 : fromHigh < -35 ? 15 : -10),
    weight: 0.45,
    detail: fromHigh > -8 ? "Perto do máximo de 52 semanas — força relativa evidente." : fromHigh < -35 ? `A ${fmt(fromHigh, 1)}% do máximo anual: título muito castigado.` : `A ${fmt(fromHigh, 1)}% do máximo anual.`,
  });

  const perfM: Performance = {
    d1: changePct,
    w1: get("Perf.W"),
    m1: get("Perf.1M"),
    m3: get("Perf.3M"),
    m6: get("Perf.6M"),
    y1: get("Perf.Y"),
  };

  // -------- pontuação --------
  let w = 0; let tw = 0; let agree = 0;
  for (const sg of signals) { w += sg.bias * sg.weight; tw += sg.weight; }
  const raw = tw ? w / tw : 0;
  for (const sg of signals) if (Math.sign(sg.bias) === Math.sign(raw) && sg.bias !== 0) agree += sg.weight;
  const score = clamp(Math.round(raw * 10) / 10);
  const confidence = Math.round(Math.min(94, (tw ? (agree / tw) * 100 : 0) * 0.5 + Math.min(Math.abs(score), 100) * 0.35 + Math.min(signals.length, 20) * 0.7));
  const probabilityUp = Math.round(50 + Math.tanh(score / 55) * 32);
  const verdict: Verdict = score >= 12 ? "SUBIR" : score <= -12 ? "DESCER" : "NEUTRO";
  const verdictLabel = verdict === "SUBIR" ? (score >= 45 ? "Comprar / Forte expectativa de subida" : "Expectativa de subida") : verdict === "DESCER" ? (score <= -45 ? "Vender / Forte expectativa de descida" : "Expectativa de descida") : "Neutro / Aguardar";

  const shortScore = scoreOf(signals, ["rsi14", "stoch", "cci", "volume", "percentB", "williams", "ao", "tvrec"]);
  const midScore = scoreOf(signals, ["macd", "sma20", "sma50", "sma20x50", "adx", "rsiweek", "tvrecw", "range52"]);
  const longScore = scoreOf(signals, ["sma200", "ema200", "sma100", "rsimonth", "tvrecm", "range52"]);
  const timeframes = [
    { label: "Curto prazo (1–4 semanas)", score: Math.round(shortScore * 10) / 10, verdict: verdictFor(shortScore) },
    { label: "Médio prazo (1–6 meses)", score: Math.round(midScore * 10) / 10, verdict: verdictFor(midScore) },
    { label: "Longo prazo (6–18 meses)", score: Math.round(longScore * 10) / 10, verdict: verdictFor(longScore) },
  ];

  const atrVal = atrV ?? price * 0.02;
  const bullish = verdict !== "DESCER";
  const p = fnd?.pivots;
  const stop = bullish ? (p?.s1 ?? price - 2 * atrVal) : (p?.r1 ?? price + 2 * atrVal);
  const target1 = bullish ? (p?.r1 ?? price + 2 * atrVal) : (p?.s1 ?? price - 2 * atrVal);
  const target2 = bullish ? (p?.r2 ?? price + 4 * atrVal) : (p?.s2 ?? price - 4 * atrVal);
  const risk = Math.abs(price - stop);
  const riskReward = risk > 0 ? Math.abs(target2 - price) / risk : null;

  const levels: Level[] = [];
  if (p) {
    if (p.r1 != null) levels.push({ price: p.r1, touches: 3, kind: "resistência" });
    if (p.r2 != null) levels.push({ price: p.r2, touches: 2, kind: "resistência" });
    if (p.r3 != null) levels.push({ price: p.r3, touches: 1, kind: "resistência" });
    if (p.s1 != null) levels.push({ price: p.s1, touches: 3, kind: "suporte" });
    if (p.s2 != null) levels.push({ price: p.s2, touches: 2, kind: "suporte" });
    if (p.s3 != null) levels.push({ price: p.s3, touches: 1, kind: "suporte" });
  }
  if (high52 > price) levels.push({ price: high52, touches: 2, kind: "resistência" });
  if (low52 < price) levels.push({ price: low52, touches: 2, kind: "suporte" });

  const patterns: string[] = [];
  if (sma50 != null && sma200 != null) patterns.push(sma50 > sma200 ? "Golden Cross em vigor — SMA50 acima da SMA200" : "Death Cross em vigor — SMA50 abaixo da SMA200");
  if (adx14 != null && adx14 >= 25) patterns.push(`Tendência forte (ADX ${fmt(adx14, 1)})`);
  if (rsi14 != null && rsi14 >= 70) patterns.push("Sobrecompra no RSI diário");
  if (rsi14 != null && rsi14 <= 30) patterns.push("Sobrevenda no RSI diário");
  if (percentB != null && percentB > 1) patterns.push("Preço acima da banda de Bollinger superior");
  if (percentB != null && percentB < 0) patterns.push("Preço abaixo da banda de Bollinger inferior");
  if (bandwidth != null && bandwidth < 0.08) patterns.push("Squeeze de Bollinger — rutura direcional provável");
  if (relVol != null && relVol > 1.6) patterns.push(`Volume anómalo (${fmt(relVol, 2)}× a média)`);

  const risks = [
    "Sem série histórica de velas nesta consulta: não foi possível desenhar o gráfico nem medir a estrutura de máximos/mínimos.",
    adx14 != null && adx14 < 20 ? "ADX fraco: mercado lateral, sinais de momento pouco fiáveis." : "Confirma a leitura com o gráfico quando o histórico voltar a estar disponível.",
    fnd?.beta != null && fnd.beta > 1.4 ? `Beta de ${fmt(fnd.beta, 2)}: o título amplifica os movimentos do mercado.` : "Mantém gestão de risco disciplinada.",
  ];

  const strongest = [...signals].sort((a, b) => Math.abs(b.bias) * b.weight - Math.abs(a.bias) * a.weight).slice(0, 5);
  const name = info.name || tvStr(s.description) || tvStr(s.name) || md.symbol;

  const summary = [
    `${name} negoceia a ${fmt(price)} ${md.currency} (${pct(changePct)} na última sessão).`,
    `Sem histórico de velas disponível nesta consulta, a leitura usa ${signals.length} indicadores do scanner TradingView. Com base neles, ${verdict === "SUBIR" ? "a minha expectativa é de SUBIDA" : verdict === "DESCER" ? "a minha expectativa é de DESCIDA" : "a minha leitura é NEUTRA"} — pontuação ${score > 0 ? "+" : ""}${fmt(score, 1)}/100, confiança ${confidence}%, probabilidade de subida ${probabilityUp}%.`,
    `Estrutura: preço ${sma200 != null ? (price > sma200 ? "acima" : "abaixo") : "sem referência"} da SMA200 (${fmt(sma200)}) e ${sma50 != null ? (price > sma50 ? "acima" : "abaixo") : "sem referência"} da SMA50 (${fmt(sma50)}); RSI(14) em ${fmt(rsi14, 1)}; ADX ${fmt(adx14, 1)}; MACD ${macdHist != null ? (macdHist > 0 ? "positivo" : "negativo") : "indisponível"}.`,
    `Intervalo anual: ${fmt(fromHigh, 1)}% face ao máximo (${fmt(high52)}) e +${fmt(fromLow, 1)}% face ao mínimo (${fmt(low52)}).`,
    `Performance: 1M ${pct(perfM.m1)}, 3M ${pct(perfM.m3)}, 6M ${pct(perfM.m6)}, YTD ${pct(get("Perf.YTD"))}.`,
  ].join(" ");

  return {
    hasHistory: false,
    historySource: md.historySource,
    sourceNotes: md.notes,
    fundamentals: fnd,
    symbol: md.symbol,
    name,
    exchange: info.exchange || tvStr(s.exchange) || "",
    market: info.market || tvStr(s.exchange) || "",
    sector: info.sector || tvStr(s.sector) || "",
    currency: md.currency || String(s.currency ?? ""),
    interval: md.interval,
    range: md.range,
    price,
    previousClose,
    change: price - previousClose,
    changePct,
    dayRange: [get("low") ?? price, get("high") ?? price],
    high52,
    low52,
    fromHigh,
    fromLow,
    verdict,
    verdictLabel,
    verdictEmoji: verdict === "SUBIR" ? "▲" : verdict === "DESCER" ? "▼" : "◆",
    score,
    confidence,
    probabilityUp,
    horizon: "3 a 6 meses",
    summary,
    rationale: strongest.map((sg) => `${sg.name}: ${sg.detail}`),
    risks,
    plan: {
      entry: price,
      target1,
      target2,
      stop,
      riskReward,
      upsidePct: ((target2 - price) / price) * 100,
      downsidePct: ((stop - price) / price) * 100,
    },
    timeframes,
    signals: signals.sort((a, b) => b.weight * Math.abs(b.bias) - a.weight * Math.abs(a.bias)),
    indicators: ind,
    performance: perfM,
    levels,
    patterns,
    candles: [],
    series: { sma20: [], sma50: [], sma200: [], bbUpper: [], bbLower: [], rsi14: [], volume: [], obvSeries: [] },
    bars: 0,
    updatedAt: Date.now(),
  };
}
