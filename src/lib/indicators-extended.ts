import type { Candle } from "./yahoo";
import { atr, ema, rsi, sma, type Series } from "./indicators";

/** Indicadores calculados exclusivamente com OHLCV observado; nunca preenche valores ausentes. */
export type ExtendedIndicators = {
  vwma20: number | null;
  hull9: number | null;
  hull9Previous: number | null;
  tenkan: number | null;
  kijun: number | null;
  cloudTop: number | null;
  cloudBottom: number | null;
  supertrend: number | null;
  supertrendDirection: number | null;
  stochRsiK: number | null;
  stochRsiD: number | null;
  ultimateOscillator: number | null;
  cmf20: number | null;
  donchianHigh: number | null;
  donchianLow: number | null;
  keltnerUpper: number | null;
  keltnerLower: number | null;
  aroonUp: number | null;
  aroonDown: number | null;
  bullPower: number | null;
  bearPower: number | null;
  efficiencyRatio: number | null;
  parabolicSar: number | null;
  parabolicDirection: number | null;
  vwap20: number | null;
  fibonacci382: number | null;
  fibonacci50: number | null;
  fibonacci618: number | null;
  recentGoldenCross: number | null;
  recentDeathCross: number | null;
  rsiDivergence: number | null;
};

export function weightedMA(values: number[], period: number): Series {
  const out: Series = Array(values.length).fill(null);
  const denominator = period * (period + 1) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += values[i - period + 1 + j] * (j + 1);
    out[i] = sum / denominator;
  }
  return out;
}

export function hullMA(values: number[], period = 9): Series {
  const half = weightedMA(values, Math.max(1, Math.floor(period / 2)));
  const full = weightedMA(values, period);
  const length = Math.max(1, Math.round(Math.sqrt(period)));
  const differences = full.map((v, i) => v == null || half[i] == null ? null : 2 * half[i]! - v);
  const out: Series = Array(values.length).fill(null);
  for (let i = period + length - 2; i < values.length; i++) {
    let sum = 0;
    for (let j = 0; j < length; j++) sum += differences[i - length + 1 + j]! * (j + 1);
    out[i] = sum / (length * (length + 1) / 2);
  }
  return out;
}

function midpoint(candles: Candle[], end: number, period: number): number | null {
  if (end < period - 1) return null;
  const segment = candles.slice(end - period + 1, end + 1);
  return (Math.max(...segment.map(c => c.h)) + Math.min(...segment.map(c => c.l))) / 2;
}

/** Ultimate Oscillator de Larry Williams, janelas 7/14/28 e pesos 4/2/1. */
export function ultimateOscillator(candles: Candle[]): number | null {
  if (candles.length < 29) return null;
  const bp: number[] = [];
  const tr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const low = Math.min(candles[i].l, candles[i - 1].c);
    bp.push(candles[i].c - low);
    tr.push(Math.max(candles[i].h, candles[i - 1].c) - low);
  }
  const average = (p: number) => {
    const denominator = tr.slice(-p).reduce((a, b) => a + b, 0);
    return denominator > 0 ? bp.slice(-p).reduce((a, b) => a + b, 0) / denominator : null;
  };
  const a = average(7), b = average(14), c = average(28);
  return a == null || b == null || c == null ? null : 100 * (4 * a + 2 * b + c) / 7;
}

export function chaikinMoneyFlow(candles: Candle[], period = 20): number | null {
  if (candles.length < period) return null;
  let flow = 0, volume = 0;
  for (const c of candles.slice(-period)) {
    volume += c.v;
    flow += c.h === c.l ? 0 : ((2 * c.c - c.h - c.l) / (c.h - c.l)) * c.v;
  }
  return volume > 0 ? flow / volume : null;
}

/** Supertrend 10,3 com ATR de Wilder e bandas finais recorrentes. */
export function supertrend(candles: Candle[], period = 10, multiplier = 3) {
  if (candles.length < period + 2) return { value: null, direction: null };
  const ranges = atr(candles, period);
  let upper: number | null = null, lower: number | null = null;
  let direction = 1;
  for (let i = period - 1; i < candles.length; i++) {
    const a = ranges[i];
    if (a == null) continue;
    const mid = (candles[i].h + candles[i].l) / 2;
    const basicUpper = mid + multiplier * a;
    const basicLower = mid - multiplier * a;
    const oldUpper: number = upper ?? basicUpper;
    const oldLower: number = lower ?? basicLower;
    upper = basicUpper < oldUpper || candles[i - 1]?.c > oldUpper ? basicUpper : oldUpper;
    lower = basicLower > oldLower || candles[i - 1]?.c < oldLower ? basicLower : oldLower;
    if (direction < 0 && candles[i].c > oldUpper) direction = 1;
    else if (direction > 0 && candles[i].c < oldLower) direction = -1;
  }
  return { value: direction > 0 ? lower : upper, direction };
}

/** SAR de Wilder, AF 0.02–0.20, com limites dos dois extremos anteriores. */
export function parabolicSAR(candles: Candle[]): { value: number | null; direction: number | null } {
  if (candles.length < 3) return { value: null, direction: null };
  let rising = candles[1].c >= candles[0].c;
  let sar = rising ? Math.min(candles[0].l, candles[1].l) : Math.max(candles[0].h, candles[1].h);
  let extreme = rising ? Math.max(candles[0].h, candles[1].h) : Math.min(candles[0].l, candles[1].l);
  let acceleration = 0.02;
  for (let i = 2; i < candles.length; i++) {
    sar += acceleration * (extreme - sar);
    if (rising) {
      sar = Math.min(sar, candles[i - 1].l, candles[i - 2].l);
      if (candles[i].l < sar) { rising = false; sar = extreme; extreme = candles[i].l; acceleration = 0.02; }
      else if (candles[i].h > extreme) { extreme = candles[i].h; acceleration = Math.min(0.2, acceleration + 0.02); }
    } else {
      sar = Math.max(sar, candles[i - 1].h, candles[i - 2].h);
      if (candles[i].h > sar) { rising = true; sar = extreme; extreme = candles[i].h; acceleration = 0.02; }
      else if (candles[i].l < extreme) { extreme = candles[i].l; acceleration = Math.min(0.2, acceleration + 0.02); }
    }
  }
  return { value: sar, direction: rising ? 1 : -1 };
}

function nullableSMA(values: Series, period: number): Series {
  return values.map((_, i) => {
    const section = values.slice(i - period + 1, i + 1);
    return i < period - 1 || section.some(v => v == null) ? null : (section as number[]).reduce((a, b) => a + b, 0) / period;
  });
}

export function extendedIndicators(candles: Candle[]): ExtendedIndicators {
  const n = candles.length, i = n - 1;
  const closes = candles.map(c => c.c);
  const last = (series: Series): number | null => series[series.length - 1] ?? null;
  const hull = hullMA(closes);
  const tenkan = midpoint(candles, i, 9);
  const kijun = midpoint(candles, i, 26);
  // A nuvem visível HOJE foi calculada 26 barras atrás, sem look-ahead.
  const oldTenkan = midpoint(candles, i - 26, 9);
  const oldKijun = midpoint(candles, i - 26, 26);
  const spanA = oldTenkan != null && oldKijun != null ? (oldTenkan + oldKijun) / 2 : null;
  const spanB = midpoint(candles, i - 26, 52);
  const recent = candles.slice(-20);
  const volume = recent.reduce((a, c) => a + c.v, 0);
  const vwma20 = n >= 20 && volume > 0 ? recent.reduce((a, c) => a + c.c * c.v, 0) / volume : null;
  const rsiSeries = rsi(closes, 14);
  const rawStoch: Series = rsiSeries.map((v, ix) => {
    if (v == null || ix < 27) return null;
    const window = rsiSeries.slice(ix - 13, ix + 1);
    if (window.some(x => x == null)) return null;
    const low = Math.min(...window as number[]), high = Math.max(...window as number[]);
    return high === low ? 50 : 100 * (v - low) / (high - low);
  });
  const k = nullableSMA(rawStoch, 3), d = nullableSMA(k, 3);
  const st = supertrend(candles);
  const ema20 = last(ema(closes, 20));
  const ema13 = last(ema(closes, 13));
  const atr20 = last(atr(candles, 20));
  // Canal anterior: o fecho atual não participa no limiar de breakout.
  const prior20 = candles.slice(-21, -1);
  const prior25 = candles.slice(-26);
  let aroonUp: number | null = null, aroonDown: number | null = null;
  if (prior25.length === 26) {
    const high = Math.max(...prior25.map(c => c.h)), low = Math.min(...prior25.map(c => c.l));
    const highIndex = prior25.findLastIndex(c => c.h === high);
    const lowIndex = prior25.findLastIndex(c => c.l === low);
    aroonUp = highIndex / 25 * 100;
    aroonDown = lowIndex / 25 * 100;
  }
  let efficiencyRatio: number | null = null;
  if (n > 20) {
    const points = closes.slice(-21);
    let movement = 0;
    for (let j = 1; j < points.length; j++) movement += Math.abs(points[j] - points[j - 1]);
    efficiencyRatio = movement > 0 ? Math.abs(points[20] - points[0]) / movement : 0;
  }
  const psar = parabolicSAR(candles);
  const vwap20 = n >= 20 && volume > 0 ? recent.reduce((sum, c) => sum + (c.h + c.l + c.c) / 3 * c.v, 0) / volume : null;
  const swing = candles.slice(-60);
  const swingHigh = n >= 60 ? Math.max(...swing.map(c => c.h)) : null;
  const swingLow = n >= 60 ? Math.min(...swing.map(c => c.l)) : null;
  const fib = (ratio: number) => swingHigh == null || swingLow == null ? null : swingHigh - (swingHigh - swingLow) * ratio;
  const short = sma(closes, 50), long = sma(closes, 200);
  let recentGoldenCross: number | null = n >= 201 ? 0 : null;
  let recentDeathCross: number | null = n >= 201 ? 0 : null;
  for (let j = Math.max(200, n - 10); j < n; j++) {
    if (short[j - 1] == null || long[j - 1] == null || short[j] == null || long[j] == null) continue;
    if (short[j - 1]! <= long[j - 1]! && short[j]! > long[j]!) recentGoldenCross = 1;
    if (short[j - 1]! >= long[j - 1]! && short[j]! < long[j]!) recentDeathCross = 1;
  }
  // Divergências apenas entre pivôs confirmados, não entre dois fechos arbitrários.
  let rsiDivergence: number | null = n >= 35 ? 0 : null;
  const lowPivots: number[] = [], highPivots: number[] = [];
  for (let j = Math.max(16, n - 60); j < n - 2; j++) {
    if (candles[j].l < Math.min(candles[j - 2].l, candles[j - 1].l, candles[j + 1].l, candles[j + 2].l)) lowPivots.push(j);
    if (candles[j].h > Math.max(candles[j - 2].h, candles[j - 1].h, candles[j + 1].h, candles[j + 2].h)) highPivots.push(j);
  }
  const divergence = (pivots: number[], rising: boolean) => {
    const lastIndex = pivots.at(-1), previous = pivots.at(-2);
    if (lastIndex == null || previous == null || lastIndex - previous < 5 || rsiSeries[lastIndex] == null || rsiSeries[previous] == null) return false;
    return rising ? candles[lastIndex].l < candles[previous].l && rsiSeries[lastIndex]! > rsiSeries[previous]! + 3
      : candles[lastIndex].h > candles[previous].h && rsiSeries[lastIndex]! < rsiSeries[previous]! - 3;
  };
  if (divergence(lowPivots, true)) rsiDivergence = 1;
  if (divergence(highPivots, false)) rsiDivergence = rsiDivergence === 1 ? 0 : -1;
  return {
    vwma20, hull9: last(hull), hull9Previous: hull[n - 2] ?? null,
    tenkan, kijun,
    cloudTop: spanA != null && spanB != null ? Math.max(spanA, spanB) : null,
    cloudBottom: spanA != null && spanB != null ? Math.min(spanA, spanB) : null,
    supertrend: st.value, supertrendDirection: st.direction,
    stochRsiK: last(k), stochRsiD: last(d), ultimateOscillator: ultimateOscillator(candles), cmf20: chaikinMoneyFlow(candles),
    donchianHigh: prior20.length === 20 ? Math.max(...prior20.map(c => c.h)) : null,
    donchianLow: prior20.length === 20 ? Math.min(...prior20.map(c => c.l)) : null,
    keltnerUpper: ema20 != null && atr20 != null ? ema20 + 2 * atr20 : null,
    keltnerLower: ema20 != null && atr20 != null ? ema20 - 2 * atr20 : null,
    aroonUp, aroonDown,
    bullPower: ema13 != null ? candles[i].h - ema13 : null,
    bearPower: ema13 != null ? candles[i].l - ema13 : null,
    efficiencyRatio, parabolicSar: psar.value, parabolicDirection: psar.direction, vwap20,
    fibonacci382: fib(0.382), fibonacci50: fib(0.5), fibonacci618: fib(0.618),
    recentGoldenCross, recentDeathCross, rsiDivergence,
  };
}
