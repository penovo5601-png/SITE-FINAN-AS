import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type SiteMode = "main" | "chart";

let cached: SiteMode | null = null;

/**
 * Decide que site estamos a servir.
 *
 * Ordem de precedência:
 *  1. variável de ambiente SITE_MODE (Vercel/painel) — opcional
 *  2. ficheiro site.config.json commitado no repositório
 *  3. "main"
 *
 * Isto permite ter dois repositórios/deployments com o MESMO código e
 * zero configuração no painel: basta o site.config.json de cada um.
 */
export function getSiteMode(): SiteMode {
  if (cached) return cached;
  const env = process.env.SITE_MODE;
  if (env === "chart" || env === "main") {
    cached = env;
    return cached;
  }
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
    /* ficheiro ausente ou inválido — usa o valor por omissão */
  }
  cached = "main";
  return cached;
}
