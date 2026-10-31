import test from "node:test";
import assert from "node:assert/strict";
import { weightedMA, hullMA, chaikinMoneyFlow, ultimateOscillator, extendedIndicators } from "../src/lib/indicators-extended";
import { analyzeStock, analyzeFromScanner } from "../src/lib/engine";
import { applyConfluence, groupSignals } from "../src/lib/confluence";
import { parseNewsRss, deduplicateNews } from "../src/lib/news";
import type { Candle, ChartBundle } from "../src/lib/yahoo";

const candles = (drift: number): Candle[] => Array.from({ length: 320 }, (_, i) => {
  const c = 160 + i * drift + Math.sin(i / 7) * 0.7;
  return { t: Date.UTC(2025, 0, 1) + i * 86_400_000, o: c - drift * 0.4, h: c + 0.8, l: c - 0.8, c, v: 1_000_000 + i * 100 };
});
function analyze(drift: number) {
  const data = candles(drift), last = data[data.length - 1];
  const bundle: ChartBundle = { meta: { symbol: "TEST", currency: "EUR", exchangeName: "TEST", fullExchangeName: "TEST", instrumentType: "EQUITY", regularMarketPrice: last.c, previousClose: data[data.length - 2].c, regularMarketTime: last.t / 1000 }, candles: data, interval: "1d", range: "2y", fetchedAt: Date.now() };
  return applyConfluence(analyzeStock(bundle, { name: "Teste" }), null, data);
}

test("WMA pondera os valores mais recentes e Hull preserva série constante", () => {
  assert.equal(weightedMA([1, 2, 3], 3)[2], 14 / 6);
  assert.equal(hullMA(Array(40).fill(12), 9).at(-1), 12);
});
test("CMF usa volume real e não cria fluxo sem volume", () => {
  const data = candles(0.1).slice(-20).map(c => ({ ...c, l: 0, h: 10, c: 10 }));
  assert.equal(chaikinMoneyFlow(data), 1);
  assert.equal(chaikinMoneyFlow(data.map(c => ({ ...c, c: 0 }))), -1);
  assert.equal(chaikinMoneyFlow(data.map(c => ({ ...c, v: 0 }))), null);
});
test("Ultimate Oscillator é limitado a 0–100 e exige histórico", () => {
  assert.equal(ultimateOscillator(candles(0.1).slice(0, 20)), null);
  const value = ultimateOscillator(candles(0.1));
  assert.ok(value != null && value >= 0 && value <= 100);
});
test("Donchian exclui barra atual e nuvem Ichimoku usa deslocamento histórico", () => {
  const data = candles(0.2), previous = data.slice(-21, -1);
  const extended = extendedIndicators(data);
  assert.equal(extended.donchianHigh, Math.max(...previous.map(c => c.h)));
  const altered = data.map(c => ({ ...c })); altered[altered.length - 1].h = 9999;
  const changed = extendedIndicators(altered);
  assert.equal(changed.cloudTop, extended.cloudTop);
  assert.equal(changed.donchianHigh, extended.donchianHigh);
  assert.notEqual(changed.tenkan, extended.tenkan);
});
test("Confluência conserva leitura SUBIR/DESCER em tendências opostas", () => {
  const up = analyze(0.22), down = analyze(-0.22);
  assert.equal(up.verdict, "SUBIR"); assert.equal(down.verdict, "DESCER");
  for (const a of [up, down]) {
    assert.ok(a.confluence && a.confluence.newSignals.length >= 10);
    assert.ok(Number.isFinite(a.score) && Math.abs(a.score) <= 100);
    assert.ok(a.plan.stop > 0 && a.plan.target2 > 0);
    if (a.verdict === "SUBIR") assert.ok(a.plan.stop < a.price && a.plan.target2 > a.price);
    else assert.ok(a.plan.stop > a.price && a.plan.target2 < a.price);
  }
});
test("Consenso agregado não volta a votar no score das famílias", () => {
  const a = analyze(0.1);
  const first = groupSignals(a.signals);
  const withConsensus = groupSignals([...a.signals, { id: "tvrec", group: "Momento", name: "aggregate", value: "100", bias: 100, weight: 1, detail: "aggregate" }]);
  assert.deepEqual(first, withConsensus);
});
test("Scanner sem OHLCV não inventa Supertrend, CMF ou nuvem", () => {
  const scanner = { close: 100, RSI: 55, SMA20: 98, SMA50: 95, SMA200: 88, ADX: 30, VWMA: 97, HullMA9: 99, "Stoch.RSI.K": 50, "UO": 55, "Ichimoku.BLine": 96 };
  const a = analyzeFromScanner({ symbol: "TEST", scanner, currency: "EUR", range: "2y", interval: "1d", historySource: "nenhuma", notes: [] });
  assert.ok(a);
  const result = applyConfluence(a, scanner, []);
  assert.equal(result.confluence?.extended.cmf20, null);
  assert.equal(result.confluence?.extended.supertrend, null);
  assert.equal(result.confluence?.extended.cloudTop, null);
  assert.ok((result.confluence?.missing.length ?? 0) > 0);
});
test("RSS mantém título, fonte, ligação e data; bloqueia DTD e protocolos perigosos", () => {
  const date = new Date().toUTCString();
  const xml = `<rss><channel><item><title>Empresa &amp; resultados - Jornal</title><link>https://example.org/noticia</link><pubDate>${date}</pubDate><source url="https://example.org">Jornal</source></item><item><title>Inválido</title><link>javascript:alert(1)</link><pubDate>${date}</pubDate></item></channel></rss>`;
  const items = parseNewsRss(xml, "Google News", "pt");
  assert.equal(items.length, 1); assert.equal(items[0].title, "Empresa & resultados"); assert.equal(items[0].source, "Jornal");
  assert.equal(parseNewsRss('<!DOCTYPE x [<!ENTITY a "bad">]>' + xml, "Google News", "pt").length, 0);
  assert.equal(parseNewsRss(xml.replaceAll(date, "bad date"), "Google News", "pt").length, 0);
});
test("RSS elimina títulos duplicados, preservando o mais recente", () => {
  const item = { id: "1", title: "Resultados: sólidos!", url: "https://example.org/1", source: "Jornal", language: "pt", via: "Google News" as const, publishedAt: "2026-01-01T00:00:00Z" };
  const recent = { ...item, id: "2", title: "Resultados sólidos", publishedAt: "2026-01-02T00:00:00Z" };
  assert.equal(deduplicateNews([item, recent]).length, 1);
  assert.equal(deduplicateNews([item, recent])[0].id, "2");
});
