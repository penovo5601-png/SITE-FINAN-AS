import type { Signal, StockAnalysis, TvLike, Verdict } from "./engine";
import { extendedIndicators, type ExtendedIndicators } from "./indicators-extended";
import type { Candle } from "./yahoo";

export type SignalFamily = { name: Signal["group"]; score: number; weight: number; count: number; bullish: number; bearish: number; neutral: number };
export type ConfluenceReport = {
  version: "2.0";
  families: SignalFamily[];
  votes: { bullish: number; bearish: number; neutral: number };
  alignment: number;
  regime: string;
  coverage: number;
  observations: number;
  extended: ExtendedIndicators;
  newSignals: Signal[];
  missing: string[];
  conflicts: string[];
  methodology: string;
};
const num = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const clamp = (n: number, a = -100, b = 100) => Math.max(a, Math.min(b, n));
const fmt = (n: number | null, digits = 2) => n == null ? "—" : n.toFixed(digits);
const decision = (score: number): Verdict => score >= 12 ? "SUBIR" : score <= -12 ? "DESCER" : "NEUTRO";
const baseWeights: Record<Signal["group"], number> = { "Tendência": 0.36, "Momento": 0.28, "Volume": 0.18, "Volatilidade": 0.10, "Padrões": 0.08 };

export function groupSignals(signals: Signal[], adx: number | null = null): SignalFamily[] {
  return (Object.keys(baseWeights) as Signal["group"][]).flatMap(name => {
    // Consensos de TradingView já agregam os mesmos indicadores. Não votam outra vez.
    const rows = signals.filter(s => s.group === name && !["tvrec", "tvrecw", "tvrecm", "adx", "atr", "bandwidth"].includes(s.id) && Number.isFinite(s.bias));
    if (!rows.length) return [];
    let numerator = 0, denominator = 0;
    for (const s of rows) { numerator += s.bias * s.weight; denominator += s.weight; }
    const weight = baseWeights[name] * (name === "Tendência" && adx != null && adx < 20 ? 0.65 : 1);
    return [{ name, score: Math.round((denominator ? numerator / denominator : 0) * 10) / 10, weight, count: rows.length,
      bullish: rows.filter(s => s.bias >= 12).length, bearish: rows.filter(s => s.bias <= -12).length, neutral: rows.filter(s => Math.abs(s.bias) < 12).length }];
  });
}

/** Enriquecimento comum aos dois sites: dados reais, pesos por família e transparência de cobertura. */
export function applyConfluence(a: StockAnalysis, scanner: TvLike | null, history: Candle[] = a.candles): StockAnalysis {
  const observed = a.hasHistory ? history : [];
  const ext = extendedIndicators(observed);
  const source = observed.length ? "OHLCV" : "TradingView";
  // Um timeframe semanal não se mistura com valores diários do scanner.
  const tv = a.interval === "1d" ? scanner : null;
  const value = (key: string) => num(tv?.[key]);
  if (!observed.length) {
    ext.vwma20 = value("VWMA"); ext.hull9 = value("HullMA9"); ext.kijun = value("Ichimoku.BLine");
    ext.stochRsiK = value("Stoch.RSI.K"); ext.stochRsiD = value("Stoch.RSI.D"); ext.ultimateOscillator = value("UO");
  }
  const added: Signal[] = [];
  const add = (id: string, group: Signal["group"], name: string, displayed: string, bias: number, weight: number, detail: string) => {
    added.push({ id: `ext_${id}`, group, name, value: displayed, bias: clamp(bias), weight, detail: `${detail} Fonte: ${source}.` });
  };
  const price = observed.length ? observed[observed.length - 1].c : a.price;
  if (ext.vwma20 != null) add("vwma", "Volume", "VWMA (20)", fmt(ext.vwma20), price > ext.vwma20 ? 48 : -48, 0.75, `Preço ${price > ext.vwma20 ? "acima" : "abaixo"} da média ponderada pelo volume: confirmação do fluxo negociado.`);
  if (ext.hull9 != null) {
    const bias = (price > ext.hull9 ? 28 : -28) + (ext.hull9Previous == null ? 0 : ext.hull9 > ext.hull9Previous ? 20 : -20);
    add("hull", "Tendência", "Hull MA (9)", fmt(ext.hull9), bias, 0.55, "Média de menor atraso; cruza a posição do preço com a inclinação da Hull quando existe histórico.");
  }
  if (ext.kijun != null) {
    const cloud = ext.cloudTop != null && ext.cloudBottom != null;
    const bias = cloud ? price > ext.cloudTop! ? 65 : price < ext.cloudBottom! ? -65 : 0 : price > ext.kijun ? 35 : -35;
    add("ichimoku", "Tendência", cloud ? "Ichimoku · nuvem + Tenkan/Kijun" : "Ichimoku · linha Kijun", `${fmt(ext.tenkan)} / ${fmt(ext.kijun)}`, bias, 0.9,
      cloud ? `Preço ${bias > 0 ? "acima da nuvem" : bias < 0 ? "abaixo da nuvem" : "dentro da nuvem"}. Nuvem deslocada 26 barras sem olhar para o futuro.` : "Só a linha base foi disponibilizada; não inferimos uma nuvem inexistente.");
  }
  if (ext.supertrendDirection != null) add("supertrend", "Tendência", "Supertrend (10,3)", fmt(ext.supertrend), ext.supertrendDirection * 60, 0.85, `Regime ${ext.supertrendDirection > 0 ? "altista" : "baixista"} com bandas de ATR. Mudança de lado invalida o sinal.`);
  if (ext.stochRsiK != null) {
    const k = ext.stochRsiK, d = ext.stochRsiD;
    const bias = k > 80 ? -25 : k < 20 ? 25 : d != null ? k > d ? 32 : -32 : (k - 50) * 0.6;
    add("stochrsi", "Momento", "Stochastic RSI (14,14,3,3)", `${fmt(k, 1)} / ${fmt(d, 1)}`, bias, 0.55, "Mede a posição do RSI no seu próprio intervalo. Extremos são alertas de extensão, não ordens automáticas.");
  }
  if (ext.ultimateOscillator != null) add("uo", "Momento", "Ultimate Oscillator (7,14,28)", fmt(ext.ultimateOscillator, 1), (ext.ultimateOscillator - 50) * 2, 0.7, "Cruza pressão compradora em três janelas, com pesos 4/2/1, reduzindo a dependência de uma só duração.");
  if (ext.cmf20 != null) add("cmf", "Volume", "Chaikin Money Flow (20)", fmt(ext.cmf20, 3), ext.cmf20 * 250, 0.9, ext.cmf20 > 0 ? "Fluxo monetário de acumulação, medido pelo fecho na amplitude e pelo volume." : "Fluxo monetário de distribuição, medido pelo fecho na amplitude e pelo volume.");
  if (ext.donchianHigh != null && ext.donchianLow != null) {
    const width = ext.donchianHigh - ext.donchianLow;
    const bias = price > ext.donchianHigh ? 65 : price < ext.donchianLow ? -65 : width > 0 ? ((price - ext.donchianLow) / width - 0.5) * 65 : 0;
    add("donchian", "Padrões", "Canal Donchian (20) · breakout", `${fmt(ext.donchianLow)} — ${fmt(ext.donchianHigh)}`, bias, 0.75, "Máximos e mínimos das 20 barras anteriores, excluindo a barra atual para permitir testar ruturas sem look-ahead.");
  }
  if (ext.keltnerUpper != null && ext.keltnerLower != null) {
    const mid = (ext.keltnerUpper + ext.keltnerLower) / 2;
    add("keltner", "Volatilidade", "Canal Keltner (EMA20 ± 2 ATR20)", `${fmt(ext.keltnerLower)} — ${fmt(ext.keltnerUpper)}`, price > ext.keltnerUpper ? 42 : price < ext.keltnerLower ? -42 : price > mid ? 18 : -18, 0.55, "Localiza o preço num canal ajustado à volatilidade; lê extensões em conjunto com o regime de tendência.");
  }
  if (ext.aroonUp != null && ext.aroonDown != null) add("aroon", "Tendência", "Aroon (25) · máximos vs mínimos", `${fmt(ext.aroonUp, 0)} / ${fmt(ext.aroonDown, 0)}`, (ext.aroonUp - ext.aroonDown) * 0.7, 0.65, "Mede há quanto tempo ocorreram os extremos: Aroon Up dominante favorece subida; Down dominante favorece descida.");
  if (ext.bullPower != null && ext.bearPower != null) add("elder", "Momento", "Elder Ray · Bull/Bear Power (13)", `${fmt(ext.bullPower, 3)} / ${fmt(ext.bearPower, 3)}`, (ext.bullPower + ext.bearPower) / price * 900, 0.55, "Distância dos extremos à EMA13: força relativa de compradores e vendedores.");
  else if (value("BBPower") != null) add("elder", "Momento", "Bull/Bear Power", fmt(value("BBPower"), 3), value("BBPower")! / price * 900, 0.55, "Pressão líquida de compradores e vendedores em torno da média exponencial.");
  const plus = a.indicators.plusDI ?? value("ADX+DI"), minus = a.indicators.minusDI ?? value("ADX-DI");
  if (plus != null && minus != null) add("dmi", "Tendência", "DMI · +DI vs −DI", `${fmt(plus, 1)} / ${fmt(minus, 1)}`, (plus - minus) * (a.indicators.adx14 != null && a.indicators.adx14 > 25 ? 3 : 1.8), 0.75, "Direção do movimento separada da força do ADX. Um ADX alto sozinho não significa subida.");

  if (ext.parabolicSar != null && ext.parabolicDirection != null) add("psar", "Tendência", "Parabolic SAR (0,02–0,20)", fmt(ext.parabolicSar), ext.parabolicDirection * 45, 0.55, "SAR abaixo do preço favorece alta; acima favorece baixa. É sensível a falsos sinais em mercados laterais.");
  if (ext.vwap20 != null && ext.vwap20 > 0) add("vwap", "Volume", "VWAP móvel (20 barras)", fmt(ext.vwap20), (price / ext.vwap20 - 1) * 600, 0.55, "Preço típico HLC/3 ponderado pelo volume das últimas 20 barras. Não é o VWAP intradiário de uma única sessão.");
  if (ext.fibonacci382 != null && ext.fibonacci50 != null && ext.fibonacci618 != null) add("fibonacci", "Padrões", "Retrações de Fibonacci (60 barras)", `38,2%: ${fmt(ext.fibonacci382)} · 50%: ${fmt(ext.fibonacci50)} · 61,8%: ${fmt(ext.fibonacci618)}`, price > ext.fibonacci50 ? 18 : -18, 0.35, "Referências do intervalo de 60 barras. Não são suportes garantidos; exigem reação de preço e confirmação de volume.");
  if (ext.recentGoldenCross || ext.recentDeathCross) add("goldendeath", "Tendência", ext.recentGoldenCross ? "Golden Cross recente (50/200)" : "Death Cross recente (50/200)", "Nas últimas 10 barras", ext.recentGoldenCross ? 60 : -60, 0.65, "Cruzamento efetivo entre médias completas de 50 e 200 barras; não se reduz o período para preencher histórico em falta.");
  if (observed.length && a.indicators.ema9 != null && a.indicators.ema21 != null && a.indicators.ema21 > 0) add("ema921", "Tendência", "EMA 9 / EMA 21", `${fmt(a.indicators.ema9)} / ${fmt(a.indicators.ema21)}`, (a.indicators.ema9 / a.indicators.ema21 - 1) * 1200, 0.5, "Cruza as médias rápida e lenta na mesma periodicidade da série observada.");
  if (a.indicators.roc12 != null && observed.length) add("roc12", "Momento", "ROC (12 barras)", `${fmt(a.indicators.roc12)}%`, a.indicators.roc12 * 5, 0.5, "Taxa de variação do fecho em 12 barras, sem confundir momentum absoluto com retorno percentual.");
  if (ext.rsiDivergence) add("rsidiv", "Momento", "Divergência RSI · pivôs confirmados", ext.rsiDivergence > 0 ? "Altista" : "Baixista", ext.rsiDivergence * 38, 0.55, "Comparação de dois extremos de preço confirmados e dos respetivos valores do RSI, com separação mínima de cinco barras.");

  a.signals = [...a.signals.filter(s => !s.id.startsWith("ext_")), ...added];
  const families = groupSignals(a.signals, a.indicators.adx14);
  const totalWeight = families.reduce((sum, f) => sum + f.weight, 0);
  const raw = totalWeight > 0 ? families.reduce((sum, f) => sum + f.score * f.weight, 0) / totalWeight : 0;
  const coverage = Math.round(Object.values(ext).filter(v => v != null).length / Object.keys(ext).length * 100);
  const availableVotes = a.signals.filter(s => !["tvrec", "tvrecw", "tvrecm", "adx", "atr", "bandwidth"].includes(s.id));
  const votes = { bullish: availableVotes.filter(s => s.bias >= 12).length, bearish: availableVotes.filter(s => s.bias <= -12).length, neutral: availableVotes.filter(s => Math.abs(s.bias) < 12).length };
  const active = families.filter(f => Math.abs(f.score) >= 12);
  const agreement = active.length ? active.filter(f => Math.sign(f.score) === Math.sign(raw)).length / active.length : 0;
  // Reduz o excesso de certeza quando faltam dados, existe lateralização ou conflito entre famílias.
  const score = Math.round(clamp(raw * (0.7 + 0.3 * Math.min(1, families.length / 4))) * 10) / 10;
  const verdict = decision(score);
  const confidence = Math.round(clamp(agreement * 45 + coverage * 0.15 + Math.min(Math.abs(score), 60) * 0.4 + Math.min(observed.length / 200, 1) * 10, 5, verdict === "NEUTRO" ? 50 : 90));
  const regime = a.indicators.adx14 != null ? a.indicators.adx14 >= 25 ? "Tendência definida" : a.indicators.adx14 < 20 ? "Lateral / tendência fraca" : "Transição de tendência" : "Regime sem confirmação de ADX";
  const conflicts: string[] = [];
  for (const f of families) if (Math.abs(f.score) >= 12 && Math.sign(f.score) !== Math.sign(score)) conflicts.push(`${f.name}: ${f.score > 0 ? "altista" : "baixista"} (${f.score > 0 ? "+" : ""}${f.score.toFixed(1)}), contra o viés global.`);
  if (ext.efficiencyRatio != null && ext.efficiencyRatio < 0.2) conflicts.push("Eficiência de Kaufman baixa: muito ruído relativamente à deslocação líquida do preço.");
  const missing = !observed.length ? ["Supertrend, CMF, Donchian, Keltner, Aroon e nuvem Ichimoku completa precisam de histórico OHLCV e não foram inventados."] : observed.length < 78 ? ["Nuvem Ichimoku indisponível: requer pelo menos 78 barras."] : [];
  const report: ConfluenceReport = { version: "2.0", families, votes, alignment: Math.round(agreement * 100), regime, coverage, observations: observed.length, extended: ext, newSignals: added, missing, conflicts,
    methodology: "Pontuação por famílias: tendência 36%, momento 28%, volume 18%, volatilidade 10%, padrões 8%; pesos redistribuídos nas famílias disponíveis. ADX fraco reduz o peso da tendência. Consensos agregados não voltam a votar. Confiança mede concordância/cobertura e não uma taxa de acerto. O viés percentual é heurístico, sem calibração probabilística ou garantia. Notícias são contexto e não votos automáticos." };
  a.confluence = report;
  a.score = score; a.verdict = verdict;
  a.verdictLabel = verdict === "SUBIR" ? "Expectativa de subida" : verdict === "DESCER" ? "Expectativa de descida" : "Sinais mistos · aguardar";
  a.verdictEmoji = verdict === "SUBIR" ? "▲" : verdict === "DESCER" ? "▼" : "◆";
  a.confidence = confidence;
  a.probabilityUp = Math.round(50 + Math.tanh(score / 65) * 30);
  const weighted = (names: Signal["group"][]) => {
    const subset = families.filter(f => names.includes(f.name));
    const sum = subset.reduce((x, f) => x + f.weight, 0);
    return sum ? subset.reduce((x, f) => x + f.score * f.weight, 0) / sum : 0;
  };
  a.timeframes = [
    { label: "Curto prazo (1–4 semanas)", score: Math.round(weighted(["Momento", "Volume", "Padrões"])), verdict: decision(weighted(["Momento", "Volume", "Padrões"])) },
    { label: "Médio prazo (1–6 meses)", score, verdict },
    { label: "Longo prazo (6–18 meses)", score: Math.round(weighted(["Tendência"])), verdict: decision(weighted(["Tendência"])) },
  ];
  const sign = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
  a.summary = `${a.name}: ${a.verdictLabel.toLowerCase()} no horizonte de ${a.horizon}, com score ${sign(score)}/100. ${a.signals.length} sinais disponíveis, cruzados em ${families.length} famílias: ${votes.bullish} altistas, ${votes.bearish} baixistas e ${votes.neutral} neutros. ${regime}. Concordância entre famílias ${report.alignment}%; qualidade/convergência ${confidence}/100. ${conflicts.length ? "Há sinais em sentido contrário: consulta as divergências antes de decidir." : "As famílias direcionais disponíveis estão alinhadas."} Esta é uma leitura técnica condicional, não uma garantia de subida ou descida.`;
  a.rationale = [...families].sort((x, y) => Math.abs(y.score) * y.weight - Math.abs(x.score) * x.weight).slice(0, 4).map(f => `${f.name}: score ${sign(f.score)}; ${f.bullish} sinais de alta e ${f.bearish} de baixa, peso relativo ${(f.weight / totalWeight * 100).toFixed(0)}%.`);
  a.risks = [...new Set([...conflicts, ...missing, ...a.risks])].slice(0, 8);
  // Planos sempre coerentes com a direção FINAL; pivôs ultrapassados não podem servir de alvo.
  const atrValue = a.indicators.atr14 && a.indicators.atr14 > 0 ? a.indicators.atr14 : a.price * 0.025;
  const direction = verdict === "DESCER" ? -1 : 1;
  const target1 = a.price + direction * 2 * atrValue, target2 = a.price + direction * 4 * atrValue;
  const stop = a.price - direction * 2 * atrValue;
  if (Math.min(target1, target2, stop) > 0) a.plan = { entry: a.price, target1, target2, stop, riskReward: 2, upsidePct: (target2 / a.price - 1) * 100, downsidePct: (stop / a.price - 1) * 100 };
  return a;
}
