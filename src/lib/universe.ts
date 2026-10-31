import { gunzipSync } from "node:zlib";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { analyses, tickers, type Ticker } from "@/db/schema";

export type UniverseRow = {
  symbol: string;
  name: string;
  exchange: string;
  market: string;
  country: string;
  sector: string;
  assetType: string;
  featured: boolean;
  popularity: number;
};

export type TickerLike = {
  symbol: string;
  name: string;
  exchange: string | null;
  market: string | null;
  countryCode: string | null;
  sector: string | null;
  featured: boolean | null;
  popularity: number | null;
};

let memoryUniverse: UniverseRow[] | null = null;
let dbOk = true;

/** false quando não há PostgreSQL disponível — o site passa a usar o índice em memória. */
export function isDbAvailable() {
  return dbOk;
}

function candidates(): string[] {
  const root = process.cwd();
  return [
    path.join(root, "public", "data", "universe.tsv.gz"),
    path.join(root, ".next", "server", "public", "data", "universe.tsv.gz"),
    path.join(root, "..", "public", "data", "universe.tsv.gz"),
  ];
}

/** Carrega o universo completo em memória (0.6 MB gzip -> ~61k registos). */
export function loadUniverse(): UniverseRow[] {
  if (memoryUniverse) return memoryUniverse;
  const file = candidates().find((c) => existsSync(c));
  if (!file) {
    memoryUniverse = [];
    return memoryUniverse;
  }
  try {
    const text = gunzipSync(readFileSync(file)).toString("utf8");
    const rows: UniverseRow[] = [];
    for (const line of text.split("\n")) {
      if (!line) continue;
      const p = line.split("\t");
      if (p.length < 9) continue;
      rows.push({
        symbol: p[0],
        name: p[1] || p[0],
        exchange: p[2] || "",
        market: p[3] || "",
        country: p[4] || "",
        sector: p[5] || "",
        assetType: p[6] || "Stock",
        featured: p[7] === "1",
        popularity: Number(p[8]) || 0,
      });
    }
    memoryUniverse = rows;
  } catch (err) {
    console.error("[universe] falha a carregar o ficheiro:", err);
    memoryUniverse = [];
  }
  return memoryUniverse;
}

const toTickerLike = (r: UniverseRow): TickerLike => ({
  symbol: r.symbol,
  name: r.name,
  exchange: r.exchange,
  market: r.market,
  countryCode: r.country,
  sector: r.sector,
  featured: r.featured,
  popularity: r.popularity,
});

let seeding: Promise<number> | null = null;

/** Insere o universo na base de dados uma única vez (idempotente e tolerante a falhas). */
export function ensureSeeded(): Promise<number> {
  if (!seeding) {
    seeding = (async () => {
      if (!process.env.DATABASE_URL) {
        dbOk = false;
        return loadUniverse().length;
      }
      try {
        const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(tickers);
        if (n > 1000) return n;
        const rows = loadUniverse();
        if (!rows.length) return n;
        const chunkSize = 800;
        let written = 0;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize).map((r) => ({
            symbol: r.symbol,
            ticker: r.symbol.includes(".") ? r.symbol.slice(0, r.symbol.lastIndexOf(".")) : r.symbol,
            name: r.name,
            exchange: r.exchange,
            market: r.market,
            countryCode: r.country,
            sector: r.sector,
            assetType: r.assetType,
            featured: r.featured,
            popularity: r.popularity,
          }));
          await db.insert(tickers).values(chunk).onConflictDoNothing();
          written += chunk.length;
        }
        return written;
      } catch (err) {
        dbOk = false;
        console.error("[universe] base de dados indisponível, a usar índice em memória:", (err as Error).message);
        return loadUniverse().length;
      }
    })();
  }
  return seeding;
}

// --------------------------------------------------------------------------- em memória
function memSearch(q: string, limit: number): TickerLike[] {
  const rows = loadUniverse();
  const clean = q.trim().toUpperCase();
  if (!clean) return memFeatured(limit);
  const exact: TickerLike[] = [];
  const prefix: TickerLike[] = [];
  const nameHits: TickerLike[] = [];
  for (const r of rows) {
    if (r.symbol === clean) exact.push(toTickerLike(r));
    else if (r.symbol.startsWith(clean)) prefix.push(toTickerLike(r));
    else if (r.name.toUpperCase().includes(clean)) nameHits.push(toTickerLike(r));
  }
  const byPop = (a: TickerLike, b: TickerLike) => (b.popularity ?? 0) - (a.popularity ?? 0) || a.symbol.localeCompare(b.symbol);
  return [...exact, ...prefix.sort(byPop), ...nameHits.sort(byPop)].slice(0, limit);
}

function memFeatured(limit: number): TickerLike[] {
  return loadUniverse()
    .filter((r) => r.featured)
    .sort((a, b) => b.popularity - a.popularity || a.symbol.localeCompare(b.symbol))
    .slice(0, limit)
    .map(toTickerLike);
}

function memMarkets(): { market: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of loadUniverse()) if (r.market) map.set(r.market, (map.get(r.market) ?? 0) + 1);
  return [...map.entries()].map(([market, count]) => ({ market, count })).sort((a, b) => b.count - a.count);
}

function memSectors(): string[] {
  return [...new Set(loadUniverse().map((r) => r.sector).filter(Boolean))].sort();
}

function memBrowse(opts: { market?: string; sector?: string; q?: string; offset?: number; limit?: number }) {
  const limit = Math.min(opts.limit ?? 40, 200);
  const offset = opts.offset ?? 0;
  let rows = loadUniverse();
  if (opts.market) rows = rows.filter((r) => r.market === opts.market);
  if (opts.sector) rows = rows.filter((r) => r.sector === opts.sector);
  if (opts.q) {
    const q = opts.q.trim().toUpperCase();
    rows = rows.filter((r) => r.symbol.startsWith(q) || r.name.toUpperCase().includes(q));
  }
  rows = [...rows].sort((a, b) => b.popularity - a.popularity || a.symbol.localeCompare(b.symbol));
  return { rows: rows.slice(offset, offset + limit).map(toTickerLike), total: rows.length };
}

// --------------------------------------------------------------------------- API pública
export async function countTickers(): Promise<number> {
  if (dbOk) {
    try {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(tickers);
      if (n > 0) return n;
    } catch {
      dbOk = false;
    }
  }
  return loadUniverse().length;
}

export async function searchTickers(query: string, limit = 25): Promise<TickerLike[]> {
  const q = query.trim();
  if (!dbOk) return memSearch(q, limit);
  try {
    if (!q) return featuredTickers(limit);
    const upper = q.toUpperCase();
    const safe = upper.replace(/[%_]/g, "");
    const exact = await db.select().from(tickers).where(eq(tickers.symbol, upper)).limit(1);
    const rows = await db
      .select()
      .from(tickers)
      .where(or(ilike(tickers.ticker, `${safe}%`), ilike(tickers.name, `%${q.replace(/[%_]/g, "")}%`), ilike(tickers.symbol, `${safe}%`)))
      .orderBy(desc(tickers.popularity), asc(tickers.symbol))
      .limit(limit);
    const seen = new Set<string>();
    const merged = [...exact, ...rows].filter((r) => (seen.has(r.symbol) ? false : (seen.add(r.symbol), true)));
    return merged.slice(0, limit);
  } catch (err) {
    dbOk = false;
    console.error("[universe] searchTickers fallback:", (err as Error).message);
    return memSearch(q, limit);
  }
}

export async function featuredTickers(limit = 12): Promise<TickerLike[]> {
  if (!dbOk) return memFeatured(limit);
  try {
    const rows = await db
      .select()
      .from(tickers)
      .where(eq(tickers.featured, true))
      .orderBy(desc(tickers.popularity), asc(tickers.symbol))
      .limit(limit);
    return rows.length ? rows : memFeatured(limit);
  } catch {
    dbOk = false;
    return memFeatured(limit);
  }
}

export async function getTicker(symbol: string): Promise<TickerLike | null> {
  const upper = symbol.trim().toUpperCase();
  if (!dbOk) {
    const rows = loadUniverse();
    const hit = rows.find((r) => r.symbol === upper);
    return hit ? toTickerLike(hit) : null;
  }
  try {
    const rows = await db.select().from(tickers).where(eq(tickers.symbol, upper)).limit(1);
    if (rows[0]) return rows[0];
    const loose = await db.select().from(tickers).where(ilike(tickers.ticker, upper)).orderBy(desc(tickers.popularity)).limit(1);
    if (loose[0]) return loose[0];
    const mem = loadUniverse().find((r) => r.symbol === upper);
    return mem ? toTickerLike(mem) : null;
  } catch {
    dbOk = false;
    const mem = loadUniverse().find((r) => r.symbol === upper);
    return mem ? toTickerLike(mem) : null;
  }
}

export async function marketStats(): Promise<{ market: string; count: number }[]> {
  if (!dbOk) return memMarkets();
  try {
    const rows = await db
      .select({ market: tickers.market, count: sql<number>`count(*)::int` })
      .from(tickers)
      .groupBy(tickers.market)
      .orderBy(desc(sql`count(*)`));
    const out = rows.filter((r) => r.market !== null).map((r) => ({ market: r.market as string, count: r.count }));
    return out.length ? out : memMarkets();
  } catch {
    dbOk = false;
    return memMarkets();
  }
}

export async function browseTickers(opts: { market?: string; sector?: string; offset?: number; limit?: number; q?: string }) {
  if (!dbOk) return memBrowse(opts);
  try {
    const limit = Math.min(opts.limit ?? 40, 200);
    const offset = opts.offset ?? 0;
    const conds = [];
    if (opts.market) conds.push(eq(tickers.market, opts.market));
    if (opts.sector) conds.push(eq(tickers.sector, opts.sector));
    if (opts.q) {
      const clean = opts.q.replace(/[%_]/g, "");
      conds.push(or(ilike(tickers.ticker, `${clean.toUpperCase()}%`), ilike(tickers.name, `%${clean}%`))!);
    }
    const where = conds.length ? sql.join(conds, sql` and `) : undefined;
    const [rows, [{ n }]] = await Promise.all([
      db.select().from(tickers).where(where).orderBy(desc(tickers.popularity), asc(tickers.symbol)).limit(limit).offset(offset),
      db.select({ n: sql<number>`count(*)::int` }).from(tickers).where(where),
    ]);
    return { rows, total: n };
  } catch {
    dbOk = false;
    return memBrowse(opts);
  }
}

export async function listSectors(): Promise<string[]> {
  if (!dbOk) return memSectors();
  try {
    const rows = await db.selectDistinct({ sector: tickers.sector }).from(tickers).orderBy(tickers.sector);
    const out = rows.map((r) => r.sector).filter(Boolean) as string[];
    return out.length ? out : memSectors();
  } catch {
    dbOk = false;
    return memSectors();
  }
}

export async function saveAnalysis(data: {
  symbol: string;
  name?: string;
  verdict: string;
  score: number;
  confidence: number;
  price?: number;
  currency?: string;
  targetUp?: number;
  targetDown?: number;
  payload: unknown;
}) {
  if (!dbOk) return;
  try {
    await db.insert(analyses).values({
      symbol: data.symbol,
      name: data.name ?? null,
      verdict: data.verdict,
      score: data.score,
      confidence: data.confidence,
      price: data.price ?? null,
      currency: data.currency ?? null,
      targetUp: data.targetUp ?? null,
      targetDown: data.targetDown ?? null,
      payload: data.payload as never,
    });
  } catch (err) {
    console.error("[universe] falha ao guardar análise:", (err as Error).message);
  }
}

export async function recentAnalyses(limit = 20) {
  if (!dbOk) return [];
  try {
    return await db.select().from(analyses).orderBy(desc(analyses.id)).limit(limit);
  } catch {
    dbOk = false;
    return [];
  }
}

export type TickerRecord = Ticker | TickerLike;
