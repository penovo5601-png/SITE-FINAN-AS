import type { Candle } from "./yahoo";

export type HistorySnapshot = {
  symbol: string;
  currency: string;
  provider: "Yahoo Finance" | "Nasdaq";
  interval: "1d";
  priceBasis: "adjusted" | "unadjusted";
  fetchedAt: string;
  lastBarAt: string;
  origin: "network" | "memory" | "postgres" | "bundled" | "browser";
  candles: Candle[];
  discardedBars?: number;
};
export type HistoryEvidence = Omit<HistorySnapshot, "candles"> & { bars: number; ageHours: number; archived: boolean };

export const canonicalSymbol = (symbol: string) => ({ "GAL.LS": "GALP.LS", "MCP.LS": "EGL.LS", "REN.LS": "RENE.LS", "CORT.LS": "COR.LS" }[symbol.toUpperCase()] ?? symbol.toUpperCase());
export const validSymbol = (symbol: string) => /^[A-Z0-9][A-Z0-9.\-]{0,31}$/.test(symbol);

export function validHistory(snapshot: HistorySnapshot, requested = snapshot.symbol, now = Date.now()): boolean {
  if (!snapshot || canonicalSymbol(snapshot.symbol) !== canonicalSymbol(requested) || !validSymbol(snapshot.symbol) || !snapshot.currency || snapshot.interval !== "1d" || !Array.isArray(snapshot.candles) || snapshot.candles.length < 2) return false;
  for (let i = 0; i < snapshot.candles.length; i++) {
    const c = snapshot.candles[i];
    if (![c.t,c.o,c.h,c.l,c.c,c.v].every(Number.isFinite) || Math.min(c.o,c.h,c.l,c.c) <= 0 || c.v < 0 || c.t > now) return false;
    if (c.h + 1e-8 < Math.max(c.o,c.c,c.l) || c.l - 1e-8 > Math.min(c.o,c.c,c.h)) return false;
    if (i > 0 && c.t <= snapshot.candles[i - 1].t) return false;
  }
  return Date.parse(snapshot.lastBarAt) === snapshot.candles.at(-1)!.t && Number.isFinite(Date.parse(snapshot.fetchedAt));
}
export function historyEvidence(snapshot: HistorySnapshot): HistoryEvidence {
  const {candles, ...metadata} = snapshot;
  return {...metadata, bars:candles.length, ageHours:Math.max(0,(Date.now()-Date.parse(snapshot.lastBarAt))/3_600_000), archived:snapshot.origin!=="network"&&snapshot.origin!=="memory"};
}
