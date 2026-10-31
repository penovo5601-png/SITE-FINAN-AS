export type ValuationAssumptions={growthPct:number;discountPct:number;terminalGrowthPct:number;years:number;};
export type DcfValue={value:number;presentCashFlows:number;presentTerminal:number;terminalSharePct:number;assumptions:ValuationAssumptions};
/** DCF de FCF por ação como proxy do fluxo para o acionista. Não subtrai dívida uma segunda vez. */
export function discountedCashFlow(fcfPerShare:number,assumptions:ValuationAssumptions):DcfValue|null{
 const {growthPct,discountPct,terminalGrowthPct,years}=assumptions;
 if(![fcfPerShare,growthPct,discountPct,terminalGrowthPct,years].every(Number.isFinite)||fcfPerShare<=0||years<1||years>15||!Number.isInteger(years)||discountPct<=0||discountPct<=terminalGrowthPct||growthPct<=-100)return null;
 const growth=growthPct/100,discount=discountPct/100,terminal=terminalGrowthPct/100;let cash=fcfPerShare,pv=0;
 for(let y=1;y<=years;y++){cash*=1+growth;pv+=cash/(1+discount)**y;}
 const presentTerminal=cash*(1+terminal)/(discount-terminal)/(1+discount)**years;
 const value=pv+presentTerminal;
 return Number.isFinite(value)&&value>0?{value,presentCashFlows:pv,presentTerminal,terminalSharePct:presentTerminal/value*100,assumptions}:null;
}
export function grahamReference(eps:number|null,bookValue:number|null):number|null{
 return eps!=null&&bookValue!=null&&Number.isFinite(eps)&&Number.isFinite(bookValue)&&eps>0&&bookValue>0?Math.sqrt(22.5*eps*bookValue):null;
}
export function valuationGap(value:number|null,price:number):{discountToValuePct:number|null;upsidePct:number|null}{
 return value==null||value<=0||!Number.isFinite(price)||price<=0?{discountToValuePct:null,upsidePct:null}:{discountToValuePct:(value-price)/value*100,upsidePct:(value/price-1)*100};
}
