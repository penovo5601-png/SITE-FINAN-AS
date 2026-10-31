#!/usr/bin/env bash
# ============================================================================
#  Publicação PERMANENTE e gratuita do TickerLab + ChartLens
#  Corre tudo de uma vez: base de dados na cloud, seed dos 61.589 tickers,
#  e deploy dos dois sites em domínios gratuitos que nunca dependem da sandbox.
#
#  Uso:
#    VERCEL_TOKEN=vcp_xxx  NEON_DATABASE_URL=postgresql://...  bash scripts/deploy-permanent.sh
#
#  O que precisas de criar (grátis, ~2 min cada):
#    1) https://vercel.com/account/tokens        -> VERCEL_TOKEN
#    2) https://neon.tech  (projeto novo)        -> NEON_DATABASE_URL (usa a "pooled connection string")
# ============================================================================
set -euo pipefail

: "${VERCEL_TOKEN:?Falta VERCEL_TOKEN (https://vercel.com/account/tokens)}"
: "${NEON_DATABASE_URL:?Falta NEON_DATABASE_URL (string de ligação pooled do Neon)}"

PROJECT="${PROJECT_NAME:-tickerlab}"
CHART_PROJECT="${CHART_PROJECT_NAME:-chartlens}"

echo "==> 1/6  A preparar a base de dados na cloud (Neon)"
DATABASE_URL="$NEON_DATABASE_URL" npx drizzle-kit push --force

echo "==> 2/6  A carregar o universo de 61.589 ações"
if [ ! -f public/data/universe.tsv.gz ]; then
  echo "    (a regenerar o universo a partir das fontes públicas...)"
  node scripts/build-universe.mjs
fi
DATABASE_URL="$NEON_DATABASE_URL" node scripts/seed-db.mjs

echo "==> 3/6  A configurar as variáveis de ambiente no Vercel"
for P in "$PROJECT" "$CHART_PROJECT"; do
  printf '%s' "$NEON_DATABASE_URL" | npx vercel env add DATABASE_URL production --project "$P" --token "$VERCEL_TOKEN" --yes 2>/dev/null \
    || echo "    (DATABASE_URL já existe em $P)"
done
printf '%s' "chart" | npx vercel env add SITE_MODE production --project "$CHART_PROJECT" --token "$VERCEL_TOKEN" --yes 2>/dev/null \
  || echo "    (SITE_MODE já existe em $CHART_PROJECT)"

echo "==> 4/6  Build de produção local (validação)"
DATABASE_URL="$NEON_DATABASE_URL" npm run build

echo "==> 5/6  Deploy do SITE 1 — TickerLab (avaliação de ações)"
URL1=$(npx vercel deploy --prod --yes --name "$PROJECT" --token "$VERCEL_TOKEN" | tail -1)
echo "    $URL1"

echo "==> 6/6  Deploy do SITE 2 — ChartLens (foto do gráfico)"
URL2=$(SITE_MODE=chart npx vercel deploy --prod --yes --name "$CHART_PROJECT" --token "$VERCEL_TOKEN" | tail -1)
echo "    $URL2"

echo
echo "============================================================"
echo "  PUBLICADO. Guarda estes dois links — são permanentes:"
echo
echo "  Site 1 · TickerLab  ->  $URL1"
echo "  Site 2 · ChartLens  ->  $URL2"
echo
echo "  Domínios próprios (opcional, grátis): em vercel.com ->"
echo "  Project -> Settings -> Domains."
echo "============================================================"
