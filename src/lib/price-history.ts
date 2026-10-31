import { fetchChart } from "./yahoo";
import { fetchNasdaqHistory } from "./providers/nasdaq";
import { canonicalSymbol, validHistory, validSymbol, type HistorySnapshot } from "./history-types";
import { recentHistory, recoverHistory, saveHistory } from "./history-store";

const pending = new Map<string,Promise<HistorySnapshot|null>>();

/** Yahoo em dois hosts, Nasdaq para tickers dos EUA, arquivo real persistente.
 * Nunca substitui um ticker estrangeiro por um homónimo americano nem cria velas.
 */
export async function getPriceHistory(symbol:string, refresh=false):Promise<HistorySnapshot|null>{
  symbol=canonicalSymbol(symbol);if(!validSymbol(symbol))return null;
  if(!refresh){const hit=recentHistory(symbol);if(hit)return hit;}
  const running=pending.get(symbol);if(running)return running;
  const task=(async()=>{
    const yahoo=await fetchChart(symbol,"5y","1d",refresh);
    if(yahoo){
      const snapshot:HistorySnapshot={symbol,currency:yahoo.meta.currency,provider:"Yahoo Finance",interval:"1d",priceBasis:yahoo.priceBasis??"unadjusted",fetchedAt:new Date(yahoo.fetchedAt).toISOString(),lastBarAt:new Date(yahoo.candles.at(-1)!.t).toISOString(),origin:yahoo.cached?"memory":"network",candles:yahoo.candles,discardedBars:yahoo.discardedBars};
      if(validHistory(snapshot,symbol)){await saveHistory(snapshot);return snapshot;}
    }
    if(!symbol.includes(".")){
      const candles=await fetchNasdaqHistory(symbol,5.5);
      if(candles){const snapshot:HistorySnapshot={symbol,currency:"USD",provider:"Nasdaq",interval:"1d",priceBasis:"unadjusted",fetchedAt:new Date().toISOString(),lastBarAt:new Date(candles.at(-1)!.t).toISOString(),origin:"network",candles};if(validHistory(snapshot,symbol)){await saveHistory(snapshot);return snapshot;}}
    }
    return recoverHistory(symbol);
  })();
  pending.set(symbol,task);
  try{return await task;}finally{pending.delete(symbol);}
}
