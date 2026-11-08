import { NextResponse, after } from "next/server";
import { startRun } from "@/lib/agent/orchestrate";
import { handle } from "@/lib/http";
import { scenarioById } from "@/lib/scenarios";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;
const STORM = ["cooling-cascade", "office-ahu", "northstar-panel"];

// POST -> problems in three buildings at once. Each runs its own crew in parallel.
export const POST = handle(async () => {
  const db = createSupabaseAdminClient();
  const runIds: string[] = [];
  for (const id of STORM) {
    const sc = scenarioById(id)!;
    const { runId, execute } = await startRun(db, { signal: sc.signal, propertyId: sc.property_id, hints: sc.hints, trigger: "incident", title: sc.label });
    runIds.push(runId);
    after(execute);
  }
  return NextResponse.json({ run_ids: runIds }, { status: 202 });
});
