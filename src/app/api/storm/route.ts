import { NextResponse, after } from "next/server";
import { handle } from "@/lib/http";
import { startScenario, stormPicks } from "@/lib/incidents";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;
// POST -> a random problem in each building at once. Each runs its own crew in parallel, with fresh numbers.
export const POST = handle(async () => {
  const db = createSupabaseAdminClient();
  const runIds: string[] = [];
  for (const sc of stormPicks()) {
    const { runId, execute } = await startScenario(db, sc);
    runIds.push(runId);
    after(execute);
  }
  return NextResponse.json({ run_ids: runIds }, { status: 202 });
});
