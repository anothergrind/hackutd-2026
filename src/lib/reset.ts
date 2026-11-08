import type { SupabaseClient } from "@supabase/supabase-js";

/** Clears every run and what it produced, and puts all equipment back to OK. Seeded history stays. */
export async function resetDemo(db: SupabaseClient) {
  const { data: runs } = await db.from("agent_runs").select("event_id");
  const eventIds = (runs ?? []).map((r) => r.event_id).filter(Boolean);
  const nil = "00000000-0000-0000-0000-000000000000";
  await db.from("verifications").delete().neq("id", nil);
  await db.from("triage_plans").delete().neq("id", nil);
  await db.from("telemetry_events").delete().like("message", "After repair%");
  await db.from("telemetry_events").delete().like("message", "Sensor feed%"); // generated histories; each incident makes its own
  await db.from("schedule_changes").delete().neq("id", nil);
  await db.from("work_orders").delete().not("run_id", "is", null); // keep seeded history
  await db.from("tenant_notices").delete().neq("id", nil);
  await db.from("approvals").delete().neq("id", nil);
  await db.from("building_memory").delete().neq("source", "seed");
  await db.from("sweeps").delete().neq("id", nil);
  await db.from("agent_runs").delete().neq("id", nil);
  if (eventIds.length) await db.from("telemetry_events").delete().in("id", eventIds);
  await db.from("assets").update({ status: "ok" }).neq("id", "");
}

export const resetAllowed = (memory: boolean) => process.env.ALLOW_DEMO_RESET === "true" || memory;
