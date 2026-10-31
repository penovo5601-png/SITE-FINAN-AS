import { createHash } from "node:crypto";
import type { Candle } from "./yahoo";
import { historicalSignal } from "./technical-model";
import { DIRECTION_THRESHOLD, FORECAST_HORIZON, MAX_VALIDATION_FOLDS, MIN_VALIDATION_TRADES, RESEARCH_VERSION, ROUND_TRIP_COST_BPS, TECHNICAL_LOOKBACK, VALIDATION_SPACING } from "./research-policy";

export type WalkForwardFold = {
  predictionAt: string;
  trainingStart: string;
  entryAt: string;
  exitAt: string;
  inputHash: string;
  score: number;
  direction: "SUBIR" | "DESCER" | "NEUTRO";
  entry: number;
  exit: number;
  netReturnPct: number;
  baselineNetPct: number;
  directionalHit: boolean | null;
};
export type ValidationReport = {
  status: "supported" | "inconclusive" | "insufficient" | "unavailable" | "invalid";
  label: string;
  modelVersion: string;
  horizonSessions: number;
  costBps: number;
  minimumTrades: number;
  observations: number;
  windows: number;
  trades: number;
  abstentions: number;
  coveragePct: number;
  directionalAccuracyPct: number | null;
  netWinRatePct: number | null;
  wilson95Pct: [number, number] | null;
  meanNetReturnPct: number | null;
  baselineActiveMeanNetPct: number | null;
  meanExcessNetPct: number | null;
  profitFactor: number | null;
  maxDrawdownPct: number | null;
  byDirection: { direction: "SUBIR" | "DESCER"; trades: number; directionalAccuracyPct: number | null; meanNetReturnPct: number | null; wilson95Pct: [number, number] | null }[];
  recentBlocks: { label: string; trades: number; meanNetPct: number | null }[];
  testedFrom: string | null;
  testedTo: string | null;
  dataHash: string | null;
  folds: WalkForwardFold[];
  methodology: string;
  limitations: string[];
};

const methodology = "Walk-forward de regras fixas: janela móvel de 320 barras; decisão no fecho; entrada na abertura da sessão seguinte; saída no fecho da 20.ª sessão; uma sessão de separação entre blocos de resultados; até 36 janelas sem sobreposição. Sem ajustar parâmetros ao teste. O modelo histórico e o modelo OHLCV atual usam o mesmo cálculo. Custos totais assumidos: 20 pontos base por operação completa (0,20%). Notícias, fundamentos e snapshots atuais do scanner não entram no histórico.";
const limitations = [
  "Diagnóstico histórico de uma única ação, não certificação de rentabilidade ou probabilidade futura. Pode haver dependência serial entre regimes mesmo sem janelas sobrepostas.",
  "O intervalo Wilson de 95% é aproximado e assume ensaios independentes. A amostra pequena exige cautela.",
  "Dados atuais do fornecedor podem estar ajustados ou revistos; não constituem uma base point-in-time certificada e não incluem ações deslistadas.",
  "Não modela financiamento, empréstimo de títulos, restrições a vendas a descoberto, impacto de mercado ou todos os custos específicos da corretora. As pernas descendentes são apenas uma simulação.",
  "Não testa o impacto de notícias nem garante execução de stops/alvos intradiários. Avalia apenas a direção técnica a 20 sessões. O drawdown por fechos não captura a pior perda intradiária.",
];
export function candleFingerprint(history: Candle[]): string {
  return createHash("sha256").update(JSON.stringify(history.map(c => [c.t, c.o, c.h, c.l, c.c, c.v]))).digest("hex");
}
export function validateCandleHistory(history: Candle[]): string[] {
  const errors: string[] = [];
  for (let i = 0; i < history.length; i++) {
    const c = history[i];
    if (![c.t, c.o, c.h, c.l, c.c, c.v].every(Number.isFinite) || Math.min(c.o, c.h, c.l, c.c) <= 0 || c.v < 0) { errors.push("OHLCV contém valores inválidos."); break; }
    if (c.h + 1e-8 < Math.max(c.o, c.c, c.l) || c.l - 1e-8 > Math.min(c.o, c.c, c.h)) { errors.push("Máximos e mínimos incompatíveis com abertura/fecho."); break; }
    if (i > 0 && c.t <= history[i - 1].t) { errors.push("Datas duplicadas ou não ordenadas no histórico."); break; }
  }
  return errors;
}
export function wilsonInterval(wins: number, total: number): [number, number] | null {
  if (total <= 0) return null;
  const z = 1.95996398454, p = wins / total, denominator = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denominator;
  const radius = z / denominator * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total));
  return [Math.max(0, (center - radius) * 100), Math.min(100, (center + radius) * 100)];
}
export function unavailableValidation(observations = 0, message = "Sem histórico diário suficiente para validar esta ação."): ValidationReport {
  return { status: "unavailable", label: message, modelVersion: RESEARCH_VERSION, horizonSessions: FORECAST_HORIZON, costBps: ROUND_TRIP_COST_BPS, minimumTrades: MIN_VALIDATION_TRADES,
    observations, windows: 0, trades: 0, abstentions: 0, coveragePct: 0, directionalAccuracyPct: null, netWinRatePct: null, wilson95Pct: null, meanNetReturnPct: null, baselineActiveMeanNetPct: null, meanExcessNetPct: null, profitFactor: null, maxDrawdownPct: null, byDirection: [], recentBlocks: [], testedFrom: null, testedTo: null, dataHash: null, folds: [], methodology, limitations: [...limitations] };
}
const cache = new Map<string, ValidationReport>();

export function walkForwardValidation(history: Candle[], predict = historicalSignal): ValidationReport {
  const report = unavailableValidation(history.length);
  const errors = validateCandleHistory(history);
  if (errors.length) return { ...report, status: "invalid", label: "Histórico rejeitado por falhas de integridade.", limitations: [...errors, ...limitations] };
  if (history.length < TECHNICAL_LOOKBACK + FORECAST_HORIZON) return report;
  const dataHash = candleFingerprint(history);
  const cacheKey = `${RESEARCH_VERSION}:${dataHash}`;
  if (predict === historicalSignal && cache.has(cacheKey)) return cache.get(cacheKey)!;
  const origins: number[] = [];
  // Todas as origens são fixadas antes de observar os respetivos retornos.
  for (let i = TECHNICAL_LOOKBACK - 1; i + FORECAST_HORIZON < history.length; i += VALIDATION_SPACING) origins.push(i);
  const folds: WalkForwardFold[] = [];
  const costPct = ROUND_TRIP_COST_BPS / 100;
  for (const origin of origins.slice(-MAX_VALIDATION_FOLDS)) {
    const past = history.slice(origin - TECHNICAL_LOOKBACK + 1, origin + 1);
    const prediction = predict(past);
    const direction = prediction.eligible && prediction.score >= DIRECTION_THRESHOLD ? 1 : prediction.eligible && prediction.score <= -DIRECTION_THRESHOLD ? -1 : 0;
    const entry = history[origin + 1], exit = history[origin + FORECAST_HORIZON];
    const underlyingReturn = (exit.c / entry.o - 1) * 100;
    folds.push({ predictionAt: new Date(history[origin].t).toISOString(), trainingStart: new Date(past[0].t).toISOString(), entryAt: new Date(entry.t).toISOString(), exitAt: new Date(exit.t).toISOString(), inputHash: candleFingerprint(past), score: prediction.score,
      direction: direction > 0 ? "SUBIR" : direction < 0 ? "DESCER" : "NEUTRO", entry: entry.o, exit: exit.c,
      netReturnPct: direction === 0 ? 0 : direction * underlyingReturn - costPct, baselineNetPct: underlyingReturn - costPct, directionalHit: direction === 0 ? null : direction * underlyingReturn > 0 });
  }
  const trades = folds.filter(f => f.direction !== "NEUTRO");
  const n = trades.length;
  const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const hits = trades.filter(f => f.directionalHit).length;
  const ci = wilsonInterval(hits, n);
  const meanNet = average(trades.map(f => f.netReturnPct));
  const baselineMean = average(trades.map(f => f.baselineNetPct));
  const excess = meanNet != null && baselineMean != null ? meanNet - baselineMean : null;
  const profit = trades.reduce((sum, f) => sum + Math.max(0, f.netReturnPct), 0);
  const loss = trades.reduce((sum, f) => sum + Math.max(0, -f.netReturnPct), 0);
  const profitFactor = loss > 0 ? profit / loss : null;
  let equity = 1, peak = 1, drawdown = 0;
  for (const f of trades) { equity = Math.max(0, equity * (1 + f.netReturnPct / 100)); peak = Math.max(peak, equity); drawdown = Math.min(drawdown, (equity / peak - 1) * 100); }
  const positive = n >= MIN_VALIDATION_TRADES && ci != null && ci[0] > 50 && (meanNet ?? 0) > 0 && (excess ?? 0) > 0 && (loss === 0 ? profit > 0 : (profitFactor ?? 0) > 1);
  const status = n < MIN_VALIDATION_TRADES ? "insufficient" : positive ? "supported" : "inconclusive";
  const blocks: ValidationReport["recentBlocks"] = [];
  for (let b = 0; b < 3; b++) {
    const part = folds.slice(Math.floor(b * folds.length / 3), Math.floor((b + 1) * folds.length / 3)).filter(f => f.direction !== "NEUTRO");
    blocks.push({ label: `Bloco ${b + 1}`, trades: part.length, meanNetPct: average(part.map(f => f.netReturnPct)) });
  }
  const byDirection = (["SUBIR", "DESCER"] as const).map(direction => {
    const subset = trades.filter(f => f.direction === direction);
    const successes = subset.filter(f => f.directionalHit).length;
    return { direction, trades: subset.length, directionalAccuracyPct: subset.length ? successes / subset.length * 100 : null, meanNetReturnPct: average(subset.map(f => f.netReturnPct)), wilson95Pct: wilsonInterval(successes, subset.length) };
  });
  const result: ValidationReport = { ...report, status, byDirection, label: status === "supported" ? "Suporte histórico limitado neste protocolo" : status === "insufficient" ? `Amostra insuficiente: ${n}/${MIN_VALIDATION_TRADES} sinais negociáveis` : "Sem evidência suficiente de vantagem histórica",
    windows: folds.length, trades: n, abstentions: folds.length - n, coveragePct: folds.length ? n / folds.length * 100 : 0,
    directionalAccuracyPct: n ? hits / n * 100 : null, netWinRatePct: n ? trades.filter(f => f.netReturnPct > 0).length / n * 100 : null,
    wilson95Pct: ci, meanNetReturnPct: meanNet, baselineActiveMeanNetPct: baselineMean, meanExcessNetPct: excess,
    profitFactor, maxDrawdownPct: n ? drawdown : null, recentBlocks: blocks, testedFrom: folds[0]?.entryAt ?? null, testedTo: folds.at(-1)?.exitAt ?? null, dataHash, folds };
  if (predict === historicalSignal) {
    if (cache.size >= 32) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, result);
  }
  return result;
}
