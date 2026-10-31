import { createHash } from "node:crypto";
import type { StockAnalysis, Verdict, TvLike } from "./engine";
import type { Candle } from "./yahoo";
import type { StockNewsFeed } from "./news";
import { filterRecentNews, ageHours, newsRecencyWeight } from "./news-policy";
import { supportingFamilies } from "./technical-model";
import { candleFingerprint, unavailableValidation, validateCandleHistory, walkForwardValidation, type ValidationReport } from "./validation";
import { DIRECTION_THRESHOLD, FORECAST_HORIZON, MIN_SUPPORTING_FAMILIES, MIN_VALIDATION_TRADES, RESEARCH_VERSION, TECHNICAL_LOOKBACK } from "./research-policy";

export type DecisionCheck = { id: string; label: string; result: "pass" | "warn" | "fail"; evidence: string };
export type ForecastScenario = {
  id: "bull" | "bear" | "range";
  label: string;
  direction: Verdict;
  weight: number;
  trigger: number | null;
  target: number | null;
  invalidation: number | null;
  lowerBound: number;
  upperBound: number;
  riskReward: number | null;
  supporting: string[];
  confirmation: string;
  invalidatedIf: string;
};
export type DecisionAudit = {
  modelVersion: string;
  id: string;
  createdAt: string;
  marketAsOf: string | null;
  horizonBars: number;
  horizonUnit: "sessões" | "barras semanais";
  rawVerdict: Verdict;
  finalVerdict: Verdict;
  grade: "blocked" | "provisional" | "historical_support";
  gradeLabel: string;
  supportingFamilies: number;
  executionReady: false;
  checks: DecisionCheck[];
  scenarios: ForecastScenario[];
  validation: ValidationReport;
  news: {
    status: string;
    maxAgeHours: 72;
    last24Hours: number;
    last48Hours: number;
    last72Hours: number;
    publishers: number;
    recencyWeightedCount: number;
    impact: "Não verificado: atualidade não equivale a impacto nem a surpresa financeira.";
  };
  snapshot: {
    symbol: string;
    price: number;
    currency: string;
    interval: string;
    source: string;
    score: number;
    dataHash: string | null;
    technicalWindow: Candle[];
    scanner: TvLike | null;
    headlines: { title: string; publishedAt: string; source: string; url: string }[];
    rules: { threshold: number; minimumFamilies: number; lookback: number; futureDataAllowed: false };
  };
  limitations: string[];
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const f = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: n < 1 ? 4 : 2 });

export function buildScenarios(a: StockAnalysis): ForecastScenario[] {
  const p = a.price;
  const atr = a.indicators.atr14 && a.indicators.atr14 > 0 ? a.indicators.atr14 : p * 0.025;
  const unit = Math.min(atr, p * 0.12);
  const nearestResistance = a.levels.filter(l => l.price > p).sort((x, y) => x.price - y.price)[0]?.price;
  const nearestSupport = a.levels.filter(l => l.price < p).sort((x, y) => y.price - x.price)[0]?.price;
  const resistance = Math.max(p + 0.5 * unit, Math.min(nearestResistance ?? p + unit, p + 2 * unit));
  const support = Math.min(p - 0.5 * unit, Math.max(nearestSupport ?? p - unit, p - 2 * unit));
  const adx = a.indicators.adx14 ?? 20;
  const conflicting = a.confluence?.conflicts.length ?? 0;
  const logits = [a.score / 35, -a.score / 35, 1.1 - adx / 35 + conflicting * 0.15];
  const weights = logits.map(v => Math.exp(clamp(v, -4, 4)));
  const sum = weights.reduce((x, y) => x + y, 0);
  const bullWeight = Math.round(weights[0] / sum * 100), bearWeight = Math.round(weights[1] / sum * 100);
  const volumeText = a.indicators.avgVolume20 != null ? "volume de pelo menos 1,2× a média das últimas 20 barras" : "confirmação de volume ainda indisponível — não assumir confirmação";
  const positive = a.confluence?.families.filter(g => g.score >= 12).map(g => g.name) ?? [];
  const negative = a.confluence?.families.filter(g => g.score <= -12).map(g => g.name) ?? [];
  return [
    { id: "bull", label: "Cenário de alta", direction: "SUBIR", weight: bullWeight, trigger: resistance, target: resistance + 3 * unit, invalidation: resistance - 1.25 * unit,
      lowerBound: p, upperBound: resistance + 3 * unit, riskReward: 2.4, supporting: positive,
      confirmation: `Duas barras fechadas acima de ${f(resistance)} ${a.currency}, com ${volumeText}. Critérios futuros: não estão marcados como cumpridos.`,
      invalidatedIf: `Regresso abaixo de ${f(resistance - 1.25 * unit)} ${a.currency} ou perda de duas famílias altistas. Uma abertura em gap exige recalcular os níveis.` },
    { id: "bear", label: "Cenário de baixa", direction: "DESCER", weight: bearWeight, trigger: support, target: Math.max(p * 0.01, support - 3 * unit), invalidation: support + 1.25 * unit,
      lowerBound: Math.max(p * 0.01, support - 3 * unit), upperBound: p, riskReward: 2.4, supporting: negative,
      confirmation: `Duas barras fechadas abaixo de ${f(support)} ${a.currency}, com ${volumeText}. Não equivale a autorização para vender a descoberto.`,
      invalidatedIf: `Recuperação de ${f(support + 1.25 * unit)} ${a.currency} ou perda de duas famílias baixistas. Verificar risco de gap e restrições de negociação.` },
    { id: "range", label: "Cenário lateral", direction: "NEUTRO", weight: 100 - bullWeight - bearWeight, trigger: null, target: null, invalidation: null,
      lowerBound: support, upperBound: resistance, riskReward: null, supporting: ["Ausência de rutura confirmada", ...(adx < 20 ? ["ADX inferior a 20"] : [])],
      confirmation: `Preço permanece entre ${f(support)} e ${f(resistance)} ${a.currency}, sem convergência direcional suficiente. Não abrir uma operação apenas por este cenário.`,
      invalidatedIf: "Rutura confirmada de um dos limites, com volume e pelo menos duas famílias de indicadores no mesmo sentido." },
  ];
}

export function attachDecisionAudit(
  a: StockAnalysis,
  input: { history: Candle[]; source: string; scanner: TvLike | null; quoteAsOf?: number | null; news?: StockNewsFeed | null },
  now = Date.now(),
): StockAnalysis {
  const history = input.history;
  const invalid = validateCandleHistory(history);
  const lastBar = history.at(-1)?.t ?? null;
  const asOf = lastBar ?? input.quoteAsOf ?? null;
  const ageDays = asOf == null ? null : (now - asOf) / 86_400_000;
  const permittedAge = a.interval === "1wk" ? 14 : 7;
  const support = supportingFamilies(a);
  const currentBarMayBeOpen = a.interval === "1wk" || lastBar != null && now - lastBar < 86_400_000;
  const raw = a.verdict;
  const validation = a.interval !== "1d" ? unavailableValidation(history.length, "O protocolo histórico é diário; a vista semanal não está validada por este teste.")
    : invalid.length ? { ...unavailableValidation(history.length), status: "invalid" as const, label: "Integridade do histórico falhou.", limitations: invalid }
    : walkForwardValidation(history);
  const sameDirection = validation.byDirection.find(d => d.direction === raw);
  const directionSupported = sameDirection != null && sameDirection.trades >= MIN_VALIDATION_TRADES && sameDirection.wilson95Pct != null && sameDirection.wilson95Pct[0] > 50 && (sameDirection.meanNetReturnPct ?? 0) > 0;
  const news = filterRecentNews(input.news?.articles ?? [], 72, now);
  const checks: DecisionCheck[] = [
    { id: "integrity", label: "Integridade dos dados", result: invalid.length ? "fail" : history.length ? "pass" : "warn", evidence: invalid.length ? invalid.join(" ") : history.length ? `${history.length} barras OHLCV ordenadas e com extremos coerentes.` : "Apenas snapshot do scanner. Não há série histórica para verificar ou testar." },
    { id: "freshness", label: "Atualidade do mercado", result: ageDays == null ? "warn" : ageDays < 0 || ageDays > permittedAge ? "fail" : "pass", evidence: ageDays == null ? "A fonte não expõe uma data verificável da cotação. O instante de consulta não foi usado como data fictícia de mercado." : `Última observação: ${new Date(asOf!).toISOString()}; idade ${ageDays.toFixed(1)} dias. Limite conservador ${permittedAge} dias de calendário, incluindo pausas de negociação.` },
    { id: "closedbar", label: "Barra fechada e periodicidade", result: currentBarMayBeOpen || !history.length ? "warn" : "pass", evidence: currentBarMayBeOpen ? "Barra semanal ou observação com menos de 24h: o fecho da sessão não está confirmado por calendário de bolsa. Aguardar confirmação." : history.length ? "O teste usa fechos históricos e entrada seguinte. A última barra tem pelo menos 24h; não é usado um calendário oficial de sessões." : "Sem barras verificáveis; confirmação por fechos indisponível." },
    { id: "strength", label: "Força direcional mínima", result: Math.abs(a.score) >= DIRECTION_THRESHOLD ? "pass" : "fail", evidence: `Score ${a.score.toFixed(1)}; é necessário |score| ≥ ${DIRECTION_THRESHOLD}.` },
    { id: "families", label: "Confirmação independente por famílias", result: support >= MIN_SUPPORTING_FAMILIES ? "pass" : "fail", evidence: `${support} famílias direcionais no mesmo sentido; mínimo ${MIN_SUPPORTING_FAMILIES}. Médias correlacionadas não contam como famílias novas.` },
    { id: "historical", label: "Verificação histórica a 20 sessões", result: validation.status === "supported" ? "pass" : "warn", evidence: validation.label },
    { id: "direction_history", label: "Amostra do sentido atual", result: directionSupported ? "pass" : "warn", evidence: raw === "NEUTRO" ? "Não há direção atual a validar." : `${sameDirection?.trades ?? 0} sinais ${raw} no teste; mínimo ${MIN_VALIDATION_TRADES}, retorno médio líquido positivo e limite Wilson inferior acima de 50% para suporte nesse sentido.` },
    { id: "news", label: "Notícias: publicação ≤ 72 horas", result: news.length && !input.news?.stale ? "pass" : "warn", evidence: news.length ? `${news.length} manchetes dentro de 72h. Datas verificadas, impacto e novidade económica não confirmados${input.news?.stale ? "; fontes indisponíveis, cache refiltrada" : ""}.` : input.news ? "Nenhuma notícia admissível nas últimas 72h; não se reutilizam notícias antigas." : "Notícias não consultadas para este registo; não se presume ausência de eventos." },
  ];
  const blocked = checks.some(c => c.result === "fail");
  const grade: DecisionAudit["grade"] = blocked ? "blocked" : validation.status === "supported" && directionSupported && history.length > 0 && ageDays != null && !currentBarMayBeOpen ? "historical_support" : "provisional";
  const gradeLabel = grade === "blocked" ? "AGUARDAR · critérios não cumpridos" : grade === "historical_support" ? "Suporte histórico limitado · não é garantia" : "SINAL PROVISÓRIO · sem validação suficiente";
  const finalVerdict = blocked ? "NEUTRO" : raw;
  const snapshot: DecisionAudit["snapshot"] = {
    symbol: a.symbol, price: a.price, currency: a.currency, interval: a.interval, source: input.source, score: a.score,
    dataHash: history.length ? candleFingerprint(history) : null, technicalWindow: history.slice(-TECHNICAL_LOOKBACK),
    scanner: history.length ? null : input.scanner,
    headlines: news.map(n => ({ title: n.title, publishedAt: n.publishedAt, source: n.source, url: n.url })),
    rules: { threshold: DIRECTION_THRESHOLD, minimumFamilies: MIN_SUPPORTING_FAMILIES, lookback: TECHNICAL_LOOKBACK, futureDataAllowed: false },
  };
  const id = createHash("sha256").update(JSON.stringify({ version: RESEARCH_VERSION, snapshot })).digest("hex").slice(0, 16);
  const decision: DecisionAudit = { modelVersion: RESEARCH_VERSION, id, createdAt: new Date(now).toISOString(), marketAsOf: asOf == null ? null : new Date(asOf).toISOString(), horizonBars: FORECAST_HORIZON,
    horizonUnit: a.interval === "1wk" ? "barras semanais" : "sessões", rawVerdict: raw, finalVerdict, grade, gradeLabel, supportingFamilies: support, executionReady: false, checks,
    scenarios: buildScenarios(a), validation,
    news: { status: input.news?.status ?? "not_consulted", maxAgeHours: 72, last24Hours: news.filter(n => (ageHours(n.publishedAt, now) ?? Infinity) <= 24).length,
      last48Hours: news.filter(n => (ageHours(n.publishedAt, now) ?? Infinity) <= 48).length, last72Hours: news.length,
      publishers: new Set(news.map(n => n.source.toLowerCase())).size, recencyWeightedCount: Number(news.reduce((n, item) => n + newsRecencyWeight(item.publishedAt, now), 0).toFixed(2)),
      impact: "Não verificado: atualidade não equivale a impacto nem a surpresa financeira." },
    snapshot,
    limitations: ["Pesos dos três cenários são apenas uma distribuição heurística de hipóteses, não probabilidades calibradas ou intervalos de confiança de preço.",
      "Notícias recentes podem já estar refletidas no preço. Uma notícia antiga pode continuar materialmente relevante, mesmo sendo excluída do feed de atualidade.",
      "Não lemos nem verificamos integralmente os artigos ou comunicados. Não atribuímos direção ao preço por palavras numa manchete.",
      "Não há gestão ou execução automática de ordens. Os níveis são condicionais e precisam de ser recalculados se o mercado mudar."],
  };
  a.decision = decision;
  a.verdict = finalVerdict;
  a.verdictLabel = finalVerdict === "SUBIR" ? "Subida · cenário condicional" : finalVerdict === "DESCER" ? "Descida · cenário condicional" : "Neutro · aguardar confirmação";
  a.verdictEmoji = finalVerdict === "SUBIR" ? "▲" : finalVerdict === "DESCER" ? "▼" : "◆";
  a.confidence = Math.min(a.confidence, grade === "historical_support" ? 75 : grade === "provisional" ? 35 : 20);
  a.horizon = `${FORECAST_HORIZON} ${decision.horizonUnit}${a.interval === "1d" ? " (cerca de 4 semanas)" : " · sem validação diária"}`;
  a.summary = `${a.name}: ${a.verdictLabel.toLowerCase()}. ${gradeLabel}. O viés técnico candidato é ${raw}, com score ${a.score > 0 ? "+" : ""}${a.score.toFixed(1)}/100 e ${support} famílias alinhadas. Horizonte: ${a.horizon}. ${validation.label}. ${news.length} notícias com publicação verificável nas últimas 72 horas; o seu impacto financeiro não foi presumido. Consulta as condições de confirmação, invalidação e as limitações antes de decidir.`;
  if (finalVerdict !== "NEUTRO") {
    const scenario = decision.scenarios.find(s => s.direction === finalVerdict)!;
    const entry = scenario.trigger!, target2 = scenario.target!, stop = scenario.invalidation!;
    const reward = Math.abs(target2 - entry), risk = Math.abs(stop - entry);
    a.plan = { entry, target1: entry + (target2 - entry) / 2, target2, stop, riskReward: risk > 0 ? reward / risk : null, upsidePct: (target2 / entry - 1) * 100, downsidePct: (stop / entry - 1) * 100 };
  }
  a.risks = [...new Set([...checks.filter(c => c.result !== "pass").map(c => `${c.label}: ${c.evidence}`), ...a.risks])].slice(0, 10);
  a.timeframes = a.timeframes.map((t, i) => i === 1 ? { label: "20 sessões · veredicto condicionado", score: a.score, verdict: finalVerdict } : { ...t, label: i === 0 ? "Momento/volume · diagnóstico" : "Tendência · diagnóstico estrutural" });
  return a;
}
