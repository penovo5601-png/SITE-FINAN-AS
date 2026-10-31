import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { marketHistoryCache } from "@/db/schema";
import { canonicalSymbol, validHistory, validSymbol, type HistorySnapshot } from "./history-types";

const memory = new Map<string, HistorySnapshot>();
let dbBackoffUntil = 0;
export function recentHistory(symbol: string): HistorySnapshot | null {
  const hit = memory.get(canonicalSymbol(symbol));
  return hit && Date.now()-Date.parse(hit.fetchedAt)<5*60_000 ? {...hit,origin:"memory"} : null;
}
export async function saveHistory(snapshot: HistorySnapshot): Promise<void> {
  if (!validHistory(snapshot)) return;
  if (memory.size>160) memory.delete(memory.keys().next().value!);
  memory.set(snapshot.symbol,snapshot);
  if (!process.env.DATABASE_URL || Date.now()<dbBackoffUntil) return;
  try {
    await db.insert(marketHistoryCache).values({symbol:snapshot.symbol,payload:snapshot,updatedAt:new Date()}).onConflictDoUpdate({target:marketHistoryCache.symbol,set:{payload:snapshot,updatedAt:new Date()}});
  } catch { dbBackoffUntil=Date.now()+180_000; }
}
export function bundledHistory(symbol: string): HistorySnapshot | null {
  symbol=canonicalSymbol(symbol);
  if (!validSymbol(symbol)) return null;
  try {
    const file=path.join(process.cwd(),"public/data/history",`${symbol}.json.gz`);
    if (!existsSync(file)) return null;
    const data=JSON.parse(gunzipSync(readFileSync(file)).toString("utf8")) as HistorySnapshot;
    return validHistory(data,symbol) ? {...data,origin:"bundled"} : null;
  } catch {return null;}
}
export async function recoverHistory(symbol: string): Promise<HistorySnapshot|null> {
  symbol=canonicalSymbol(symbol);
  const candidates: HistorySnapshot[]=[];
  const hit=memory.get(symbol);if(hit&&validHistory(hit,symbol)) candidates.push({...hit,origin:"memory"});
  if(process.env.DATABASE_URL&&Date.now()>=dbBackoffUntil){
    try{const rows=await db.select().from(marketHistoryCache).where(eq(marketHistoryCache.symbol,symbol)).limit(1);const stored=rows[0]?.payload as HistorySnapshot|undefined;if(stored&&validHistory(stored,symbol))candidates.push({...stored,origin:"postgres"});}
    catch{dbBackoffUntil=Date.now()+180_000;}
  }
  const archive=bundledHistory(symbol);if(archive)candidates.push(archive);
  return candidates.sort((a,b)=>Date.parse(b.lastBarAt)-Date.parse(a.lastBarAt)||b.candles.length-a.candles.length)[0]??null;
}
