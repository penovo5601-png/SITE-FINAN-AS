/**
 * MÉTODO DO GUIA PRÁTICO (Simulação de Gestão de Carteira 2026/27)
 * 1) Fundamentais vs concorrente (PER, PBV, ROE, DY, Payout)
 * 2) Tendência 6 meses (bullish/bearish/lateral, ≥3 pontos de contacto)
 * 3) Suporte / resistência (4 leituras)
 * 4) Velas (série verde/vermelha, tamanho)
 * 5) MM20/MM50 → ADX → MACD ou RSI → padrões gráficos
 * 6) Tabela-semáforo + plano de saída (stop 5–8%, objetivo 8–10%) + justificação escrita
 */
export interface GCandle { t: number; o: number; h: number; l: number; c: number; v: number }
export interface PeerRow { symbol: string; name: string; country: string; exchange: string; price: number | null; currency: string | null; per: number | null; pbv: number | null; roe: number | null; dy: number | null; payout: number | null; perf6m: number | null; perf1y: number | null; marketCap: number | null; isSelf?: boolean }
export type Light = "VERDE" | "AMARELO" | "VERMELHO";
export interface SemaforoRow { n: number; question: string; light: Light; reading: string }

export interface GuideAnalysis {
  fundamentals: {
    per: number | null; pbv: number | null; roe: number | null; dy: number | null; payout: number | null;
    peers: PeerRow[]; peerMedian: { per: number | null; pbv: number | null; roe: number | null; dy: number | null; payout: number | null };
    bestPeer: PeerRow | null; verdict: "Melhores que a concorrente" | "Semelhantes" | "Piores" | "Sem comparável"; light: Light; text: string;
  };
  trend: { kind: "BULLISH" | "BEARISH" | "LATERAL"; label: string; contacts: number; confirmed: boolean; slopePctPerMonth: number; higherHighs: boolean; higherLows: boolean; lowerHighs: boolean; lowerLows: boolean; change6mPct: number; light: Light; action: string; text: string };
  levels: { support: number; resistance: number; range52: { low: number; high: number; positionPct: number }; situation: string; light: Light; text: string };
  candles: { greens5: number; reds5: number; lastBig: boolean; dominance: "Compradores dominam" | "Vendedores dominam" | "Indecisão"; text: string };
  movingAverages: { mm20: number; mm50: number; priceAbove20: boolean; priceAbove50: boolean; mm20Above50: boolean; crossUpRecently: boolean; crossDownRecently: boolean; signal: string; light: Light; text: string };
  oscillator: { adx: number; adxReading: string; chosen: "MACD" | "RSI"; macd: { line: number; signal: number; hist: number; crossUp: boolean; crossDown: boolean; histRising: boolean; divergence: boolean }; rsi: number; signal: string; light: Light; text: string };
  patterns: { name: string; bias: "COMPRA" | "VENDA" | "NEUTRO"; description: string }[];
  semaforo: { rows: SemaforoRow[]; greens: number; yellows: number; reds: number; decision: "COMPRAR" | "COMPRAR MENOS / ESPERAR CONFIRMAÇÃO" | "NÃO COMPRAR / VENDER"; decisionLight: Light };
  exitPlan: { stopLoss: number; stopPct: number; target: number; targetPct: number; rationale: string };
  justification: { buy: string; wait: string };
  checklist: { item: string; done: boolean }[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const median = (arr: (number | null)[]) => { const a = arr.filter((x): x is number => x != null && isFinite(x)).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
const sma = (a: number[], p: number) => a.map((_, i) => (i < p - 1 ? NaN : a.slice(i - p + 1, i + 1).reduce((x, y) => x + y, 0) / p));
const ema = (a: number[], p: number) => { const k = 2 / (p + 1); const out: number[] = []; a.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k))); return out; };
const fmt = (v: number | null, d = 1) => (v == null ? "—" : v.toFixed(d));

function rsi14(c: number[]): number {
  if (c.length < 16) return 50;
  let g = 0, l = 0;
  for (let i = 1; i <= 14; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= 14; l /= 14;
  for (let i = 15; i < c.length; i++) { const d = c[i] - c[i - 1]; g = (g * 13 + Math.max(d, 0)) / 14; l = (l * 13 + Math.max(-d, 0)) / 14; }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
function adx14(cs: GCandle[]): number {
  const n = cs.length; if (n < 30) return 20;
  const tr: number[] = [], pdm: number[] = [], ndm: number[] = [];
  for (let i = 1; i < n; i++) { const up = cs[i].h - cs[i - 1].h, dn = cs[i - 1].l - cs[i].l; pdm.push(up > dn && up > 0 ? up : 0); ndm.push(dn > up && dn > 0 ? dn : 0); tr.push(Math.max(cs[i].h - cs[i].l, Math.abs(cs[i].h - cs[i - 1].c), Math.abs(cs[i].l - cs[i - 1].c))); }
  const sm = (a: number[]) => { const o: number[] = []; let s = a.slice(0, 14).reduce((x, y) => x + y, 0); o.push(s); for (let i = 14; i < a.length; i++) { s = s - s / 14 + a[i]; o.push(s); } return o; };
  const sT = sm(tr), sP = sm(pdm), sN = sm(ndm); const dx: number[] = [];
  for (let i = 0; i < sT.length; i++) { const p = sT[i] ? (sP[i] / sT[i]) * 100 : 0, q = sT[i] ? (sN[i] / sT[i]) * 100 : 0; dx.push(p + q ? (Math.abs(p - q) / (p + q)) * 100 : 0); }
  const last = dx.slice(-14); return last.reduce((x, y) => x + y, 0) / Math.max(1, last.length);
}
function pivots(cs: GCandle[], wing = 3) {
  const highs: { i: number; p: number }[] = [], lows: { i: number; p: number }[] = [];
  for (let i = wing; i < cs.length - wing; i++) {
    const w = cs.slice(i - wing, i + wing + 1);
    if (cs[i].h >= Math.max(...w.map(c => c.h))) highs.push({ i, p: cs[i].h });
    if (cs[i].l <= Math.min(...w.map(c => c.l))) lows.push({ i, p: cs[i].l });
  }
  return { highs, lows };
}
function linreg(y: number[]) { const n = y.length; const xm = (n - 1) / 2, ym = y.reduce((a, b) => a + b, 0) / n; let num = 0, den = 0; for (let i = 0; i < n; i++) { num += (i - xm) * (y[i] - ym); den += (i - xm) ** 2; } const slope = den ? num / den : 0; return { slope, intercept: ym - slope * xm }; }

export function buildGuideAnalysis(input: {
  symbol: string; name: string; price: number; currency: string; candles: GCandle[];
  fundamentals: { per: number | null; pbv: number | null; roe: number | null; dy: number | null; payout: number | null };
  peers: PeerRow[]; sector?: string | null; portfolioContext?: string;
}): GuideAnalysis {
  const { symbol, name, price, currency } = input;
  const all = input.candles.filter(c => isFinite(c.c) && c.c > 0);
  const six = all.slice(-126); // ~6 meses de sessões
  const closes = six.map(c => c.c);
  const n = closes.length;

  // ---------------- 1) FUNDAMENTAIS vs CONCORRENTE ----------------
  const f = input.fundamentals;
  const peers = input.peers.filter(p => !p.isSelf);
  const peerMedian = { per: median(peers.map(p => p.per)), pbv: median(peers.map(p => p.pbv)), roe: median(peers.map(p => p.roe)), dy: median(peers.map(p => p.dy)), payout: median(peers.map(p => p.payout)) };
  const bestPeer = peers.slice().sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))[0] ?? null;
  let fScore = 0, fCount = 0;
  if (f.per != null && f.per > 0 && peerMedian.per != null) { fCount++; fScore += f.per < peerMedian.per * 0.9 ? 1 : f.per > peerMedian.per * 1.15 ? -1 : 0; }
  if (f.roe != null && peerMedian.roe != null) { fCount++; fScore += f.roe > peerMedian.roe * 1.1 ? 1 : f.roe < peerMedian.roe * 0.85 ? -1 : 0; }
  if (f.dy != null && peerMedian.dy != null) { fCount++; fScore += f.dy > peerMedian.dy * 1.1 ? 1 : f.dy < peerMedian.dy * 0.7 ? -1 : 0; }
  if (f.pbv != null && peerMedian.pbv != null) { fCount++; fScore += f.pbv < peerMedian.pbv * 0.85 ? 0.5 : f.pbv > peerMedian.pbv * 1.3 ? -0.5 : 0; }
  if (f.per != null && f.per < 0) fScore -= 1;
  const fVerdict: GuideAnalysis["fundamentals"]["verdict"] = !fCount ? "Sem comparável" : fScore >= 1 ? "Melhores que a concorrente" : fScore <= -1 ? "Piores" : "Semelhantes";
  const fLight: Light = fVerdict === "Melhores que a concorrente" ? "VERDE" : fVerdict === "Piores" ? "VERMELHO" : "AMARELO";
  const fText = bestPeer
    ? `PER de ${fmt(f.per)} (mediana dos concorrentes ${fmt(peerMedian.per)}; ${bestPeer.name.split(" ")[0]} ${fmt(bestPeer.per)}), PBV ${fmt(f.pbv, 2)} vs ${fmt(peerMedian.pbv, 2)}, ROE ${fmt(f.roe)}% vs ${fmt(peerMedian.roe)}%, dividend yield ${fmt(f.dy, 2)}% vs ${fmt(peerMedian.dy, 2)}%, payout ${fmt(f.payout, 0)}%. Leitura: fundamentais ${fVerdict.toLowerCase()}.`
    : `PER ${fmt(f.per)}, PBV ${fmt(f.pbv, 2)}, ROE ${fmt(f.roe)}%, DY ${fmt(f.dy, 2)}%, payout ${fmt(f.payout, 0)}%. Sem concorrentes comparáveis disponíveis.`;

  // ---------------- 2) TENDÊNCIA 6 MESES ----------------
  const { highs, lows } = pivots(six, 3);
  const lastHighs = highs.slice(-4), lastLows = lows.slice(-4);
  const asc = (a: { p: number }[]) => a.length >= 2 && a.every((x, i) => i === 0 || x.p > a[i - 1].p * 0.995);
  const desc = (a: { p: number }[]) => a.length >= 2 && a.every((x, i) => i === 0 || x.p < a[i - 1].p * 1.005);
  const higherHighs = asc(lastHighs.slice(-3)), higherLows = asc(lastLows.slice(-3)), lowerHighs = desc(lastHighs.slice(-3)), lowerLows = desc(lastLows.slice(-3));
  const reg = linreg(closes);
  const slopePctPerMonth = n ? (reg.slope * 21) / (closes[0] || 1) * 100 : 0;
  const change6m = n > 1 ? (closes[n - 1] / closes[0] - 1) * 100 : 0;
  let kind: GuideAnalysis["trend"]["kind"] = "LATERAL";
  if ((higherLows || slopePctPerMonth > 1.2) && change6m > 3 && !lowerLows) kind = "BULLISH";
  else if ((lowerHighs || slopePctPerMonth < -1.2) && change6m < -3 && !higherHighs) kind = "BEARISH";
  // Pontos de contacto com a linha de tendência (pelos mínimos se bullish, máximos se bearish, S/R se lateral)
  let contacts = 0;
  if (kind === "BULLISH" && lows.length >= 2) {
    const base = linreg(lows.map(l => l.p)); // aproximação: linha pelos mínimos pivot
    const tol = 0.015 * price;
    contacts = lows.filter((l, i) => Math.abs(l.p - (base.intercept + base.slope * i)) <= tol).length;
  } else if (kind === "BEARISH" && highs.length >= 2) {
    const base = linreg(highs.map(h => h.p)); const tol = 0.015 * price;
    contacts = highs.filter((h, i) => Math.abs(h.p - (base.intercept + base.slope * i)) <= tol).length;
  } else {
    const hi = Math.max(...closes), lo = Math.min(...closes); const tol = 0.02 * price;
    contacts = highs.filter(h => Math.abs(h.p - hi) <= tol).length + lows.filter(l => Math.abs(l.p - lo) <= tol).length;
  }
  const confirmed = contacts >= 3;
  const trendLight: Light = kind === "BULLISH" ? "VERDE" : kind === "BEARISH" ? "VERMELHO" : "AMARELO";
  const trendAction = kind === "BULLISH" ? "Comprar, de preferência quando o preço recua até à linha de tendência." : kind === "BEARISH" ? "Vender, ou não comprar." : "Manter se já tem a ação; esperar se ainda não comprou.";
  const trendText = `No gráfico diário dos últimos 6 meses (${n} sessões, ${change6m > 0 ? "+" : ""}${change6m.toFixed(1)}%), a ação apresenta tendência ${kind === "BULLISH" ? "bullish, com mínimos cada vez mais altos" : kind === "BEARISH" ? "bearish, com máximos cada vez mais baixos" : "lateral, a oscilar entre um piso e um teto"} (${contacts} ponto${contacts === 1 ? "" : "s"} de contacto com a linha de tendência${confirmed ? " — tendência confirmada" : " — ainda não confirmada, são precisos 3"}). Inclinação ≈ ${slopePctPerMonth > 0 ? "+" : ""}${slopePctPerMonth.toFixed(1)}%/mês.`;

  // ---------------- 3) SUPORTE / RESISTÊNCIA ----------------
  const recent = six.slice(-60);
  const lowsSorted = recent.map(c => c.l).sort((a, b) => a - b), highsSorted = recent.map(c => c.h).sort((a, b) => b - a);
  const support = r2(lowsSorted[Math.floor(lowsSorted.length * 0.1)] ?? price * 0.95);
  const resistance = r2(highsSorted[Math.floor(highsSorted.length * 0.1)] ?? price * 1.05);
  const yr = all.slice(-252); const low52 = Math.min(...yr.map(c => c.l)), high52 = Math.max(...yr.map(c => c.h));
  const pos52 = high52 > low52 ? ((price - low52) / (high52 - low52)) * 100 : 50;
  const prev5 = six.slice(-6, -1);
  const brokeRes = price > resistance * 0.998 && prev5.some(c => c.c < resistance * 0.99);
  const brokeSup = price < support * 1.002 && prev5.some(c => c.c > support * 1.01);
  const nearSup = price <= support * 1.03, nearRes = price >= resistance * 0.97;
  let situation = "A meio do intervalo"; let levelLight: Light = "AMARELO";
  if (brokeRes) { situation = "Rompeu a resistência para cima — sinal de força: o antigo teto passa a funcionar como chão"; levelLight = "VERDE"; }
  else if (brokeSup) { situation = "Rompeu o suporte para baixo — sinal de fraqueza: considerar vender; bom nível para stop loss"; levelLight = "VERMELHO"; }
  else if (nearSup && kind === "BULLISH") { situation = "Perto do suporte em tendência bullish — bom momento para comprar: há chão por baixo"; levelLight = "VERDE"; }
  else if (nearSup) { situation = "Perto do suporte (chão) — atenção a uma possível quebra"; levelLight = "AMARELO"; }
  else if (nearRes) { situation = "Colado à resistência — cuidado: pode voltar a recuar"; levelLight = "VERMELHO"; }
  const levelText = `Suporte (chão) ≈ ${support} ${currency}; resistência (teto) ≈ ${resistance} ${currency}. Intervalo de 52 semanas ${r2(low52)}–${r2(high52)} ${currency}: o preço está a ${pos52.toFixed(0)}% do intervalo (${pos52 < 35 ? "zona barata face ao último ano" : pos52 > 70 ? "zona cara face ao último ano" : "nem barata nem cara face ao último ano"}). ${situation}.`;

  // ---------------- 4) VELAS ----------------
  const last5 = six.slice(-5);
  const greens5 = last5.filter(c => c.c > c.o).length, reds5 = 5 - greens5;
  const bodies = six.slice(-20).map(c => Math.abs(c.c - c.o)); const avgBody = bodies.reduce((a, b) => a + b, 0) / Math.max(1, bodies.length);
  const lastC = six[six.length - 1]; const lastBig = lastC ? Math.abs(lastC.c - lastC.o) > avgBody * 1.6 : false;
  const dominance: GuideAnalysis["candles"]["dominance"] = greens5 >= 4 ? "Compradores dominam" : reds5 >= 4 ? "Vendedores dominam" : "Indecisão";
  const candleText = `Últimas 5 velas: ${greens5} verdes e ${reds5} vermelhas → ${dominance.toLowerCase()}. ${lastBig ? `A última vela é grande (${lastC.c > lastC.o ? "verde" : "vermelha"}): movimento forte.` : "Velas de tamanho normal/pequeno: sem movimento extremo."}`;

  // ---------------- 5a) MÉDIAS MÓVEIS ----------------
  const allCloses = all.map(c => c.c);
  const s20 = sma(allCloses, 20), s50 = sma(allCloses, 50);
  const mm20 = r2(s20[s20.length - 1] || price), mm50 = r2(s50[s50.length - 1] || price);
  const priceAbove20 = price > mm20, priceAbove50 = price > mm50, mm20Above50 = mm20 > mm50;
  const k = allCloses.length - 1;
  const crossUpRecently = [1, 2, 3, 4, 5].some(d => allCloses[k - d] < s20[k - d] && allCloses[k - d + 1] >= s20[k - d + 1]);
  const crossDownRecently = [1, 2, 3, 4, 5].some(d => allCloses[k - d] > s20[k - d] && allCloses[k - d + 1] <= s20[k - d + 1]);
  let maSignal = "Em cima da média"; let maLight: Light = "AMARELO";
  if (priceAbove20 && priceAbove50 && mm20Above50) { maSignal = "Tendência ascendente confirmada (preço acima das duas médias, MM20 > MM50)"; maLight = "VERDE"; }
  else if (!priceAbove20 && !priceAbove50) { maSignal = "Tendência descendente (preço abaixo das duas médias)"; maLight = "VERMELHO"; }
  else if (crossUpRecently) { maSignal = "COMPRA: o preço cruzou a MM20 de baixo para cima"; maLight = "VERDE"; }
  else if (crossDownRecently) { maSignal = "VENDA: o preço cruzou a MM20 de cima para baixo"; maLight = "VERMELHO"; }
  else if (priceAbove50) { maSignal = "Preço acima da MM50 mas abaixo da MM20 — recuo dentro da tendência"; maLight = "AMARELO"; }
  const maText = `MM20 = ${mm20} e MM50 = ${mm50} ${currency}; preço ${price} está ${priceAbove20 ? "acima" : "abaixo"} da MM20 e ${priceAbove50 ? "acima" : "abaixo"} da MM50. ${maSignal}.`;

  // ---------------- 5b) ADX → MACD ou RSI ----------------
  const adx = r2(adx14(all.slice(-120)));
  const adxReading = adx > 30 ? "tendência marcadamente forte" : adx >= 25 ? "existe tendência, mas não muito forte" : adx >= 20 ? "praticamente não existe tendência" : "mercado marcadamente lateral";
  const chosen: "MACD" | "RSI" = adx >= 25 ? "MACD" : "RSI";
  const e12 = ema(allCloses, 12), e26 = ema(allCloses, 26); const macdLine = e12.map((v, i) => v - e26[i]); const sig = ema(macdLine, 9); const hist = macdLine.map((v, i) => v - sig[i]);
  const m = macdLine.length - 1;
  const crossUp = [1, 2, 3, 4, 5].some(d => macdLine[m - d] < sig[m - d] && macdLine[m - d + 1] >= sig[m - d + 1]);
  const crossDown = [1, 2, 3, 4, 5].some(d => macdLine[m - d] > sig[m - d] && macdLine[m - d + 1] <= sig[m - d + 1]);
  const histRising = hist[m] > hist[m - 1] && hist[m - 1] > hist[m - 2];
  const recentHigh = Math.max(...allCloses.slice(-10)), prevHigh = Math.max(...allCloses.slice(-40, -10));
  const divergence = recentHigh > prevHigh && Math.max(...hist.slice(-10)) < Math.max(...hist.slice(-40, -10));
  const rsi = r2(rsi14(allCloses));
  const rsiPrev = r2(rsi14(allCloses.slice(0, -3)));
  let oscSignal = "Sem sinal"; let oscLight: Light = "AMARELO";
  if (chosen === "MACD") {
    if (crossUp) { oscSignal = "COMPRA: a linha MACD cruzou a de sinal de baixo para cima"; oscLight = "VERDE"; }
    else if (crossDown) { oscSignal = "VENDA: a linha MACD cruzou a de sinal de cima para baixo"; oscLight = "VERMELHO"; }
    else if (divergence) { oscSignal = "Falta força: novo máximo no preço sem novo máximo no histograma — fechar posições"; oscLight = "VERMELHO"; }
    else if (hist[m] > 0 && histRising) { oscSignal = "Pressão compradora a aumentar (histograma a crescer acima de zero)"; oscLight = "VERDE"; }
    else if (hist[m] > 0) { oscSignal = "MACD acima da linha de sinal — viés comprador sem cruzamento recente"; oscLight = "AMARELO"; }
    else { oscSignal = "MACD abaixo da linha de sinal — viés vendedor"; oscLight = "VERMELHO"; }
  } else {
    if (rsi >= 70) { oscSignal = `Sobrecompra (RSI ${rsi}): preparar a venda`; oscLight = "VERMELHO"; }
    else if (rsiPrev >= 70 && rsi < 70) { oscSignal = "VENDA: o RSI voltou a descer abaixo de 70"; oscLight = "VERMELHO"; }
    else if (rsi <= 30 && rsi > rsiPrev) { oscSignal = `Sobrevenda a terminar (RSI ${rsi} a subir): atenção a uma possível recuperação`; oscLight = "AMARELO"; }
    else if (rsi <= 30) { oscSignal = `Sobrevendida (RSI ${rsi})`; oscLight = "AMARELO"; }
    else if (rsiPrev < 50 && rsi >= 50) { oscSignal = "COMPRA: o RSI subiu acima de 50"; oscLight = "VERDE"; }
    else if (rsi >= 50) { oscSignal = `RSI ${rsi} acima de 50 — zona compradora`; oscLight = "VERDE"; }
    else { oscSignal = `RSI ${rsi} abaixo de 50 — vender ou não comprar`; oscLight = "VERMELHO"; }
  }
  const oscText = `ADX = ${adx} (${adxReading}) → usar ${chosen}. ${oscSignal}.`;

  // ---------------- 5c) PADRÕES ----------------
  const patterns: GuideAnalysis["patterns"] = [];
  const lh = lows.slice(-3), hh = highs.slice(-3);
  if (lh.length >= 2) { const [a, b] = lh.slice(-2); const mid = highs.find(h => h.i > a.i && h.i < b.i); if (Math.abs(a.p - b.p) / price < 0.03 && mid && price > mid.p) patterns.push({ name: "Double bottom (\"W\")", bias: "COMPRA", description: "Dois mínimos ao mesmo nível e quebra do máximo intermédio: reversão para cima." }); }
  if (hh.length >= 2) { const [a, b] = hh.slice(-2); const mid = lows.find(l => l.i > a.i && l.i < b.i); if (Math.abs(a.p - b.p) / price < 0.03 && mid && price < mid.p) patterns.push({ name: "Double top (\"M\")", bias: "VENDA", description: "Dois máximos ao mesmo nível e quebra do suporte do meio: reversão para baixo." }); }
  if (hh.length >= 3) { const [l, h, r] = hh; const neck = Math.min(...lows.filter(x => x.i > l.i && x.i < r.i).map(x => x.p)); if (h.p > l.p * 1.03 && h.p > r.p * 1.03 && Math.abs(l.p - r.p) / price < 0.04 && isFinite(neck) && price < neck) patterns.push({ name: "Ombro-cabeça-ombro", bias: "VENDA", description: "Quebra da linha de ombros (neckline): um dos padrões mais fiáveis de venda." }); }
  const rng20 = six.slice(-20), rng60 = six.slice(-60, -20);
  const amp = (a: GCandle[]) => a.length ? (Math.max(...a.map(c => c.h)) - Math.min(...a.map(c => c.l))) / price : 0;
  if (rng60.length && amp(rng20) < amp(rng60) * 0.55 && kind !== "LATERAL") patterns.push({ name: "Triângulo (compressão)", bias: "NEUTRO", description: "Pausa na tendência com amplitude a estreitar; a quebra indica a direção seguinte." });
  if (kind === "LATERAL" && amp(six.slice(-60)) < 0.15) patterns.push({ name: "Retângulo", bias: brokeRes ? "COMPRA" : "NEUTRO", description: `Preço entre o piso ${support} e o teto ${resistance}; a quebra do teto é sinal de compra.` });
  const impulse = six.length > 35 ? six[six.length - 21].c / six[six.length - 36].c - 1 : 0;
  if (impulse > 0.10 && Math.abs(six[six.length - 1].c / six[six.length - 21].c - 1) < 0.04) patterns.push({ name: "Flag (bandeira)", bias: "COMPRA", description: `Subida forte (+${(impulse * 100).toFixed(0)}%) seguida de pausa curta: a subida tende a continuar.` });

  // ---------------- 6) SEMÁFORO ----------------
  const rows: SemaforoRow[] = [
    { n: 1, question: "Fundamentais (PER, ROE…)", light: fLight, reading: fVerdict },
    { n: 2, question: "Tendência (6 meses)", light: trendLight, reading: kind === "BULLISH" ? "Bullish" : kind === "BEARISH" ? "Bearish" : "Lateral" },
    { n: 3, question: "Suporte / resistência", light: levelLight, reading: situation.split(" — ")[0] },
    { n: 4, question: "Médias móveis", light: maLight, reading: priceAbove20 && priceAbove50 ? "Preço acima" : !priceAbove20 && !priceAbove50 ? "Preço abaixo" : "Em cima da média" },
    { n: 5, question: `${chosen} (segundo o ADX)`, light: oscLight, reading: oscLight === "VERDE" ? "Sinal de compra" : oscLight === "VERMELHO" ? "Sinal de venda" : "Sem sinal" },
  ];
  const greens = rows.filter(r => r.light === "VERDE").length, reds = rows.filter(r => r.light === "VERMELHO").length, yellows = 5 - greens - reds;
  const decision: GuideAnalysis["semaforo"]["decision"] = reds >= 2 ? "NÃO COMPRAR / VENDER" : greens >= 4 ? "COMPRAR" : "COMPRAR MENOS / ESPERAR CONFIRMAÇÃO";
  const decisionLight: Light = decision === "COMPRAR" ? "VERDE" : decision === "NÃO COMPRAR / VENDER" ? "VERMELHO" : "AMARELO";

  // ---------------- PLANO DE SAÍDA ----------------
  let stopLoss = Math.max(support * 0.995, price * 0.92); stopLoss = Math.min(stopLoss, price * 0.95);
  let target = Math.min(resistance > price * 1.04 ? resistance : price * 1.10, price * 1.10); target = Math.max(target, price * 1.08);
  const stopPct = (stopLoss / price - 1) * 100, targetPct = (target / price - 1) * 100;
  const exitRationale = `Stop loss a ${r2(stopLoss)} ${currency} (${stopPct.toFixed(1)}%; ${stopLoss < support ? "logo abaixo do suporte" : "dentro da regra 5–8%"}) e objetivo de ganho a ${r2(target)} ${currency} (+${targetPct.toFixed(1)}%; ${Math.abs(target - resistance) / price < 0.01 ? "perto da resistência" : "regra 8–10%"}). Rácio ganho/perda ${(targetPct / Math.abs(stopPct || 1)).toFixed(1)}:1.`;

  // ---------------- JUSTIFICAÇÃO ESCRITA ----------------
  const peerName = bestPeer ? bestPeer.name.replace(/\s+(SA|S\.A\.|SE|PLC|ASA|AG|N\.V\.).*$/i, "") : "concorrente";
  const buy = `Comprei ___ ações da ${name} a ${price} ${currency}, num montante de cerca de ___ ${currency} (___% da carteira). Do ponto de vista fundamental, a empresa apresenta um PER de ${fmt(f.per)}${peerMedian.per != null ? `, ${f.per != null && f.per < peerMedian.per ? "inferior" : "superior"} ao da ${peerName} (${fmt(bestPeer?.per ?? peerMedian.per)})` : ""}, e um ROE de ${fmt(f.roe)}%, o que indica ${f.roe != null && f.roe >= 12 ? "uma empresa rentável" : "rentabilidade moderada"}${f.per != null && peerMedian.per != null && f.per < peerMedian.per ? " a um preço razoável" : ""}. O dividend yield de ${fmt(f.dy, 2)}% ${f.dy != null && f.dy >= 3 ? "reforça o interesse" : "é modesto"}. Do ponto de vista técnico, no gráfico diário dos últimos 6 meses a ação apresenta tendência ${kind.toLowerCase()} (${contacts} pontos de contacto), o preço está ${priceAbove20 ? "acima" : "abaixo"} da MM20 e ${priceAbove50 ? "acima" : "abaixo"} da MM50${crossUpRecently ? " após cruzar a MM20 em alta" : ""}, e o ${chosen} ${oscLight === "VERDE" ? "deu sinal de compra" : oscLight === "VERMELHO" ? "mostra sinal de venda" : "não dá sinal claro"}. O preço encontra-se a ${pos52.toFixed(0)}% do intervalo de 52 semanas (${r2(low52)}–${r2(high52)} ${currency}), com margem de subida até à resistência de ${resistance} ${currency}. ${input.portfolioContext ?? `A ${name} representa o setor ${input.sector ?? "—"} na carteira, reforçando a diversificação.`} Defini um stop loss a ${r2(stopLoss)} ${currency} (${stopPct.toFixed(1)}%) e um objetivo de ganho a ${r2(target)} ${currency} (+${targetPct.toFixed(1)}%).`;
  const wait = `Não comprei a ${name} esta semana: ${kind === "BEARISH" ? "a tendência dos últimos 6 meses continua descendente" : kind === "LATERAL" ? "a tendência é lateral e indefinida" : "apesar da tendência positiva, faltam confirmações"}${!priceAbove50 ? " e o preço está abaixo da MM50" : ""}${oscLight !== "VERDE" ? `, e o ${chosen} ainda não deu sinal de compra` : ""}. Seguindo a regra de investir a favor da tendência (Teoria de Dow), aguardo confirmação, como ${chosen === "MACD" ? "um cruzamento do MACD em alta" : "o RSI a subir acima de 50"}${!priceAbove20 ? " e o preço a cruzar a MM20" : ""}, antes de entrar.`;

  const checklist = [
    { item: "Vi os fundamentais (PER, ROE, dividend yield) e comparei-os com uma concorrente.", done: fCount > 0 },
    { item: "Abri o gráfico diário de 6 meses e identifiquei a tendência.", done: n >= 60 },
    { item: "Identifiquei o suporte (chão) e a resistência (teto).", done: true },
    { item: "Vi as médias móveis (MM20 e MM50).", done: true },
    { item: "Vi o ADX e, consoante o valor, o MACD ou o RSI.", done: true },
    { item: "Defini o stop loss e o objetivo de ganho.", done: true },
    { item: "Confirmei que a compra mantém a carteira diversificada.", done: !!input.portfolioContext },
  ];

  return {
    fundamentals: { ...f, peers: input.peers, peerMedian, bestPeer, verdict: fVerdict, light: fLight, text: fText },
    trend: { kind, label: kind === "BULLISH" ? "Bullish (altista)" : kind === "BEARISH" ? "Bearish (baixista)" : "Lateral", contacts, confirmed, slopePctPerMonth: r2(slopePctPerMonth), higherHighs, higherLows, lowerHighs, lowerLows, change6mPct: r2(change6m), light: trendLight, action: trendAction, text: trendText },
    levels: { support, resistance, range52: { low: r2(low52), high: r2(high52), positionPct: r2(pos52) }, situation, light: levelLight, text: levelText },
    candles: { greens5, reds5, lastBig, dominance, text: candleText },
    movingAverages: { mm20, mm50, priceAbove20, priceAbove50, mm20Above50, crossUpRecently, crossDownRecently, signal: maSignal, light: maLight, text: maText },
    oscillator: { adx, adxReading, chosen, macd: { line: r2(macdLine[m]), signal: r2(sig[m]), hist: r2(hist[m]), crossUp, crossDown, histRising, divergence }, rsi, signal: oscSignal, light: oscLight, text: oscText },
    patterns,
    semaforo: { rows, greens, yellows, reds, decision, decisionLight },
    exitPlan: { stopLoss: r2(stopLoss), stopPct: r2(stopPct), target: r2(target), targetPct: r2(targetPct), rationale: exitRationale },
    justification: { buy, wait },
    checklist,
  };
}

/** Rendibilidade esperada a 12 meses (para carteiras): mistura prudente de momentum, dividendos, valor e qualidade. */
export function expectedReturn12m(p: { perf1y: number | null; perf6m: number | null; dy: number | null; per: number | null; roe: number | null; analystUpside: number | null; beta: number | null }): { expected: number; low: number; high: number; components: string } {
  const mom = Math.max(-15, Math.min(25, ((p.perf1y ?? 0) * 0.35 + (p.perf6m ?? 0) * 2 * 0.25))) * 0.4; // momentum encolhido
  const div = Math.min(p.dy ?? 0, 8);
  const value = p.per != null && p.per > 0 ? Math.max(-6, Math.min(6, (15 - p.per) * 0.4)) : 0;
  const quality = p.roe != null ? Math.max(-3, Math.min(5, (p.roe - 10) * 0.2)) : 0;
  const analyst = p.analystUpside != null ? Math.max(-10, Math.min(15, p.analystUpside * 0.3)) : 0;
  const equityPremium = 5.5 * (p.beta ?? 1);
  const expected = Math.max(-10, Math.min(30, equityPremium * 0.5 + mom + div + value + quality + analyst));
  const vol = 18 + Math.max(0, ((p.beta ?? 1) - 1) * 10);
  return { expected: Math.round(expected * 10) / 10, low: Math.round((expected - vol) * 10) / 10, high: Math.round((expected + vol) * 10) / 10, components: `prémio de risco ${(equityPremium * 0.5).toFixed(1)} + momentum ${mom.toFixed(1)} + dividendos ${div.toFixed(1)} + valor ${value.toFixed(1)} + qualidade ${quality.toFixed(1)} + analistas ${analyst.toFixed(1)}` };
}
