import { NextResponse } from "next/server";
import { getPriceHistory } from "@/lib/price-history";
import { canonicalSymbol, historyEvidence, validSymbol } from "@/lib/history-types";
import { RESEARCH_VERSION } from "@/lib/research-policy";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function GET(req:Request){
 const url=new URL(req.url),symbol=canonicalSymbol((url.searchParams.get("symbol")??"").trim());
 if(!validSymbol(symbol))return NextResponse.json({error:"Ticker de ação inválido."},{status:400});
 const snapshot=await getPriceHistory(symbol,url.searchParams.get("refresh")==="1");
 if(!snapshot)return NextResponse.json({symbol,snapshot:null,retryable:true,version:RESEARCH_VERSION,message:"Nenhuma fonte OHLC respondeu. O gráfico mantém as cópias reais locais e oferece o fornecedor independente; não gera velas fictícias."},{status:503,headers:{"Cache-Control":"no-store"}});
 return NextResponse.json({snapshot,evidence:historyEvidence(snapshot),version:RESEARCH_VERSION},{headers:{"Cache-Control":"no-store"}});
}
