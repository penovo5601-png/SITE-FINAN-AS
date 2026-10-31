import { canonicalSymbol } from "../history-types";
export const FINANCIAL_COLUMNS=["fundamental_currency_code","total_revenue_ttm","total_revenue_yoy_growth_ttm","earnings_per_share_diluted_ttm","earnings_per_share_diluted_yoy_growth_ttm","gross_margin_ttm","operating_margin_ttm","net_margin_ttm","return_on_assets_fq","return_on_equity_fq","return_on_invested_capital_fq","total_assets_fq","total_equity_fq","total_debt_fq","net_debt_fq","cash_n_short_term_invest_fq","current_ratio_fq","quick_ratio_fq","debt_to_equity_fq","free_cash_flow_ttm","cash_f_operating_activities_ttm","total_shares_outstanding_fundamental","fiscal_period_end_current","dividend_payout_ratio_ttm","ebitda_ttm"] as const;
export type FiscalYear={end:string;currency:string;revenue:number|null;netIncome:number|null;freeCashFlow:number|null;operatingCashFlow:number|null;equity:number|null;assets:number|null;debt:number|null;cash:number|null;eps:number|null;shares:number|null};
export type FinancialStatements={symbol:string;source:"Yahoo Finance · demonstrações anuais";fetchedAt:string;years:FiscalYear[];stale:boolean;warnings:string[]};
export type FxQuote={from:string;to:string;rate:number;asOf:string;source:string};
const types:Record<string,keyof Omit<FiscalYear,"end"|"currency">>={annualTotalRevenue:"revenue",annualNetIncome:"netIncome",annualFreeCashFlow:"freeCashFlow",annualOperatingCashFlow:"operatingCashFlow",annualStockholdersEquity:"equity",annualTotalAssets:"assets",annualTotalDebt:"debt",annualCashAndCashEquivalents:"cash",annualDilutedEPS:"eps",annualDilutedAverageShares:"shares"};
const statementCache=new Map<string,{at:number;data:FinancialStatements}>();
const fxCache=new Map<string,{at:number;data:FxQuote}>();
const hosts=["https://query1.finance.yahoo.com","https://query2.finance.yahoo.com"];

export function parseFinancialStatements(raw:unknown,symbol:string,now=Date.now()):FinancialStatements{
 const out:FinancialStatements={symbol,source:"Yahoo Finance · demonstrações anuais",fetchedAt:new Date(now).toISOString(),years:[],stale:false,warnings:[]};
 const input=raw as {timeseries?:{result?:Array<Record<string,unknown>&{meta?:{type?:string[]}}>} };
 const rows=new Map<string,FiscalYear>();
 for(const series of input.timeseries?.result??[]){const type=series.meta?.type?.[0]??"",field=types[type];if(!field)continue;const points=series[type];if(!Array.isArray(points))continue;
  for(const value of points){const point=value as {asOfDate?:string;periodType?:string;currencyCode?:string;reportedValue?:{raw?:number}};const end=point.asOfDate??"";const date=Date.parse(end);const number=point.reportedValue?.raw;if(!/^\d{4}-\d{2}-\d{2}$/.test(end)||!Number.isFinite(date)||date>now||typeof number!=="number"||!Number.isFinite(number)||point.periodType!=="12M")continue;
   let row=rows.get(end);if(!row){row={end,currency:field==="shares"?"":point.currencyCode??"",revenue:null,netIncome:null,freeCashFlow:null,operatingCashFlow:null,equity:null,assets:null,debt:null,cash:null,eps:null,shares:null};rows.set(end,row);}
   if(field!=="shares"&&!row.currency&&point.currencyCode)row.currency=point.currencyCode;
   if(field!=="shares"&&row.currency&&point.currencyCode&&row.currency!==point.currencyCode){out.warnings.push(`Campo ${field} em ${end} ignorado: moeda diferente dentro do exercício.`);continue;}
   row[field]=number;
  }
 }
 out.years=[...rows.values()].sort((a,b)=>a.end.localeCompare(b.end)).slice(-6);
 if(!out.years.length)out.warnings.push("A fonte não disponibilizou uma série anual verificável. Consistência plurianual não é inferida de um único trimestre.");
 return out;
}
export async function fetchFinancialStatements(symbol:string):Promise<FinancialStatements>{
 symbol=canonicalSymbol(symbol);
 const cached=statementCache.get(symbol);if(cached&&Date.now()-cached.at<6*3600000)return cached.data;
 const now=Date.now(),period1=Math.floor((now-8*365.25*86400000)/1000),period2=Math.floor(now/1000);
 for(const host of hosts){try{const url=`${host}/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?${new URLSearchParams({type:Object.keys(types).join(","),period1:String(period1),period2:String(period2)})}`;
  const response=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0",Accept:"application/json"},signal:AbortSignal.timeout(6500),cache:"no-store"});if(!response.ok)continue;
  const data=parseFinancialStatements(await response.json(),symbol,now);if(data.years.length){if(statementCache.size>=100)statementCache.delete(statementCache.keys().next().value!);statementCache.set(symbol,{at:now,data});return data;}
 }catch{/* fonte alternativa */}}
 return cached?{...cached.data,stale:true,warnings:[...cached.data.warnings,"Fonte indisponível: demonstrações recuperadas da cache com a data original."]}:parseFinancialStatements({},symbol,now);
}
export function quoteUnit(currency:string):{base:string;multiplier:number}{
 if(currency==="GBp"||currency==="GBX")return{base:"GBP",multiplier:100};
 if(currency==="ZAc")return{base:"ZAR",multiplier:100};
 if(currency==="ILA")return{base:"ILS",multiplier:100};
 return{base:currency.toUpperCase(),multiplier:1};
}
export async function fetchFx(from:string,quoteCurrency:string):Promise<FxQuote|null>{
 from=from.toUpperCase();const unit=quoteUnit(quoteCurrency),to=unit.base;
 if(!/^[A-Z]{3}$/.test(from)||!/^[A-Z]{3}$/.test(to))return null;
 if(from===to)return{from,to:quoteCurrency,rate:unit.multiplier,asOf:new Date().toISOString(),source:unit.multiplier===1?"Mesma moeda":"Conversão de unidade de cotação"};
 const key=from+":"+quoteCurrency,cached=fxCache.get(key);if(cached&&Date.now()-cached.at<15*60000)return cached.data;
 for(const host of hosts){try{const r=await fetch(`${host}/v8/finance/chart/${from}${to}%3DX?range=5d&interval=1d`,{headers:{"User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(4000),cache:"no-store"});if(!r.ok)continue;const j=await r.json() as {chart?:{result?:{meta?:{regularMarketPrice?:number;regularMarketTime?:number}}[]}};const m=j.chart?.result?.[0]?.meta;const rate=m?.regularMarketPrice,time=m?.regularMarketTime;if(typeof rate!=="number"||rate<=0||!time||time*1000>Date.now()||Date.now()-time*1000>7*86400000)continue;
  const data:FxQuote={from,to:quoteCurrency,rate:rate*unit.multiplier,asOf:new Date(time*1000).toISOString(),source:`Yahoo Finance · ${from}/${to}`};fxCache.set(key,{at:Date.now(),data});return data;
 }catch{/* segundo host */}}
 return null;
}
