import type { SupabaseClient } from "@supabase/supabase-js";
import { metricLabel } from "@/lib/plain";
import { scenarioForProperty } from "@/lib/scenarios";
import { scenarioOfRun } from "@/lib/sites";

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

type VerifyCfg = { asset_id: string; metric: string; limit: number; direction: "below" | "above" };

/** What to re-check after the repair: the scenario's own check, or the trend the agents analyzed (custom incidents). */
async function configFor(db: SupabaseClient, runId: string, run: { title: string | null; property_id: string | null }): Promise<VerifyCfg | null> {
  const sc = scenarioOfRun(run);
  if (sc?.hints.verify) return sc.hints.verify;
  const { data: steps } = await db.from("agent_steps").select("content").eq("run_id", runId).eq("kind", "tool");
  const trend = (steps ?? []).map((x) => x.content as { name?: string; args?: Record<string, unknown>; result?: Record<string, unknown> })
    .reverse().find((c) => c.name === "detect_trend" && c.result && !c.result.error);
  if (trend?.args && trend.result) {
    const limit = Number(trend.args.limit), latest = Number(trend.result.latest);
    // Readings below a limit they are climbing toward must end up further below it, and the other way round.
    return { asset_id: String(trend.args.asset_id), metric: String(trend.args.metric), limit, direction: latest <= limit ? "below" : "above" };
  }
  const fallback = sc ?? (run.property_id ? scenarioForProperty(run.property_id) : undefined);
  return fallback ? { asset_id: fallback.hints.root, metric: "health_pct", limit: 90, direction: "above" } : null;
}

/** Called when a work order is approved. One check per run. */
export async function scheduleVerification(db: SupabaseClient, runId: string) {
  const { data: existing } = await db.from("verifications").select("id").eq("run_id", runId);
  if (existing?.length) return;
  const { data: run } = await db.from("agent_runs").select("title, property_id").eq("id", runId).single();
  const cfg = run && (await configFor(db, runId, run));
  if (!cfg) return;
  const { data: rows } = await db.from("telemetry_events").select("value, created_at").eq("asset_id", cfg.asset_id).eq("metric", cfg.metric)
    .not("value", "is", null).order("created_at", { ascending: false }).limit(6);
  const before = (rows ?? []).reverse().map((r) => ({ t: r.created_at as string, v: Number(r.value) }));
  await db.from("verifications").insert({
    run_id: runId, asset_id: cfg.asset_id, metric: cfg.metric, limit_value: cfg.limit, direction: cfg.direction,
    due_at: new Date(Date.now() + DELAY_S * 1000).toISOString(), before,
  });
}

/** After-repair readings for any metric: a pass moves clearly back to the safe side of the limit; a fail keeps going past it. */
function simulated(v: Pick<Verification, "limit_value" | "direction" | "before">, outcome: "pass" | "fail") {
  const limit = Number(v.limit_value);
  const last = v.before.length ? v.before[v.before.length - 1].v : limit;
  const away = v.direction === "below" ? -1 : 1; // which way is safe
  const gap = Math.max(Math.abs(limit - last), Math.abs(limit) * 0.04, 0.05);
  const steps = outcome === "pass" ? [1.5, 3, 4.5] : [-0.6, -1.2, -1.8];
  const dec = Math.abs(limit) < 5 ? 100 : 10;
  return steps.map((k) => Math.round((last + away * gap * k * (outcome === "pass" ? 0.5 : 1)) * dec) / dec);
}

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
    const values = simulated(v, outcome);
    const now = Date.now();
    const after = values.map((val, i) => ({ t: new Date(now - (values.length - 1 - i) * 20 * 60_000).toISOString(), v: val }));
    for (const a of after) {
      await db.from("telemetry_events").insert({ asset_id: v.asset_id, source: "sensor", metric: v.metric, value: a.v, message: "After repair (simulated)", created_at: a.t });
    }
    const latest = values[values.length - 1];
    const limit = Number(v.limit_value);
    const margin = Math.max(Math.abs(limit) * 0.02, 0.01); // clearly on the safe side, scaled to the metric
    const ok = v.direction === "below" ? latest < limit - margin && values[0] >= latest : latest > limit + margin && values[0] <= latest;
    const unit = metricLabel(v.metric).unit;
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
