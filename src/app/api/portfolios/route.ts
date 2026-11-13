import {NextResponse} from "next/server";
import {buildPortfolioReport} from "@/lib/portfolio-service";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"no-store"};
const requests=new Map<string,{since:number;count:number}>();
export async function POST(req:Request){
 const ip=req.headers.get("x-forwarded-for")?.split(",")[0]??"local",now=Date.now(),previous=requests.get(ip);
 if(previous&&now-previous.since<60000&&previous.count>=15)return NextResponse.json({error:"Muitas simulações seguidas. Aguarda um minuto."},{status:429,headers});
 if(!previous||now-previous.since>=60000)requests.set(ip,{since:now,count:1});else previous.count++;
 if(requests.size>300)requests.delete(requests.keys().next().value!);
 if(Number(req.headers.get("content-length")??0)>12000)return NextResponse.json({error:"Pedido demasiado grande."},{status:413,headers});
 let input:Record<string,unknown>;
 try{input=await req.json();if(!input||typeof input!=="object"||Array.isArray(input))throw new Error();}catch{return NextResponse.json({error:"Pedido inválido."},{status:400,headers});}
 try{return NextResponse.json(await buildPortfolioReport(input),{headers});}
 catch(e){const message=e instanceof Error?e.message:"Não foi possível calcular a composição.";return NextResponse.json({error:message},{status:400,headers});}
}
