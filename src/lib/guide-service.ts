import type {StockAnalysis} from "./engine";
import type {MarketData} from "./market-data";
import {getPeerComparison} from "./peer-comparison";
import {buildGuideReport,guideTechnical} from "./practical-guide";
export async function attachPracticalGuide(a:StockAnalysis,md:MarketData):Promise<StockAnalysis>{
 const peers=await getPeerComparison(md.symbol,md.scanner);
 a.guide=buildGuideReport(guideTechnical(md.validationCandles??md.candles??[]),peers);
 return a;
}
