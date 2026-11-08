import { NextResponse } from "next/server";
import { handle } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { forecastFor } from "@/lib/forecast";
import { checkVerification } from "@/lib/verify";

export const dynamic = "force-dynamic";

// Poll while the run is "running" to draw the crew live.
export const GET = handle(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const db = createSupabaseAdminClient();
  const [run, steps, approvals] = await Promise.all([
    db.from("agent_runs").select("*, properties(name, building_type), telemetry_events(asset_id, source, metric, value, message)").eq("id", id).single(),
    db.from("agent_steps").select("id, agent, kind, content, created_at").eq("run_id", id).order("id"),
    db.from("approvals").select("*").eq("run_id", id).order("created_at"),
  ]);
  if (run.error) return NextResponse.json({ error: run.error.message }, { status: 404 });
  if (steps.error) throw new Error(steps.error.message);
  // Runs the after-repair check when it comes due; table may be missing before migration 007.
  const verification = await checkVerification(db, id).catch(() => null);
  // Sensor readings, best-fit line and failure time for the forecast chart (ticks the live feed too).
  const forecast = await forecastFor(db, run.data, steps.data ?? []).catch(() => null);
  return NextResponse.json({ run: run.data, steps: steps.data, approvals: approvals.data ?? [], verification, forecast });
});
