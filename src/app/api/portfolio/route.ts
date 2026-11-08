import { NextResponse } from "next/server";
import { handle } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureSites } from "@/lib/incidents";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const db = createSupabaseAdminClient();
  await ensureSites(db).catch((e) => console.error("[sites]", e));
  const results = await Promise.all([
    db.from("properties").select("id, name, address, building_type").order("name"),
    db.from("assets").select("id, property_id, name, kind, location, status"),
    db.from("dependencies").select("upstream, downstream, relation"),
    db.from("tenants").select("id, property_id, asset_id, name, sla_penalty_per_hour"),
    db.from("maintenance_tickets").select("id, property_id, equipment, title, urgency, status, reported_at").neq("status", "resolved").order("reported_at", { ascending: false }),
    db.from("work_orders").select("id, asset_id, title, priority, status, scheduled_for, created_at, vendors(name)").order("created_at", { ascending: false }).limit(200),
    db.from("sweeps").select("scores, created_at").eq("status", "done").order("created_at", { ascending: false }).limit(1),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  const [properties, assets, dependencies, tenants, tickets, workOrders, sweep] = results.map((r) => r.data ?? []);
  return NextResponse.json({ properties, assets, dependencies, tenants, tickets, work_orders: workOrders, sweep: sweep[0] ?? null });
});
