import {NextResponse} from "next/server";
import {canonicalSymbol,validSymbol} from "@/lib/history-types";
import {getPriceHistory} from "@/lib/price-history";
import {getPeerComparison} from "@/lib/peer-comparison";
import {buildGuideReport,guideTechnical} from "@/lib/practical-guide";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function GET(req:Request){
 const symbol=canonicalSymbol((new URL(req.url).searchParams.get("symbol")??"").trim());if(!validSymbol(symbol))return NextResponse.json({error:"Escolhe um ticker de ação válido."},{status:400});
 const [history,peers]=await Promise.all([getPriceHistory(symbol),getPeerComparison(symbol)]);
 if(!history&&!peers.target)return NextResponse.json({error:"Sem dados reais suficientes para esta ação."},{status:404});
 return NextResponse.json({symbol,report:buildGuideReport(guideTechnical(history?.candles??[]),peers)},{headers:{"Cache-Control":"no-store"}});
}
