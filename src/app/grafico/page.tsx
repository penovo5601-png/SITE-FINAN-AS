import ChartAnalyzer from "@/components/ChartAnalyzer";
import { ensureSeeded } from "@/lib/universe";

export const dynamic = "force-dynamic";

export default async function GraficoPage() {
  await ensureSeeded();
  return <ChartAnalyzer />;
}
