import { NextResponse, after } from "next/server";
import { bad, body, handle } from "@/lib/http";
import { startScenario } from "@/lib/incidents";
import { SCENARIOS } from "@/lib/scenarios";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

// POST { per_type?: 1-3 } -> fills the app with demo incidents: every problem type, each with its own numbers.
// They run in scripted mode so a batch is quick and doesn't use up Nemotron rate limits.
export const POST = handle(async (request: Request) => {
  const input = await body(request);
  const per = Math.min(3, Math.max(1, Number(input.per_type ?? 2) || 2));
  if (!Number.isFinite(per)) return bad("per_type must be 1, 2 or 3.");
  const db = createSupabaseAdminClient();
  // One incident per problem type per round. Rounds run one after another, so incidents of the same type each
  // get their own fresh sensor history instead of sharing one.
  // Each round puts every problem type in a different building than the round before.
  const offset = Math.floor(Math.random() * 4);
  const round = async (r: number) => {
    const started = [];
    for (const [i, sc] of SCENARIOS.entries()) started.push(await startScenario(db, sc, { mode: "scripted", site: offset + r + i }));
    return started;
  };
  const first = await round(0);
  after(async () => {
    await Promise.all(first.map((r) => r.execute()));
    for (let i = 1; i < per; i++) await Promise.all((await round(i)).map((r) => r.execute()));
  });
  return NextResponse.json({ run_ids: first.map((r) => r.runId), rounds: per }, { status: 202 });
});
