import { NextResponse, after } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agent/run";

export const maxDuration = 120; // agent loop runs after the response; Vercel caps this by plan

const SOURCES = ["sensor", "bms", "cyber", "ticket", "weather"];

// POST { asset_id, source, metric, value?, message } -> records the signal, starts the agent, returns run_id.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const { asset_id, source, metric, value, message } = body ?? {};
  if (
    typeof asset_id !== "string" || typeof metric !== "string" || typeof message !== "string" ||
    typeof source !== "string" || !SOURCES.includes(source) ||
    (value != null && typeof value !== "number")
  ) {
    return NextResponse.json({ error: "Need asset_id, source, metric, message (and optional numeric value)." }, { status: 400 });
  }

  try {
    const db = createSupabaseAdminClient();
    const { data: event, error } = await db
      .from("telemetry_events")
      .insert({ asset_id, source, metric, value: value ?? null, message: message.slice(0, 1000) })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await db.from("assets").update({ status: "degraded" }).eq("id", asset_id);
    const { data: run, error: runError } = await db.from("agent_runs").insert({ event_id: event.id }).select("id").single();
    if (runError) return NextResponse.json({ error: runError.message }, { status: 500 });

    after(() => runAgent(db, run.id, event));
    return NextResponse.json({ run_id: run.id }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 503 });
  }
}
