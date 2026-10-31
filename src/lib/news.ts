export interface NewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt: string; // ISO
  sentiment: "POSITIVA" | "NEGATIVA" | "NEUTRA";
  sentimentScore: number; // -1 .. 1
  thumbnail?: string;
  origin: "Yahoo Finance" | "Google Notícias";
}

export interface NewsSentimentSummary {
  items: NewsItem[];
  positive: number;
  negative: number;
  neutral: number;
  score: number; // -100 .. 100
  label: "Fluxo Noticioso Muito Positivo" | "Fluxo Noticioso Positivo" | "Fluxo Noticioso Neutro" | "Fluxo Noticioso Negativo" | "Fluxo Noticioso Muito Negativo";
  scoreImpact: number; // contribution to final score (-8 .. +8)
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const POSITIVE_WORDS = [
  "sobe", "subida", "dispara", "recorde", "lucro", "lucros", "crescimento", "cresce", "ganhos", "ganha", "valoriza", "valorização",
  "upgrade", "compra", "comprar", "otimista", "otimismo", "dividendo", "dividendos", "supera", "superou", "bate", "expansão", "acordo",
  "aprovado", "forte", "robusto", "máximo", "máximos", "recupera", "recuperação", "rally", "alta", "melhora", "positivo", "bull",
  "beats", "surge", "soars", "jumps", "rises", "record", "profit", "growth", "upgrade", "buy", "outperform", "strong", "gains", "rally",
  "bullish", "boost", "wins", "high", "tops", "raises", "dividend", "expands", "approval", "breakout", "optimistic"
];

const NEGATIVE_WORDS = [
  "cai", "queda", "desce", "afunda", "tomba", "perde", "perdas", "prejuízo", "prejuízos", "recua", "desvaloriza", "desvalorização",
  "downgrade", "venda", "vender", "pessimista", "pessimismo", "alerta", "risco", "riscos", "investigação", "multa", "processo", "crise",
  "corte", "cortes", "despedimentos", "falha", "falhou", "mínimo", "mínimos", "fraco", "fraca", "abaixo", "negativo", "dívida", "bear",
  "falls", "drops", "plunges", "slides", "sinks", "tumbles", "loss", "losses", "misses", "downgrade", "sell", "underperform", "weak",
  "lawsuit", "probe", "fine", "cuts", "layoffs", "warning", "recall", "bearish", "low", "slump", "crash", "debt", "fraud", "decline"
];

function scoreSentiment(text: string): number {
  const t = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ")} `;
  let pos = 0;
  let neg = 0;
  for (const w of POSITIVE_WORDS) if (t.includes(` ${w} `)) pos++;
  for (const w of NEGATIVE_WORDS) if (t.includes(` ${w} `)) neg++;
  if (pos === 0 && neg === 0) return 0;
  return Math.max(-1, Math.min(1, (pos - neg) / Math.max(1, pos + neg)));
}

function decodeHtml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function withTimeout(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

async function fetchYahooNews(query: string): Promise<NewsItem[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=0&newsCount=10`;
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: withTimeout(5000), next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = await res.json();
    const news = data?.news || [];
    return news.map((n: any) => {
      const s = scoreSentiment(n.title || "");
      return {
        title: n.title,
        link: n.link,
        source: n.publisher || "Yahoo Finance",
        publishedAt: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : new Date().toISOString(),
        sentiment: s > 0.15 ? "POSITIVA" : s < -0.15 ? "NEGATIVA" : "NEUTRA",
        sentimentScore: s,
        thumbnail: n.thumbnail?.resolutions?.find((r: any) => r.width <= 200)?.url || n.thumbnail?.resolutions?.[0]?.url,
        origin: "Yahoo Finance" as const
      };
    });
  } catch {
    return [];
  }
}

async function fetchGoogleNews(query: string, lang: "pt-PT" | "pt-BR" | "en-US"): Promise<NewsItem[]> {
  try {
    const locale = lang === "pt-PT" ? "hl=pt-PT&gl=PT&ceid=PT:pt-150" : lang === "pt-BR" ? "hl=pt-BR&gl=BR&ceid=BR:pt-419" : "hl=en-US&gl=US&ceid=US:en";
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${locale}`;
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: withTimeout(5000), next: { revalidate: 300 } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.split("<item>").slice(1, 13);
    return items.map((raw) => {
      const title = decodeHtml((raw.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "");
      const link = decodeHtml((raw.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "");
      const pub = (raw.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "";
      const source = decodeHtml((raw.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || "Google Notícias");
      const cleanTitle = title.replace(/\s-\s[^-]+$/, "");
      const s = scoreSentiment(cleanTitle);
      return {
        title: cleanTitle,
        link,
        source,
        publishedAt: pub ? new Date(pub).toISOString() : new Date().toISOString(),
        sentiment: s > 0.15 ? "POSITIVA" : s < -0.15 ? "NEGATIVA" : "NEUTRA",
        sentimentScore: s,
        origin: "Google Notícias" as const
      } as NewsItem;
    }).filter(n => n.title && n.link);
  } catch {
    return [];
  }
}

export async function fetchStockNews(symbol: string, companyName?: string): Promise<NewsSentimentSummary> {
  const sym = symbol.toUpperCase();
  const base = sym.replace(/\..*$/, "");
  const name = (companyName || base).replace(/\s+(Inc\.?|Corp\.?|Corporation|S\.A\.|SA|SGPS|PLC|N\.V\.|SE|AG|Ltd\.?|Holding[s]?)\b.*$/i, "").trim();

  const isPT = sym.endsWith(".LS");
  const isBR = sym.endsWith(".SA");
  const gLang: "pt-PT" | "pt-BR" | "en-US" = isPT ? "pt-PT" : isBR ? "pt-BR" : "en-US";
  const gQuery = isPT || isBR ? `${name} ações` : `${name} stock`;

  const [yahooByTicker, yahooByName, google, googlePT] = await Promise.all([
    fetchYahooNews(sym),
    fetchYahooNews(name),
    fetchGoogleNews(gQuery, gLang),
    gLang === "en-US" ? fetchGoogleNews(`${name} ações`, "pt-PT") : Promise.resolve([] as NewsItem[])
  ]);

  // Merge & dedupe by normalized title
  const seen = new Set<string>();
  const merged: NewsItem[] = [];
  for (const n of [...yahooByTicker, ...yahooByName, ...google, ...googlePT]) {
    const key = n.title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").slice(0, 60);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(n);
  }
  merged.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const items = merged.slice(0, 14);

  const positive = items.filter(i => i.sentiment === "POSITIVA").length;
  const negative = items.filter(i => i.sentiment === "NEGATIVA").length;
  const neutral = items.length - positive - negative;

  // Recency-weighted score
  const now = Date.now();
  let weighted = 0;
  let weightSum = 0;
  for (const i of items) {
    const ageDays = Math.max(0, (now - new Date(i.publishedAt).getTime()) / 86400000);
    const w = 1 / (1 + ageDays / 7);
    weighted += i.sentimentScore * w;
    weightSum += w;
  }
  const score = weightSum > 0 ? Math.round((weighted / weightSum) * 100) : 0;

  let label: NewsSentimentSummary["label"] = "Fluxo Noticioso Neutro";
  if (score >= 40) label = "Fluxo Noticioso Muito Positivo";
  else if (score >= 12) label = "Fluxo Noticioso Positivo";
  else if (score <= -40) label = "Fluxo Noticioso Muito Negativo";
  else if (score <= -12) label = "Fluxo Noticioso Negativo";

  const scoreImpact = Math.max(-8, Math.min(8, Math.round(score / 12)));

  return { items, positive, negative, neutral, score, label, scoreImpact };
}
