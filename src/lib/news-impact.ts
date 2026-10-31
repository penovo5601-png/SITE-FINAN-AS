import type { NewsArticle, StockNewsFeed } from "./news";

export type ScoredArticle = NewsArticle & {
  sentiment: "POSITIVA" | "NEGATIVA" | "NEUTRA";
  sentimentScore: number;
  ageHours: number;
  impactWeight: number; // 1 (<=24h) | 0.75 (<=48h) | 0.4 (<=72h) | 0 (>72h)
  isStale: boolean;
};

export type NewsImpact = {
  articles: ScoredArticle[];
  freshCount: number;
  staleCount: number;
  positive: number;
  negative: number;
  neutral: number;
  score: number; // -100..100, só notícias <= 72h
  label: string;
};

const POS = ["sobe","subida","dispara","recorde","lucro","lucros","crescimento","cresce","ganhos","valoriza","valorização","upgrade","compra","comprar","otimista","dividendo","dividendos","supera","superou","bate","expansão","acordo","aprovado","forte","robusto","máximo","máximos","recupera","recuperação","rally","alta","melhora","positivo","beats","surge","soars","jumps","rises","record","profit","growth","buy","outperform","strong","gains","bullish","boost","wins","high","tops","raises","dividend","expands","approval","breakout","optimistic"];
const NEG = ["cai","queda","desce","afunda","tomba","perde","perdas","prejuízo","prejuízos","recua","desvaloriza","desvalorização","downgrade","venda","vender","pessimista","alerta","risco","riscos","investigação","multa","processo","crise","corte","cortes","despedimentos","falha","falhou","mínimo","mínimos","fraco","fraca","abaixo","negativo","dívida","falls","drops","plunges","slides","sinks","tumbles","loss","losses","misses","sell","underperform","weak","lawsuit","probe","fine","cuts","layoffs","warning","recall","bearish","low","slump","crash","debt","fraud","decline"];

export function newsImpactWeight(ageHours: number): number {
  if (ageHours <= 24) return 1;
  if (ageHours <= 48) return 0.75;
  if (ageHours <= 72) return 0.4;
  return 0;
}

function sentimentOf(title: string): number {
  const t = ` ${title.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ")} `;
  let p = 0, n = 0;
  for (const w of POS) if (t.includes(` ${w} `)) p++;
  for (const w of NEG) if (t.includes(` ${w} `)) n++;
  return p + n ? Math.max(-1, Math.min(1, (p - n) / (p + n))) : 0;
}

export function scoreNewsImpact(feed: StockNewsFeed | null | undefined, now = Date.now()): NewsImpact {
  const articles: ScoredArticle[] = (feed?.articles ?? []).map((a) => {
    const s = sentimentOf(a.title);
    const ageHours = Math.max(0, (now - Date.parse(a.publishedAt)) / 3_600_000);
    const impactWeight = Number.isFinite(ageHours) ? newsImpactWeight(ageHours) : 0;
    return { ...a, sentiment: s > 0.15 ? "POSITIVA" : s < -0.15 ? "NEGATIVA" : "NEUTRA", sentimentScore: s, ageHours: Math.round(ageHours), impactWeight, isStale: impactWeight === 0 };
  });
  const fresh = articles.filter((a) => a.impactWeight > 0);
  let num = 0, den = 0;
  for (const a of fresh) { num += a.sentimentScore * a.impactWeight; den += a.impactWeight; }
  const score = den ? Math.round((num / den) * 100) : 0;
  const positive = fresh.filter((a) => a.sentiment === "POSITIVA").length;
  const negative = fresh.filter((a) => a.sentiment === "NEGATIVA").length;
  const label = fresh.length === 0 ? "Sem notícias nas últimas 72h com impacto" : score >= 40 ? "Fluxo noticioso muito positivo" : score >= 12 ? "Fluxo noticioso positivo" : score <= -40 ? "Fluxo noticioso muito negativo" : score <= -12 ? "Fluxo noticioso negativo" : "Fluxo noticioso neutro";
  return { articles, freshCount: fresh.length, staleCount: articles.length - fresh.length, positive, negative, neutral: fresh.length - positive - negative, score, label };
}
