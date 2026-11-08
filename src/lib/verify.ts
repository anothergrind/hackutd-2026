import type { SupabaseClient } from "@supabase/supabase-js";
import { scenarioByLabel, scenarioForProperty } from "@/lib/scenarios";

// After a repair is approved, OpsCrew checks the sensors again and confirms the problem is gone,
// or reopens it. In the demo there is no real repair, so the after-repair readings are simulated
// (labelled "After repair (simulated)") and the check runs a short delay after approval.

export type Verification = {
  id: string; run_id: string; asset_id: string; metric: string; limit_value: number; direction: "below" | "above";
  due_at: string; status: "scheduled" | "passed" | "failed"; before: { t: string; v: number }[]; after: { t: string; v: number }[];
  note: string | null; checked_at: string | null;
};

const DELAY_S = Number(process.env.OPSCREW_VERIFY_DELAY_S ?? 25);
const g = globalThis as unknown as { __opscrewVerifyLock?: Set<string> };
const lock = (g.__opscrewVerifyLock ??= new Set());

function configFor(run: { title: string | null; property_id: string | null }) {
  const sc = scenarioByLabel(run.title) ?? (run.property_id ? scenarioForProperty(run.property_id) : undefined);
  if (!sc) return null;
  return sc.hints.verify ?? { asset_id: sc.hints.root, metric: "health_pct", limit: 90, direction: "above" as const };
}

/** Called when a work order is approved. One check per run. */
export async function scheduleVerification(db: SupabaseClient, runId: string) {
  const { data: existing } = await db.from("verifications").select("id").eq("run_id", runId);
  if (existing?.length) return;
  const { data: run } = await db.from("agent_runs").select("title, property_id").eq("id", runId).single();
  const cfg = run && configFor(run);
  if (!cfg) return;
  const { data: rows } = await db.from("telemetry_events").select("value, created_at").eq("asset_id", cfg.asset_id).eq("metric", cfg.metric)
    .not("value", "is", null).order("created_at", { ascending: false }).limit(6);
  const before = (rows ?? []).reverse().map((r) => ({ t: r.created_at as string, v: Number(r.value) }));
  await db.from("verifications").insert({
    run_id: runId, asset_id: cfg.asset_id, metric: cfg.metric, limit_value: cfg.limit, direction: cfg.direction,
    due_at: new Date(Date.now() + DELAY_S * 1000).toISOString(), before,
  });
}

const simulated = (metric: string, outcome: "pass" | "fail") =>
  metric === "supply_temp_f" ? (outcome === "pass" ? [46.4, 45.3, 44.6] : [49.8, 50.2, 50.7])
    : outcome === "pass" ? [96, 98, 99] : [78, 74, 71];

/** Runs the check if it is due (or forced). Safe to call on every poll. */
export async function checkVerification(db: SupabaseClient, runId: string, opts: { force?: boolean; outcome?: "pass" | "fail" } = {}) {
  const { data } = await db.from("verifications").select("*").eq("run_id", runId).limit(1);
  const v = data?.[0] as Verification | undefined;
  if (!v || v.status !== "scheduled") return v ?? null;
  if (!opts.force && Date.parse(v.due_at) > Date.now()) return v;
  if (lock.has(v.id)) return v;
  lock.add(v.id);
  try {
    const outcome = opts.outcome ?? "pass";
    const values = simulated(v.metric, outcome);
    const now = Date.now();
    const after = values.map((val, i) => ({ t: new Date(now - (values.length - 1 - i) * 20 * 60_000).toISOString(), v: val }));
    for (const a of after) {
      await db.from("telemetry_events").insert({ asset_id: v.asset_id, source: "sensor", metric: v.metric, value: a.v, message: "After repair (simulated)", created_at: a.t });
    }
    const latest = values[values.length - 1];
    const limit = Number(v.limit_value);
    const ok = v.direction === "below" ? latest < limit - 1 && values[0] >= latest : latest > limit && values[0] <= latest;
    const unit = v.metric.endsWith("_f") ? "°F" : v.metric.endsWith("_pct") ? "%" : "";
    const note = ok
      ? `Fix confirmed: ${v.asset_id} ${v.metric} is back to ${latest}${unit} and improving (limit ${limit}${unit}).`
      : `Fix did not hold: ${v.asset_id} ${v.metric} is ${latest}${unit} and still getting worse (limit ${limit}${unit}).`;
    const { data: claimed } = await db.from("verifications")
      .update({ status: ok ? "passed" : "failed", after, note, checked_at: new Date().toISOString() })
      .eq("id", v.id).eq("status", "scheduled").select("id");
    if (claimed?.length) {
      const { data: run } = await db.from("agent_runs").select("property_id, event_id").eq("id", runId).single();
      const { data: ev } = run?.event_id ? await db.from("telemetry_events").select("asset_id").eq("id", run.event_id).single() : { data: null };
      for (const id of new Set([v.asset_id, ev?.asset_id].filter(Boolean) as string[])) {
        await db.from("assets").update({ status: ok ? "ok" : "degraded" }).eq("id", id);
      }
      if (run?.property_id) await db.from("building_memory").insert({ property_id: run.property_id, asset_id: v.asset_id, note, source: "agent", run_id: runId });
    }
    const { data: fresh } = await db.from("verifications").select("*").eq("id", v.id).single();
    return fresh as Verification;
  } finally {
    lock.delete(v.id);
  }
}
