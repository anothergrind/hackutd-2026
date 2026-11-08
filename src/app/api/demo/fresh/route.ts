import { NextResponse, after } from "next/server";
import { handle } from "@/lib/http";
import { startScenario } from "@/lib/incidents";
import { resetAllowed, resetDemo } from "@/lib/reset";
import { SCENARIOS } from "@/lib/scenarios";
import { createSupabaseAdminClient, usingMemoryDb } from "@/lib/supabase/admin";

export const maxDuration = 300;

// POST -> a clean demo: clears old incidents, then one fresh incident of every problem type, each in a
// different building, all waiting for approval. Scripted so the set is quick and consistent.
export const POST = handle(async () => {
  if (!resetAllowed(usingMemoryDb())) return NextResponse.json({ error: "Set ALLOW_DEMO_RESET=true to enable." }, { status: 403 });
  const db = createSupabaseAdminClient();
  await resetDemo(db);
  const offset = Math.floor(Math.random() * 4);
  const started: Awaited<ReturnType<typeof startScenario>>[] = [];
  for (const [i, sc] of SCENARIOS.entries()) started.push(await startScenario(db, sc, { mode: "scripted", site: offset + i }));
  after(async () => { await Promise.all(started.map((r) => r.execute())); });
  return NextResponse.json({ run_ids: started.map((r) => r.runId) }, { status: 202 });
});
