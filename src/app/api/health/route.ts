import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSeeded, loadUniverse } from "@/lib/universe";

export const dynamic = "force-dynamic";

/**
 * A app está saudável mesmo sem PostgreSQL: nesse caso o universo de ações é
 * servido pelo índice em memória (public/data/universe.tsv.gz).
 */
export async function GET() {
  await ensureSeeded();
  let database = false;
  try {
    await db.execute(sql`select 1`);
    database = true;
  } catch {
    database = false;
  }
  const memory = loadUniverse().length;
  const ok = database || memory > 1000;
  return NextResponse.json(
    {
      ok,
      database: database ? "postgresql" : "índice em memória",
      tickersDisponiveis: memory,
    },
    { status: ok ? 200 : 500 },
  );
}
