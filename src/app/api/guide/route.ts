import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
export async function GET(){return NextResponse.json({error:"A leitura do guia foi atualizada. Abre /guia para tendências confirmadas e comparação por indústria.",canonical:"/guia",api:"/api/research/guide"},{status:410,headers:{"Cache-Control":"no-store"}});}
