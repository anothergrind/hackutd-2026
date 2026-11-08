import { NextResponse } from "next/server";
import { handle } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Row = { id: string; title: string | null; property_id: string | null; created_at: string };

export const GET = handle(async () => {
  const db = createSupabaseAdminClient();
  const [runs, pending] = await Promise.all([
    db.from("agent_runs").select("id, status, trigger, title, summary, property_id, risk, mode, created_at, finished_at, properties(name), telemetry_events(asset_id)").order("created_at", { ascending: false }).limit(200),
    db.from("approvals").select("run_id, status, kind").in("status", ["pending", "sent"]),
  ]);
  if (runs.error) throw new Error(runs.error.message);
  const waiting = new Map<string, number>(), repaired = new Set<string>();
  for (const a of pending.data ?? []) {
    if (a.status === "pending") waiting.set(a.run_id, (waiting.get(a.run_id) ?? 0) + 1);
    else if (a.kind === "work_order") repaired.add(a.run_id); // an approved repair
  }
  // A building lists each kind of incident once: the newest one wins (the list is newest first).
  const seen = new Set<string>();
  const unique = ((runs.data ?? []) as unknown as Row[]).filter((r) => {
    const key = `${r.property_id}|${r.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return NextResponse.json({ runs: unique.slice(0, 150).map((r) => ({ ...r, pending: waiting.get(r.id) ?? 0, repaired: repaired.has(r.id) })) });
});
