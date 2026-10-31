import type { StockAnalysis } from "./engine";
import type { MarketData } from "./market-data";
import { buildCompanyResearch } from "./company-research";
import { fetchFinancialStatements,fetchFx,type FinancialStatements } from "./providers/financials";

/** Contexto empresarial corrente, deliberadamente separado do backtest técnico. */
export async function attachCompanyResearch(a:StockAnalysis,md:MarketData,provided?:FinancialStatements):Promise<StockAnalysis>{
 const statements=provided??await fetchFinancialStatements(md.symbol);
 const snapshotCurrency=typeof md.scanner?.fundamental_currency_code==="string"?md.scanner.fundamental_currency_code:null;
 const currencies=[...new Set([snapshotCurrency,...statements.years.map(y=>y.currency)].filter((c):c is string=>!!c))];
 const fx=(await Promise.all(currencies.map(c=>fetchFx(c,a.currency)))).filter((q):q is NonNullable<typeof q>=>q!=null);
 a.company=buildCompanyResearch({symbol:a.symbol,price:a.price,quoteCurrency:a.currency,sector:a.sector||String(md.scanner?.sector??""),scanner:md.scanner,statements,fx,history:md.validationCandles??md.candles??[],historyEvidence:md.historyEvidence});
 return a;
}
