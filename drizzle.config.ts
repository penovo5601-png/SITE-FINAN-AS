import { defineConfig } from "drizzle-kit";

/**
 * Funciona nos dois contextos:
 *  - local / sandbox  -> usa a base de dados PostgreSQL da plataforma
 *  - Vercel / Neon    -> usa a DATABASE_URL que definires no painel
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  },
  verbose: false,
  strict: false,
});
