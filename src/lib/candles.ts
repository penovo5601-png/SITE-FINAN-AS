/** Compatibilidade legada; usa exclusivamente o histórico real auditado da v4. */
import {getPriceHistory} from "./price-history";
export interface OhlcCandle {t:number;o:number;h:number;l:number;c:number;v:number}
export interface CandleMeta {currency?:string;exchangeName?:string;regularMarketPrice?:number;previousClose?:number;fiftyTwoWeekHigh?:number;fiftyTwoWeekLow?:number;shortName?:string;longName?:string;instrumentType?:string}
export interface CandleResult {candles:OhlcCandle[];source:"yahoo"|"wsj"|"nasdaq"|"cache"|"nenhuma";meta:CandleMeta|null;notes:string[]}
export function sanitizeCandles(input:OhlcCandle[]):OhlcCandle[]{
 const rows=new Map<number,OhlcCandle>();
 for(const c of input){if(![c.t,c.o,c.h,c.l,c.c,c.v].every(Number.isFinite)||Math.min(c.o,c.h,c.l,c.c)<=0||c.v<0||c.t>Date.now()||c.h+1e-8<Math.max(c.o,c.c,c.l)||c.l-1e-8>Math.min(c.o,c.c,c.h))continue;rows.set(c.t,{...c});}
 return [...rows.values()].sort((a,b)=>a.t-b.t);
}
export async function getCandles(symbol:string,range:"1y"|"2y"|"5y"="2y"):Promise<CandleResult>{
 const h=await getPriceHistory(symbol);if(!h)return{candles:[],source:"nenhuma",meta:null,notes:["As fontes e cópias reais não responderam. Não são criadas velas com apenas fechos."]};
 const cut=Date.now()-(range==="5y"?5:range==="1y"?1:2)*365.25*86400000;const all=sanitizeCandles(h.candles);const candles=all.filter(c=>c.t>=cut);const selected=candles.length>1?candles:all;
 return{candles:selected,source:h.origin==="bundled"||h.origin==="postgres"||h.origin==="browser"?"cache":h.provider==="Yahoo Finance"?"yahoo":"nasdaq",meta:{currency:h.currency,instrumentType:"EQUITY",regularMarketPrice:selected.at(-1)?.c,previousClose:selected.at(-2)?.c},notes:["Última barra real: "+h.lastBarAt+"; origem "+h.origin]};
}
