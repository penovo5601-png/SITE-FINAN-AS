/** Gera PNGs de gráficos de velas sintéticos para testar o motor de visão computacional. */
import sharp from "sharp";
import { writeFileSync } from "node:fs";

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function makeChart({ file, seed, drift, W = 900, H = 460, dark = false, bars = 70 }) {
  const rnd = seeded(seed);
  const bg = dark ? "#0b1020" : "#ffffff";
  const grid = dark ? "#1e2a44" : "#e5e7eb";
  let price = 100;
  const candles = [];
  for (let i = 0; i < bars; i++) {
    const o = price;
    const move = (rnd() - 0.5 + drift) * 4;
    const c = o + move;
    const h = Math.max(o, c) + rnd() * 1.8;
    const l = Math.min(o, c) - rnd() * 1.8;
    candles.push({ o, c, h, l });
    price = c;
  }
  const hi = Math.max(...candles.map((x) => x.h));
  const lo = Math.min(...candles.map((x) => x.l));
  const padT = 40, padB = 40, padL = 50, padR = 60;
  const y = (p) => padT + ((hi - p) / (hi - lo)) * (H - padT - padB);
  const step = (W - padL - padR) / bars;
  const bw = Math.max(3, step * 0.62);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${bg}"/>`;
  for (let i = 0; i <= 6; i++) {
    const yy = padT + ((H - padT - padB) * i) / 6;
    const pv = hi - ((hi - lo) * i) / 6;
    svg += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="${grid}" stroke-width="1"/>`;
    svg += `<text x="${W - padR + 6}" y="${yy + 4}" font-family="monospace" font-size="11" fill="${dark ? "#64748b" : "#6b7280"}">${pv.toFixed(2)}</text>`;
  }
  candles.forEach((c, i) => {
    const x = padL + step * (i + 0.5);
    const up = c.c >= c.o;
    const col = up ? "#16a34a" : "#dc2626";
    svg += `<line x1="${x}" y1="${y(c.h)}" x2="${x}" y2="${y(c.l)}" stroke="${col}" stroke-width="${Math.max(1, bw * 0.18)}"/>`;
    const top = y(Math.max(c.o, c.c));
    const h = Math.max(1.5, Math.abs(y(c.c) - y(c.o)));
    svg += `<rect x="${x - bw / 2}" y="${top}" width="${bw}" height="${h}" fill="${col}"/>`;
  });
  svg += `<text x="${padL}" y="24" font-family="monospace" font-size="13" fill="${dark ? "#cbd5e1" : "#111827"}">TESTE · 1D</text></svg>`;

  return sharp(Buffer.from(svg)).png().toFile(file);
}

const jobs = [
  { file: "/tmp/chart-up.png", seed: 42, drift: 0.22 },
  { file: "/tmp/chart-down.png", seed: 77, drift: -0.22 },
  { file: "/tmp/chart-dark-up.png", seed: 12, drift: 0.2, dark: true },
  { file: "/tmp/chart-flat.png", seed: 5, drift: 0 },
];

for (const j of jobs) {
  await makeChart(j);
  console.log("gerado", j.file);
}
