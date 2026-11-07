import { NextResponse, after } from "next/server";
import { startRun } from "@/lib/agent/orchestrate";
import { bad, body, handle } from "@/lib/http";
import { scenarioById, SCENARIOS } from "@/lib/scenarios";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300; // the agents keep working after the response (Vercel caps by plan)

export const GET = handle(async () => NextResponse.json({ scenarios: SCENARIOS.map(({ hints: _h, ...s }) => s) }));

// POST { scenario_id } -> records the signal, starts the crew, returns run_id immediately.
export const POST = handle(async (request: Request) => {
  const input = await body(request);
  const scenario = typeof input.scenario_id === "string" ? scenarioById(input.scenario_id) : undefined;
  if (!scenario) return bad(`Unknown scenario_id. Try one of: ${SCENARIOS.map((s) => s.id).join(", ")}`);

  const db = createSupabaseAdminClient();
  const { runId, execute } = await startRun(db, {
    signal: scenario.signal, propertyId: scenario.property_id, hints: scenario.hints, trigger: "incident", title: scenario.label,
  });
  after(execute);
  return NextResponse.json({ run_id: runId }, { status: 202 });
});
