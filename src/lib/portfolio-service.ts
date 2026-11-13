import {createHash} from "node:crypto";
import {getPriceHistory} from "./price-history";
import {recoverHistory} from "./history-store";
import {fetchTradingViewBatch,type TvSnapshot} from "./providers/tradingview";
import {getEuroFxHistory,type FxHistory} from "./providers/fx-history";
import {technicalFromHistory} from "./technical-model";
import {guideTechnical} from "./practical-guide";
import {PORTFOLIO_UNIVERSE,PORTFOLIO_POLICY as P,type PortfolioStock} from "./portfolio-universe";
import {alignMonthly,composePortfolio,PROFILES,validPortfolioOptions,type PortfolioCandidate,type PortfolioOptions,type PortfolioResult} from "./portfolio-math";
import type {HistorySnapshot} from "./history-types";

export type PortfolioReport={version:string;id:string;createdAt:string;options:PortfolioOptions;universeCount:number;eligibleCount:number;excluded:{symbol:string;reason:string}[];portfolios:PortfolioResult[];status:"ok"|"insufficient";message:string;data:{oldestQuote:string|null;newestQuote:string|null;fxAsOf:string|null;fxSource:string|null;candidateUniverse:string};methodology:string[];limitations:string[];};
const num=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)?v:null;
function monthKey(t:number){return new Date(t).toISOString().slice(0,7);}
function endOfMonth(key:string){const [y,m]=key.split("-").map(Number);return Date.UTC(y,m,1)-1;}
export function monthlyEuroPrices(history:HistorySnapshot,fx:FxHistory|null,now=Date.now()):Record<string,number>{
 const current=monthKey(now),last=new Map<string,{t:number;value:number}>();
 for(const c of history.candles){const key=monthKey(c.t);if(key>=current||c.t>now)continue;last.set(key,{t:c.t,value:c.c});}
 const foreign=new Map<string,{t:number;value:number}>();if(fx)for(const q of fx.closes){const key=monthKey(q.t);if(key<current)foreign.set(key,q);}
 const result:Record<string,number>={};for(const [key,c] of last){if(endOfMonth(key)-c.t>8*86400000)continue;let rate=1;if(history.currency==="USD"){const q=foreign.get(key);if(!q||endOfMonth(key)-q.t>8*86400000)continue;rate=q.value;}else if(history.currency!=="EUR")continue;result[key]=c.value*rate;}
 return result;
}
function quality(snapshot:TvSnapshot){
 const financial=/financ|bank|insurance/i.test(String(snapshot.sector??"")+" "+String(snapshot.industry??""));
 const roe=num(snapshot.return_on_equity_fq),margin=num(snapshot.net_margin_ttm),growth=num(snapshot.total_revenue_yoy_growth_ttm),de=num(snapshot.debt_to_equity_fq);
 const values=[roe==null?null:Math.max(0,Math.min(100,roe/(financial?15:20)*100)),margin==null?null:Math.max(0,Math.min(100,margin/20*100)),growth==null?null:Math.max(0,Math.min(100,(growth+5)/20*100)),financial||de==null?null:Math.max(0,Math.min(100,(2.5-de)/2.5*100))].filter((v):v is number=>v!=null);
 return{score:values.length?values.reduce((a,b)=>a+b,0)/values.length:0,coverage:values.length};
}
export function candidateFromData(meta:PortfolioStock,h:HistorySnapshot|null,snapshot:TvSnapshot|undefined,fx:FxHistory|null,now=Date.now()):PortfolioCandidate|string{
 if(!h)return"Sem histórico real disponível.";
 if(h.symbol!==meta.symbol)return"Identidade do ticker/bolsa não coincide com o universo.";
 if(h.currency!==meta.currency)return"Moeda da cotação diferente da verificada para este instrumento.";
 if(now-Date.parse(h.lastBarAt)>7*86400000)return`Histórico desatualizado (${h.lastBarAt.slice(0,10)}); não usado como cotação atual.`;
 if(h.priceBasis!=="adjusted")return"Histórico não ajustado: não é usado no modelo de carteiras sem reconciliação de splits/dividendos.";
 if(!snapshot||String(snapshot.type??"").toLowerCase()!=="stock")return"Sem confirmação corrente de ação ordinária; ETFs, ADRs e outros instrumentos não são elegíveis.";
 if(meta.currency==="USD"&&(!fx||now-Date.parse(fx.asOf)>7*86400000))return"Sem histórico/cotação USD/EUR atual verificável.";
 const q=quality(snapshot);if(q.coverage<2)return"Menos de dois critérios empresariais disponíveis; não se inventa qualidade.";
 const monthlyEUR=monthlyEuroPrices(h,fx,now);if(alignMonthly([{monthlyEUR}]).months.length<P.minMonths)return"Menos de 36 meses completos de retornos em EUR.";
 const latest=h.candles.at(-1)!.c,rate=meta.currency==="USD"?fx!.rate:1,a=technicalFromHistory(h.candles,{symbol:meta.symbol,name:meta.name,currency:meta.currency}),guide=guideTechnical(h.candles,now);
 const countryMap:Record<string,string>={"United States":"Estados Unidos",Netherlands:"Países Baixos",Germany:"Alemanha",France:"França",Spain:"Espanha",Portugal:"Portugal",Belgium:"Bélgica","United Kingdom":"Reino Unido",Ireland:"Irlanda"};
 const sourceCountry=typeof snapshot.country==="string"?snapshot.country:"";
 return{...meta,country:countryMap[sourceCountry]??(sourceCountry||meta.country),priceLocal:latest,priceEUR:latest*rate,quoteDate:h.lastBarAt,currencyRate:rate,monthlyEUR,quality:q.score,qualityCoverage:q.coverage,technicalScore:a?.score??0,guideTrend:guide.trend,dividendYield:num(snapshot.dividends_yield),payout:num(snapshot.dividend_payout_ratio_ttm),per:num(snapshot.price_earnings_ttm),roe:num(snapshot.return_on_equity_fq),source:`${h.provider} · ${h.origin} · ajustado`,warnings:[...(guide.trend==="bearish"?["Inclinação baixista: é uma composição de estudo, não uma ordem de compra imediata."]:[]),...(num(snapshot.dividends_yield)!>0&&num(snapshot.dividend_payout_ratio_ttm)===0?["Yield positivo e payout zero: reconciliar os períodos antes de concluir sustentabilidade."]:[]),"Qualidade é uma síntese corrente de ROE, margem, crescimento e alavancagem aplicável; não um rating oficial nem comparação integral com pares."]};
}
const reportCache=new Map<string,{at:number;report:PortfolioReport}>();
let universePending:Promise<{candidates:PortfolioCandidate[];excluded:{symbol:string;reason:string}[];fx:FxHistory|null}>|null=null;
let universeCache:{at:number;data:{candidates:PortfolioCandidate[];excluded:{symbol:string;reason:string}[];fx:FxHistory|null}}|null=null;
async function boundedHistory(symbol:string){
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([getPriceHistory(symbol),new Promise<HistorySnapshot|null>(resolve=>{timer=setTimeout(()=>{void recoverHistory(symbol).then(resolve).catch(()=>resolve(null));},6000);})]);}
 finally{if(timer)clearTimeout(timer);}
}
async function loadUniverse(){
 if(universeCache&&Date.now()-universeCache.at<5*60000)return universeCache.data;if(universePending)return universePending;
 universePending=(async()=>{
 const deadline=Date.now()+30000;
 const [snapshots,fx]=await Promise.all([fetchTradingViewBatch(PORTFOLIO_UNIVERSE.map(c=>c.symbol)),getEuroFxHistory("USD")]);
 const candidates:PortfolioCandidate[]=[],excluded:{symbol:string;reason:string}[]=[];let index=0;
 const worker=async()=>{while(index<PORTFOLIO_UNIVERSE.length&&Date.now()<deadline){const meta=PORTFOLIO_UNIVERSE[index++];try{const history=await boundedHistory(meta.symbol);const c=candidateFromData(meta,history,snapshots.get(meta.symbol),fx);if(typeof c==="string")excluded.push({symbol:meta.symbol,reason:c});else candidates.push(c);}catch{excluded.push({symbol:meta.symbol,reason:"A fonte não respondeu dentro do orçamento de tempo."});}}};
 await Promise.all(Array.from({length:5},worker));while(index<PORTFOLIO_UNIVERSE.length){excluded.push({symbol:PORTFOLIO_UNIVERSE[index++].symbol,reason:"Orçamento de tempo de recolha esgotado; não foi inventada uma cotação."});}const data={candidates:candidates.sort((a,b)=>a.symbol.localeCompare(b.symbol)),excluded,fx};universeCache={at:Date.now(),data};return data;
 })();try{return await universePending;}finally{universePending=null;}
}
export async function buildPortfolioReport(input:Record<string,unknown>):Promise<PortfolioReport>{
 const options=validPortfolioOptions(input),key=JSON.stringify(options),hit=reportCache.get(key);if(hit&&Date.now()-hit.at<5*60000)return hit.report;
 const data=await loadUniverse(),candidates=data.candidates.filter(c=>options.region!=="eur"||c.currency==="EUR");
 const fingerprint=createHash("sha256").update(JSON.stringify({version:P.version,options,data:candidates.map(c=>({symbol:c.symbol,price:c.priceEUR,at:c.quoteDate,monthly:c.monthlyEUR,quality:c.quality}))})).digest("hex");
 const simulationHash=createHash("sha256").update(JSON.stringify({version:P.version,monthly:candidates.map(c=>({symbol:c.symbol,monthly:c.monthlyEUR}))})).digest("hex");
 const pairedSeed=parseInt(simulationHash.slice(0,8),16);
 const portfolios=PROFILES.flatMap(p=>{const r=composePortfolio(candidates,options,p,pairedSeed);return r?[r]:[]});
 const quotes=candidates.map(c=>c.quoteDate).sort();
 const report:PortfolioReport={version:P.version,id:fingerprint.slice(0,16),createdAt:new Date().toISOString(),options,universeCount:PORTFOLIO_UNIVERSE.length,eligibleCount:candidates.length,excluded:data.excluded,portfolios,status:portfolios.length?"ok":"insufficient",message:portfolios.length?"Composições pedagógicas long-only, sem ordens automáticas. A estimativa é condicionada às hipóteses e aos dados identificados.":"Não há uma composição que cumpra simultaneamente orçamento, ações inteiras, dados e limites de diversificação. Aumenta o capital ou aguarda fontes completas; não preenchemos com ETFs, empréstimos ou preços inventados.",data:{oldestQuote:quotes[0]??null,newestQuote:quotes.at(-1)??null,fxAsOf:data.fx?.asOf??null,fxSource:data.fx?.source??null,candidateUniverse:"Universo pedagógico declarado de 35 ações ordinárias EUR/USD, não pesquisa exaustiva de todas as ações mundiais."},methodology:["Seleção heurística por qualidade/volatilidade/dividendos; diversidade primeiro e ranking depois. Não promete ótimo de Markowitz nem melhor carteira futura.","12 emitentes, pelo menos 5 setores e 4 países. Limites iniciais: emitente 12,5%, setor 25%, país 40%. Sem crédito, short, ETFs, opções ou criptoativos.","Quantidades inteiras e custos de entrada/saída. O saldo residual não investido tem retorno assumido zero e é mostrado separadamente.","Preços em EUR: ações USD convertidas com USD/EUR observado. Retornos históricos usam fechos mensais coincidentes de ações e FX; não se alinham mercados por índice de array.","Até 60 meses comuns completos e contínuos; mínimo 36. O mês corrente parcial é excluído. Fontes sem ajuste ou desatualizadas são rejeitadas.","Retorno anual do modelo: 75% de hipótese explícita de mercado e 25% do crescimento geométrico histórico limitado a −8%/+12%. A normalização do momento dos blocos impede inflacionar a média apenas por volatilidade. Não é uma previsão de analistas nem uma taxa de acerto.","2.500 trajetórias por composição, semente baseada no histórico completo e hipóteses (não na hora intradiária), com números aleatórios comuns para comparar composições. Bootstrap circular conjunto de blocos de 3 meses. Preserva dependência observada entre ações e parte da sequência, sem assumir independência entre ativos.","Sem rebalanceamento: o valor de cada posição evolui e os pesos derivam. Não se somam dividendos outra vez a séries já ajustadas.","O gráfico de cenários é capital simulado, nunca velas ou cotações reais. Percentis P10/P90 não são intervalos de confiança calibrados do futuro."],limitations:["Toda a carteira investida é acionista. Pode haver perdas elevadas e todas as ações podem cair em conjunto.","A amostra recente pode não conter crises futuras. A simulação pode subestimar caudas, risco de liquidez, alterações cambiais e incerteza das médias.","A seleção de empresas sobreviventes/currentes tem viés de seleção; o controlo temporal final não valida fora da amostra a escolha das ações.","Custos são hipóteses do formulário; não inclui impostos pessoais, inflação, bid/ask em tempo real ou execução garantida de stops.","Isto é apoio académico geral, não aconselhamento personalizado ou adequação à situação financeira de uma pessoa."]};
 if(reportCache.size>30)reportCache.delete(reportCache.keys().next().value!);reportCache.set(key,{at:Date.now(),report});return report;
}
