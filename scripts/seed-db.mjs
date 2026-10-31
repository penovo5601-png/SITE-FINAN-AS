/**
 * Carrega public/data/universe.tsv.gz para a tabela `tickers` (idempotente).
 * Uso: node scripts/seed-db.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/app_db";
const file = path.join(process.cwd(), "public", "data", "universe.tsv.gz");

if (!existsSync(file)) {
  console.error("Falta public/data/universe.tsv.gz — corre primeiro: node scripts/build-universe.mjs");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function main() {
  const text = gunzipSync(readFileSync(file)).toString("utf8");
  const lines = text.split("\n").filter(Boolean);
  console.log(`Linhas no universo: ${lines.length}`);

  const { rows } = await pool.query("SELECT count(*)::int AS n FROM tickers");
  if (rows[0].n > 1000) {
    console.log(`Tabela tickers já tem ${rows[0].n} registos — nada a fazer.`);
    await pool.end();
    return;
  }

  const values = [];
  const params = [];
  let p = 1;
  for (const line of lines) {
    const c = line.split("\t");
    if (c.length < 9) continue;
    const symbol = c[0];
    const dot = symbol.lastIndexOf(".");
    values.push(
      `($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`,
    );
    params.push(
      symbol,
      dot > 0 ? symbol.slice(0, dot) : symbol,
      c[1] || symbol,
      c[2] || null,
      c[3] || null,
      c[4] || null,
      c[5] || null,
      c[6] || "Stock",
      c[7] === "1",
      Number(c[8]) || 0,
    );
    if (values.length >= 500) {
      await flush(values, params);
      values.length = 0;
      params.length = 0;
      p = 1;
    }
  }
  if (values.length) await flush(values, params);

  const after = await pool.query("SELECT count(*)::int AS n FROM tickers");
  const mkts = await pool.query("SELECT count(DISTINCT market)::int AS n FROM tickers");
  console.log(`\nSeed concluído: ${after.rows[0].n} ações em ${mkts.rows[0].n} mercados.`);
  await pool.end();

  async function flush(vals, prm) {
    if (!vals.length) return;
    await pool.query(
      `INSERT INTO tickers (symbol, ticker, name, exchange, market, country_code, sector, asset_type, featured, popularity)
       VALUES ${vals.join(",")}
       ON CONFLICT (symbol) DO NOTHING`,
      prm,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
