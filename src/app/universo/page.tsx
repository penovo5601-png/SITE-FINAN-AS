import UniverseBrowser from "@/components/UniverseBrowser";
import { ensureSeeded } from "@/lib/universe";

export const dynamic = "force-dynamic";

export default async function UniversoPage() {
  await ensureSeeded();
  return <UniverseBrowser />;
}
