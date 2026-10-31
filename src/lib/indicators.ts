import type { Candle } from "./yahoo";

export type Series = (number | null)[];

export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  seed /= period;
  out[period - 1] = seed;
  for (let i = period; i < values.length; i++) out[i] = values[i] * k + (out[i - 1] as number) * (1 - k);
  return out;
}

/** RSI de Wilder. */
export function rsi(values: number[], period = 14): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9) {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line: Series = values.map((_, i) => (f[i] != null && s[i] != null ? (f[i] as number) - (s[i] as number) : null));
  const valid = line.map((v) => (v == null ? 0 : v));
  const sig = ema(valid, signalPeriod).map((v, i) => (line[i] == null ? null : v));
  const hist: Series = line.map((v, i) => (v != null && sig[i] != null ? v - (sig[i] as number) : null));
  return { line, signal: sig, hist };
}

export function bollinger(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper: Series = new Array(values.length).fill(null);
  const lower: Series = new Array(values.length).fill(null);
  const bandwidth: Series = new Array(values.length).fill(null);
  const percentB: Series = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const m = mid[i] as number;
    let acc = 0;
    for (let j = i - period + 1; j <= i; j++) acc += (values[j] - m) ** 2;
    const sd = Math.sqrt(acc / period);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
    bandwidth[i] = m === 0 ? null : ((upper[i] as number) - (lower[i] as number)) / m;
    const span = (upper[i] as number) - (lower[i] as number);
    percentB[i] = span === 0 ? null : (values[i] - (lower[i] as number)) / span;
  }
  return { mid, upper, lower, bandwidth, percentB };
}

export function stochastic(candles: Candle[], kPeriod = 14, dPeriod = 3) {
  const rawK: Series = new Array(candles.length).fill(null);
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      hh = Math.max(hh, candles[j].h);
      ll = Math.min(ll, candles[j].l);
    }
    rawK[i] = hh === ll ? 50 : ((candles[i].c - ll) / (hh - ll)) * 100;
  }
  const flat = rawK.map((v) => (v == null ? 0 : v));
  const d = sma(flat, dPeriod).map((v, i) => (rawK[i] == null ? null : v));
  return { k: rawK, d };
}

/** Average True Range de Wilder. */
export function atr(candles: Candle[], period = 14): Series {
  const trs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) trs.push(candles[i].h - candles[i].l);
    else {
      const pc = candles[i - 1].c;
      trs.push(Math.max(candles[i].h - candles[i].l, Math.abs(candles[i].h - pc), Math.abs(candles[i].l - pc)));
    }
  }
  const out: Series = new Array(candles.length).fill(null);
  if (candles.length < period) return out;
  let seed = 0;
  for (let i = 0; i < period; i++) seed += trs[i];
  seed /= period;
  out[period - 1] = seed;
  for (let i = period; i < candles.length; i++) out[i] = ((out[i - 1] as number) * (period - 1) + trs[i]) / period;
  return out;
}

export function adx(candles: Candle[], period = 14) {
  const n = candles.length;
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);
  const tr: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = candles[i].h - candles[i - 1].h;
    const down = candles[i - 1].l - candles[i].l;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
    tr[i] = Math.max(
      candles[i].h - candles[i].l,
      Math.abs(candles[i].h - candles[i - 1].c),
      Math.abs(candles[i].l - candles[i - 1].c),
    );
  }
  const smooth = (arr: number[]): Series => {
    const out: Series = new Array(n).fill(null);
    if (n < period) return out;
    let acc = 0;
    for (let i = 1; i <= period; i++) acc += arr[i];
    out[period] = acc;
    for (let i = period + 1; i < n; i++) out[i] = (out[i - 1] as number) - (out[i - 1] as number) / period + arr[i];
    return out;
  };
  const sPlus = smooth(plusDM);
  const sMinus = smooth(minusDM);
  const sTr = smooth(tr);
  const plusDI: Series = new Array(n).fill(null);
  const minusDI: Series = new Array(n).fill(null);
  const dx: Series = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (sTr[i] == null || sTr[i] === 0) continue;
    plusDI[i] = (100 * (sPlus[i] as number)) / (sTr[i] as number);
    minusDI[i] = (100 * (sMinus[i] as number)) / (sTr[i] as number);
    const sum = (plusDI[i] as number) + (minusDI[i] as number);
    dx[i] = sum === 0 ? 0 : (100 * Math.abs((plusDI[i] as number) - (minusDI[i] as number))) / sum;
  }
  const out: Series = new Array(n).fill(null);
  const start = period * 2;
  if (n > start) {
    let acc = 0;
    let cnt = 0;
    for (let i = period; i <= start; i++) {
      if (dx[i] != null) { acc += dx[i] as number; cnt++; }
    }
    if (cnt) {
      out[start] = acc / cnt;
      for (let i = start + 1; i < n; i++) {
        if (dx[i] == null || out[i - 1] == null) continue;
        out[i] = ((out[i - 1] as number) * (period - 1) + (dx[i] as number)) / period;
      }
    }
  }
  return { adx: out, plusDI, minusDI, dx };
}

export function obv(candles: Candle[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const prev = out[i - 1];
    if (candles[i].c > candles[i - 1].c) out.push(prev + candles[i].v);
    else if (candles[i].c < candles[i - 1].c) out.push(prev - candles[i].v);
    else out.push(prev);
  }
  return out;
}

export function williamsR(candles: Candle[], period = 14): Series {
  const out: Series = new Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hh = Math.max(hh, candles[j].h);
      ll = Math.min(ll, candles[j].l);
    }
    out[i] = hh === ll ? -50 : (-100 * (hh - candles[i].c)) / (hh - ll);
  }
  return out;
}

export function roc(values: number[], period = 12): Series {
  const out: Series = new Array(values.length).fill(null);
  for (let i = period; i < values.length; i++) {
    const prev = values[i - period];
    out[i] = prev === 0 ? null : ((values[i] - prev) / prev) * 100;
  }
  return out;
}

export function cci(candles: Candle[], period = 20): Series {
  const tp = candles.map((c) => (c.h + c.l + c.c) / 3);
  const out: Series = new Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += tp[j];
    const m = sum / period;
    let dev = 0;
    for (let j = i - period + 1; j <= i; j++) dev += Math.abs(tp[j] - m);
    dev /= period;
    out[i] = dev === 0 ? 0 : (tp[i] - m) / (0.015 * dev);
  }
  return out;
}

export function mfi(candles: Candle[], period = 14): Series {
  const out: Series = new Array(candles.length).fill(null);
  const tp = candles.map((c) => (c.h + c.l + c.c) / 3);
  for (let i = period; i < candles.length; i++) {
    let pos = 0;
    let neg = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const flow = tp[j] * candles[j].v;
      if (tp[j] > tp[j - 1]) pos += flow;
      else if (tp[j] < tp[j - 1]) neg += flow;
    }
    out[i] = pos === 0 && neg === 0 ? null : neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

/** Inclinação da regressão linear normalizada (% por barra). */
export function linregSlope(values: number[], period: number): number | null {
  const slice = values.slice(-period);
  if (slice.length < period || period < 3) return null;
  const n = slice.length;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += slice[i];
    sxy += i * slice[i];
    sxx += i * i;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const mean = sy / n;
  return mean === 0 ? null : (slope / mean) * 100;
}

export function linregR2(values: number[], period: number): number | null {
  const slice = values.slice(-period);
  if (slice.length < period || period < 3) return null;
  const n = slice.length;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += i; sy += slice[i]; sxy += i * slice[i]; sxx += i * i;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const mean = sy / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * i + intercept;
    ssRes += (slice[i] - pred) ** 2;
    ssTot += (slice[i] - mean) ** 2;
  }
  return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
}

/** Desvio padrão anualizado da rentabilidade diária. */
export function annualizedVolatility(values: number[], period = 30): number | null {
  if (values.length < period + 1) return null;
  const slice = values.slice(-(period + 1));
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    if (slice[i - 1] !== 0) rets.push(slice[i] / slice[i - 1] - 1);
  }
  if (rets.length < 5) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varr = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(rets.length - 1, 1);
  return Math.sqrt(varr) * Math.sqrt(252) * 100;
}

export function maxDrawdown(values: number[]): number {
  let peak = -Infinity;
  let dd = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    if (peak > 0) dd = Math.min(dd, (v - peak) / peak);
  }
  return dd * 100;
}

export type Level = { price: number; touches: number; kind: "suporte" | "resistência" };

/** Agrupa mínimos/máximos pivotantes em níveis de suporte e resistência. */
export function supportResistance(candles: Candle[], lookback = 180, tolerance = 0.018): Level[] {
  const slice = candles.slice(-lookback);
  if (slice.length < 12) return [];
  const pivots: { price: number; kind: "suporte" | "resistência" }[] = [];
  const wing = 2;
  for (let i = wing; i < slice.length - wing; i++) {
    let isLow = true;
    let isHigh = true;
    for (let j = i - wing; j <= i + wing; j++) {
      if (j === i) continue;
      if (slice[j].l < slice[i].l) isLow = false;
      if (slice[j].h > slice[i].h) isHigh = false;
    }
    if (isLow) pivots.push({ price: slice[i].l, kind: "suporte" });
    if (isHigh) pivots.push({ price: slice[i].h, kind: "resistência" });
  }
  const clusters: Level[] = [];
  for (const p of pivots) {
    const hit = clusters.find((c) => Math.abs(c.price - p.price) / p.price <= tolerance);
    if (hit) {
      hit.price = (hit.price * hit.touches + p.price) / (hit.touches + 1);
      hit.touches += 1;
      hit.kind = hit.touches >= 2 ? hit.kind : p.kind;
    } else {
      clusters.push({ price: p.price, touches: 1, kind: p.kind });
    }
  }
  return clusters.filter((c) => c.touches >= 2).sort((a, b) => b.touches - a.touches).slice(0, 8);
}

export function last<T>(arr: Series | T[], back = 0): T | null {
  const i = arr.length - 1 - back;
  if (i < 0) return null;
  const v = arr[i];
  return v == null ? null : (v as T);
}

export function crossAbove(a: Series, b: Series, back = 0): boolean {
  const i = a.length - 1 - back;
  if (i < 1) return false;
  const a1 = a[i]; const a0 = a[i - 1]; const b1 = b[i]; const b0 = b[i - 1];
  if (a1 == null || a0 == null || b1 == null || b0 == null) return false;
  return a0 <= b0 && a1 > b1;
}

export function crossBelow(a: Series, b: Series, back = 0): boolean {
  const i = a.length - 1 - back;
  if (i < 1) return false;
  const a1 = a[i]; const a0 = a[i - 1]; const b1 = b[i]; const b0 = b[i - 1];
  if (a1 == null || a0 == null || b1 == null || b0 == null) return false;
  return a0 >= b0 && a1 < b1;
}

/** Inclinação OBV em percentagem do volume médio: a origem arbitrária do OBV não inverte o sinal. */
export function normalizedObvSlope(candles: Candle[], period = 25): number | null {
  if (candles.length < period) return null;
  const values = obv(candles).slice(-period);
  const volume = candles.slice(-period).reduce((n, c) => n + c.v, 0) / period;
  if (volume <= 0) return null;
  const center = (period - 1) / 2;
  const mean = values.reduce((a, b) => a + b, 0) / period;
  let numerator = 0, denominator = 0;
  for (let i = 0; i < period; i++) { numerator += (i - center) * (values[i] - mean); denominator += (i - center) ** 2; }
  return denominator > 0 ? numerator / denominator / volume * 100 : null;
}
