import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Universo global de ações (61k+ símbolos em 34 mercados).
 * Alimentado a partir de public/data/universe.tsv.gz no primeiro arranque.
 */
export const tickers = pgTable(
  "tickers",
  {
    symbol: varchar("symbol", { length: 32 }).primaryKey(),
    ticker: varchar("ticker", { length: 24 }).notNull(),
    name: text().notNull(),
    exchange: varchar("exchange", { length: 64 }),
    market: varchar("market", { length: 64 }),
    countryCode: varchar("country_code", { length: 4 }),
    sector: varchar("sector", { length: 64 }),
    assetType: varchar("asset_type", { length: 24 }).default("Stock"),
    featured: boolean("featured").default(false),
    popularity: integer("popularity").default(0),
  },
  (t) => [
    index("tickers_ticker_idx").on(t.ticker),
    index("tickers_name_idx").on(t.name),
    index("tickers_market_idx").on(t.market),
    index("tickers_popularity_idx").on(t.popularity),
  ],
);

/** Cache das análises técnicas calculadas (evita martelar o fornecedor de dados). */
export const analyses = pgTable(
  "analyses",
  {
    id: serial("id").primaryKey(),
    symbol: varchar("symbol", { length: 32 }).notNull(),
    name: text(),
    verdict: varchar("verdict", { length: 24 }).notNull(),
    score: doublePrecision("score").notNull(),
    confidence: doublePrecision("confidence").notNull(),
    price: doublePrecision("price"),
    currency: varchar("currency", { length: 8 }),
    targetUp: doublePrecision("target_up"),
    targetDown: doublePrecision("target_down"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("analyses_symbol_idx").on(t.symbol), index("analyses_created_idx").on(t.createdAt)],
);

/** Relatórios gerados a partir de fotografias/capturas de gráficos enviadas pelo utilizador. */
export const chartReports = pgTable(
  "chart_reports",
  {
    id: serial("id").primaryKey(),
    symbol: varchar("symbol", { length: 32 }),
    name: text(),
    fileName: text(),
    bytes: integer("bytes"),
    verdict: varchar("verdict", { length: 24 }).notNull(),
    score: doublePrecision("score").notNull(),
    confidence: doublePrecision("confidence").notNull(),
    headline: text().notNull(),
    metrics: jsonb("metrics"),
    signals: jsonb("signals"),
    notes: jsonb("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("chart_reports_created_idx").on(t.createdAt)],
);

/** Lista de vigilância do utilizador (guardada no servidor). */
export const watchlist = pgTable(
  "watchlist",
  {
    id: serial("id").primaryKey(),
    symbol: varchar("symbol", { length: 32 }).notNull(),
    name: text(),
    market: varchar("market", { length: 64 }),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("watchlist_symbol_idx").on(t.symbol)],
);

export type Ticker = typeof tickers.$inferSelect;
export type AnalysisRow = typeof analyses.$inferSelect;
export type ChartReport = typeof chartReports.$inferSelect;

/** Histórico real persistente, identificado pelo ticker completo e bolsa/sufixo. */
export const marketHistoryCache = pgTable("market_history_cache", {
  symbol: varchar("symbol", {length:32}).primaryKey(),
  payload: jsonb("payload").notNull(),
  updatedAt: timestamp("updated_at", {withTimezone:true}).defaultNow().notNull(),
});
