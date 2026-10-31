/**
 * Constrói o universo global de ações (apenas ações, sem ETFs) usado pela app.
 * Fontes:
 *  - https://github.com/herrrickshaw/global-ticker-universe  (símbolos Yahoo Finance, 34 mercados)
 *  - https://github.com/adanos-software/free-ticker-database (nomes, setores, países, tipo de ativo)
 *  - Nasdaq Trader (lista oficial NASDAQ/NYSE/AMEX em tempo real)
 * Saída: public/data/universe.tsv.gz  -> symbol \t name \t exchange \t market \t country \t sector \t assetType \t featured
 */
import { createWriteStream, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { execSync } from "node:child_process";

const TMP = "/tmp/universe-src";
mkdirSync(TMP, { recursive: true });
mkdirSync("public/data", { recursive: true });

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

function fetchTo(url, file) {
  if (existsSync(file) && readFileSync(file).length > 10000) {
    console.log("  (cache)", file);
    return;
  }
  execSync(`curl -sL --max-time 180 -A "${UA}" "${url}" -o "${file}"`, { stdio: "inherit" });
  console.log("  (descarregado)", file, readFileSync(file).length, "bytes");
}

console.log("1) A descarregar fontes...");
fetchTo("https://raw.githubusercontent.com/herrrickshaw/global-ticker-universe/main/data/validated_universe_flat.csv", `${TMP}/universe.csv`);
fetchTo("https://raw.githubusercontent.com/adanos-software/free-ticker-database/main/data/core_listings.csv", `${TMP}/core_listings.csv`);
fetchTo("https://www.nasdaqtrader.com/dynamic/symdir/nasdaqlisted.txt", `${TMP}/nasdaqlisted.txt`);
fetchTo("https://www.nasdaqtrader.com/dynamic/symdir/otherlisted.txt", `${TMP}/otherlisted.txt`);

/** Parser CSV simples com suporte a aspas. */
function parseCsv(text, delim = ",") {
  const rows = [];
  let row = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); cur = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; }
    else if (c === "\r") { /* skip */ }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// ---------------------------------------------------------------- nomes / setores
console.log("2) A indexar nomes e setores...");
const listingRows = parseCsv(readFileSync(`${TMP}/core_listings.csv`, "utf8"));
const head = listingRows[0].map((h) => h.trim());
const idx = Object.fromEntries(head.map((h, i) => [h, i]));
const nameByTicker = new Map(); // TICKER -> {name, sector, country, assetType, weight}
const countryWeight = {
  "United States": 5, Brazil: 5, Portugal: 6, Spain: 6, France: 6, Germany: 6, Italy: 6,
  Netherlands: 6, Belgium: 6, "United Kingdom": 6, Canada: 5, Australia: 5, Japan: 4,
  Switzerland: 5, Sweden: 4, Norway: 4, Denmark: 4, Austria: 4, Ireland: 5,
};
for (let i = 1; i < listingRows.length; i++) {
  const r = listingRows[i];
  const ticker = (r[idx.ticker] || "").trim().toUpperCase();
  const name = (r[idx.name] || "").trim();
  if (!ticker || !name || name.length < 2) continue;
  const assetType = (r[idx.asset_type] || "").trim();
  const country = (r[idx.country] || "").trim();
  const sector = (r[idx.stock_sector] || "").trim();
  const w = (countryWeight[country] || 1) + (assetType === "Stock" ? 3 : 0) + (sector ? 1 : 0);
  const prev = nameByTicker.get(ticker);
  if (!prev || w > prev.w) nameByTicker.set(ticker, { name, sector, country, assetType, w });
}
console.log("   nomes indexados:", nameByTicker.size);

// ---------------------------------------------------------------- universo base
console.log("3) A processar universo Yahoo...");
const uniRows = parseCsv(readFileSync(`${TMP}/universe.csv`, "utf8"));
const uHead = uniRows[0].map((h) => h.trim());
const uIdx = Object.fromEntries(uHead.map((h, i) => [h, i]));

const out = new Map(); // symbol -> record
let droppedEtf = 0;

const MARKET_TO_COUNTRY = {
  "United States": "US", Germany: "DE", Austria: "AT", China: "CN", India: "IN", Brazil: "BR",
  "United Kingdom": "GB", Japan: "JP", Italy: "IT", France: "FR", Australia: "AU",
  "Hong Kong": "HK", Sweden: "SE", Norway: "NO", Canada: "CA", Taiwan: "TW", Denmark: "DK",
  "South Korea": "KR", Argentina: "AR", "South Africa": "ZA", Russia: "RU", "Saudi Arabia": "SA",
  "New Zealand": "NZ", Switzerland: "CH", Spain: "ES", UAE: "AE", Netherlands: "NL",
  Singapore: "SG", Greece: "GR", Finland: "FI", Poland: "PL", Ireland: "IE", Belgium: "BE",
  Portugal: "PT",
};

for (let i = 1; i < uniRows.length; i++) {
  const r = uniRows[i];
  const symbol = (r[uIdx.yf_symbol] || "").trim().toUpperCase();
  const market = (r[uIdx.market_name] || "").trim();
  const exchange = (r[uIdx.exchange] || "").trim();
  if (!symbol) continue;
  const base = symbol.includes(".") ? symbol.slice(0, symbol.lastIndexOf(".")) : symbol;
  if (!/^[A-Z0-9^.\-]{1,14}$/.test(base)) continue;
  if (base.startsWith("^")) continue; // índices não são ações
  const meta = nameByTicker.get(base);
  if (meta && meta.assetType === "ETF") { droppedEtf++; continue; }
  if (/ETF$/i.test(symbol)) { droppedEtf++; continue; }
  const countryCode = MARKET_TO_COUNTRY[market] || "";
  out.set(symbol, {
    symbol,
    name: meta ? meta.name : base,
    exchange: exchange || "",
    market: market || "",
    country: countryCode || (meta ? meta.country : ""),
    sector: meta ? meta.sector : "",
    assetType: "Stock",
    featured: 0,
    popularity: 0,
  });
}
console.log("   tickers Yahoo:", out.size, "| ETFs removidos:", droppedEtf);

// ---------------------------------------------------------------- EUA via Nasdaq Trader
console.log("4) A enriquecer com Nasdaq Trader (oficial)...");
function addPipe(file, map) {
  const txt = readFileSync(file, "utf8");
  const lines = txt.split(/\r?\n/);
  const cols = lines[0].split("|");
  const ci = Object.fromEntries(cols.map((c, i) => [c.trim(), i]));
  let added = 0;
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split("|");
    if (p.length < 5) continue;
    const sym = (p[ci["Symbol"] || ci["ACT Symbol"] || 0] || "").trim().toUpperCase();
    const name = (p[ci["Security Name"]] || "").trim();
    const isEtf = ((p[ci["ETF"]] || "") || "").trim().toUpperCase() === "Y";
    const isTest = ((p[ci["Test Issue"]] || "") || "").trim().toUpperCase() === "Y";
    if (!sym || isEtf || isTest || !name) continue;
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(sym)) continue;
    if (/\$/.test(sym)) continue; // warrants/rights
    const clean = name.replace(/\s*[-,(].*$/, "").trim() || name;
    const prev = out.get(sym);
    if (prev) {
      if (!prev.name || prev.name === sym) prev.name = clean;
      if (!prev.exchange) prev.exchange = map;
      added++;
    } else {
      out.set(sym, {
        symbol: sym, name: clean, exchange: map, market: "United States",
        country: "US", sector: "", assetType: "Stock", featured: 0, popularity: 0,
      });
      added++;
    }
  }
  return added;
}
console.log("   NASDAQ:", addPipe(`${TMP}/nasdaqlisted.txt`, "NASDAQ"));
console.log("   NYSE/AMEX:", addPipe(`${TMP}/otherlisted.txt`, "NYSE/AMEX"));

// ---------------------------------------------------------------- listagens manuais (PT/EU/LatAm/Ásia)
console.log("5) A adicionar listagens manuais (Euronext Lisboa e outros)...");
const MANUAL = {
  Portugal: [
    ["BCP.LS", "Banco Comercial Português", "Euronext Lisbon", "Financials"],
    ["EDP.LS", "EDP - Energias de Portugal", "Euronext Lisbon", "Utilities"],
    ["EDPR.LS", "EDP Renováveis", "Euronext Lisbon", "Utilities"],
    ["GAL.LS", "Galp Energia", "Euronext Lisbon", "Energy"],
    ["JMT.LS", "Jerónimo Martins", "Euronext Lisbon", "Consumer Staples"],
    ["REN.LS", "REN - Redes Energéticas Nacionais", "Euronext Lisbon", "Utilities"],
    ["NOS.LS", "NOS SGPS", "Euronext Lisbon", "Communication Services"],
    ["SON.LS", "Sonae SGPS", "Euronext Lisbon", "Consumer Discretionary"],
    ["SONC.LS", "Sonae Capital", "Euronext Lisbon", "Industrials"],
    ["SEM.LS", "Semapa", "Euronext Lisbon", "Materials"],
    ["NVG.LS", "Navigator", "Euronext Lisbon", "Materials"],
    ["ALTR.LS", "Altri", "Euronext Lisbon", "Materials"],
    ["CORT.LS", "Corticeira Amorim", "Euronext Lisbon", "Consumer Discretionary"],
    ["RAM.LS", "Ramada Investimentos", "Euronext Lisbon", "Industrials"],
    ["IBS.LS", "Ibersol", "Euronext Lisbon", "Consumer Discretionary"],
    ["MCP.LS", "Mota-Engil", "Euronext Lisbon", "Industrials"],
    ["TDSA.LS", "Teixeira Duarte", "Euronext Lisbon", "Industrials"],
    ["GLINT.LS", "Glintt", "Euronext Lisbon", "Information Technology"],
    ["CTT.LS", "CTT - Correios de Portugal", "Euronext Lisbon", "Industrials"],
    ["GRE.LS", "Greenvolt", "Euronext Lisbon", "Utilities"],
    ["SCP.LS", "Sporting CP", "Euronext Lisbon", "Consumer Discretionary"],
    ["SLB.LS", "SL Benfica", "Euronext Lisbon", "Consumer Discretionary"],
    ["FCP.LS", "FC Porto", "Euronext Lisbon", "Consumer Discretionary"],
    ["MART.LS", "Martifer", "Euronext Lisbon", "Industrials"],
    ["PHR.LS", "Pharol", "Euronext Lisbon", "Communication Services"],
    ["TST.LS", "Tavfer", "Euronext Lisbon", "Consumer Discretionary"],
  ],
  Netherlands: [
    ["ASML.AS", "ASML Holding", "Euronext Amsterdam", "Information Technology"],
    ["AD.AS", "Ahold Delhaize", "Euronext Amsterdam", "Consumer Staples"],
    ["INGA.AS", "ING Groep", "Euronext Amsterdam", "Financials"],
    ["RDSA.AS", "Shell (Royal Dutch)", "Euronext Amsterdam", "Energy"],
    ["SHEL.AS", "Shell plc", "Euronext Amsterdam", "Energy"],
    ["UNH.AS", "Unilever", "Euronext Amsterdam", "Consumer Staples"],
    ["UNA.AS", "Unilever", "Euronext Amsterdam", "Consumer Staples"],
    ["PHIA.AS", "Philips", "Euronext Amsterdam", "Health Care"],
    ["HEIA.AS", "Heineken", "Euronext Amsterdam", "Consumer Staples"],
    ["DSFIR.AS", "DSM-Firmenich", "Euronext Amsterdam", "Materials"],
    ["WKL.AS", "Wolters Kluwer", "Euronext Amsterdam", "Industrials"],
    ["RAND.AS", "Randstad", "Euronext Amsterdam", "Industrials"],
    ["ABN.AS", "ABN AMRO", "Euronext Amsterdam", "Financials"],
    ["KPN.AS", "KPN", "Euronext Amsterdam", "Communication Services"],
    ["MT.AS", "ArcelorMittal", "Euronext Amsterdam", "Materials"],
    ["PNL.AS", "Panattoni", "Euronext Amsterdam", "Real Estate"],
    ["AGS.AS", "Ageas", "Euronext Amsterdam", "Financials"],
    ["NN.AS", "NN Group", "Euronext Amsterdam", "Financials"],
    ["TKWY.AS", "Just Eat Takeaway", "Euronext Amsterdam", "Consumer Discretionary"],
    ["BESI.AS", "BE Semiconductor", "Euronext Amsterdam", "Information Technology"],
  ],
  Belgium: [
    ["ABI.BR", "Anheuser-Busch InBev", "Euronext Brussels", "Consumer Staples"],
    ["SOLB.BR", "Solvay", "Euronext Brussels", "Materials"],
    ["UCB.BR", "UCB", "Euronext Brussels", "Health Care"],
    ["GBLB.BR", "GBL", "Euronext Brussels", "Financials"],
    ["KBC.BR", "KBC Group", "Euronext Brussels", "Financials"],
    ["AGS.BR", "Ageas", "Euronext Brussels", "Financials"],
    ["ACKB.BR", "Ackermans & van Haaren", "Euronext Brussels", "Industrials"],
    ["SOFT.BR", "Softimat", "Euronext Brussels", "Materials"],
    ["PROX.BR", "Proximus", "Euronext Brussels", "Communication Services"],
    ["MELE.BR", "Melexis", "Euronext Brussels", "Information Technology"],
    ["BAR.BR", "Barco", "Euronext Brussels", "Information Technology"],
    ["ELI.BR", "Elia Group", "Euronext Brussels", "Utilities"],
    ["WDP.BR", "Warehouses De Pauw", "Euronext Brussels", "Real Estate"],
    ["COFB.BR", "Cofinimmo", "Euronext Brussels", "Real Estate"],
    ["ARES.BR", "Aedifica", "Euronext Brussels", "Real Estate"],
  ],
  Spain: [
    ["ITX.MC", "Inditex", "BME", "Consumer Discretionary"],
    ["BBVA.MC", "BBVA", "BME", "Financials"],
    ["SAN.MC", "Banco Santander", "BME", "Financials"],
    ["IBE.MC", "Iberdrola", "BME", "Utilities"],
    ["REP.MC", "Repsol", "BME", "Energy"],
    ["TEF.MC", "Telefónica", "BME", "Communication Services"],
    ["AMS.MC", "Amadeus IT", "BME", "Information Technology"],
    ["CABK.MC", "CaixaBank", "BME", "Financials"],
    ["MAP.MC", "Mapfre", "BME", "Financials"],
    ["FER.MC", "Ferrovial", "BME", "Industrials"],
    ["ACS.MC", "ACS", "BME", "Industrials"],
    ["AENA.MC", "Aena", "BME", "Industrials"],
    ["ELE.MC", "Endesa", "BME", "Utilities"],
    ["NTGY.MC", "Naturgy", "BME", "Utilities"],
    ["RED.MC", "Redeia", "BME", "Utilities"],
    ["SAB.MC", "Banco Sabadell", "BME", "Financials"],
    ["BKT.MC", "Bankinter", "BME", "Financials"],
    ["SLR.MC", "Solaria", "BME", "Utilities"],
    ["ACS2.MC", "Acerinox", "BME", "Materials"],
    ["GRLS.MC", "Grifols", "BME", "Health Care"],
    ["IDR.MC", "Indra", "BME", "Information Technology"],
    ["MEL.MC", "Meliá Hotels", "BME", "Consumer Discretionary"],
    ["COL.MC", "Colonial", "BME", "Real Estate"],
    ["MER.MC", "Merlin Properties", "BME", "Real Estate"],
    ["ENC.MC", "Ence", "BME", "Materials"],
    ["SCYR.MC", "Sacyr", "BME", "Industrials"],
    ["OHL.MC", "OHLA", "BME", "Industrials"],
  ],
  France: [
    ["MC.PA", "LVMH", "Euronext Paris", "Consumer Discretionary"],
    ["OR.PA", "L'Oréal", "Euronext Paris", "Consumer Staples"],
    ["TTE.PA", "TotalEnergies", "Euronext Paris", "Energy"],
    ["SAN.PA", "Sanofi", "Euronext Paris", "Health Care"],
    ["BNP.PA", "BNP Paribas", "Euronext Paris", "Financials"],
    ["AI.PA", "C3.ai", "Euronext Paris", "Information Technology"],
    ["AIR.PA", "Airbus", "Euronext Paris", "Industrials"],
    ["SU.PA", "Schneider Electric", "Euronext Paris", "Industrials"],
    ["SAF.PA", "Safran", "Euronext Paris", "Industrials"],
    ["CS.PA", "AXA", "Euronext Paris", "Financials"],
    ["GLE.PA", "Société Générale", "Euronext Paris", "Financials"],
    ["CA.PA", "Carrefour", "Euronext Paris", "Consumer Staples"],
    ["VIE.PA", "Veolia", "Euronext Paris", "Industrials"],
    ["DG.PA", "Vinci", "Euronext Paris", "Industrials"],
    ["ENGI.PA", "Engie", "Euronext Paris", "Utilities"],
    ["KER.PA", "Kering", "Euronext Paris", "Consumer Discretionary"],
    ["RNO.PA", "Renault", "Euronext Paris", "Consumer Discretionary"],
    ["STLAP.PA", "Stellantis", "Euronext Paris", "Consumer Discretionary"],
    ["DSY.PA", "Dassault Systèmes", "Euronext Paris", "Information Technology"],
    ["EL.PA", "EssilorLuxottica", "Euronext Paris", "Health Care"],
    ["HO.PA", "Thales", "Euronext Paris", "Industrials"],
    ["STMPA.PA", "STMicroelectronics", "Euronext Paris", "Information Technology"],
    ["WLN.PA", "Worldline", "Euronext Paris", "Information Technology"],
    ["FR.PA", "Valeo", "Euronext Paris", "Consumer Discretionary"],
    ["BN.PA", "Danone", "Euronext Paris", "Consumer Staples"],
    ["LR.PA", "Legrand", "Euronext Paris", "Industrials"],
    ["PUB.PA", "Publicis", "Euronext Paris", "Communication Services"],
    ["CDI.PA", "Christian Dior", "Euronext Paris", "Consumer Discretionary"],
    ["ATO.PA", "Atos", "Euronext Paris", "Information Technology"],
    ["EN.PA", "Bouygues", "Euronext Paris", "Industrials"],
  ],
  Germany: [
    ["SAP.DE", "SAP", "Xetra", "Information Technology"],
    ["SIE.DE", "Siemens", "Xetra", "Industrials"],
    ["ALV.DE", "Allianz", "Xetra", "Financials"],
    ["DTE.DE", "Deutsche Telekom", "Xetra", "Communication Services"],
    ["BMW.DE", "BMW", "Xetra", "Consumer Discretionary"],
    ["MBG.DE", "Mercedes-Benz Group", "Xetra", "Consumer Discretionary"],
    ["VOW3.DE", "Volkswagen", "Xetra", "Consumer Discretionary"],
    ["BAS.DE", "BASF", "Xetra", "Materials"],
    ["BAYN.DE", "Bayer", "Xetra", "Health Care"],
    ["DBK.DE", "Deutsche Bank", "Xetra", "Financials"],
    ["ADS.DE", "Adidas", "Xetra", "Consumer Discretionary"],
    ["MUV2.DE", "Munich Re", "Xetra", "Financials"],
    ["RWE.DE", "RWE", "Xetra", "Utilities"],
    ["EOAN.DE", "E.ON", "Xetra", "Utilities"],
    ["IFX.DE", "Infineon", "Xetra", "Information Technology"],
    ["FRE.DE", "Fresenius", "Xetra", "Health Care"],
    ["HEI.DE", "Heidelberg Materials", "Xetra", "Materials"],
    ["HEN3.DE", "Henkel", "Xetra", "Consumer Staples"],
    ["DHER.DE", "Delivery Hero", "Xetra", "Consumer Discretionary"],
    ["ZAL.DE", "Zalando", "Xetra", "Consumer Discretionary"],
    ["DTG.DE", "Deutsche Telekom", "Xetra", "Communication Services"],
    ["1COV.DE", "Covestro", "Xetra", "Materials"],
    ["QIA.DE", "Qiagen", "Xetra", "Health Care"],
    ["SHL.DE", "Siemens Healthineers", "Xetra", "Health Care"],
    ["ENR.DE", "Siemens Energy", "Xetra", "Industrials"],
    ["HLE.DE", "HelloFresh", "Xetra", "Consumer Discretionary"],
    ["PSM.DE", "ProSiebenSat.1", "Xetra", "Communication Services"],
    ["RAA.DE", "Rational", "Xetra", "Industrials"],
    ["PUM.DE", "Puma", "Xetra", "Consumer Discretionary"],
    ["RHM.DE", "Rheinmetall", "Xetra", "Industrials"],
  ],
  Italy: [
    ["ENI.MI", "Eni", "Borsa Italiana", "Energy"],
    ["STLAM.MI", "Stellantis", "Borsa Italiana", "Consumer Discretionary"],
    ["G.MI", "Generali", "Borsa Italiana", "Financials"],
    ["ISP.MI", "Intesa Sanpaolo", "Borsa Italiana", "Financials"],
    ["UCG.MI", "UniCredit", "Borsa Italiana", "Financials"],
    ["ENEL.MI", "Enel", "Borsa Italiana", "Utilities"],
    ["TIT.MI", "Telecom Italia", "Borsa Italiana", "Communication Services"],
    ["PRY.MI", "Prysmian", "Borsa Italiana", "Industrials"],
    ["MONC.MI", "Moncler", "Borsa Italiana", "Consumer Discretionary"],
    ["CNHI.MI", "CNH Industrial", "Borsa Italiana", "Industrials"],
    ["F.MI", "Ferrari", "Borsa Italiana", "Consumer Discretionary"],
    ["TEN.MI", "Tenaris", "Borsa Italiana", "Energy"],
    ["RACE.MI", "Ferrari", "Borsa Italiana", "Consumer Discretionary"],
    ["PST.MI", "Poste Italiane", "Borsa Italiana", "Industrials"],
    ["SFER.MI", "Salvatore Ferragamo", "Borsa Italiana", "Consumer Discretionary"],
    ["LDO.MI", "Leonardo", "Borsa Italiana", "Industrials"],
    ["AMP.MI", "Amplifon", "Borsa Italiana", "Health Care"],
    ["DIA.MI", "DiaSorin", "Borsa Italiana", "Health Care"],
    ["REC.MI", "Recordati", "Borsa Italiana", "Health Care"],
    ["BPE.MI", "BPER Banca", "Borsa Italiana", "Financials"],
    ["BMPS.MI", "Banca MPS", "Borsa Italiana", "Financials"],
    ["BAMI.MI", "Banco BPM", "Borsa Italiana", "Financials"],
    ["SPM.MI", "Saipem", "Borsa Italiana", "Energy"],
    ["IVG.MI", "Iveco Group", "Borsa Italiana", "Industrials"],
  ],
  "United Kingdom": [
    ["HSBA.L", "HSBC Holdings", "LSE", "Financials"],
    ["SHEL.L", "Shell", "LSE", "Energy"],
    ["AZN.L", "AstraZeneca", "LSE", "Health Care"],
    ["ULVR.L", "Unilever", "LSE", "Consumer Staples"],
    ["BP.L", "BP", "LSE", "Energy"],
    ["GSK.L", "GSK", "LSE", "Health Care"],
    ["DGE.L", "Diageo", "LSE", "Consumer Staples"],
    ["RIO.L", "Rio Tinto", "LSE", "Materials"],
    ["LLOY.L", "Lloyds Banking Group", "LSE", "Financials"],
    ["BARC.L", "Barclays", "LSE", "Financials"],
    ["RDSA.L", "Shell", "LSE", "Energy"],
    ["NWG.L", "NatWest Group", "LSE", "Financials"],
    ["STAN.L", "Standard Chartered", "LSE", "Financials"],
    ["PRU.L", "Prudential", "LSE", "Financials"],
    ["AV.L", "Aviva", "LSE", "Financials"],
    ["BA.L", "BAE Systems", "LSE", "Industrials"],
    ["RR.L", "Rolls-Royce", "LSE", "Industrials"],
    ["TSCO.L", "Tesco", "LSE", "Consumer Staples"],
    ["VOD.L", "Vodafone", "LSE", "Communication Services"],
    ["BT.A.L", "BT Group", "LSE", "Communication Services"],
    ["IAG.L", "International Airlines Group", "LSE", "Industrials"],
    ["EZJ.L", "easyJet", "LSE", "Industrials"],
    ["WDS.L", "Woodside Energy", "LSE", "Energy"],
    ["GLEN.L", "Glencore", "LSE", "Materials"],
    ["ANTO.L", "Antofagasta", "LSE", "Materials"],
    ["JD.L", "JD Sports", "LSE", "Consumer Discretionary"],
    ["NG.L", "National Grid", "LSE", "Utilities"],
    ["CNA.L", "Centrica", "LSE", "Utilities"],
    ["HL.L", "Hargreaves Lansdown", "LSE", "Financials"],
    ["ABF.L", "Associated British Foods", "LSE", "Consumer Staples"],
  ],
  Brazil: [
    ["PETR4.SA", "Petrobras PN", "B3", "Energy"],
    ["PETR3.SA", "Petrobras ON", "B3", "Energy"],
    ["VALE3.SA", "Vale", "B3", "Materials"],
    ["ITUB4.SA", "Itaú Unibanco", "B3", "Financials"],
    ["BBDC4.SA", "Bradesco", "B3", "Financials"],
    ["BBAS3.SA", "Banco do Brasil", "B3", "Financials"],
    ["ABEV3.SA", "Ambev", "B3", "Consumer Staples"],
    ["WEGE3.SA", "WEG", "B3", "Industrials"],
    ["MGLU3.SA", "Magazine Luiza", "B3", "Consumer Discretionary"],
    ["B3SA3.SA", "B3", "B3", "Financials"],
    ["SUZB3.SA", "Suzano", "B3", "Materials"],
    ["GGBR4.SA", "Gerdau", "B3", "Materials"],
    ["CSNA3.SA", "CSN", "B3", "Materials"],
    ["LREN3.SA", "Lojas Renner", "B3", "Consumer Discretionary"],
    ["VIVT3.SA", "Vivo/Telefônica Brasil", "B3", "Communication Services"],
    ["EQTL3.SA", "Equatorial", "B3", "Utilities"],
    ["RAIL3.SA", "Rumo", "B3", "Industrials"],
    ["JBSS3.SA", "JBS", "B3", "Consumer Staples"],
    ["MRVE3.SA", "MRV", "B3", "Real Estate"],
    ["HAPV3.SA", "Hapvida", "B3", "Health Care"],
    ["PRIO3.SA", "PRIO", "B3", "Energy"],
    ["EGIE3.SA", "Engie Brasil", "B3", "Utilities"],
    ["NTCO3.SA", "Natura", "B3", "Consumer Staples"],
    ["ASAI3.SA", "Assaí", "B3", "Consumer Staples"],
    ["SLCE3.SA", "SLC Agrícola", "B3", "Consumer Staples"],
    ["TIMS3.SA", "TIM Brasil", "B3", "Communication Services"],
    ["SANB11.SA", "Santander Brasil", "B3", "Financials"],
    ["ITSA4.SA", "Itaúsa", "B3", "Financials"],
    ["RADL3.SA", "Raia Drogasil", "B3", "Health Care"],
    ["SAPR4.SA", "Sanepar", "B3", "Utilities"],
  ],
  "United States": [
    ["AAPL", "Apple Inc", "NASDAQ", "Information Technology"],
    ["MSFT", "Microsoft Corporation", "NASDAQ", "Information Technology"],
    ["NVDA", "NVIDIA Corporation", "NASDAQ", "Information Technology"],
    ["GOOGL", "Alphabet Inc Class A", "NASDAQ", "Communication Services"],
    ["AMZN", "Amazon.com Inc", "NASDAQ", "Consumer Discretionary"],
    ["META", "Meta Platforms Inc", "NASDAQ", "Communication Services"],
    ["TSLA", "Tesla Inc", "NASDAQ", "Consumer Discretionary"],
    ["BRK-B", "Berkshire Hathaway Class B", "NYSE", "Financials"],
    ["AVGO", "Broadcom Inc", "NASDAQ", "Information Technology"],
    ["LLY", "Eli Lilly and Company", "NYSE", "Health Care"],
    ["JPM", "JPMorgan Chase & Co", "NYSE", "Financials"],
    ["V", "Visa Inc", "NYSE", "Financials"],
    ["WMT", "Walmart Inc", "NYSE", "Consumer Staples"],
    ["MA", "Mastercard Inc", "NYSE", "Financials"],
    ["UNH", "UnitedHealth Group", "NYSE", "Health Care"],
    ["XOM", "Exxon Mobil Corporation", "NYSE", "Energy"],
    ["JNJ", "Johnson & Johnson", "NYSE", "Health Care"],
    ["HD", "Home Depot", "NYSE", "Consumer Discretionary"],
    ["PG", "Procter & Gamble", "NYSE", "Consumer Staples"],
    ["COST", "Costco Wholesale", "NASDAQ", "Consumer Staples"],
    ["NFLX", "Netflix Inc", "NASDAQ", "Communication Services"],
    ["AMD", "Advanced Micro Devices", "NASDAQ", "Information Technology"],
    ["CRM", "Salesforce Inc", "NYSE", "Information Technology"],
    ["ORCL", "Oracle Corporation", "NYSE", "Information Technology"],
    ["BAC", "Bank of America", "NYSE", "Financials"],
    ["KO", "Coca-Cola Company", "NYSE", "Consumer Staples"],
    ["PEP", "PepsiCo Inc", "NASDAQ", "Consumer Staples"],
    ["DIS", "Walt Disney Company", "NYSE", "Communication Services"],
    ["INTC", "Intel Corporation", "NASDAQ", "Information Technology"],
    ["CSCO", "Cisco Systems", "NASDAQ", "Information Technology"],
    ["PLTR", "Palantir Technologies", "NASDAQ", "Information Technology"],
    ["COIN", "Coinbase Global", "NASDAQ", "Financials"],
    ["SHOP", "Shopify Inc", "NYSE", "Information Technology"],
    ["UBER", "Uber Technologies", "NYSE", "Industrials"],
    ["ABNB", "Airbnb Inc", "NASDAQ", "Consumer Discretionary"],
    ["SNOW", "Snowflake Inc", "NYSE", "Information Technology"],
    ["SQ", "Block Inc", "NYSE", "Information Technology"],
    ["PYPL", "PayPal Holdings", "NASDAQ", "Financials"],
    ["MSTR", "MicroStrategy", "NASDAQ", "Information Technology"],
    ["F", "Ford Motor Company", "NYSE", "Consumer Discretionary"],
    ["GM", "General Motors", "NYSE", "Consumer Discretionary"],
    ["BA", "Boeing Company", "NYSE", "Industrials"],
    ["CAT", "Caterpillar Inc", "NYSE", "Industrials"],
    ["GE", "GE Aerospace", "NASDAQ", "Industrials"],
    ["DE", "Deere & Company", "NYSE", "Industrials"],
    ["MCD", "McDonald's Corporation", "NYSE", "Consumer Discretionary"],
    ["NKE", "Nike Inc", "NYSE", "Consumer Discretionary"],
    ["SBUX", "Starbucks Corporation", "NASDAQ", "Consumer Discretionary"],
    ["T", "AT&T Inc", "NYSE", "Communication Services"],
    ["VZ", "Verizon Communications", "NYSE", "Communication Services"],
    ["CVX", "Chevron Corporation", "NYSE", "Energy"],
    ["PFE", "Pfizer Inc", "NYSE", "Health Care"],
    ["MRK", "Merck & Co", "NYSE", "Health Care"],
    ["ABBV", "AbbVie Inc", "NYSE", "Health Care"],
    ["TMO", "Thermo Fisher Scientific", "NYSE", "Health Care"],
    ["NOW", "ServiceNow", "NYSE", "Information Technology"],
    ["ADBE", "Adobe Inc", "NASDAQ", "Information Technology"],
    ["QCOM", "Qualcomm Inc", "NASDAQ", "Information Technology"],
    ["TXN", "Texas Instruments", "NASDAQ", "Information Technology"],
    ["IBM", "International Business Machines", "NYSE", "Information Technology"],
    ["MU", "Micron Technology", "NASDAQ", "Information Technology"],
    ["ARM", "Arm Holdings", "NASDAQ", "Information Technology"],
    ["SMCI", "Super Micro Computer", "NASDAQ", "Information Technology"],
    ["DELL", "Dell Technologies", "NYSE", "Information Technology"],
    ["PANW", "Palo Alto Networks", "NASDAQ", "Information Technology"],
    ["CRWD", "CrowdStrike Holdings", "NASDAQ", "Information Technology"],
    ["RIVN", "Rivian Automotive", "NASDAQ", "Consumer Discretionary"],
    ["LCID", "Lucid Group", "NASDAQ", "Consumer Discretionary"],
    ["NIO", "NIO Inc", "NYSE", "Consumer Discretionary"],
    ["XPEV", "XPeng Inc", "NYSE", "Consumer Discretionary"],
    ["LI", "Li Auto Inc", "NASDAQ", "Consumer Discretionary"],
    ["BABA", "Alibaba Group", "NYSE", "Consumer Discretionary"],
    ["JD", "JD.com Inc", "NASDAQ", "Consumer Discretionary"],
    ["PDD", "PDD Holdings", "NASDAQ", "Consumer Discretionary"],
    ["TM", "Toyota Motor Corporation", "NYSE", "Consumer Discretionary"],
    ["SONY", "Sony Group Corporation", "NYSE", "Consumer Discretionary"],
    ["SAP", "SAP SE ADR", "NYSE", "Information Technology"],
    ["NVO", "Novo Nordisk", "NYSE", "Health Care"],
    ["ASML", "ASML Holding ADR", "NASDAQ", "Information Technology"],
    ["NVS", "Novartis AG", "NYSE", "Health Care"],
    ["UL", "Unilever PLC ADR", "NYSE", "Consumer Staples"],
    ["SHEL", "Shell plc ADR", "NYSE", "Energy"],
    ["TSM", "Taiwan Semiconductor", "NYSE", "Information Technology"],
    ["AZN", "AstraZeneca PLC ADR", "NASDAQ", "Health Care"],
    ["HSBC", "HSBC Holdings PLC ADR", "NYSE", "Financials"],
    ["RIO", "Rio Tinto PLC ADR", "NYSE", "Materials"],
    ["SAN", "Banco Santander ADR", "NYSE", "Financials"],
    ["C", "Citigroup Inc", "NYSE", "Financials"],
    ["WFC", "Wells Fargo & Company", "NYSE", "Financials"],
    ["GS", "Goldman Sachs Group", "NYSE", "Financials"],
    ["MS", "Morgan Stanley", "NYSE", "Financials"],
    ["BLK", "BlackRock Inc", "NYSE", "Financials"],
    ["AXP", "American Express", "NYSE", "Financials"],
    ["SCHW", "Charles Schwab", "NYSE", "Financials"],
  ],
  Switzerland: [
    ["NESN.SW", "Nestlé", "SIX", "Consumer Staples"],
    ["ROG.SW", "Roche Holding", "SIX", "Health Care"],
    ["NOVN.SW", "Novartis", "SIX", "Health Care"],
    ["UBSG.SW", "UBS Group", "SIX", "Financials"],
    ["ABBN.SW", "ABB", "SIX", "Industrials"],
    ["RIGN.SW", "Richemont", "SIX", "Consumer Discretionary"],
    ["SREN.SW", "Swiss Re", "SIX", "Financials"],
    ["ZURN.SW", "Zurich Insurance", "SIX", "Financials"],
    ["LHN.SW", "LafargeHolcim", "SIX", "Materials"],
    ["SWS.SW", "Swisscom", "SIX", "Communication Services"],
    ["LONN.SW", "Lonza", "SIX", "Health Care"],
    ["ALC.SW", "Alcon", "SIX", "Health Care"],
    ["SGSN.SW", "SGS", "SIX", "Industrials"],
    ["GEBN.SW", "Geberit", "SIX", "Industrials"],
  ],
  Japan: [
    ["7203.T", "Toyota Motor", "TSE", "Consumer Discretionary"],
    ["6758.T", "Sony Group", "TSE", "Consumer Discretionary"],
    ["9984.T", "SoftBank Group", "TSE", "Communication Services"],
    ["6752.T", "Panasonic", "TSE", "Consumer Discretionary"],
    ["8306.T", "Mitsubishi UFJ Financial", "TSE", "Financials"],
    ["9432.T", "NTT", "TSE", "Communication Services"],
    ["6861.T", "Keyence", "TSE", "Information Technology"],
    ["4063.T", "Shin-Etsu Chemical", "TSE", "Materials"],
    ["7974.T", "Nintendo", "TSE", "Communication Services"],
    ["6954.T", "Fanuc", "TSE", "Industrials"],
    ["6501.T", "Hitachi", "TSE", "Information Technology"],
    ["8058.T", "Mitsubishi Corporation", "TSE", "Industrials"],
    ["4502.T", "Takeda Pharmaceutical", "TSE", "Health Care"],
    ["6178.T", "Japan Post", "TSE", "Industrials"],
    ["9983.T", "Fast Retailing", "TSE", "Consumer Discretionary"],
  ],
  Canada: [
    ["SHOP.TO", "Shopify", "TSX", "Information Technology"],
    ["RY.TO", "Royal Bank of Canada", "TSX", "Financials"],
    ["TD.TO", "Toronto-Dominion Bank", "TSX", "Financials"],
    ["ENB.TO", "Enbridge", "TSX", "Energy"],
    ["SU.TO", "Suncor Energy", "TSX", "Energy"],
    ["CNQ.TO", "Canadian Natural Resources", "TSX", "Energy"],
    ["CP.TO", "Canadian Pacific Kansas City", "TSX", "Industrials"],
    ["CNR.TO", "Canadian National Railway", "TSX", "Industrials"],
    ["ABX.TO", "Alberta Investment", "TSX", "Real Estate"],
    ["BMO.TO", "Bank of Montreal", "TSX", "Financials"],
    ["BNS.TO", "Bank of Nova Scotia", "TSX", "Financials"],
    ["MFC.TO", "Manulife Financial", "TSX", "Financials"],
    ["SLF.TO", "Sun Life Financial", "TSX", "Financials"],
    ["ATD.TO", "Alimentation Couche-Tard", "TSX", "Consumer Staples"],
    ["L.TO", "Loblaw Companies", "TSX", "Consumer Staples"],
  ],
  Mexico: [
    ["WALMEX.MX", "Walmart de México", "BMV", "Consumer Staples"],
    ["AMXL.MX", "América Móvil", "BMV", "Communication Services"],
    ["FEMSAUBD.MX", "FEMSA", "BMV", "Consumer Staples"],
    ["GMEXICOB.MX", "Grupo México", "BMV", "Materials"],
    ["BIMBOA.MX", "Grupo Bimbo", "BMV", "Consumer Staples"],
    ["CEMEXCPO.MX", "CEMEX", "BMV", "Materials"],
    ["GFNORTEO.MX", "Grupo Financiero Banorte", "BMV", "Financials"],
    ["AC.MX", "Arca Continental", "BMV", "Consumer Staples"],
    ["ALFAA.MX", "Alfa", "BMV", "Industrials"],
    ["CUERVO.MX", "Becle (José Cuervo)", "BMV", "Consumer Staples"],
  ],
};

let manualAdded = 0;
for (const [market, list] of Object.entries(MANUAL)) {
  const country = MARKET_TO_COUNTRY[market] || "";
  for (const [symbol, name, exchange, sector] of list) {
    const prev = out.get(symbol);
    if (prev) {
      prev.name = name;
      prev.sector = sector;
      prev.exchange = exchange;
      prev.market = market;
      prev.country = country;
      prev.featured = 1;
      continue;
    }
    out.set(symbol, {
      symbol, name, exchange, market, country, sector,
      assetType: "Stock", featured: 1, popularity: 0,
    });
    manualAdded++;
  }
}
console.log("   manuais novos:", manualAdded);

// ---------------------------------------------------------------- popularidade
console.log("6) A calcular popularidade...");
const POP_SECTOR = { "Information Technology": 3, Financials: 2, "Consumer Discretionary": 2, Energy: 2, "Health Care": 2 };
for (const rec of out.values()) {
  let p = 0;
  if (rec.featured) p += 100;
  if (rec.sector) p += POP_SECTOR[rec.sector] || 1;
  if (rec.country === "PT") p += 8;
  if (rec.country === "BR") p += 4;
  if (rec.country === "US") p += 4;
  if (rec.name && rec.name !== rec.symbol) p += 2;
  rec.popularity = Math.min(p, 140);
}

// ---------------------------------------------------------------- escrita
console.log("7) A escrever public/data/universe.tsv.gz...");
const rows = [...out.values()].sort((a, b) => {
  if (b.popularity !== a.popularity) return b.popularity - a.popularity;
  return a.symbol.localeCompare(b.symbol);
});
const tsv = rows
  .map((r) => [r.symbol, r.name.replace(/\t/g, " "), r.exchange, r.market, r.country, r.sector, r.assetType, r.featured, r.popularity].join("\t"))
  .join("\n");
const gz = gzipSync(Buffer.from(tsv, "utf8"), { level: 9 });
writeFileSync("public/data/universe.tsv.gz", gz);

// stats por país
const byCountry = new Map();
for (const r of rows) byCountry.set(r.market || "?", (byCountry.get(r.market || "?") || 0) + 1);
const stats = [...byCountry.entries()].sort((a, b) => b[1] - a[1]);
writeFileSync("public/data/universe-stats.json", JSON.stringify({
  total: rows.length,
  markets: stats.map(([market, count]) => ({ market, count })),
  generatedAt: new Date().toISOString(),
}, null, 2));

console.log(`\nTOTAL: ${rows.length} ações | ${stats.length} mercados | ficheiro: ${(gz.length / 1024 / 1024).toFixed(2)} MB`);
console.log(stats.slice(0, 12).map(([m, c]) => `${m}: ${c}`).join(" | "));
