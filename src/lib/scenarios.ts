/** Experiência legada preservada do histórico. Não participa no protocolo v3 ativo.
 * Ver decision-audit.ts, technical-model.ts e validation.ts para o veredicto em produção.
 * Resultados desta simulação ou classificações de títulos não são probabilidades calibradas.
 */
/**
 * Motor de Cenários & Validação
 * ------------------------------------------------------------
 * 1) Estatística dos retornos reais do título (vol, drift, drawdown)
 * 2) Simulação Monte Carlo (bootstrap dos retornos históricos) a N sessões
 *    → probabilidade de tocar o alvo antes do stop, distribuição de preços
 * 3) Cenários Bull / Base / Bear com probabilidades e gatilhos
 * 4) Backtest walk-forward do PRÓPRIO modelo no histórico da ação
 *    → taxa de acerto quando o modelo disse "sobe"/"desce"
 * 5) Checklist de validação + contradições → confiança final
 * 6) Veredito final combinado (SOBE / DESCE / NEUTRO)
 */

export interface ScenarioCandle { o: number; h: number; l: number; c: number; v: number; t?: number | string }

export interface ScenarioInput {
  candles: ScenarioCandle[];
  currentPrice: number;
  atr: number;
  support: number;
  resistance: number;
  technicalBias: number;    // -100..100
  fundamentalBias?: number; // -100..100 (opcional)
  newsBias: number;         // -100..100 já com decaimento temporal (0 se não há notícias frescas)
  newsFreshCount: number;
  bullishSignals: number;
  bearishSignals: number;
  scoreAt: (window: ScenarioCandle[]) => number | null; // bias -100..100 do modelo no fim da janela
  horizonDays?: number;
  lastCandleTime?: number; // ms epoch
}

export interface ScenarioCase {
  key: "BULL" | "BASE" | "BEAR";
  name: string;
  probability: number; // %
  targetPrice: number;
  targetPct: number;
  trigger: string;
  narrative: string;
}

export interface ValidationCheck { name: string; passed: boolean; detail: string; critical?: boolean }

export interface ScenarioResult {
  horizonDays: number;
  dataQuality: "OK" | "LIMITADA" | "SEM_HISTORICO";
  dataQualityNote: string;
  stats: {
    bars: number;
    dailyVolPct: number;
    annualVolPct: number;
    driftDailyPct: number;
    maxDrawdownPct: number;
    lastCandleAgeDays: number | null;
    upDaysPct: number;
  };
  monteCarlo: {
    paths: number;
    tiltPerDayPct: number;
    pUpEnd: number;            // % (com inclinação dos indicadores)
    pUpEndNeutral: number;     // % (sem inclinação — só estatística)
    pHitTargetFirst: number;   // % tocar alvo antes do stop
    pHitStopFirst: number;     // %
    pNeither: number;          // %
    expectedReturnPct: number;
    p10: number; p25: number; p50: number; p75: number; p90: number;
    target: number; stop: number;
  };
  scenarios: ScenarioCase[];
  backtest: {
    samples: number;
    bullishSamples: number; bullishHits: number; bullishAccuracy: number | null; bullishAvgFwdPct: number | null;
    bearishSamples: number; bearishHits: number; bearishAccuracy: number | null; bearishAvgFwdPct: number | null;
    overallAccuracy: number | null;
    baselineUpPct: number | null; // % de janelas em que o preço subiu, independentemente do sinal
    edgePct: number | null;        // acerto - 50
    reliability: "A" | "B" | "C" | "N/D";
    reliabilityLabel: string;
  };
  validation: {
    checks: ValidationCheck[];
    passed: number;
    total: number;
    grade: "Validação Forte" | "Validação Razoável" | "Validação Fraca";
    contradictions: string[];
  };
  final: {
    bias: number;            // -100..100
    overallScore: number;    // 0..100
    direction: "SOBE" | "DESCE" | "NEUTRO";
    probability: number;     // % da direção escolhida (50 para NEUTRO)
    confidence: number;      // 0..100
    confidenceLabel: "Alta Convicção" | "Média Convicção" | "Baixa / Cautela";
    reasoning: string[];     // passos do raciocínio
    weights: { technical: number; fundamental: number; news: number; monteCarlo: number; backtest: number };
  };
}

// PRNG determinístico (resultados reprodutíveis para o mesmo histórico)
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo = -100, hi = 100) => Math.max(lo, Math.min(hi, v));
const pctl = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];

export function runScenarioEngine(input: ScenarioInput): ScenarioResult {
  const H = input.horizonDays ?? 20;
  const candles = input.candles.filter(c => c && isFinite(c.c) && c.c > 0);
  const closes = candles.map(c => c.c);
  const n = closes.length;
  const price = input.currentPrice || closes[n - 1] || 1;
  const atr = input.atr > 0 ? input.atr : price * 0.02;

  // ---------- 1) Estatística dos retornos ----------
  const rets: number[] = [];
  for (let i = Math.max(1, n - 250); i < n; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const variance = rets.length > 1 ? rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1) : 0.0004;
  const std = Math.sqrt(variance) || 0.02;
  const upDays = rets.filter(r => r > 0).length;
  let peak = -Infinity, mdd = 0;
  for (const c of closes.slice(-252)) { peak = Math.max(peak, c); mdd = Math.min(mdd, (c - peak) / peak); }
  const lastT = input.lastCandleTime ?? (typeof candles[n - 1]?.t === "number" ? (candles[n - 1].t as number) : candles[n - 1]?.t ? new Date(candles[n - 1].t as string).getTime() : undefined);
  const lastAgeDays = lastT ? Math.max(0, (Date.now() - lastT) / 86400000) : null;

  // ---------- 2) Monte Carlo (bootstrap) ----------
  const target = input.technicalBias >= 0 ? Math.max(input.resistance, price + 2.2 * atr) : Math.min(input.support, price - 2.2 * atr);
  const stop = input.technicalBias >= 0 ? Math.min(input.support, price - 1.5 * atr) : Math.max(input.resistance, price + 1.5 * atr);
  const bullishDirection = input.technicalBias >= 0;

  const fundBias = input.fundamentalBias ?? 0;
  const combinedForTilt = clamp(0.6 * input.technicalBias + 0.2 * fundBias + 0.2 * input.newsBias);
  // inclinação modesta: no máximo ±0.35 desvios-padrão por dia
  const tilt = (combinedForTilt / 100) * 0.35 * std;

  const PATHS = 3000;
  const seed = Math.round(closes.slice(-30).reduce((a, b) => a + b, 0) * 1000) + n;
  const simulate = (drift: number) => {
    const rnd = mulberry32(seed);
    const ends: number[] = [];
    let hitT = 0, hitS = 0, up = 0;
    const centered = rets.length >= 30 ? rets.map(r => r - mean) : [-std, std, -std / 2, std / 2, 0];
    for (let p = 0; p < PATHS; p++) {
      let px = price; let resolved: "T" | "S" | null = null;
      for (let d = 0; d < H; d++) {
        const r = centered[Math.floor(rnd() * centered.length)] + drift;
        px = px * Math.exp(r);
        if (!resolved) {
          if (bullishDirection) { if (px >= target) resolved = "T"; else if (px <= stop) resolved = "S"; }
          else { if (px <= target) resolved = "T"; else if (px >= stop) resolved = "S"; }
        }
      }
      ends.push(px);
      if (px > price) up++;
      if (resolved === "T") hitT++; else if (resolved === "S") hitS++;
    }
    ends.sort((a, b) => a - b);
    return { ends, pUp: (up / PATHS) * 100, pT: (hitT / PATHS) * 100, pS: (hitS / PATHS) * 100 };
  };
  const neutralRun = simulate(mean * 0.5); // drift histórico atenuado (sem viés do modelo)
  const tiltedRun = simulate(mean * 0.5 + tilt);
  const ends = tiltedRun.ends;
  const expectedReturnPct = ((ends.reduce((a, b) => a + b, 0) / ends.length) / price - 1) * 100;

  // ---------- 3) Cenários ----------
  const bullThreshold = price + 1.5 * atr;
  const bearThreshold = price - 1.5 * atr;
  const pBull = (ends.filter(e => e >= bullThreshold).length / ends.length) * 100;
  const pBear = (ends.filter(e => e <= bearThreshold).length / ends.length) * 100;
  const pBase = Math.max(0, 100 - pBull - pBear);
  const bullTarget = pctl(ends, 0.8);
  const bearTarget = pctl(ends, 0.2);
  const baseTarget = pctl(ends, 0.5);
  const scenarios: ScenarioCase[] = [
    {
      key: "BULL", name: "Cenário Altista (Bull)", probability: Math.round(pBull), targetPrice: Number(bullTarget.toFixed(2)),
      targetPct: Number(((bullTarget / price - 1) * 100).toFixed(2)),
      trigger: `Fecho acima da resistência ${input.resistance.toFixed(2)} com volume acima da média`,
      narrative: `Rompimento confirmado: o preço acelera em direção a ${bullTarget.toFixed(2)} (percentil 80 da simulação). Precisa de ${input.bullishSignals} sinais altistas a manterem-se e de ausência de notícias negativas.`
    },
    {
      key: "BASE", name: "Cenário Base (Lateral)", probability: Math.round(pBase), targetPrice: Number(baseTarget.toFixed(2)),
      targetPct: Number(((baseTarget / price - 1) * 100).toFixed(2)),
      trigger: `Preço contido entre ${input.support.toFixed(2)} e ${input.resistance.toFixed(2)}`,
      narrative: `Consolidação dentro do intervalo de ±1.5 ATR (${bearThreshold.toFixed(2)}–${bullThreshold.toFixed(2)}). Mediana da simulação em ${baseTarget.toFixed(2)}. Estratégia: aguardar rompimento ou operar os extremos do intervalo.`
    },
    {
      key: "BEAR", name: "Cenário Baixista (Bear)", probability: Math.round(pBear), targetPrice: Number(bearTarget.toFixed(2)),
      targetPct: Number(((bearTarget / price - 1) * 100).toFixed(2)),
      trigger: `Perda do suporte ${input.support.toFixed(2)} com fecho abaixo e aumento de volume`,
      narrative: `Quebra de suporte abre caminho para ${bearTarget.toFixed(2)} (percentil 20). ${input.bearishSignals} sinais baixistas ativos; um choque noticioso negativo acelera este cenário.`
    }
  ];

  // ---------- 4) Backtest walk-forward ----------
  const MIN_WINDOW = 120;
  let bullS = 0, bullH = 0, bearS = 0, bearH = 0, bullFwd = 0, bearFwd = 0, allUp = 0, allN = 0;
  if (n >= MIN_WINDOW + H + 5) {
    const evals = Math.min(60, Math.floor((n - MIN_WINDOW - H) / 3));
    const step = Math.max(3, Math.floor((n - MIN_WINDOW - H) / Math.max(1, evals)));
    for (let i = MIN_WINDOW; i <= n - H; i += step) {
      const window = candles.slice(0, i);
      let s: number | null = null;
      try { s = input.scoreAt(window); } catch { s = null; }
      if (s == null || !isFinite(s)) continue;
      const fwd = closes[i + H - 1] / closes[i - 1] - 1;
      allN++; if (fwd > 0) allUp++;
      if (s >= 15) { bullS++; bullFwd += fwd; if (fwd > 0) bullH++; }
      else if (s <= -15) { bearS++; bearFwd += fwd; if (fwd < 0) bearH++; }
    }
  }
  const directional = bullS + bearS;
  const overallAccuracy = directional ? ((bullH + bearH) / directional) * 100 : null;
  const baselineUpPct = allN ? (allUp / allN) * 100 : null;
  let reliability: ScenarioResult["backtest"]["reliability"] = "N/D";
  let reliabilityLabel = "Histórico insuficiente para validar o modelo neste título";
  if (overallAccuracy != null && directional >= 8) {
    if (overallAccuracy >= 65) { reliability = "A"; reliabilityLabel = `Modelo fiável neste título: acertou ${overallAccuracy.toFixed(0)}% das ${directional} previsões direcionais (walk-forward, ${H} sessões)`; }
    else if (overallAccuracy >= 55) { reliability = "B"; reliabilityLabel = `Modelo com vantagem moderada: ${overallAccuracy.toFixed(0)}% de acerto em ${directional} previsões`; }
    else { reliability = "C"; reliabilityLabel = `Atenção: o modelo só acertou ${overallAccuracy.toFixed(0)}% em ${directional} previsões neste título — confiança reduzida`; }
  }
  const backtest: ScenarioResult["backtest"] = {
    samples: allN,
    bullishSamples: bullS, bullishHits: bullH, bullishAccuracy: bullS ? Number(((bullH / bullS) * 100).toFixed(0)) : null, bullishAvgFwdPct: bullS ? Number(((bullFwd / bullS) * 100).toFixed(2)) : null,
    bearishSamples: bearS, bearishHits: bearH, bearishAccuracy: bearS ? Number(((bearH / bearS) * 100).toFixed(0)) : null, bearishAvgFwdPct: bearS ? Number(((bearFwd / bearS) * 100).toFixed(2)) : null,
    overallAccuracy: overallAccuracy != null ? Number(overallAccuracy.toFixed(0)) : null,
    baselineUpPct: baselineUpPct != null ? Number(baselineUpPct.toFixed(0)) : null,
    edgePct: overallAccuracy != null ? Number((overallAccuracy - 50).toFixed(0)) : null,
    reliability, reliabilityLabel
  };

  // ---------- 5) Combinação & veredito ----------
  const mcBias = clamp((tiltedRun.pUp - 50) * 2);
  const hasFund = input.fundamentalBias != null;
  // Backtest como sinal: se o modelo tem edge histórico nesta direção, reforça; se tem edge negativo, penaliza
  const dirAcc = input.technicalBias >= 0 ? backtest.bullishAccuracy : backtest.bearishAccuracy;
  const dirSamples = input.technicalBias >= 0 ? bullS : bearS;
  const backtestBias = dirAcc != null && dirSamples >= 5 ? clamp((dirAcc - 50) * 2) * Math.sign(input.technicalBias || 1) : 0;

  const weights = { technical: hasFund ? 0.40 : 0.50, fundamental: hasFund ? 0.12 : 0, news: 0.10, monteCarlo: 0.23, backtest: 0.15 };
  const bias = clamp(
    weights.technical * input.technicalBias +
    weights.fundamental * fundBias +
    weights.news * input.newsBias +
    weights.monteCarlo * mcBias +
    weights.backtest * backtestBias
  );

  // ---------- Checklist de validação ----------
  const total = input.bullishSignals + input.bearishSignals;
  const dominant = Math.max(input.bullishSignals, input.bearishSignals);
  const confluencePct = total ? (dominant / total) * 100 : 0;
  const rr = Math.abs(target - price) / Math.max(1e-9, Math.abs(price - stop));
  const annualVol = std * Math.sqrt(252) * 100;
  const mcAgrees = Math.abs(input.technicalBias) < 15 || Math.sign(mcBias) === Math.sign(input.technicalBias);
  const newsContradicts = input.newsFreshCount >= 2 && Math.abs(input.newsBias) >= 25 && Math.sign(input.newsBias) !== Math.sign(bias) && Math.abs(bias) >= 15;

  const checks: ValidationCheck[] = [
    { name: "Dados de mercado recentes", passed: lastAgeDays == null ? true : lastAgeDays <= 4, detail: lastAgeDays == null ? "Data da última vela desconhecida" : `Última vela há ${lastAgeDays.toFixed(1)} dias`, critical: true },
    { name: "Amostra histórica suficiente", passed: n >= 150, detail: `${n} sessões disponíveis (mínimo recomendado 150)`, critical: true },
    { name: "Backtest do modelo neste título", passed: reliability === "A" || reliability === "B", detail: reliabilityLabel, critical: true },
    { name: "Simulação concorda com indicadores", passed: mcAgrees, detail: `Monte Carlo: ${tiltedRun.pUp.toFixed(0)}% de subida vs leitura técnica ${input.technicalBias > 0 ? "altista" : input.technicalBias < 0 ? "baixista" : "neutra"}` },
    { name: "Confluência de indicadores ≥ 60%", passed: confluencePct >= 60, detail: `${dominant} de ${total} sinais na mesma direção (${confluencePct.toFixed(0)}%)` },
    { name: "Notícias frescas não contradizem", passed: !newsContradicts, detail: input.newsFreshCount === 0 ? "Sem notícias nas últimas 72h — sem impacto" : `${input.newsFreshCount} notícias ≤72h, viés ${input.newsBias > 0 ? "+" : ""}${input.newsBias}` },
    { name: "Rácio risco/retorno ≥ 1.5", passed: rr >= 1.5, detail: `Alvo ${target.toFixed(2)} / Stop ${stop.toFixed(2)} → 1:${rr.toFixed(1)}` },
    { name: "Volatilidade não extrema", passed: annualVol < 80, detail: `Vol. anualizada ${annualVol.toFixed(0)}%` },
    { name: "Probabilidade alvo > stop", passed: tiltedRun.pT > tiltedRun.pS, detail: `Toca alvo primeiro ${tiltedRun.pT.toFixed(0)}% vs stop ${tiltedRun.pS.toFixed(0)}%` }
  ];
  const passed = checks.filter(c => c.passed).length;
  const criticalFailed = checks.filter(c => c.critical && !c.passed).length;
  const grade: ScenarioResult["validation"]["grade"] = passed >= 7 && criticalFailed === 0 ? "Validação Forte" : passed >= 5 ? "Validação Razoável" : "Validação Fraca";

  const contradictions: string[] = [];
  if (!mcAgrees) contradictions.push("A simulação estatística não confirma a direção dos indicadores — o movimento pode já estar esgotado.");
  if (newsContradicts) contradictions.push("As notícias das últimas 72h apontam na direção contrária à leitura técnica.");
  if (reliability === "C") contradictions.push("Neste título o modelo técnico teve historicamente pouca capacidade preditiva.");
  if (hasFund && Math.abs(fundBias) >= 30 && Math.sign(fundBias) !== Math.sign(input.technicalBias) && Math.abs(input.technicalBias) >= 20) contradictions.push("Técnica e fundamentos divergem: o movimento de curto prazo contraria o valor intrínseco.");

  // Direção & probabilidade
  let direction: "SOBE" | "DESCE" | "NEUTRO" = bias >= 12 ? "SOBE" : bias <= -12 ? "DESCE" : "NEUTRO";
  if (criticalFailed >= 2 && Math.abs(bias) < 30) direction = "NEUTRO";
  const pUpBlend = 0.6 * tiltedRun.pUp + 0.4 * (50 + bias / 2);
  const probability = direction === "SOBE" ? Math.round(clamp(pUpBlend, 50, 94)) : direction === "DESCE" ? Math.round(clamp(100 - pUpBlend, 50, 94)) : 50;

  // Confiança: validação × fiabilidade × magnitude
  const relFactor = reliability === "A" ? 1 : reliability === "B" ? 0.85 : reliability === "C" ? 0.55 : 0.75;
  let confidence = Math.round(clamp((passed / checks.length) * 60 + Math.min(40, Math.abs(bias) * 0.6), 0, 100) * relFactor);
  confidence -= contradictions.length * 6;
  if (n < 30) confidence = Math.min(confidence, 35);
  else if (n < 150) confidence = Math.min(confidence, 60);
  confidence = Math.round(clamp(confidence, 5, 97));
  const confidenceLabel: ScenarioResult["final"]["confidenceLabel"] = confidence >= 68 ? "Alta Convicção" : confidence >= 45 ? "Média Convicção" : "Baixa / Cautela";
  const overallScore = Math.round(50 + bias / 2);

  const dataQuality: ScenarioResult["dataQuality"] = n >= 150 ? "OK" : n >= 30 ? "LIMITADA" : "SEM_HISTORICO";
  const dataQualityNote = dataQuality === "OK"
    ? `${n} sessões reais usadas na simulação e no backtest.`
    : dataQuality === "LIMITADA"
      ? `Apenas ${n} sessões disponíveis: simulação válida mas backtest pouco robusto — confiança limitada.`
      : `Sem histórico de velas suficiente (${n} sessões): a simulação usa volatilidade genérica (2%/dia) e o backtest não é possível. O veredito fica propositadamente conservador.`;

  const reasoning = [
    `1) Leitura técnica: viés ${input.technicalBias > 0 ? "+" : ""}${input.technicalBias.toFixed(0)} com ${input.bullishSignals} sinais altistas vs ${input.bearishSignals} baixistas (confluência ${confluencePct.toFixed(0)}%).`,
    hasFund ? `2) Fundamentos: viés ${fundBias > 0 ? "+" : ""}${fundBias.toFixed(0)} (valuation e qualidade).` : `2) Fundamentos: não disponíveis para este título (peso redistribuído).`,
    `3) Notícias ≤72h: ${input.newsFreshCount} com impacto, viés ${input.newsBias > 0 ? "+" : ""}${input.newsBias} (notícias mais antigas foram ignoradas).`,
    `0) Qualidade dos dados: ${dataQualityNote}`,
    `4) Monte Carlo (${PATHS} trajetórias, ${H} sessões, bootstrap de ${rets.length} retornos reais): ${tiltedRun.pUp.toFixed(0)}% de fechar acima do preço atual (estatística pura: ${neutralRun.pUp.toFixed(0)}%); alvo antes do stop em ${tiltedRun.pT.toFixed(0)}% dos casos.`,
    `5) Backtest walk-forward: ${reliabilityLabel}.`,
    `6) Cenários: Bull ${Math.round(pBull)}% · Base ${Math.round(pBase)}% · Bear ${Math.round(pBear)}%.`,
    `7) Validação: ${passed}/${checks.length} verificações aprovadas (${grade})${contradictions.length ? `, ${contradictions.length} contradição(ões) detetada(s)` : ""}.`,
    `⇒ Veredito: ${direction} com ${probability}% de probabilidade e ${confidence}% de confiança (${confidenceLabel}).`
  ];

  return {
    horizonDays: H,
    dataQuality,
    dataQualityNote,
    stats: {
      bars: n, dailyVolPct: Number((std * 100).toFixed(2)), annualVolPct: Number(annualVol.toFixed(1)), driftDailyPct: Number((mean * 100).toFixed(3)),
      maxDrawdownPct: Number((mdd * 100).toFixed(1)), lastCandleAgeDays: lastAgeDays != null ? Number(lastAgeDays.toFixed(1)) : null,
      upDaysPct: rets.length ? Number(((upDays / rets.length) * 100).toFixed(0)) : 50
    },
    monteCarlo: {
      paths: PATHS, tiltPerDayPct: Number((tilt * 100).toFixed(3)),
      pUpEnd: Number(tiltedRun.pUp.toFixed(1)), pUpEndNeutral: Number(neutralRun.pUp.toFixed(1)),
      pHitTargetFirst: Number(tiltedRun.pT.toFixed(1)), pHitStopFirst: Number(tiltedRun.pS.toFixed(1)), pNeither: Number((100 - tiltedRun.pT - tiltedRun.pS).toFixed(1)),
      expectedReturnPct: Number(expectedReturnPct.toFixed(2)),
      p10: Number(pctl(ends, 0.1).toFixed(2)), p25: Number(pctl(ends, 0.25).toFixed(2)), p50: Number(pctl(ends, 0.5).toFixed(2)), p75: Number(pctl(ends, 0.75).toFixed(2)), p90: Number(pctl(ends, 0.9).toFixed(2)),
      target: Number(target.toFixed(2)), stop: Number(stop.toFixed(2))
    },
    scenarios,
    backtest,
    validation: { checks, passed, total: checks.length, grade, contradictions },
    final: { bias: Number(bias.toFixed(1)), overallScore, direction, probability, confidence, confidenceLabel, reasoning, weights }
  };
}
