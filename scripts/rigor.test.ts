import test from "node:test";
import assert from "node:assert/strict";
import { rsi, mfi, normalizedObvSlope } from "../src/lib/indicators";
import { filterRecentNews, HOUR_MS, newsRecencyWeight } from "../src/lib/news-policy";
import { applyNewsWindow, parseNewsRss, type StockNewsFeed } from "../src/lib/news";
import { walkForwardValidation, wilsonInterval, validateCandleHistory } from "../src/lib/validation";
import { attachDecisionAudit, buildScenarios } from "../src/lib/decision-audit";
import { technicalFromHistory, historicalSignal } from "../src/lib/technical-model";
import { analyzeMarket } from "../src/lib/analyze-market";
import { analyzeFromScanner } from "../src/lib/engine";
import type { Candle } from "../src/lib/yahoo";
import type { MarketData } from "../src/lib/market-data";

const NOW = Date.UTC(2026, 9, 31, 18);
function history(count = 800, end = NOW - 86_400_000): Candle[] {
  return Array.from({ length: count }, (_, i) => {
    const c = 100 + i * 0.08 + 2 * Math.sin(i / 9);
    const o = c - 0.3;
    return { t: end - (count - i - 1) * 86_400_000, o, c, h: c + 1.1, l: o - 0.9, v: 1_000_000 + i * 13 };
  });
}
const article = (hours: number) => ({ id: String(hours), title: `Empresa ${hours}`, url: `https://example.org/${hours}`, source: "Jornal", publishedAt: new Date(NOW - hours * HOUR_MS).toISOString(), language: "pt", via: "Google News" as const });
function feed(): StockNewsFeed {
  return { symbol: "TEST", company: "Empresa", status: "ok", articles: [article(1), article(23), article(47), article(71), article(90)], fetchedAt: new Date(NOW - 10 * HOUR_MS).toISOString(), stale: false, searchUrl: "https://example.org", message: "ok", windowHours: 72, windowStart: new Date(NOW - 72 * HOUR_MS).toISOString(), asOf: new Date(NOW).toISOString(), excludedByAge: 0 };
}

test("Notícias: 72h exatas admissíveis, 72h+1ms e datas futuras rejeitadas", () => {
  const items = [article(0), article(72), article(72 + 1 / HOUR_MS), article(-0.01), { ...article(1), publishedAt: "data inválida" }];
  assert.deepEqual(filterRecentNews(items, 72, NOW).map(a => a.id), ["0", "72"]);
  assert.equal(filterRecentNews([article(80)], 900, NOW).length, 0);
});
test("Notícias: filtros de 24/48/72h não substituem por antigas", () => {
  assert.equal(applyNewsWindow(feed(), 24, NOW).articles.length, 2);
  assert.equal(applyNewsWindow(feed(), 48, NOW).articles.length, 3);
  assert.equal(applyNewsWindow(feed(), 72, NOW).articles.length, 4);
});
test("Notícias: cache e cache de emergência voltam a expirar com o relógio", () => {
  const stale = { ...feed(), stale: true };
  const response = applyNewsWindow(stale, 72, NOW + 4 * HOUR_MS);
  assert.ok(response.stale);
  assert.equal(response.articles.some(a => a.id === "71"), false);
  assert.equal(applyNewsWindow(stale, 72, NOW + 100 * HOUR_MS).status, "empty");
  assert.equal(applyNewsWindow(stale, 72, NOW + 100 * HOUR_MS).articles.length, 0);
});
test("Notícias: o parser rejeita feeds antigos e datas futuras antes da cache", () => {
  const xml = '<rss><channel>' + [article(2), article(73), article(-2)].map(a => `<item><title>${a.title}</title><link>${a.url}</link><pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate></item>`).join('') + '</channel></rss>';
  assert.equal(parseNewsRss(xml, "Google News", "pt", NOW).length, 1);
  assert.equal(newsRecencyWeight(article(24).publishedAt, NOW), 0.5);
  assert.equal(newsRecencyWeight(article(73).publishedAt, NOW), 0);
});
test("Histórico: rejeita datas duplicadas e OHLC incoerente", () => {
  const h = history(50);
  assert.equal(validateCandleHistory(h).length, 0);
  assert.ok(validateCandleHistory([h[0], h[0]]).length);
  assert.ok(validateCandleHistory([{ ...h[0], h: 1 }]).length);
  assert.equal(walkForwardValidation([{ ...h[0], c: NaN }]).status, "invalid");
});
test("Walk-forward: só passado nas features, execução seguinte e retornos sem sobreposição", () => {
  const data = history(850);
  const seen: number[] = [];
  const report = walkForwardValidation(data, past => { seen.push(past.at(-1)!.t); assert.equal(past.length, 320); return { score: 30, eligible: true }; });
  assert.ok(report.folds.length > 10);
  for (let i = 0; i < report.folds.length; i++) {
    const row = report.folds[i];
    assert.equal(new Date(row.predictionAt).getTime(), seen[i]);
    assert.ok(Date.parse(row.entryAt) > Date.parse(row.predictionAt));
    if (i) assert.ok(Date.parse(row.entryAt) > Date.parse(report.folds[i - 1].exitAt));
    const observed = data.find(c => c.t === Date.parse(row.entryAt))!;
    assert.equal(row.entry, observed.o);
    const expectedNet = (row.exit / row.entry - 1) * 100 - 0.2;
    assert.ok(Math.abs(row.netReturnPct - expectedNet) < 1e-9);
  }
});
test("Walk-forward: alterar o futuro não altera um sinal anterior", () => {
  const data = history(700);
  const predictor = (past: Candle[]) => ({ score: past.at(-1)!.c > past[0].c ? 30 : -30, eligible: true });
  const before = walkForwardValidation(data, predictor).folds[0];
  const changed = data.map((c, i) => i > 500 ? { ...c, o: c.o * 5, h: c.h * 5, l: c.l * 5, c: c.c * 5 } : { ...c });
  const after = walkForwardValidation(changed, predictor).folds[0];
  assert.equal(before.inputHash, after.inputHash);
  assert.equal(before.score, after.score);
  assert.equal(before.netReturnPct, after.netReturnPct);
});
test("Walk-forward: sem operações não fabrica métricas nem 0% de acerto", () => {
  const report = walkForwardValidation(history(), () => ({ score: 0, eligible: false }));
  assert.equal(report.trades, 0);
  assert.equal(report.directionalAccuracyPct, null);
  assert.equal(report.meanNetReturnPct, null);
  assert.equal(report.wilson95Pct, null);
  assert.equal(report.status, "insufficient");
});
test("Wilson: poucos acertos não equivalem a certeza de sucesso", () => {
  assert.equal(wilsonInterval(0, 0), null);
  const small = wilsonInterval(3, 3)!;
  assert.ok(small[0] < 50 && small[1] <= 100);
  const middle = wilsonInterval(5, 10)!;
  assert.ok(middle[0] > 23 && middle[0] < 24 && middle[1] > 76 && middle[1] < 77);
});
test("Modelo: cálculo corrente e função histórica partilham o mesmo score", () => {
  const data = history(360);
  assert.equal(technicalFromHistory(data)!.score, historicalSignal(data).score);
});
test("Auditoria: dados desatualizados bloqueiam o veredicto direcional", () => {
  const data = history(320, NOW - 30 * 86_400_000);
  const a = technicalFromHistory(data)!;
  const audited = attachDecisionAudit(a, { history: data, source: "test", scanner: null, news: feed() }, NOW);
  assert.equal(audited.verdict, "NEUTRO");
  assert.equal(audited.decision?.grade, "blocked");
  assert.ok(audited.decision?.checks.some(c => c.id === "freshness" && c.result === "fail"));
  assert.ok(audited.decision!.snapshot.headlines.every(n => (NOW - Date.parse(n.publishedAt)) / HOUR_MS <= 72));
});
test("Auditoria: snapshot sem histórico nunca é anunciado como validado", () => {
  const scanner = { close: 100, RSI: 57, SMA50: 92, SMA200: 80, SMA20: 95, "MACD.macd": 2, "MACD.signal": 1, VWMA: 95, ADX: 28 };
  const a = analyzeFromScanner({ symbol: "TEST", scanner, currency: "EUR", range: "2y", interval: "1d", historySource: "nenhuma", notes: [] })!;
  const result = attachDecisionAudit(a, { history: [], source: "tradingview", scanner }, NOW);
  assert.notEqual(result.decision?.grade, "historical_support");
  assert.equal(result.decision?.validation.status, "unavailable");
  assert.ok(result.confidence <= 35);
});
test("Cenários: pesos somam 100, ordens e invalidações têm sentido", () => {
  const a = technicalFromHistory(history(320))!;
  const cases = buildScenarios(a), bull = cases[0], bear = cases[1];
  assert.equal(cases.reduce((n, s) => n + s.weight, 0), 100);
  assert.ok(bull.trigger! > a.price && bull.target! > bull.trigger! && bull.invalidation! < bull.trigger!);
  assert.ok(bear.trigger! < a.price && bear.target! < bear.trigger! && bear.invalidation! > bear.trigger!);
  assert.ok(cases.every(s => s.weight >= 0));
});
test("Zoom do gráfico não muda o sinal ou a janela fixa do modelo", () => {
  const h = history(370, Date.now() - 86_400_000);
  const md: MarketData = { symbol: "TEST", candles: h, validationCandles: h, scanner: null, bundle: null, meta: null, source: "nasdaq", historySource: "nasdaq", currency: "EUR", range: "2y", interval: "1d", notes: [] };
  const first = analyzeMarket(md)!;
  const zoom = analyzeMarket({ ...md, candles: h.slice(-125), range: "6mo" })!;
  assert.equal(first.score, zoom.score);
  assert.equal(first.decision?.rawVerdict, zoom.decision?.rawVerdict);
  assert.equal(first.decision?.snapshot.technicalWindow.length, 320);
  assert.equal(zoom.candles.length, 125);
});

test("Indicadores: preço parado não é RSI sobrecomprado; sem volume não é MFI 100", () => {
  assert.equal(rsi(Array(40).fill(100), 14).at(-1), 50);
  assert.equal(mfi(history(40).map(c => ({...c,v:0})), 14).at(-1), null);
});
test("OBV: uma origem acumulada negativa não inverte acumulação recente", () => {
  const h = history(70).map((c,i) => {
    const close = i === 0 ? 100 : 80 + i * 0.1;
    return {...c,o:close,h:close+1,l:close-1,c:close,v:i===1?1_000_000_000:1_000_000};
  });
  assert.ok(normalizedObvSlope(h)! > 0);
});
test("Pipeline: OHLC incoerente ou data futura não produz previsão", () => {
  const h = history(360, Date.now()-86_400_000);
  const md: MarketData = {symbol:"TEST",candles:h,validationCandles:h,scanner:null,bundle:null,meta:null,source:"nasdaq",historySource:"nasdaq",currency:"EUR",range:"2y",interval:"1d",notes:[]};
  assert.equal(analyzeMarket({...md,validationCandles:h.map((c,i)=>i===50?{...c,h:1}:c)}),null);
  assert.equal(analyzeMarket({...md,validationCandles:[...h,{...h.at(-1)!,t:Date.now()+86400000}]}),null);
});
