"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Candle } from "@/lib/yahoo";
import type { Level } from "@/lib/indicators";

type Props = {
  candles: Candle[];
  sma20: (number | null)[];
  sma50: (number | null)[];
  sma200: (number | null)[];
  bbUpper: (number | null)[];
  bbLower: (number | null)[];
  rsi: (number | null)[];
  levels: Level[];
  currency: string;
};

const PAD = { top: 14, right: 62, bottom: 22, left: 6 };
const PRICE_H = 300;
const VOL_H = 56;
const RSI_H = 74;
const GAP = 12;

export default function CandleChart({ candles, sma20, sma50, sma200, bbUpper, bbLower, rsi, levels, currency }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(960);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw && cw > 200) setW(cw);
    });
    ro.observe(el);
    setW(el.clientWidth || 960);
    return () => ro.disconnect();
  }, []);

  const totalH = PAD.top + PRICE_H + GAP + VOL_H + GAP + RSI_H + PAD.bottom;
  const plotW = Math.max(120, w - PAD.left - PAD.right);

  const model = useMemo(() => {
    const n = candles.length;
    const step = plotW / Math.max(1, n);
    const bw = Math.max(1.2, Math.min(11, step * 0.66));
    let hi = -Infinity;
    let lo = Infinity;
    let maxVol = 0;
    for (let i = 0; i < n; i++) {
      hi = Math.max(hi, candles[i].h, bbUpper[i] ?? -Infinity);
      lo = Math.min(lo, candles[i].l, bbLower[i] ?? Infinity);
      maxVol = Math.max(maxVol, candles[i].v);
    }
    if (!isFinite(hi) || !isFinite(lo)) { hi = 1; lo = 0; }
    const padY = (hi - lo) * 0.06 || 1;
    hi += padY;
    lo -= padY;
    const y = (p: number) => PAD.top + ((hi - p) / (hi - lo)) * PRICE_H;
    const x = (i: number) => PAD.left + step * (i + 0.5);

    let rMin = 100;
    let rMax = 0;
    for (const r of rsi) if (r != null) { rMin = Math.min(rMin, r); rMax = Math.max(rMax, r); }
    if (rMin === 100) { rMin = 0; rMax = 100; }
    const rPad = Math.max(6, (rMax - rMin) * 0.12);
    rMin = Math.max(0, rMin - rPad);
    rMax = Math.min(100, rMax + rPad);
    const rsiTop = PAD.top + PRICE_H + GAP + VOL_H + GAP;
    const yR = (v: number) => rsiTop + ((rMax - v) / Math.max(0.0001, rMax - rMin)) * RSI_H;

    const line = (arr: (number | null)[]) => {
      let d = "";
      let started = false;
      for (let i = 0; i < n; i++) {
        const v = arr[i];
        if (v == null || !isFinite(v)) { started = false; continue; }
        d += `${started ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`;
        started = true;
      }
      return d;
    };

    const volTop = PAD.top + PRICE_H + GAP;
    const volY = (v: number) => volTop + VOL_H - (maxVol ? (v / maxVol) * VOL_H : 0);

    return { n, step, bw, hi, lo, y, x, line, volTop, volY, maxVol, rsiTop, yR, rMin, rMax };
  }, [candles, sma20, sma50, sma200, bbUpper, bbLower, rsi, plotW]);

  const bandPath = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i < model.n; i++) {
      const u = bbUpper[i];
      if (u == null) continue;
      pts.push(`${pts.length ? "L" : "M"}${model.x(i).toFixed(2)},${model.y(u).toFixed(2)}`);
    }
    for (let i = model.n - 1; i >= 0; i--) {
      const l = bbLower[i];
      if (l == null) continue;
      pts.push(`L${model.x(i).toFixed(2)},${model.y(l).toFixed(2)}`);
    }
    return pts.length > 2 ? pts.join("") + "Z" : "";
  }, [bbUpper, bbLower, model]);

  const ticks = useMemo(() => {
    const out: number[] = [];
    const count = 6;
    for (let i = 0; i <= count; i++) out.push(model.lo + ((model.hi - model.lo) * i) / count);
    return out;
  }, [model.lo, model.hi]);

  const hoverCandle = hover != null ? candles[hover] : null;

  return (
    <div ref={wrap} className="relative w-full select-none">
      <svg
        width={w}
        height={totalH}
        viewBox={`0 0 ${w} ${totalH}`}
        className="block"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = e.clientX - rect.left;
          const i = Math.floor((px - PAD.left) / model.step);
          setHover(i >= 0 && i < model.n ? i : null);
        }}
      >
        <defs>
          <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.04" />
          </linearGradient>
          <clipPath id="priceClip">
            <rect x={PAD.left} y={PAD.top} width={plotW} height={PRICE_H} />
          </clipPath>
        </defs>

        {/* grelha + escala de preços */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={PAD.left + plotW} y1={model.y(t)} y2={model.y(t)} stroke="#1b2338" strokeWidth="1" />
            <text x={PAD.left + plotW + 7} y={model.y(t) + 3.5} fill="#64748b" fontSize="10" fontFamily="var(--font-mono)">
              {t >= 1000 ? t.toFixed(0) : t.toFixed(2)}
            </text>
          </g>
        ))}

        {/* níveis de suporte/resistência */}
        {levels.slice(0, 6).map((l, i) => {
          const yy = model.y(l.price);
          if (yy < PAD.top || yy > PAD.top + PRICE_H) return null;
          const support = l.price < (hoverCandle?.c ?? candles[model.n - 1]?.c ?? 0);
          return (
            <g key={`lv-${i}`} opacity={0.75}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={yy}
                y2={yy}
                stroke={support ? "#12b76a" : "#ef4056"}
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text x={PAD.left + 4} y={yy - 4} fill={support ? "#34d683" : "#fb7185"} fontSize="9" fontFamily="var(--font-mono)">
                {support ? "SUP" : "RES"} {l.touches}×
              </text>
            </g>
          );
        })}

        <g clipPath="url(#priceClip)">
          {bandPath && <path d={bandPath} fill="url(#bandFill)" stroke="#38bdf8" strokeOpacity="0.28" strokeWidth="1" />}

          {candles.map((c, i) => {
            const up = c.c >= c.o;
            const col = up ? "#12b76a" : "#ef4056";
            const x = model.x(i);
            const yH = model.y(c.h);
            const yL = model.y(c.l);
            const yO = model.y(c.o);
            const yC = model.y(c.c);
            const top = Math.min(yO, yC);
            const h = Math.max(1, Math.abs(yC - yO));
            return (
              <g key={i}>
                <line x1={x} x2={x} y1={yH} y2={yL} stroke={col} strokeWidth={Math.max(0.8, model.bw * 0.16)} />
                <rect x={x - model.bw / 2} y={top} width={model.bw} height={h} fill={col} opacity={hover === i ? 1 : 0.92} rx="0.6" />
              </g>
            );
          })}

          <path d={model.line(sma20)} fill="none" stroke="#f5a524" strokeWidth="1.5" opacity="0.95" />
          <path d={model.line(sma50)} fill="none" stroke="#38bdf8" strokeWidth="1.5" opacity="0.95" />
          <path d={model.line(sma200)} fill="none" stroke="#c084fc" strokeWidth="1.7" opacity="0.95" />
        </g>

        {/* volume */}
        <g>
          <line x1={PAD.left} x2={PAD.left + plotW} y1={model.volTop + VOL_H} y2={model.volTop + VOL_H} stroke="#1b2338" />
          <text x={PAD.left + plotW + 7} y={model.volTop + 10} fill="#475569" fontSize="9" fontFamily="var(--font-mono)">VOL</text>
          {candles.map((c, i) => {
            const h = Math.max(0.5, model.volTop + VOL_H - model.volY(c.v));
            return (
              <rect
                key={`v${i}`}
                x={model.x(i) - model.bw / 2}
                y={model.volTop + VOL_H - h}
                width={model.bw}
                height={h}
                fill={c.c >= c.o ? "#12b76a" : "#ef4056"}
                opacity="0.45"
              />
            );
          })}
        </g>

        {/* RSI */}
        <g>
          <rect x={PAD.left} y={model.rsiTop} width={plotW} height={RSI_H} fill="#0a0e19" stroke="#1b2338" rx="4" />
          {[30, 50, 70].map((v) =>
            v >= model.rMin && v <= model.rMax ? (
              <g key={`r${v}`}>
                <line x1={PAD.left} x2={PAD.left + plotW} y1={model.yR(v)} y2={model.yR(v)} stroke={v === 50 ? "#27314b" : "#3a2438"} strokeDasharray={v === 50 ? "0" : "3 3"} />
                <text x={PAD.left + plotW + 7} y={model.yR(v) + 3} fill="#64748b" fontSize="9" fontFamily="var(--font-mono)">{v}</text>
              </g>
            ) : null,
          )}
          <path d={(() => {
            let d = ""; let started = false;
            for (let i = 0; i < model.n; i++) {
              const v = rsi[i];
              if (v == null) { started = false; continue; }
              d += `${started ? "L" : "M"}${model.x(i).toFixed(2)},${model.yR(v).toFixed(2)}`;
              started = true;
            }
            return d;
          })()} fill="none" stroke="#c084fc" strokeWidth="1.5" />
          <text x={PAD.left + 5} y={model.rsiTop + 12} fill="#94a3b8" fontSize="9" fontFamily="var(--font-mono)">RSI 14</text>
        </g>

        {/* crosshair */}
        {hover != null && hoverCandle && (
          <g pointerEvents="none">
            <line x1={model.x(hover)} x2={model.x(hover)} y1={PAD.top} y2={model.rsiTop + RSI_H} stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.7" />
            <line x1={PAD.left} x2={PAD.left + plotW} y1={model.y(hoverCandle.c)} y2={model.y(hoverCandle.c)} stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.55" />
            <rect x={PAD.left + plotW + 2} y={model.y(hoverCandle.c) - 8} width={58} height={16} rx="3" fill="#27314b" />
            <text x={PAD.left + plotW + 6} y={model.y(hoverCandle.c) + 4} fill="#e8edf6" fontSize="10" fontFamily="var(--font-mono)">
              {hoverCandle.c.toFixed(2)}
            </text>
          </g>
        )}
      </svg>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] text-ink-400">
        <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 rounded bg-[#f5a524]" />SMA 20</span>
        <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 rounded bg-[#38bdf8]" />SMA 50</span>
        <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 rounded bg-[#c084fc]" />SMA 200</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-4 rounded-sm bg-cyan-signal/25 ring-1 ring-cyan-signal/40" />Bollinger 20,2</span>
        <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 rounded bg-bull-500" />suporte</span>
        <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 rounded bg-bear-500" />resistência</span>
        {hoverCandle && (
          <span className="tnum ml-auto text-ink-300">
            {new Date(hoverCandle.t).toLocaleDateString("pt-PT")} · A {hoverCandle.o.toFixed(2)} · Máx {hoverCandle.h.toFixed(2)} · Mín {hoverCandle.l.toFixed(2)} · F {hoverCandle.c.toFixed(2)} {currency} · Vol {(hoverCandle.v / 1e6).toFixed(2)}M
          </span>
        )}
      </div>
    </div>
  );
}
