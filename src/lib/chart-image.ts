import sharp from "sharp";
import type { Verdict } from "./engine";

export type ImageSignal = {
  id: string;
  name: string;
  value: string;
  bias: number;
  weight: number;
  detail: string;
};

export type LevelLine = { price: number; touches: number; kind: "suporte" | "resistência" };

export type ChartImageReport = {
  ok: boolean;
  verdict: Verdict;
  verdictLabel: string;
  verdictEmoji: string;
  score: number;
  confidence: number;
  probabilityUp: number;
  headline: string;
  summary: string;
  rationale: string[];
  risks: string[];
  signals: ImageSignal[];
  metrics: {
    width: number;
    height: number;
    plotArea: { x0: number; y0: number; x1: number; y1: number };
    candleColumns: number;
    greenRatio: number;
    redRatio: number;
    greenShareRecent: number;
    redShareRecent: number;
    trendSlopePct: number;
    trendR2: number;
    recentSlopePct: number;
    earlySlopePct: number;
    positionInRange: number;
    volatilityPct: number;
    maxDrawdownPct: number;
    rallyFromLowPct: number;
    dropFromHighPct: number;
    chartType: "velas" | "linha" | "indefinido";
    colorCoverage: number;
    levels: LevelLine[];
    reconstructed: { x: number; y: number }[];
  };
  notes: string[];
  qualityWarnings: string[];
  llm?: { provider: string; text: string } | null;
};

type RGB = { r: number; g: number; b: number };

function rgbToHsl({ r, g, b }: RGB) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function regression(ys: number[]) {
  const n = ys.length;
  if (n < 3) return { slope: 0, intercept: 0, r2: 0 };
  let sx = 0; let sy = 0; let sxy = 0; let sxx = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += ys[i]; sxy += i * ys[i]; sxx += i * i; }
  const den = n * sxx - sx * sx;
  if (!den) return { slope: 0, intercept: sy / n, r2: 0 };
  const slope = (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  const mean = sy / n;
  let ssRes = 0; let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * i + intercept;
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - mean) ** 2;
  }
  return { slope, intercept, r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot };
}

function clamp(n: number, lo = -100, hi = 100) { return Math.max(lo, Math.min(hi, n)); }
function fmt(n: number, d = 2) { return Number.isFinite(n) ? n.toFixed(d) : "—"; }

const MAX_W = 1100;

/**
 * Reconstrói a série de preços a partir de uma fotografia/captura de gráfico
 * e devolve uma leitura técnica completa.
 */
export async function analyzeChartImage(buf: Buffer, fileName?: string): Promise<ChartImageReport> {
  const image = sharp(buf).rotate();
  const meta = await image.metadata();
  const resized = await image
    .resize({ width: Math.min(meta.width ?? MAX_W, MAX_W), withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = resized;
  const W = info.width;
  const H = info.height;
  const channels = info.channels as number;

  // -------- fundo dominante --------
  const buckets = new Map<number, number>();
  for (let i = 0; i < W * H; i++) {
    const o = i * channels;
    const key = ((data[o] >> 4) << 8) | ((data[o + 1] >> 4) << 4) | (data[o + 2] >> 4);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  let bgKey = 0;
  let bgCount = 0;
  for (const [k, c] of buckets) if (c > bgCount) { bgCount = c; bgKey = k; }
  const bgR = ((bgKey >> 8) & 15) * 16 + 8;
  const bgG = ((bgKey >> 4) & 15) * 16 + 8;
  const bgB = (bgKey & 15) * 16 + 8;
  const bgLum = (bgR * 0.299 + bgG * 0.587 + bgB * 0.114);
  const darkTheme = bgLum < 90;

  // -------- máscaras por coluna --------
  type Col = {
    green: number[]; red: number[]; other: number[];
    minY: number; maxY: number;
    greenCount: number; redCount: number; otherCount: number;
  };
  const cols: Col[] = Array.from({ length: W }, () => ({
    green: [], red: [], other: [],
    minY: H, maxY: -1, greenCount: 0, redCount: 0, otherCount: 0,
  }));

  let coloredTotal = 0;
  let contentTotal = 0;
  let firstX = W; let lastX = 0; let firstY = H; let lastY = 0;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * channels;
      const r = data[o]; const g = data[o + 1]; const b = data[o + 2];
      const dist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
      if (dist < 34) continue; // fundo
      const { h, s, l } = rgbToHsl({ r, g, b });
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      // descarta texto/grades muito claros ou quase iguais ao fundo
      const isFaint = Math.abs(lum - bgLum) < 26;
      const c = cols[x];
      let kind: "green" | "red" | "other" = "other";
      if (s > 0.28 && h >= 65 && h <= 175) kind = "green";
      else if (s > 0.28 && (h <= 26 || h >= 330)) kind = "red";
      else if (s > 0.3 && h > 175 && h <= 265) kind = "other";
      else if (isFaint) continue;

      if (kind === "green") { c.green.push(y); c.greenCount++; coloredTotal++; }
      else if (kind === "red") { c.red.push(y); c.redCount++; coloredTotal++; }
      else { c.other.push(y); c.otherCount++; }

      const isGrid = s < 0.12 && isFaint;
      if (!isGrid) {
        contentTotal++;
        c.minY = Math.min(c.minY, y);
        c.maxY = Math.max(c.maxY, y);
        if (x < firstX) firstX = x;
        if (x > lastX) lastX = x;
        if (y < firstY) firstY = y;
        if (y > lastY) lastY = y;
      }
    }
  }

  const colorCoverage = coloredTotal / Math.max(1, W * H);
  const contentCoverage = contentTotal / Math.max(1, W * H);

  if (contentCoverage < 0.004 || lastX <= firstX + 20) {
    return emptyReport(W, H, fileName, [
      "Não consegui isolar um gráfico nesta imagem — demasiado pouco contraste ou conteúdo.",
      "Tenta uma captura com as velas/linha bem visíveis e sem filtros.",
    ]);
  }

  // -------- área de plotagem (corta ~10% à direita = eixo de preços, ~8% em baixo = eixo temporal) --------
  const padR = Math.max(8, Math.round((lastX - firstX) * 0.085));
  const padB = Math.max(6, Math.round((lastY - firstY) * 0.07));
  const x0 = firstX;
  const x1 = Math.max(firstX + 20, lastX - padR);
  const y0 = firstY;
  const y1 = Math.max(firstY + 12, lastY - padB);
  const plotH = Math.max(1, y1 - y0);

  const isCandleChart = colorCoverage > 0.006 && (coloredTotal > 250);
  const chartType: "velas" | "linha" | "indefinido" = isCandleChart
    ? "velas"
    : contentCoverage > 0.004
      ? "linha"
      : "indefinido";

  // -------- reconstrução da série --------
  const series: { x: number; y: number; green: number; red: number; total: number }[] = [];
  for (let x = x0; x <= x1; x++) {
    const c = cols[x];
    const pts: number[] = [];
    const useColor = isCandleChart;
    if (useColor) {
      pts.push(...c.green, ...c.red);
      if (!pts.length) pts.push(...c.other.filter((y) => y >= y0 - 4 && y <= y1 + 4));
    } else {
      pts.push(...c.green, ...c.red, ...c.other.filter((y) => y >= y0 - 4 && y <= y1 + 4));
    }
    if (!pts.length) continue;
    const valid = pts.filter((y) => y >= y0 - 6 && y <= y1 + 6);
    const use = valid.length ? valid : pts;
    // centro de massa: aproxima o "fecho" da vela
    let sum = 0;
    for (const y of use) sum += y;
    const meanY = sum / use.length;
    series.push({
      x,
      y: meanY,
      green: c.greenCount,
      red: c.redCount,
      total: c.greenCount + c.redCount + c.otherCount,
    });
  }

  if (series.length < 25) {
    return emptyReport(W, H, fileName, [
      `Só consegui reconstruir ${series.length} colunas de dados — insuficiente para uma leitura fiável.`,
      "Garante que o gráfico ocupa a maior parte da fotografia e está direito (sem rotação).",
    ]);
  }

  // -------- normalizar para "preço" (y invertido) --------
  const ys = series.map((s) => s.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanY = Math.max(1, maxY - minY);
  const prices = ys.map((y) => (1 - (y - minY) / spanY) * 100); // 0..100 normalizado

  const reg = regression(prices);
  const n = prices.length;
  const early = prices.slice(0, Math.floor(n * 0.4));
  const recent = prices.slice(Math.floor(n * 0.6));
  const regEarly = regression(early);
  const regRecent = regression(recent);

  const trendSlopePct = reg.slope * (n - 1); // variação total normalizada
  const recentSlopePct = regRecent.slope * Math.max(1, recent.length - 1);
  const earlySlopePct = regEarly.slope * Math.max(1, early.length - 1);

  // resíduos -> volatilidade
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const pred = reg.slope * i + reg.intercept;
    ss += (prices[i] - pred) ** 2;
  }
  const residualStd = Math.sqrt(ss / n);
  const volatilityPct = (residualStd / spanY) * 100 * 4;

  // drawdown / rally sobre a série reconstruída
  let peak = -Infinity; let dd = 0;
  let trough = Infinity; let rally = 0;
  for (const p of prices) {
    peak = Math.max(peak, p);
    dd = Math.min(dd, p - peak);
    trough = Math.min(trough, p);
    rally = Math.max(rally, p - trough);
  }

  const lastPrice = prices[n - 1];
  const positionInRange = (lastPrice - Math.min(...prices)) / Math.max(0.0001, Math.max(...prices) - Math.min(...prices));

  // -------- rácios de cor --------
  let greenTotal = 0; let redTotal = 0;
  let greenRecent = 0; let redRecent = 0;
  const recentStart = Math.floor(n * 0.66);
  series.forEach((s, i) => {
    greenTotal += s.green;
    redTotal += s.red;
    if (i >= recentStart) { greenRecent += s.green; redRecent += s.red; }
  });
  const colorSum = greenTotal + redTotal;
  const greenRatio = colorSum ? greenTotal / colorSum : 0.5;
  const redRatio = colorSum ? redTotal / colorSum : 0.5;
  const recentSum = greenRecent + redRecent;
  const greenShareRecent = recentSum ? greenRecent / recentSum : greenRatio;
  const redShareRecent = recentSum ? redRecent / recentSum : redRatio;

  // -------- níveis horizontais (agrupamento de densidade em Y) --------
  const hist = new Array(60).fill(0);
  for (let x = x0; x <= x1; x++) {
    const c = cols[x];
    const all = isCandleChart ? [...c.green, ...c.red] : [...c.green, ...c.red, ...c.other];
    for (const y of all) {
      if (y < y0 - 6 || y > y1 + 6) continue;
      const b = Math.floor(((y - y0) / plotH) * 59);
      if (b >= 0 && b < 60) hist[b]++;
    }
  }
  const histMax = Math.max(...hist, 1);
  const levels: LevelLine[] = [];
  for (let b = 1; b < 59; b++) {
    if (hist[b] > histMax * 0.55 && hist[b] >= hist[b - 1] && hist[b] >= hist[b + 1]) {
      const norm = 1 - b / 59;
      const priceNorm = norm * 100;
      const kind: "suporte" | "resistência" = priceNorm < lastPrice ? "suporte" : "resistência";
      const exists = levels.find((l) => Math.abs(l.price - priceNorm) < 4);
      if (exists) exists.touches += 1;
      else levels.push({ price: Math.round(priceNorm * 10) / 10, touches: 1, kind });
    }
  }
  levels.sort((a, b) => b.touches - a.touches);
  const topLevels = levels.slice(0, 6);

  // -------- sinais --------
  const signals: ImageSignal[] = [];
  const addS = (s: ImageSignal) => { s.bias = clamp(s.bias); signals.push(s); };

  addS({
    id: "trend",
    name: "Inclinação da tendência",
    value: `${trendSlopePct > 0 ? "+" : ""}${fmt(trendSlopePct, 1)}% no período`,
    bias: clamp(trendSlopePct * 2.4),
    weight: 1,
    detail:
      trendSlopePct > 8
        ? "A regressão linear da série reconstruída aponta para uma subida clara ao longo de todo o gráfico."
        : trendSlopePct < -8
          ? "A regressão linear da série reconstruída aponta para uma descida clara ao longo de todo o gráfico."
          : "A regressão linear é praticamente plana: mercado lateral, sem direção definida.",
  });

  addS({
    id: "recent",
    name: "Momento recente (últimos 40%)",
    value: `${recentSlopePct > 0 ? "+" : ""}${fmt(recentSlopePct, 1)}%`,
    bias: clamp(recentSlopePct * 3.4),
    weight: 0.95,
    detail:
      recentSlopePct > earlySlopePct + 4
        ? "O segmento final está mais inclinado para cima do que o inicial — aceleração compradora."
        : recentSlopePct < earlySlopePct - 4
          ? "O segmento final está mais inclinado para baixo do que o inicial — perda de força / aceleração vendedora."
          : "O ritmo recente é semelhante ao do início do gráfico.",
  });

  addS({
    id: "quality",
    name: "Qualidade da tendência (R²)",
    value: fmt(reg.r2, 2),
    bias: 0,
    weight: 0.3,
    detail:
      reg.r2 > 0.7
        ? "Movimento muito limpo e direcional — a tendência é de alta fiabilidade."
        : reg.r2 > 0.4
          ? "Movimento direcional com ruído moderado."
          : "Movimento errático: a leitura de tendência tem pouca fiabilidade estatística.",
  });

  if (isCandleChart && colorSum > 200) {
    addS({
      id: "colors",
      name: "Pressão compradora vs vendedora",
      value: `${fmt(greenRatio * 100, 0)}% verdes / ${fmt(redRatio * 100, 0)}% vermelhas`,
      bias: clamp((greenRatio - 0.5) * 180),
      weight: 0.85,
      detail:
        greenRatio > 0.58
          ? "Predomínio claro de velas verdes: os compradores dominaram o período analisado."
          : greenRatio < 0.42
            ? "Predomínio claro de velas vermelhas: os vendedores dominaram o período analisado."
            : "Equilíbrio entre velas verdes e vermelhas — disputa sem vencedor claro.",
    });
    addS({
      id: "colorsRecent",
      name: "Cor das velas no terço final",
      value: `${fmt(greenShareRecent * 100, 0)}% verdes`,
      bias: clamp((greenShareRecent - 0.5) * 200),
      weight: 0.8,
      detail:
        greenShareRecent > 0.6
          ? "O final do gráfico é dominado por velas verdes — pressão compradora atual."
          : greenShareRecent < 0.4
            ? "O final do gráfico é dominado por velas vermelhas — pressão vendedora atual."
            : "Cores equilibradas no final do gráfico.",
    });
  }

  addS({
    id: "position",
    name: "Posição do último preço no intervalo",
    value: `${fmt(positionInRange * 100, 0)}% do intervalo`,
    bias: positionInRange > 0.85 ? -22 : positionInRange < 0.15 ? 22 : clamp((positionInRange - 0.5) * 60),
    weight: 0.5,
    detail:
      positionInRange > 0.9
        ? "O preço atual está no topo do intervalo visível: força, mas também extensão — risco de pullback."
        : positionInRange < 0.1
          ? "O preço atual está no fundo do intervalo visível: fraqueza, mas possível zona de sobrevenda."
          : "O preço atual está numa zona intermédia do intervalo visível.",
  });

  addS({
    id: "drawdown",
    name: "Correção / recuperação",
    value: `rally ${fmt(rally, 1)}% · queda ${fmt(dd, 1)}%`,
    bias: dd < -35 && positionInRange < 0.35 ? 15 : rally > 45 && positionInRange > 0.8 ? -12 : 0,
    weight: 0.4,
    detail: `Desde o topo reconstruído a série cedeu ${fmt(Math.abs(dd), 1)}% do intervalo; desde o fundo recuperou ${fmt(rally, 1)}%.`,
  });

  addS({
    id: "volatility",
    name: "Volatilidade residual",
    value: `${fmt(volatilityPct, 1)}%`,
    bias: 0,
    weight: 0.25,
    detail:
      volatilityPct > 25
        ? "Série muito volátil — movimentos bruscos; reduz o tamanho da posição."
        : volatilityPct < 8
          ? "Série calma e ordenada — movimento mais sustentável."
          : "Volatilidade normal para o período.",
  });

  // -------- pontuação --------
  let w = 0; let tw = 0; let agree = 0;
  for (const s of signals) { w += s.bias * s.weight; tw += s.weight; }
  const raw = tw ? w / tw : 0;
  for (const s of signals) if (Math.sign(s.bias) === Math.sign(raw) && s.bias !== 0) agree += s.weight;
  const score = Math.round(clamp(raw) * 10) / 10;
  const verdict: Verdict = score >= 12 ? "SUBIR" : score <= -12 ? "DESCER" : "NEUTRO";

  const sampleQuality = Math.min(1, series.length / 220);
  const colorQuality = isCandleChart ? Math.min(1, colorSum / 3000) : 0.4;
  const confidence = Math.round(
    clamp(
      (tw ? (agree / tw) * 100 : 0) * 0.45 +
        Math.min(Math.abs(score), 100) * 0.35 +
        sampleQuality * 12 +
        colorQuality * 8 +
        Math.min(reg.r2, 1) * 12,
      5,
      96,
    ),
  );
  const probabilityUp = Math.round(50 + Math.tanh(score / 55) * 30);

  const qualityWarnings: string[] = [];
  if (!isCandleChart) qualityWarnings.push("Não detetei velas verdes/vermelhas suficientes — analisei o gráfico como uma linha de preço. A leitura de pressão compradora/vendedora fica limitada.");
  if (darkTheme) qualityWarnings.push("Tema escuro detetado; o contraste foi compensado automaticamente.");
  if (series.length < 80) qualityWarnings.push(`Apenas ${series.length} colunas reconstruídas — resolução baixa reduz a precisão.`);
  if (reg.r2 < 0.35) qualityWarnings.push("Série muito ruidosa (R² baixo): a direção tem pouca robustez estatística.");
  if (colorCoverage > 0.35) qualityWarnings.push("Grande parte da imagem é colorida — pode haver sobreposição de indicadores ou anotações a contaminar a leitura.");

  const notes = [
    `Área de plotagem estimada: ${x1 - x0}px × ${y1 - y0}px dentro de ${W}×${H}px.`,
    `Tipo de gráfico inferido: ${chartType === "velas" ? "velas (candlestick)" : chartType === "linha" ? "linha/área" : "indefinido"}.`,
    "Valores de preço são normalizados (0–100) porque a imagem não contém a escala numérica legível.",
  ];

  const rationale = [...signals]
    .sort((a, b) => Math.abs(b.bias) * b.weight - Math.abs(a.bias) * a.weight)
    .slice(0, 5)
    .map((s) => `${s.name}: ${s.detail}`);

  const risks = [
    "Leitura puramente técnica sobre uma imagem: sem dados de volume reais, fundamental ou contexto de notícias.",
    reg.r2 < 0.5 ? "Tendência pouco limpa — probabilidade elevada de falsos sinais." : "Confirma sempre com os dados em tempo real da plataforma.",
    positionInRange > 0.9 ? "Preço no topo do intervalo: entrar aqui é comprar força já esticada." : "Usa stop abaixo do último suporte identificado.",
  ];

  const dirTxt =
    verdict === "SUBIR" ? "espero que SUBA" : verdict === "DESCER" ? "espero que DESÇA" : "não vejo direção clara — espero LATERALIZAÇÃO";

  const headline =
    verdict === "SUBIR"
      ? `Gráfico construtivo: ${dirTxt} (score +${fmt(score, 1)})`
      : verdict === "DESCER"
        ? `Gráfico deteriorado: ${dirTxt} (score ${fmt(score, 1)})`
        : `Gráfico ambíguo: ${dirTxt} (score ${fmt(score, 1)})`;

  const summary = [
    `Analisei a imagem${fileName ? ` "${fileName}"` : ""} e reconstruí ${series.length} pontos de preço a partir de ${W}×${H}px.`,
    `A tendência global é de ${trendSlopePct > 3 ? "subida" : trendSlopePct < -3 ? "descida" : "lateral"} (${fmt(trendSlopePct, 1)}% no período, R² ${fmt(reg.r2, 2)}) e o terço final move-se ${fmt(recentSlopePct, 1)}%.`,
    isCandleChart && colorSum > 200
      ? `As velas verdes representam ${fmt(greenRatio * 100, 0)}% da área colorida (${fmt(greenShareRecent * 100, 0)}% no terço final).`
      : "Não foi possível medir o rácio de velas verdes/vermelhas com confiança.",
    `O último ponto está em ${fmt(positionInRange * 100, 0)}% do intervalo visível.`,
    `Conclusão: ${dirTxt} — pontuação ${score > 0 ? "+" : ""}${fmt(score, 1)}/100, confiança ${confidence}%, probabilidade de subida ${probabilityUp}%.`,
    topLevels.length
      ? `Níveis horizontais relevantes (escala normalizada): ${topLevels.slice(0, 4).map((l) => `${l.kind} ${fmt(l.price, 0)}`).join(", ")}.`
      : "",
  ].filter(Boolean).join(" ");

  return {
    ok: true,
    verdict,
    verdictLabel:
      verdict === "SUBIR" ? "Expectativa de subida" : verdict === "DESCER" ? "Expectativa de descida" : "Neutro / aguardar",
    verdictEmoji: verdict === "SUBIR" ? "▲" : verdict === "DESCER" ? "▼" : "◆",
    score,
    confidence,
    probabilityUp,
    headline,
    summary,
    rationale,
    risks,
    signals,
    metrics: {
      width: W,
      height: H,
      plotArea: { x0, y0, x1, y1 },
      candleColumns: series.length,
      greenRatio,
      redRatio,
      greenShareRecent,
      redShareRecent,
      trendSlopePct,
      trendR2: reg.r2,
      recentSlopePct,
      earlySlopePct,
      positionInRange,
      volatilityPct,
      maxDrawdownPct: dd,
      rallyFromLowPct: rally,
      dropFromHighPct: dd,
      chartType,
      colorCoverage,
      levels: topLevels,
      reconstructed: series.filter((_, i) => i % Math.max(1, Math.floor(n / 120)) === 0).map((s, i) => ({ x: i, y: Math.round(prices[i % prices.length] * 100) / 100 })),
    },
    notes,
    qualityWarnings,
    llm: null,
  };
}

function emptyReport(W: number, H: number, fileName?: string | undefined, notes: string[] = []): ChartImageReport {
  return {
    ok: false,
    verdict: "NEUTRO",
    verdictLabel: "Sem leitura possível",
    verdictEmoji: "◆",
    score: 0,
    confidence: 0,
    probabilityUp: 50,
    headline: "Não consegui ler o gráfico desta imagem",
    summary: notes.join(" "),
    rationale: [],
    risks: ["Sem dados suficientes para qualquer recomendação."],
    signals: [],
    metrics: {
      width: W, height: H,
      plotArea: { x0: 0, y0: 0, x1: 0, y1: 0 },
      candleColumns: 0, greenRatio: 0, redRatio: 0, greenShareRecent: 0, redShareRecent: 0,
      trendSlopePct: 0, trendR2: 0, recentSlopePct: 0, earlySlopePct: 0,
      positionInRange: 0.5, volatilityPct: 0, maxDrawdownPct: 0, rallyFromLowPct: 0, dropFromHighPct: 0,
      chartType: "indefinido", colorCoverage: 0, levels: [], reconstructed: [],
    },
    notes: fileName ? [`Ficheiro: ${fileName}`] : [],
    qualityWarnings: notes,
    llm: null,
  };
}
