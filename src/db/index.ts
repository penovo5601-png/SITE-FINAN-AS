import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * A base de dados é OPCIONAL. Sem DATABASE_URL (ou se o servidor estiver
 * inacessível) o site continua a funcionar: a pesquisa e o universo passam a
 * ser servidos pelo índice em memória carregado de public/data/universe.tsv.gz.
 * Ver `isDbAvailable()` em src/lib/universe.ts.
 */
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 3000,
    max: 5,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
