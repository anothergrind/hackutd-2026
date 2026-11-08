import { NextResponse } from "next/server";
import { handle } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const db = createSupabaseAdminClient();
  const [runs, pending] = await Promise.all([
    db.from("agent_runs").select("id, status, trigger, title, summary, property_id, risk, mode, created_at, finished_at, properties(name)").order("created_at", { ascending: false }).limit(150),
    db.from("approvals").select("run_id").eq("status", "pending"),
  ]);
  if (runs.error) throw new Error(runs.error.message);
  const waiting = new Map<string, number>();
  for (const a of pending.data ?? []) waiting.set(a.run_id, (waiting.get(a.run_id) ?? 0) + 1);
  return NextResponse.json({ runs: (runs.data ?? []).map((r) => ({ ...r, pending: waiting.get(r.id) ?? 0 })) });
});
