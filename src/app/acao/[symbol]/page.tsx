import AnalysisView from "@/components/AnalysisView";
import { ensureSeeded } from "@/lib/universe";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  await ensureSeeded();
  return <AnalysisView />;
}
