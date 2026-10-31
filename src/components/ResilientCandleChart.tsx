"use client";

import { useEffect, useMemo, useState } from "react";
import type { StockAnalysis } from "@/lib/engine";
import type { Candle } from "@/lib/yahoo";
import { canonicalSymbol, validHistory, type HistorySnapshot } from "@/lib/history-types";
import { sma, bollinger, rsi } from "@/lib/indicators";
import CandleChart from "./CandleChart";

function externalSymbol(symbol:string,known?:string|null):string{
 if(known)return known;const s=canonicalSymbol(symbol),dot=s.lastIndexOf("."),base=dot>0?s.slice(0,dot):s,suffix=dot>0?s.slice(dot+1):"";
 const map:Record<string,string>={LS:"EURONEXT",PA:"EURONEXT",AS:"EURONEXT",BR:"EURONEXT",DE:"XETRA",F:"FWB",MI:"MIL",MC:"BME",L:"LSE",T:"TSE",SA:"BMFBOVESPA",HK:"HKEX",SS:"SSE",SZ:"SZSE",TO:"TSX",AX:"ASX",SW:"SIX"};
 return map[suffix]?`${map[suffix]}:${base}`:base;
}
function ExternalChart({symbol}:{symbol:string}){
 const [failed,setFailed]=useState(false);
 const params=new URLSearchParams({symbol,interval:"D",theme:"dark",style:"1",locale:"pt",timezone:"Etc/UTC",allow_symbol_change:"0",hide_top_toolbar:"0",save_image:"0"});
 return <div><iframe title={`Gráfico de velas independente · ${symbol}`} src={`https://s.tradingview.com/widgetembed/?${params}`} className="h-[440px] w-full rounded-xl border-0 bg-slate-950" allowFullScreen loading="lazy" onError={()=>setFailed(true)} data-external-chart="TradingView"/>{failed&&<p className="mt-2 text-xs text-amber-300">O fornecedor externo não respondeu. Podes abrir a ligação direta abaixo.</p>}<a href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[11px] font-semibold text-sky-300">Gráfico {symbol} por TradingView ↗</a><p className="mt-1 text-[10px] text-slate-500">Fonte gráfica independente, isolada num iframe. Não fabrica dados OHLC para o modelo interno.</p></div>;
}
function readBrowser(symbol:string):HistorySnapshot|null{
 try{const item=localStorage.getItem(`market-history:${symbol}`);if(!item)return null;const h=JSON.parse(item) as HistorySnapshot;return validHistory(h,symbol)?{...h,origin:"browser"}:null;}catch{return null;}
}
function saveBrowser(snapshot:HistorySnapshot){
 try{if(!validHistory(snapshot))return;localStorage.setItem(`market-history:${snapshot.symbol}`,JSON.stringify({...snapshot,candles:snapshot.candles.slice(-720)}));const keys=Object.keys(localStorage).filter(k=>k.startsWith("market-history:"));if(keys.length>16){const records=keys.map(k=>{try{return{k,at:Date.parse(JSON.parse(localStorage.getItem(k)!).fetchedAt)}}catch{return{k,at:0}}}).sort((a,b)=>a.at-b.at);for(const item of records.slice(0,keys.length-16))localStorage.removeItem(item.k);}}catch{/* armazenamento indisponível não interrompe o gráfico */}
}
function weekly(input:Candle[]):Candle[]{const result=new Map<number,Candle>();for(const c of input){const d=new Date(c.t),day=(d.getUTCDay()+6)%7,t=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-day),p=result.get(t);if(p){p.h=Math.max(p.h,c.h);p.l=Math.min(p.l,c.l);p.c=c.c;p.v+=c.v;}else result.set(t,{...c,t});}return [...result.values()];}

export default function ResilientCandleChart({symbol,analysis}:{symbol:string;analysis?:StockAnalysis|null}){
 const canonical=canonicalSymbol(symbol);const initial=analysis?.chartCandles??analysis?.candles;const incoming=!!initial&&initial.length>=2;
 const [recovered,setRecovered]=useState<HistorySnapshot|null>(null),[loading,setLoading]=useState(false),[attempt,setAttempt]=useState(0),[external,setExternal]=useState(false);
 const tv=externalSymbol(canonical,analysis?.fundamentals?.tvSymbol);
 useEffect(()=>{setRecovered(null);setExternal(false);const stored=readBrowser(canonical);if(stored)setRecovered(stored);},[canonical]);
 useEffect(()=>{if(!incoming||analysis?.interval!=="1d"||!analysis.historyEvidence)return;saveBrowser({...analysis.historyEvidence,symbol:canonical,interval:"1d",candles:initial!});},[canonical,incoming,initial,analysis?.historyEvidence,analysis?.interval]);
 useEffect(()=>{if(incoming&&attempt===0)return;const controller=new AbortController();setLoading(true);
  fetch(`/api/history?symbol=${encodeURIComponent(canonical)}${attempt?"&refresh=1":""}`,{signal:controller.signal,cache:"no-store"}).then(r=>r.json()).then((data:{snapshot?:HistorySnapshot})=>{if(controller.signal.aborted)return;if(data.snapshot&&validHistory(data.snapshot,canonical)){setRecovered(data.snapshot);saveBrowser(data.snapshot);}}).catch(()=>{}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
  return()=>controller.abort();
 },[canonical,incoming,attempt]);
 const useIncoming=incoming&&(!recovered||attempt===0);
 const all=useMemo(()=>useIncoming?initial!:recovered?(analysis?.interval==="1wk"?weekly(recovered.candles):recovered.candles):[],[useIncoming,initial,recovered,analysis?.interval]);
 const maxVisible=analysis?.range==="5y"?1500:analysis?.range==="2y"?600:analysis?.range==="1y"?300:180;
 const visible=all.slice(-maxVisible),price=visible.at(-1)?.c;
 const lines=useMemo(()=>{if(useIncoming&&analysis?.series.rsi14.length===all.length)return{...analysis.series,rsi:analysis.series.rsi14};const closes=all.map(c=>c.c),bb=bollinger(closes);return{sma20:sma(closes,20).slice(-maxVisible),sma50:sma(closes,50).slice(-maxVisible),sma200:sma(closes,200).slice(-maxVisible),bbUpper:bb.upper.slice(-maxVisible),bbLower:bb.lower.slice(-maxVisible),rsi:rsi(closes).slice(-maxVisible)};},[all,useIncoming,analysis?.series,maxVisible]);
 const evidence=useIncoming?analysis?.historyEvidence:recovered;const currency=useIncoming?analysis?.currency:recovered?.currency??analysis?.currency;
 const archive=evidence?.origin==="browser"||evidence?.origin==="bundled"||evidence?.origin==="postgres";
 function csv(){const header="data,abertura,maximo,minimo,fecho,volume";const text=[header,...visible.map(c=>[new Date(c.t).toISOString(),c.o,c.h,c.l,c.c,c.v].join(","))].join("\n");const url=URL.createObjectURL(new Blob([text],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=`${canonical}-OHLC.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <section aria-label={`Histórico de velas de ${symbol}`} className="min-w-0 rounded-2xl border border-slate-700/70 bg-slate-900/75 p-4 sm:p-5">
  <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-bold text-slate-100">Velas reais <span className="ml-1 font-mono text-sky-300">{canonical}</span></h2><p className="mt-1 text-[10.5px] text-slate-500">{evidence?`${evidence.provider} · ${visible.length} barras visíveis · ${currency??""}`:"Recuperação de OHLC + fornecedor gráfico independente"}</p></div><div className="flex flex-wrap gap-2">{visible.length>1&&<button onClick={csv} className="rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] font-semibold text-slate-300">↓ OHLC CSV</button>}<button onClick={()=>setExternal(v=>!v)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] font-semibold text-slate-300">{external?"Gráfico interno":"Fonte alternativa"}</button><button disabled={loading} onClick={()=>setAttempt(n=>n+1)} className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-[11px] font-semibold text-sky-300 disabled:opacity-40">{loading?"A recuperar…":"↻ Recuperar / atualizar"}</button></div></div>
  {archive&&<p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">Cópia real recuperada de {evidence!.origin}. Última barra: {new Date(evidence!.lastBarAt).toLocaleString("pt-PT")}. A data não foi avançada nem as velas reconstruídas. A previsão deve ser recalculada com dados atuais.</p>}
  {evidence&&"discardedBars" in evidence&&Number(evidence.discardedBars)>0&&<p className="mb-2 text-[10px] text-amber-300">A fonte continha {String(evidence.discardedBars)} barras incompletas/incoerentes, excluídas sem inventar preços.</p>}
  {external||visible.length<2?<div>{loading&&<p className="mb-3 text-xs text-slate-400">A tentar o histórico interno. O gráfico independente abaixo não depende desse pedido.</p>}<ExternalChart symbol={tv}/></div>:<div data-real-candles={visible.length} className="min-w-0 overflow-hidden"><CandleChart candles={visible} sma20={lines.sma20} sma50={lines.sma50} sma200={lines.sma200} bbUpper={lines.bbUpper} bbLower={lines.bbLower} rsi={lines.rsi} levels={useIncoming?analysis?.levels??[]:[]} currency={currency??""}/></div>}
  {evidence&&<div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-slate-800 pt-2 font-mono text-[10px] text-slate-500"><span>Última barra {new Date(evidence.lastBarAt).toLocaleDateString("pt-PT")} · consulta original {new Date(evidence.fetchedAt).toLocaleString("pt-PT")}</span><span>{price!=null?`Fecho ${price.toFixed(price<1?4:2)} ${currency??""}`:""} · {evidence.priceBasis==="adjusted"?"preços ajustados da fonte":"preços sem pressupor ajuste total"}</span></div>}
 </section>;
}
