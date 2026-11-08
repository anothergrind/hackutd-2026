import { NextResponse } from "next/server";
import { handle } from "@/lib/http";
import { createSupabaseAdminClient, usingMemoryDb } from "@/lib/supabase/admin";

// Demo reset before judging. Off unless ALLOW_DEMO_RESET=true, because it deletes run history.
export const POST = handle(async () => {
  if (process.env.ALLOW_DEMO_RESET !== "true" && !usingMemoryDb()) return NextResponse.json({ error: "Set ALLOW_DEMO_RESET=true to enable." }, { status: 403 });
  const db = createSupabaseAdminClient();
  const { data: runs } = await db.from("agent_runs").select("event_id");
  const eventIds = (runs ?? []).map((r) => r.event_id).filter(Boolean);
  const nil = "00000000-0000-0000-0000-000000000000";
  await db.from("schedule_changes").delete().neq("id", nil);
  await db.from("work_orders").delete().not("run_id", "is", null); // keep seeded history
  await db.from("tenant_notices").delete().neq("id", nil);
  await db.from("approvals").delete().neq("id", nil);
  await db.from("building_memory").delete().neq("source", "seed");
  await db.from("sweeps").delete().neq("id", nil);
  await db.from("agent_runs").delete().neq("id", nil);
  if (eventIds.length) await db.from("telemetry_events").delete().in("id", eventIds);
  await db.from("assets").update({ status: "ok" }).neq("id", "");
  return NextResponse.json({ reset: true });
});
