import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type SiteMode = "main" | "chart";

let cached: SiteMode | null = null;

/**
 * Decide que site estamos a servir.
 *
 * Ordem de precedência (deliberada):
 *  1. ficheiro `site.config.json` commitado no repositório  ← MANDA ELE
 *  2. variável de ambiente SITE_MODE                        ← apenas fallback
 *  3. "main"
 *
 * O ficheiro do repositório tem prioridade de propósito: assim uma variável
 * de ambiente definida no projeto errado da Vercel não consegue transformar o
 * TickerLab (A) no ChartLens (B). Cada repositório decide o que é.
 */
export function getSiteMode(): SiteMode {
  if (cached) return cached;

  try {
    const file = path.join(process.cwd(), "site.config.json");
    if (existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as { mode?: unknown };
      if (parsed.mode === "chart" || parsed.mode === "main") {
        cached = parsed.mode;
        return cached;
      }
    }
  } catch {
    /* ficheiro ausente ou inválido — cai no fallback abaixo */
  }

  const env = process.env.SITE_MODE;
  if (env === "chart" || env === "main") {
    cached = env;
    return cached;
  }

  cached = "main";
  return cached;
}
