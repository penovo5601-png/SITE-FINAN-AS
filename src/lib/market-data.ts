import type { Candle, ChartBundle, QuoteMeta } from "./yahoo";
import { fetchTradingView, num, type TvSnapshot } from "./providers/tradingview";
import { getPriceHistory } from "./price-history";
import { canonicalSymbol, historyEvidence, type HistoryEvidence } from "./history-types";

export type DataSource="yahoo"|"nasdaq"|"tradingview"|"nenhuma";
export type MarketData={symbol:string;candles:Candle[]|null;validationCandles?:Candle[]|null;quoteAsOf?:number|null;bundle:ChartBundle|null;scanner:(TvSnapshot&{__tv:string})|null;meta:QuoteMeta|null;source:DataSource;historySource:DataSource;historyEvidence?:HistoryEvidence;currency:string;range:string;interval:string;notes:string[]};
const RANGE_DAYS:Record<string,number>={"1mo":31,"3mo":93,"6mo":186,"1y":370,"2y":740,"5y":1860,max:40000};
export function sliceByRange(candles:Candle[],range:string):Candle[]{const cutoff=Date.now()-(RANGE_DAYS[range]??740)*86400000;const selected=candles.filter(c=>c.t>=cutoff);return selected.length>=2?selected:candles;}
export function toWeekly(candles:Candle[]):Candle[]{
 const weeks=new Map<number,Candle>();
 for(const c of candles){const d=new Date(c.t);const day=(d.getUTCDay()+6)%7;const t=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-day);const previous=weeks.get(t);if(!previous)weeks.set(t,{...c,t});else{previous.h=Math.max(previous.h,c.h);previous.l=Math.min(previous.l,c.l);previous.c=c.c;previous.v+=c.v;}}
 return [...weeks.values()].sort((a,b)=>a.t-b.t);
}
export const COUNTRY_CURRENCY:Record<string,string>={PT:"EUR",ES:"EUR",FR:"EUR",DE:"EUR",IT:"EUR",NL:"EUR",BE:"EUR",IE:"EUR",AT:"EUR",FI:"EUR",GR:"EUR",GB:"GBP",US:"USD",CA:"CAD",BR:"BRL",MX:"MXN",AR:"ARS",JP:"JPY",CN:"CNY",HK:"HKD",TW:"TWD",KR:"KRW",IN:"INR",AU:"AUD",NZ:"NZD",CH:"CHF",SE:"SEK",NO:"NOK",DK:"DKK",PL:"PLN",RU:"RUB",ZA:"ZAR",SA:"SAR",AE:"AED",SG:"SGD"};

export async function getMarketData(symbol:string,range="2y",interval="1d",currencyHint?:string|null,refresh=false):Promise<MarketData>{
 symbol=canonicalSymbol(symbol);
 const [history,scanner]=await Promise.all([getPriceHistory(symbol,refresh),fetchTradingView(symbol,refresh).catch(()=>null)]);
 const notes:string[]=[];
 const historySource:DataSource=history?.provider==="Yahoo Finance"?"yahoo":history?.provider==="Nasdaq"?"nasdaq":"nenhuma";
 const validationCandles=history?.candles??null;
 let candles=history?sliceByRange(history.candles,range):null;
 if(candles&&interval==="1wk")candles=toWeekly(candles);
 const evidence=history?historyEvidence(history):undefined;
 if(evidence?.archived)notes.push(`Histórico real recuperado de ${evidence.origin}. Última barra ${evidence.lastBarAt}; a data original não foi alterada. A previsão verifica a atualidade desses dados.`);
 if(!history)notes.push("Histórico interno em recuperação. O gráfico tenta também a cópia guardada no navegador e o fornecedor gráfico independente; o snapshot técnico não é apresentado como uma série OHLC.");
 const price=history?.candles.at(-1)?.c??num(scanner?.close)??0;
 const previous=history?.candles.at(-2)?.c??(price/(1+(num(scanner?.change)??0)/100));
 const currency=history?.currency??String(scanner?.currency??currencyHint??"USD");
 const meta:QuoteMeta|null=history||scanner?{symbol,currency,exchangeName:String(scanner?.exchange??""),fullExchangeName:String(scanner?.exchange??""),instrumentType:scanner?String(scanner.type??"stock").toUpperCase():"EQUITY",regularMarketPrice:price,previousClose:previous,regularMarketTime:history?history.candles.at(-1)!.t/1000:0,fiftyTwoWeekHigh:num(scanner?.price_52_week_high)??undefined,fiftyTwoWeekLow:num(scanner?.price_52_week_low)??undefined,longName:scanner?.description?String(scanner.description):undefined,shortName:scanner?.name?String(scanner.name):symbol}:null;
 const bundle:ChartBundle|null=meta&&candles?{meta,candles,interval,range,fetchedAt:history?Date.parse(history.fetchedAt):Date.now(),priceBasis:history?.priceBasis}:null;
 return {symbol,candles,validationCandles,quoteAsOf:null,bundle,scanner,meta,source:history?historySource:scanner?"tradingview":"nenhuma",historySource,historyEvidence:evidence,currency,range,interval,notes};
}
