import type { SupabaseClient } from "@supabase/supabase-js";
import { startRun } from "@/lib/agent/orchestrate";
import { hoursToLimit, linearTrend, sweepScore } from "@/lib/agent/math";
import { activeAlerts } from "@/lib/nws";
import { scenarioForProperty } from "@/lib/scenarios";
import type { SweepScore } from "@/lib/types";

const AUTOSTART_AT = 40;

async function forecastMax(lat: number | null, lon: number | null) {
  if (lat == null || lon == null) return null;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max&forecast_days=2&temperature_unit=fahrenheit`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d = await r.json();
    return Math.max(...(d.daily?.temperature_2m_max ?? [])) || null;
  } catch {
    return null;
  }
}

/** Active NWS alert types at a building. If NWS is down or slow, the sweep carries on without them. */
async function alertEvents(lat: number | null, lon: number | null) {
  if (lat == null || lon == null) return [];
  try {
    return (await activeAlerts(lat, lon, 5000)).map((a) => a.event);
  } catch {
    return [];
  }
}

/**
 * Scores every building from cheap deterministic signals (no LLM), then starts a full agent run on the
 * worst one if it crosses the threshold. That is the "no one typed a prompt" path.
 */
export async function runSweep(db: SupabaseClient, opts: { autostart: boolean }) {
  const { data: sweep, error } = await db.from("sweeps").insert({}).select("id").single();
  if (error) throw new Error(error.message);

  const since72 = new Date(Date.now() - 72 * 3_600_000).toISOString();
  const [props, tickets, events, assets] = await Promise.all([
    db.from("properties").select("id, name, building_type, lat, lon"),
    db.from("maintenance_tickets").select("property_id, urgency").neq("status", "resolved"),
    db.from("telemetry_events").select("asset_id, source, metric, value, created_at").gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString()).order("created_at"),
    db.from("assets").select("id, property_id, status"),
  ]);
  const failed = [props, tickets, events, assets].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const assetProperty = new Map((assets.data ?? []).map((a) => [a.id as string, a.property_id as string]));
  const scores: SweepScore[] = await Promise.all((props.data ?? []).map(async (p) => {
    const ev = (events.data ?? []).filter((e) => assetProperty.get(e.asset_id) === p.id);
    const trendHint = scenarioForProperty(p.id)?.hints.trend;
    let hrs: number | null = null;
    if (trendHint) {
      const series = ev.filter((e) => e.asset_id === trendHint.asset_id && e.metric === trendHint.metric && e.value != null);
      const fit = linearTrend(series.map((e) => ({ t: Date.parse(e.created_at), value: Number(e.value) })));
      if (fit) hrs = hoursToLimit(fit.latest, fit.slopePerHour, trendHint.limit);
    }
    const s = sweepScore({
      openTicketUrgency: (tickets.data ?? []).filter((t) => t.property_id === p.id).map((t) => Number(t.urgency)),
      anomalies: ev.filter((e) => e.created_at >= since72 && e.source !== "ticket" && e.metric !== "supply_temp_f").length,
      degradedAssets: (assets.data ?? []).filter((a) => a.property_id === p.id && a.status !== "ok").length,
      hoursToLimit: hrs,
      forecastMaxF: await forecastMax(p.lat, p.lon),
      alerts: await alertEvents(p.lat, p.lon),
    });
    return { property_id: p.id, name: p.name, building_type: p.building_type, ...s };
  }));
  scores.sort((a, b) => b.score - a.score);

  let started: { runId: string; execute: () => Promise<void> } | null = null;
  const top = scores[0];
  const scenario = top && scenarioForProperty(top.property_id);
  if (opts.autostart && top && top.score >= AUTOSTART_AT && scenario) {
    const { count } = await db.from("agent_runs").select("id", { count: "exact", head: true }).eq("property_id", top.property_id).in("status", ["running"]);
    if (!count) {
      started = await startRun(db, {
        signal: { asset_id: scenario.hints.root, source: "sensor", metric: "sweep_score", value: top.score, message: `Nightly sweep flagged ${top.name} (${top.score}/100): ${top.reasons.map((r) => r.text).join("; ")}.` },
        propertyId: top.property_id, hints: scenario.hints, trigger: "sweep", title: `Sweep: ${top.name}`,
      });
    }
  }

  await db.from("sweeps").update({ status: "done", scores, started_run_id: started?.runId ?? null, finished_at: new Date().toISOString() }).eq("id", sweep.id);
  return { sweepId: sweep.id as string, scores, started };
}
