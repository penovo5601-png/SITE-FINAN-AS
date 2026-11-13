import {NextResponse} from "next/server";
import {POST as calculate} from "../portfolios/route";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function POST(req:Request){return calculate(req);}
export async function GET(){return NextResponse.json({error:"O modelo de carteiras foi atualizado. Recarrega /carteiras para a versão v5 com hipóteses, custos e cenários auditáveis.",canonical:"/carteiras"},{status:410,headers:{"Cache-Control":"no-store"}});}
