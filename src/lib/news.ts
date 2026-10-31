import { XMLParser } from "fast-xml-parser";
import { filterRecentNews, MAX_NEWS_HOURS, HOUR_MS } from "./news-policy";

export type NewsArticle = {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  language: string;
  via: "Yahoo Finance" | "Google News";
};
export type StockNewsFeed = {
  symbol: string;
  company: string;
  status: "ok" | "empty" | "unavailable";
  articles: NewsArticle[];
  fetchedAt: string;
  stale: boolean;
  searchUrl: string;
  message: string;
  windowHours: number;
  windowStart: string;
  asOf: string;
  excludedByAge: number;
};
export type NewsIdentity = { symbol: string; name?: string | null; countryCode?: string | null };
const TTL = 10 * 60 * 1000;
const cache = new Map<string, { at: number; data: StockNewsFeed }>();
const inflight = new Map<string, Promise<StockNewsFeed>>();
const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
  isArray: (tag: string) => tag === "item",
});

const aliases: Record<string, string> = {
  AAPL: "Apple", MSFT: "Microsoft", NVDA: "Nvidia", TSLA: "Tesla", AMZN: "Amazon", GOOGL: "Alphabet Google", GOOG: "Alphabet Google",
  META: "Meta Platforms", "BCP.LS": "Banco Comercial Português", "EDP.LS": "EDP", "EDPR.LS": "EDP Renováveis",
  "GAL.LS": "Galp", "GALP.LS": "Galp", "JMT.LS": "Jerónimo Martins", "MCP.LS": "Mota-Engil", "EGL.LS": "Mota-Engil",
  "NVG.LS": "Navigator", "SON.LS": "Sonae", "CORT.LS": "Corticeira Amorim", "PETR4.SA": "Petrobras", "PETR3.SA": "Petrobras",
  "VALE3.SA": "Vale", "ITUB4.SA": "Itaú Unibanco", "7203.T": "Toyota", "SIE.DE": "Siemens", "MC.PA": "LVMH", "AIR.PA": "Airbus",
};

function text(value: unknown): string {
  if (typeof value === "string") return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  if (value && typeof value === "object" && "#text" in value) return text((value as Record<string, unknown>)["#text"]);
  return "";
}
function safeUrl(value: unknown): string | null {
  try { const u = new URL(text(value)); return u.protocol === "https:" || u.protocol === "http:" ? u.href : null; } catch { return null; }
}
export function parseNewsRss(xml: string, via: NewsArticle["via"], language: string, now = Date.now()): NewsArticle[] {
  // Não aceitamos DTDs/entidades definidas por documentos externos.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || xml.length > 2_500_000) return [];
  try {
    const document = parser.parse(xml) as { rss?: { channel?: { item?: Record<string, unknown>[] } } };
    const items = document.rss?.channel?.item;
    if (!Array.isArray(items)) return [];
    return items.flatMap((item): NewsArticle[] => {
      const title = text(item.title), url = safeUrl(item.link);
      const at = Date.parse(text(item.pubDate));
      if (!title || !url || !Number.isFinite(at) || at > now || at < now - MAX_NEWS_HOURS * HOUR_MS) return [];
      let source = text(item.source);
      if (!source) source = new URL(url).hostname.replace(/^www\./, "");
      const cleanTitle = title.endsWith(` - ${source}`) ? title.slice(0, -(source.length + 3)) : title;
      return [{ id: `${via}:${url}`, title: cleanTitle, url, source, publishedAt: new Date(at).toISOString(), language, via }];
    });
  } catch { return []; }
}
export function deduplicateNews(articles: NewsArticle[]): NewsArticle[] {
  const seen = new Set<string>();
  return [...articles].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).filter(a => {
    const key = a.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export async function fetchStockNews(identity: NewsIdentity, refresh = false): Promise<StockNewsFeed> {
  const symbol = identity.symbol.toUpperCase();
  const hit = cache.get(symbol);
  if (!refresh && hit && Date.now() - hit.at < TTL) return applyNewsWindow(hit.data);
  const pending = inflight.get(symbol);
  if (pending) return applyNewsWindow(await pending);
  const task = (async (): Promise<StockNewsFeed> => {
    const company = aliases[symbol] || (identity.name || symbol).replace(/\s+(Inc\.?|Corporation|Corp\.?|PLC|Class [AB]|Common Stock|ADR)\b.*$/i, "").trim();
    const portuguese = identity.countryCode === "PT" || identity.countryCode === "BR" || /\.(LS|SA)$/.test(symbol);
    const locale = identity.countryCode === "BR" || symbol.endsWith(".SA") ? ["pt-BR", "BR", "BR:pt-419"] : portuguese ? ["pt-PT", "PT", "PT:pt-150"] : ["en-US", "US", "US:en"];
    const query = `"${company.replace(/["\\]/g, "")}" ${portuguese ? "(ações OR bolsa OR resultados OR lucros OR investimento)" : '("stock price" OR shares OR earnings OR revenue OR profit OR dividend OR investors)'} when:3d`;
    const params = new URLSearchParams({ q: query, hl: locale[0], gl: locale[1], ceid: locale[2] });
    const searchUrl = `https://news.google.com/search?${params}`;
    const feeds = [
      { url: `https://feeds.finance.yahoo.com/rss/2.0/headline?${new URLSearchParams({ s: symbol, region: "US", lang: "en-US" })}`, via: "Yahoo Finance" as const, lang: "en" },
      { url: `https://news.google.com/rss/search?${params}`, via: "Google News" as const, lang: portuguese ? "pt" : "en" },
    ];
    let successes = 0;
    const results = await Promise.all(feeds.map(async feed => {
      try {
        const res = await fetch(feed.url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/rss+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(9000), cache: "no-store" });
        if (!res.ok) return [];
        const xml = await res.text();
        if (!/<rss[\s>]/i.test(xml)) return [];
        successes++;
        return parseNewsRss(xml, feed.via, feed.lang);
      } catch { return []; }
    }));
    const normalize = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const terms = [normalize(company), normalize(symbol.split(".")[0])].filter(t => t.length >= 2);
    if (symbol === "GOOG" || symbol === "GOOGL") terms.push("alphabet", "google");
    const firstWord = normalize(company).split(" ")[0];
    if (firstWord?.length >= 4 && !["banco", "bank", "first", "global", "grupo", "group", "china", "united", "international", "american"].includes(firstWord)) terms.push(firstWord);
    const relevant = results.flat().filter(a => terms.some(t => (` ${normalize(a.title)} `).includes(` ${t} `)));
    const articles = filterRecentNews(deduplicateNews(relevant)).slice(0, 16);
    if (!successes && hit) return applyNewsWindow({ ...hit.data, stale: true, message: "Fontes indisponíveis. Cache novamente filtrada: só notícias ainda dentro das últimas 72 horas." });
    const data: StockNewsFeed = {
      symbol, company, articles, status: articles.length ? "ok" : successes ? "empty" : "unavailable",
      fetchedAt: new Date().toISOString(), stale: false, searchUrl,
      windowHours: MAX_NEWS_HOURS, windowStart: new Date(Date.now() - MAX_NEWS_HOURS * HOUR_MS).toISOString(), asOf: new Date().toISOString(), excludedByAge: 0,
      message: articles.length ? "Manchetes associadas à empresa; abre a fonte para confirmar o contexto. Podem existir notícias sobre empresas homónimas."
        : successes ? "Não foram encontradas notícias desta empresa nas últimas 72 horas. Não substituímos por notícias de outras ações."
        : "As fontes de notícias estão temporariamente indisponíveis. Podes tentar novamente ou abrir a pesquisa externa.",
    };
    if (successes) {
      if (cache.size >= 180) cache.delete(cache.keys().next().value!);
      cache.set(symbol, { at: Date.now(), data });
    }
    return data;
  })();
  inflight.set(symbol, task);
  try { return applyNewsWindow(await task); } finally { inflight.delete(symbol); }
}

/** Refiltra SEMPRE no instante de servir, incluindo cache de emergência. */
export function applyNewsWindow(feed: StockNewsFeed, hours = MAX_NEWS_HOURS, now = Date.now()): StockNewsFeed {
  const windowHours = Number.isFinite(hours) ? Math.min(MAX_NEWS_HOURS, Math.max(1, hours)) : MAX_NEWS_HOURS;
  const articles = filterRecentNews(feed.articles, windowHours, now);
  const expired = feed.articles.length - articles.length;
  return { ...feed, articles, windowHours, windowStart: new Date(now - windowHours * HOUR_MS).toISOString(), asOf: new Date(now).toISOString(),
    excludedByAge: expired + (feed.excludedByAge ?? 0),
    status: feed.status === "unavailable" ? "unavailable" : articles.length ? "ok" : "empty",
    message: articles.length ? feed.message : feed.status === "unavailable" ? feed.message : `Sem notícias verificáveis desta empresa nas últimas ${windowHours} horas. Notícias anteriores não são reutilizadas para preencher o painel.`,
  };
}
