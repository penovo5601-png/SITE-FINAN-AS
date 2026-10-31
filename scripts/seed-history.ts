/** Arquivo de emergência de dados REAIS. Não gera preços, não avança datas e não simula velas. */
import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { getPriceHistory } from "../src/lib/price-history";
const symbols=["AAPL","MSFT","NVDA","TSLA","AMZN","GOOGL","META","JPM","V","WMT","BRK-B","AMD","NFLX","BCP.LS","EDP.LS","EDPR.LS","GALP.LS","JMT.LS","EGL.LS","CTT.LS","NOS.LS","REN.LS","SON.LS","ALTR.LS","NVG.LS","CORT.LS","SEM.LS","PETR4.SA","VALE3.SA","ITUB4.SA","ASML.AS","MC.PA","AIR.PA","SAP.DE","SIE.DE","SAN.MC","SHEL.L","NESN.SW","7203.T","6758.T","0700.HK","9988.HK"];
mkdirSync("public/data/history",{recursive:true});
let cursor=0,successes=0;
async function worker(){while(cursor<symbols.length){const symbol=symbols[cursor++];try{const h=await getPriceHistory(symbol,true);if(h){writeFileSync(`public/data/history/${h.symbol}.json.gz`,gzipSync(JSON.stringify(h),{level:9}));successes++;console.log(symbol,h.candles.length,h.lastBarAt);}else console.log(symbol,"sem dados; não foi criado ficheiro");}catch(e){console.log(symbol,"falha",String(e));}await new Promise(r=>setTimeout(r,180));}}
async function main(){await Promise.all([worker(),worker()]);console.log(`Arquivos reais: ${successes}/${symbols.length}.`);}
main().catch(e=>{console.error(e);process.exit(1)});
