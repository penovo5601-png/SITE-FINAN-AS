import {PORTFOLIO_POLICY as P,type PortfolioStock} from "./portfolio-universe";
export type PortfolioOptions={capital:number;horizonMonths:6|12|24;equityPriorPct:number;feeBps:number;feePerOrder:number;region:"global"|"eur"};
export type PortfolioCandidate=PortfolioStock&{priceEUR:number;priceLocal:number;quoteDate:string;currencyRate:number;monthlyEUR:Record<string,number>;quality:number;qualityCoverage:number;technicalScore:number;guideTrend:string;dividendYield:number|null;payout:number|null;per:number|null;roe:number|null;source:string;warnings:string[]};
export type Holding=PortfolioCandidate&{quantity:number;amountEUR:number;weight:number;reasons:string[];entryCondition:string};
export type PortfolioConstraints={issuerMaxPct:number;sectorMaxPct:number;countryMaxPct:number;sectors:number;countries:number;hhi:number;passed:boolean;checks:{label:string;pass:boolean;value:string}[]};
export type PortfolioModel={monteCarloStdErrorPct:number;meanReturnPct:number;medianReturnPct:number;p10Pct:number;p90Pct:number;p05Pct:number;lossFrequencyPct:number;expectedShortfall5Pct:number;annualVolatilityPct:number;meanCorrelation:number|null;fan:{month:number;p10:number;p50:number;p90:number}[];annualReturnAssumptions:{symbol:string;historicalPct:number;shrunkPct:number}[];seed:number;paths:number;};
export type PortfolioResult={id:string;name:string;description:string;holdings:Holding[];investedEUR:number;entryCostEUR:number;estimatedExitCostEUR:number;cashEUR:number;constraints:PortfolioConstraints;sectorWeights:{label:string;weight:number}[];countryWeights:{label:string;weight:number}[];currencyWeights:{label:string;weight:number}[];months:string[];historical:{cagrPct:number;totalReturnPct:number;maxDrawdownPct:number;curve:{month:string;value:number}[]};model:PortfolioModel;holdout:null|{trainingFrom:string;trainingTo:string;testFrom:string;testTo:string;observedReturnPct:number;modelMedianPct:number;modelP10Pct:number;modelP90Pct:number;insideBand:boolean;note:string};stress:{label:string;returnPct:number;endingEUR:number}[];warnings:string[]};
export const PROFILES=[{id:"quality",name:"Qualidade diversificada",description:"Qualidade observada e distribuição por empresas, setores e países; não é uma carteira de baixo risco."},{id:"balanced",name:"Menor volatilidade relativa",description:"Prefere oscilações históricas mais baixas dentro de ações; continua exposta ao risco de mercado acionista."},{id:"income",name:"Dividendos com disciplina",description:"Prefere dividendos observados com limites de yield/payout e qualidade; distribuições futuras não são garantidas."}] as const;
export function validPortfolioOptions(input:Record<string,unknown>):PortfolioOptions{
 const capital=Number(input.capital??100000),horizonMonths=Number(input.horizonMonths??12),equityPriorPct=Number(input.equityPriorPct??6),feeBps=Number(input.feeBps??10),feePerOrder=Number(input.feePerOrder??1);
 if(!Number.isFinite(capital)||capital<P.minCapital||capital>P.maxCapital)throw new Error("O capital tem de estar entre 100 € e 100.000 €.");
 if(![6,12,24].includes(horizonMonths))throw new Error("Escolhe um horizonte de 6, 12 ou 24 meses.");
 if(!Number.isFinite(equityPriorPct)||equityPriorPct<0||equityPriorPct>12)throw new Error("A hipótese anual tem de estar entre 0% e 12%.");
 if(!Number.isFinite(feeBps)||feeBps<0||feeBps>100||!Number.isFinite(feePerOrder)||feePerOrder<0||feePerOrder>20)throw new Error("Custos inválidos: 0–100 bps e 0–20 € por ordem.");
 if(input.region!=null&&!["global","eur"].includes(String(input.region)))throw new Error("Universo de ações inválido.");
 return{capital,horizonMonths:horizonMonths as 6|12|24,equityPriorPct,feeBps,feePerOrder,region:input.region==="eur"?"eur":"global"};
}
export function monthIndex(key:string):number{const [y,m]=key.split("-").map(Number);return y*12+m-1;}
export function alignMonthly(candidates:Pick<PortfolioCandidate,"monthlyEUR">[]):{months:string[];logs:number[][]}{
 if(!candidates.length)return{months:[],logs:[]};
 const keys=Object.keys(candidates[0].monthlyEUR).sort();const possible=keys.filter(k=>candidates.every(c=>Number.isFinite(c.monthlyEUR[k])&&c.monthlyEUR[k]>0));
 const rows:{month:string;values:number[]}[]=[];
 for(let i=1;i<possible.length;i++){if(monthIndex(possible[i])-monthIndex(possible[i-1])!==1)continue;rows.push({month:possible[i],values:candidates.map(c=>Math.log(c.monthlyEUR[possible[i]]/c.monthlyEUR[possible[i-1]]))});}
 // Último bloco CONTÍNUO, não uma sequência que salta meses em falta.
 let latest:typeof rows=[];for(const row of rows){if(latest.length&&monthIndex(row.month)-monthIndex(latest.at(-1)!.month)!==1)latest=[];latest.push(row);}
 latest=latest.slice(-P.maxMonths);return{months:latest.map(r=>r.month),logs:latest.map(r=>r.values)};
}
const mean=(v:number[])=>v.reduce((a,b)=>a+b,0)/Math.max(1,v.length);
const sd=(v:number[])=>v.length>1?Math.sqrt(v.reduce((a,b)=>a+(b-mean(v))**2,0)/(v.length-1)):0;
export function correlation(a:number[],b:number[]):number|null{if(a.length!==b.length||a.length<3)return null;const ma=mean(a),mb=mean(b);let x=0,y=0,z=0;for(let i=0;i<a.length;i++){x+=(a[i]-ma)*(b[i]-mb);y+=(a[i]-ma)**2;z+=(b[i]-mb)**2;}return y>0&&z>0?Math.max(-1,Math.min(1,x/Math.sqrt(y*z))):null;}
export function quantile(values:number[],q:number):number{const a=[...values].sort((a,b)=>a-b);const i=(a.length-1)*q,l=Math.floor(i);return a[l]+(a[Math.min(a.length-1,l+1)]-a[l])*(i-l);}
function random(seed:number){let state=seed>>>0;return()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export function exposure(holdings:Holding[],key:"sector"|"country"|"currency"):{label:string;weight:number}[]{const m=new Map<string,number>();for(const h of holdings)m.set(h[key],(m.get(h[key])??0)+h.weight);return [...m.entries()].map(([label,weight])=>({label,weight})).sort((a,b)=>b.weight-a.weight);}
export function checkDiversification(holdings:Holding[]):PortfolioConstraints{
 const sectors=exposure(holdings,"sector"),countries=exposure(holdings,"country"),issuer=new Map<string,number>();for(const h of holdings)issuer.set(h.issuer,(issuer.get(h.issuer)??0)+h.weight);
 const maxIssuer=Math.max(0,...issuer.values()),maxSector=Math.max(0,...sectors.map(s=>s.weight)),maxCountry=Math.max(0,...countries.map(s=>s.weight));
 const checks=[{label:"Máximo por emitente 12,5%",pass:maxIssuer<=P.maxIssuerWeight+1e-8,value:`${(maxIssuer*100).toFixed(1)}%`},{label:"Máximo por setor 25%",pass:maxSector<=P.maxSectorWeight+1e-8,value:`${(maxSector*100).toFixed(1)}%`},{label:"Máximo por país 40%",pass:maxCountry<=P.maxCountryWeight+1e-8,value:`${(maxCountry*100).toFixed(1)}%`},{label:"Pelo menos 5 setores",pass:sectors.length>=P.minSectors,value:String(sectors.length)},{label:"Pelo menos 4 países",pass:countries.length>=P.minCountries,value:String(countries.length)},{label:"Só posições longas e ações inteiras",pass:holdings.every(h=>Number.isInteger(h.quantity)&&h.quantity>0),value:`${holdings.length} ações/emitentes`}];
 return{issuerMaxPct:maxIssuer*100,sectorMaxPct:maxSector*100,countryMaxPct:maxCountry*100,sectors:sectors.length,countries:countries.length,hhi:[...issuer.values()].reduce((s,w)=>s+w*w,0),passed:checks.every(c=>c.pass),checks};
}
function volatility(c:PortfolioCandidate){const keys=Object.keys(c.monthlyEUR).sort();const rets=keys.slice(1).flatMap((k,i)=>monthIndex(k)-monthIndex(keys[i])===1?[Math.log(c.monthlyEUR[k]/c.monthlyEUR[keys[i]])]:[]);return sd(rets)*Math.sqrt(12)*100;}
function rank(c:PortfolioCandidate,profile:string):number{
 if(profile==="balanced")return c.quality*0.55+Math.max(0,50-volatility(c))*0.8+Math.max(-10,Math.min(10,c.technicalScore))*0.3;
 if(profile==="income")return c.quality*0.55+(c.dividendYield!=null&&c.dividendYield>0&&c.dividendYield<=8?c.dividendYield*6:0)+(c.payout!=null&&c.payout>=20&&c.payout<=80?10:0)-Math.max(0,volatility(c)-30)*0.3;
 return c.quality*0.8+Math.max(-20,Math.min(20,c.technicalScore))*0.5-Math.max(0,volatility(c)-35)*0.2;
}
export function allocatePortfolio(candidates:PortfolioCandidate[],options:PortfolioOptions,profile:string):Holding[]{
 const target=(options.capital-P.holdings*options.feePerOrder)/(1+options.feeBps/10000)/P.holdings;
 const ranked=candidates.filter(c=>c.priceEUR>0&&c.priceEUR<=target&&(options.region!=="eur"||c.currency==="EUR")&&(profile!=="income"||(c.dividendYield!=null&&c.dividendYield>0&&c.dividendYield<=8&&(c.payout==null||c.payout<=100)))).sort((a,b)=>rank(b,profile)-rank(a,profile)||a.symbol.localeCompare(b.symbol));
 const selected:PortfolioCandidate[]=[];const issuers=new Set<string>();const sectorCount=new Map<string,number>(),countryCount=new Map<string,number>();
 // Diversidade primeiro, ranking depois: garante cobertura sem prometer ótimo global.
 const add=(c:PortfolioCandidate)=>{if(selected.length>=P.holdings||issuers.has(c.issuer)||(sectorCount.get(c.sector)??0)>=3||(countryCount.get(c.country)??0)>=4)return false;selected.push(c);issuers.add(c.issuer);sectorCount.set(c.sector,(sectorCount.get(c.sector)??0)+1);countryCount.set(c.country,(countryCount.get(c.country)??0)+1);return true;};
 for(const c of ranked)if(!countryCount.has(c.country))add(c);
 for(const c of ranked)if(!sectorCount.has(c.sector))add(c);
 for(const c of ranked)add(c);
 if(selected.length!==P.holdings)return[];
 const holdings:Holding[]=selected.map(c=>({...c,quantity:Math.floor(target/c.priceEUR),amountEUR:0,weight:0,reasons:[`Pilar de qualidade corrente ${c.quality.toFixed(0)}/100, com ${c.qualityCoverage} critérios disponíveis.`,`${c.sector} · ${c.country}; emitente distinto, sem ETF nem alavancagem.`,c.roe!=null?`ROE da fonte ${c.roe.toFixed(1)}%.`:"ROE indisponível: não foi preenchido com zero.",profile==="income"?`Yield observado ${c.dividendYield?.toFixed(2)??"—"}%; payout ${c.payout?.toFixed(1)??"—"}%. Não se soma yield a retornos já ajustados.`:profile==="balanced"?`Volatilidade histórica individual ${volatility(c).toFixed(1)}% anualizada; não equivale a risco baixo.`:`Score técnico corrente ${c.technicalScore.toFixed(1)}; não é uma previsão de retorno anual.`],entryCondition:c.guideTrend==="bearish"?"Tendência baixista no guia: composição teórica, aguardar confirmação antes de iniciar compra.":`Guia: ${c.guideTrend}. Confirmar entrada, suporte e plano de saída; a simulação não executa ordens.`}));
 const update=()=>{for(const h of holdings){h.amountEUR=h.quantity*h.priceEUR;h.weight=h.amountEUR/options.capital;}};update();
 // O arredondamento só acrescenta ações se todos os limites e o orçamento continuarem cumpridos.
 for(let k=0;k<10000;k++){
  const invested=holdings.reduce((n,h)=>n+h.amountEUR,0),entry=invested*options.feeBps/10000+holdings.length*options.feePerOrder,remaining=options.capital-invested-entry;
  const order=[...holdings].sort((a,b)=>(1/P.holdings-a.weight)-(1/P.holdings-b.weight)).reverse();let bought=false;
  for(const h of order){if(h.priceEUR*(1+options.feeBps/10000)>remaining+1e-8)continue;h.quantity++;update();if(checkDiversification(holdings).passed){bought=true;break;}h.quantity--;update();}
  if(!bought)break;
 }
 return checkDiversification(holdings).passed?holdings:[];
}
function endingValue(values:number[],cash:number,o:PortfolioOptions){return Math.max(0,values.reduce((a,b)=>a+b,0)*(1-o.feeBps/10000)+cash-values.length*o.feePerOrder);}
export function simulatePortfolio(holdings:Holding[],rows:number[][],options:PortfolioOptions,seed:number,months:number=options.horizonMonths,paths:number=P.paths):PortfolioModel{
 if(rows.length<P.minMonths||!holdings.length)throw new Error("São necessários pelo menos 36 meses conjuntos completos.");
 const count=holdings.length,means=holdings.map((_,i)=>mean(rows.map(r=>r[i])));
 const targets=means.map(m=>(1-P.shrinkage)*Math.max(-0.08,Math.min(0.12,Math.expm1(m*12)))+P.shrinkage*options.equityPriorPct/100);
 const drift=targets.map(Math.log1p);
 // Normalização do momento do bloco: não transformar volatilidade em retorno médio gratuito.
 const blockCorrection=means.map((_,a)=>Math.log(mean(rows.map((__,start)=>Math.exp(Array.from({length:P.blockMonths},(_,j)=>rows[(start+j)%rows.length][a]-means[a]).reduce((x,y)=>x+y,0)))))/P.blockMonths);
 const invested=holdings.reduce((n,h)=>n+h.amountEUR,0),entry=invested*options.feeBps/10000+count*options.feePerOrder,cash=options.capital-invested-entry;
 if(cash<-1e-7)throw new Error("Orçamento insuficiente para suportar os custos.");
 const terminal:number[]=[],fan:number[][]=Array.from({length:months+1},()=>[]);
 for(let p=0;p<paths;p++){const rng=random(seed+Math.imul(p+1,0x9e3779b9));const values=holdings.map(h=>h.amountEUR);fan[0].push(options.capital);let index=0;
  for(let t=0;t<months;t++){if(t%P.blockMonths===0)index=Math.floor(rng()*rows.length);else index=(index+1)%rows.length;for(let a=0;a<count;a++)values[a]*=Math.exp(rows[index][a]-means[a]+drift[a]/12-blockCorrection[a]);fan[t+1].push(t===months-1?endingValue(values,cash,options):values.reduce((a,b)=>a+b,0)+cash);}
  terminal.push(endingValue(values,cash,options));
 }
 const returns=terminal.map(v=>(v/options.capital-1)*100),threshold=quantile(returns,0.05),tail=returns.filter(r=>r<=threshold);
 const weighted=rows.map(row=>row.reduce((sum,r,i)=>sum+holdings[i].weight*Math.expm1(r),0));
 const correlations:number[]=[];for(let i=0;i<count;i++)for(let j=i+1;j<count;j++){const c=correlation(rows.map(r=>r[i]),rows.map(r=>r[j]));if(c!=null)correlations.push(c);}
 return{monteCarloStdErrorPct:sd(returns)/Math.sqrt(paths),meanReturnPct:mean(returns),medianReturnPct:quantile(returns,0.5),p10Pct:quantile(returns,0.1),p90Pct:quantile(returns,0.9),p05Pct:threshold,lossFrequencyPct:returns.filter(v=>v<0).length/returns.length*100,expectedShortfall5Pct:mean(tail),annualVolatilityPct:sd(weighted)*Math.sqrt(12)*100,meanCorrelation:correlations.length?mean(correlations):null,fan:fan.map((v,month)=>({month,p10:quantile(v,0.1),p50:quantile(v,0.5),p90:quantile(v,0.9)})),annualReturnAssumptions:holdings.map((h,i)=>({symbol:h.symbol,historicalPct:Math.expm1(means[i]*12)*100,shrunkPct:targets[i]*100})),seed,paths};
}
export function realizedPortfolio(holdings:Holding[],rows:number[][],months:string[],o:PortfolioOptions):PortfolioResult["historical"]{
 const invested=holdings.reduce((n,h)=>n+h.amountEUR,0),entry=invested*o.feeBps/10000+holdings.length*o.feePerOrder,cash=o.capital-invested-entry,values=holdings.map(h=>h.amountEUR);let peak=o.capital,dd=0;
 const curve=rows.map((row,k)=>{for(let a=0;a<values.length;a++)values[a]*=Math.exp(row[a]);const value=k===rows.length-1?endingValue(values,cash,o):values.reduce((a,b)=>a+b,0)+cash;peak=Math.max(peak,value);dd=Math.min(dd,(value/peak-1)*100);return{month:months[k],value};});
 const end=curve.at(-1)?.value??o.capital;return{totalReturnPct:(end/o.capital-1)*100,cagrPct:(Math.pow(end/o.capital,12/rows.length)-1)*100,maxDrawdownPct:dd,curve};
}
export function composePortfolio(candidates:PortfolioCandidate[],o:PortfolioOptions,profile:typeof PROFILES[number],seed:number):PortfolioResult|null{
 const holdings=allocatePortfolio(candidates,o,profile.id);if(!holdings.length)return null;const aligned=alignMonthly(holdings);if(aligned.months.length<P.minMonths)return null;
 const invested=holdings.reduce((n,h)=>n+h.amountEUR,0),entryCost=invested*o.feeBps/10000+holdings.length*o.feePerOrder,cash=o.capital-invested-entryCost;
 if(cash<-1e-6)throw new Error("O arredondamento excedeu o orçamento.");
 const model=simulatePortfolio(holdings,aligned.logs,o,seed);const historical=realizedPortfolio(holdings,aligned.logs,aligned.months,o);
 let holdout:PortfolioResult["holdout"]=null;
 if(aligned.logs.length>=P.minMonths+12){const split=aligned.logs.length-12,train=aligned.logs.slice(0,split),test=aligned.logs.slice(split),m=simulatePortfolio(holdings,train,o,seed+19,12,1000),observed=realizedPortfolio(holdings,test,aligned.months.slice(split),o).totalReturnPct;holdout={trainingFrom:aligned.months[0],trainingTo:aligned.months[split-1],testFrom:aligned.months[split],testTo:aligned.months.at(-1)!,observedReturnPct:observed,modelMedianPct:m.medianReturnPct,modelP10Pct:m.p10Pct,modelP90Pct:m.p90Pct,insideBand:observed>=m.p10Pct&&observed<=m.p90Pct,note:"Uma única janela cronológica do cenário. Os constituintes foram escolhidos hoje: existe viés de seleção/sobrevivência. Não é validação fora da amostra da estratégia de seleção nem calibração probabilística."};}
 const stress=(label:string,fn:(h:Holding)=>number)=>{const end=endingValue(holdings.map(h=>h.amountEUR*fn(h)),cash,o);return{label,endingEUR:end,returnPct:(end/o.capital-1)*100};};
 return{id:profile.id,name:profile.name,description:profile.description,holdings,investedEUR:invested,entryCostEUR:entryCost,estimatedExitCostEUR:invested*o.feeBps/10000+holdings.length*o.feePerOrder,cashEUR:cash,constraints:checkDiversification(holdings),sectorWeights:exposure(holdings,"sector"),countryWeights:exposure(holdings,"country"),currencyWeights:exposure(holdings,"currency"),months:aligned.months,historical,model,holdout,stress:[stress("Queda conjunta de 25% nas ações",()=>0.75),stress("USD perde 10% face ao EUR; ações locais constantes",h=>h.currency==="USD"?0.9:1)],warnings:["100% dos instrumentos investidos são ações; isto não é uma carteira conservadora. O saldo residual é operacional, sem rendimento assumido.","Limites de diversificação são da composição inicial. Não há rebalanceamento automático e os pesos podem desviar-se.","País é domicílio/listagem de referência, não distribuição geográfica de receitas. Diversificar países não elimina risco sistémico.","Histórico da seleção atual é descritivo e tem viés de seleção/sobrevivência. Não prova uma vantagem futura.","Percentis e frequência de perdas são resultados do modelo condicionado às hipóteses, não probabilidades futuras calibradas. O passado pode subestimar crises não observadas.","Retornos ajustados não recebem dividendos somados uma segunda vez. Impostos, inflação, spreads reais variáveis e impacto de mercado não são modelados.",...holdings.flatMap(h=>h.warnings.map(w=>`${h.symbol}: ${w}`)).slice(0,8)]};
}
