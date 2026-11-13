export type FxHistory={pair:string;asOf:string;rate:number;closes:{t:number;value:number}[];source:string};
const cache=new Map<string,{at:number;data:FxHistory}>();
/** Referência cambial interna para avaliar carteiras de ações em EUR, não um ativo oferecido para negociação. */
export async function getEuroFxHistory(from:"USD"):Promise<FxHistory|null>{
 const pair=from+"EUR=X",hit=cache.get(pair);if(hit&&Date.now()-hit.at<300000)return hit.data;
 for(const host of ['https://query1.finance.yahoo.com','https://query2.finance.yahoo.com'])try{
  const r=await fetch(`${host}/v8/finance/chart/${encodeURIComponent(pair)}?range=5y&interval=1d`,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(6500),cache:'no-store'});if(!r.ok)continue;
  const j=await r.json() as {chart?:{result?:{meta?:{symbol?:string;regularMarketPrice?:number;regularMarketTime?:number};timestamp?:number[];indicators?:{quote?:{close?:(number|null)[]}[]}}[]}};const x=j.chart?.result?.[0],m=x?.meta;
  if(!x||m?.symbol!==pair||!m.regularMarketPrice||!m.regularMarketTime||m.regularMarketTime*1000>Date.now())continue;
  const closes=(x.timestamp??[]).flatMap((t,i)=>{const v=x.indicators?.quote?.[0]?.close?.[i];return typeof v==='number'&&Number.isFinite(v)&&v>0&&t*1000<=Date.now()?[{t:t*1000,value:v}]:[]});
  if(closes.length<750)continue;const data:FxHistory={pair,asOf:new Date(m.regularMarketTime*1000).toISOString(),rate:m.regularMarketPrice,closes,source:'Yahoo Finance · USD/EUR'};cache.set(pair,{at:Date.now(),data});return data;
 }catch{/* segundo host */}
 return null;
}
