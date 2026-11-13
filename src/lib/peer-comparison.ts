import { fetchTradingView, type TvSnapshot } from "./providers/tradingview";
import { canonicalSymbol } from "./history-types";

export type PeerCompany={symbol:string;tvSymbol:string;name:string;industry:string;sector:string;country:string;currency:string;periodEnd:string|null;per:number|null;pbv:number|null;roe:number|null;dividendYield:number|null;payout:number|null;marketCap:number|null};
export type PeerComparison={status:"ok"|"insufficient"|"unavailable";target:PeerCompany|null;peers:PeerCompany[];industry:string;selection:string;asOf:string;medians:{per:number|null;pbv:number|null;roe:number|null;dividendYield:number|null;payout:number|null};observations:{label:string;tone:"green"|"amber"|"red"|"missing";text:string}[];warnings:string[]};
const fields=["name","description","type","exchange","country","currency","industry","sector","market_cap_basic","price_earnings_ttm","price_book_fq","return_on_equity_fq","dividends_yield","dividend_payout_ratio_ttm","fiscal_period_end_current","total_equity_fq"];
const numeric=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)?v:null;
export function median(values:(number|null)[]):number|null{const a=values.filter((v):v is number=>v!=null&&Number.isFinite(v)).sort((a,b)=>a-b);return a.length?a.length%2?a[Math.floor(a.length/2)]:(a[a.length/2-1]+a[a.length/2])/2:null;}
export function yahooPeerSymbol(tv:string,country:string):string|null{
 const [exchange,...rest]=tv.split(":"),base=rest.join(":");if(!base||!/[A-Z0-9]/i.test(base))return null;
 if(["NASDAQ","NYSE","NYSEAMERICAN","AMEX"].includes(exchange))return base.replaceAll(".","-");
 if(exchange==="EURONEXT"){const suffix:Record<string,string>={Portugal:"LS",France:"PA",Netherlands:"AS",Belgium:"BR",Ireland:"IR"};return suffix[country]?`${base}.${suffix[country]}`:null;}
 const suffix:Record<string,string>={BME:"MC",MIL:"MI",XETRA:"DE",FWB:"F",LSE:"L",SIX:"SW",TSX:"TO",TSE:"T",HKEX:"HK",SSE:"SS",SZSE:"SZ",BMFBOVESPA:"SA",ASX:"AX",STO:"ST",OMXSTO:"ST",OMXCOP:"CO",OMXHEL:"HE",TADAWUL:"SR",TASI:"SR"};
 return suffix[exchange]?`${base.replace(/\.$/,"")}.${suffix[exchange]}`:null;
}
function convert(symbol:string,tv:string,s:TvSnapshot):PeerCompany|null{
 if(String(s.type??"stock").toLowerCase()!=="stock")return null;
 const per=numeric(s.price_earnings_ttm),pbv=numeric(s.price_book_fq),equity=numeric(s.total_equity_fq),period=numeric(s.fiscal_period_end_current);
 return{symbol,tvSymbol:tv,name:String(s.description??symbol),industry:String(s.industry??""),sector:String(s.sector??""),country:String(s.country??""),currency:String(s.currency??""),periodEnd:period&&period*1000<=Date.now()?new Date(period*1000).toISOString().slice(0,10):null,per:per!=null&&per>0?per:null,pbv:pbv!=null&&pbv>0&&(equity==null||equity>0)?pbv:null,roe:equity!=null&&equity<=0?null:numeric(s.return_on_equity_fq),dividendYield:numeric(s.dividends_yield),payout:numeric(s.dividend_payout_ratio_ttm),marketCap:numeric(s.market_cap_basic)};
}
export function comparePeerMetrics(target:PeerCompany,peers:PeerCompany[]):Pick<PeerComparison,"medians"|"observations">{
 const medians={per:median(peers.map(p=>p.per)),pbv:median(peers.map(p=>p.pbv)),roe:median(peers.map(p=>p.roe)),dividendYield:median(peers.map(p=>p.dividendYield)),payout:median(peers.map(p=>p.payout))};
 const observations:PeerComparison["observations"]=[];
 for(const [key,label,higher] of [["per","PER",false],["pbv","PBV",false],["roe","ROE",true]] as const){const a=target[key],m=medians[key];const available=a!=null&&m!=null;const favorable=available&&(higher?a!>m!:a!<m!);observations.push({label,tone:!available?"missing":Math.abs(a!-m!)/(Math.abs(m!)||1)<0.05?"amber":favorable?"green":"red",text:!available?"Dados comparáveis insuficientes; múltiplos negativos não são classificados como baratos.":`${label} ${a!.toFixed(2)} ${higher?"vs":"face a"} mediana ${m!.toFixed(2)}. ${favorable?"Favorável neste critério relativo":"Não favorável neste critério relativo"}; não prova por si só subavaliação ou qualidade.`});}
 const dy=target.dividendYield;observations.push({label:"Dividend yield",tone:dy==null?"missing":dy>8?"amber":"green",text:dy==null?"Rendimento não disponibilizado.":`${dy.toFixed(2)}%; mediana ${medians.dividendYield?.toFixed(2)??"—"}%. Yield elevado pode refletir queda do preço ou distribuição extraordinária.`});
 const p=target.payout;observations.push({label:"Payout",tone:p==null?"missing":p>100?"red":p>=40&&p<=70?"green":"amber",text:p==null?"Payout não disponibilizado.":`${p.toFixed(1)}%. O guia refere 40–70% como regra pedagógica, não norma universal. ${p>100?"Acima de 100%: distribuição superior ao lucro da base usada; verificar sustentabilidade.":p===0&&dy!=null&&dy>0?"Yield positivo e payout zero exigem reconciliação de períodos/fontes.":"Confirmar base contabilística e política de dividendos."}`});
 return{medians,observations};
}
const cache=new Map<string,{at:number;data:PeerComparison}>();
export async function getPeerComparison(symbol:string,provided?:TvSnapshot|null):Promise<PeerComparison>{
 symbol=canonicalSymbol(symbol);const cached=cache.get(symbol);if(cached&&Date.now()-cached.at<1800000)return cached.data;
 const snapshot=provided??await fetchTradingView(symbol);const target=snapshot?convert(symbol,String(snapshot.__tv??symbol),snapshot):null;
 const empty:PeerComparison={status:"unavailable",target,peers:[],industry:target?.industry??"",selection:"Mesma indústria, ações ordinárias e listagem primária; preferência por país e moeda semelhantes, sem prometer comparabilidade perfeita.",asOf:new Date().toISOString(),medians:{per:null,pbv:null,roe:null,dividendYield:null,payout:null},observations:[],warnings:["Múltiplos são instantâneos correntes, não uma base point-in-time. Setor, regras contabilísticas e períodos podem diferir."]};
 if(!target?.industry)return empty;
 try{
 const r=await fetch("https://scanner.tradingview.com/global/scan",{method:"POST",headers:{"Content-Type":"application/json","User-Agent":"Mozilla/5.0"},body:JSON.stringify({filter:[{left:"type",operation:"equal",right:"stock"},{left:"industry",operation:"equal",right:target.industry},{left:"is_primary",operation:"equal",right:true}],columns:fields,sort:{sortBy:"market_cap_basic",sortOrder:"desc"},range:[0,50]}),signal:AbortSignal.timeout(6000),cache:"no-store"});
 if(!r.ok)return empty;const j=await r.json() as {data?:{s:string;d:(string|number|null)[]}[]};
 const seen=new Set<string>();const peers=(j.data??[]).flatMap(row=>{const s:TvSnapshot={};fields.forEach((f,i)=>s[f]=row.d[i]??null);const candidate=yahooPeerSymbol(row.s,String(s.country??""));if(!candidate||canonicalSymbol(candidate)===symbol)return[];const p=convert(candidate,row.s,s);if(!p||p.industry!==target.industry)return[];const issuer=p.name.toLowerCase().replace(/\b(class|common|ordinary|shares?|stock|inc|corp|plc|ltd)\b.*$/g,"").replace(/[^a-z0-9]/g,"");if(!issuer||seen.has(issuer))return[];seen.add(issuer);return[p];}).sort((a,b)=>Number(b.country===target.country)-Number(a.country===target.country)||Number(b.currency===target.currency)-Number(a.currency===target.currency)||(b.marketCap??0)-(a.marketCap??0)).slice(0,4);
 const data:PeerComparison={...empty,...comparePeerMetrics(target,peers),peers,status:peers.length>=2?"ok":"insufficient",warnings:[...empty.warnings,...(!peers.some(p=>p.country===target.country)?["Sem concorrentes do mesmo país entre os dados admissíveis; a comparação usa a indústria internacional e não elimina diferenças geográficas."]:[])]};if(cache.size>150)cache.delete(cache.keys().next().value!);cache.set(symbol,{at:Date.now(),data});return data;
 }catch{return empty;}
}
