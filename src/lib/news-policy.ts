/** Política partilhada pelo servidor e browser: nenhuma exceção de cache ultrapassa 72h. */
export const MAX_NEWS_HOURS = 72;
export const HOUR_MS = 3_600_000;
export const NEWS_WINDOWS = [24, 48, 72] as const;

export function ageHours(publishedAt: string, now = Date.now()): number | null {
  const at = Date.parse(publishedAt);
  if (!Number.isFinite(at) || at > now) return null;
  return (now - at) / HOUR_MS;
}

export function filterRecentNews<T extends { publishedAt: string }>(articles: readonly T[], hours = MAX_NEWS_HOURS, now = Date.now()): T[] {
  const cutoff = Number.isFinite(hours) ? Math.min(MAX_NEWS_HOURS, Math.max(1, hours)) : MAX_NEWS_HOURS;
  return articles.filter(article => {
    const age = ageHours(article.publishedAt, now);
    return age != null && age <= cutoff;
  });
}

/** Decaimento de atualidade, não de impacto financeiro: meia-vida de 24h. */
export function newsRecencyWeight(publishedAt: string, now = Date.now()): number {
  const age = ageHours(publishedAt, now);
  return age == null || age > MAX_NEWS_HOURS ? 0 : Math.pow(0.5, age / 24);
}
