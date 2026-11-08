import type { SupabaseClient } from "@supabase/supabase-js";
import { hoursToLimit, linearTrend } from "@/lib/agent/math";
import { scenarioOfRun } from "@/lib/sites";
import { latestTag, readSeries, tickFeed } from "@/lib/sensors";

export type Forecast = {
  asset_id: string; metric: string; limit: number; failing: "rising" | "falling";
  points: { t: string; v: number }[];
  /** Live best-fit line through the readings: value at `at`, change per hour. */
  fit: { at: string; value: number; slope_per_hour: number; r2: number } | null;
  /** Hours left by the live fit, and the moment the line crosses the limit. */
  hours_left: number | null; fail_at: string | null;
  /** What Sensor Watch found when it analyzed the incident (for the "show the math" view). */
  analysis: { at: string; latest: number; slope_per_day: number; hours_to_limit: number | null; r2: number } | null;
};

type Step = { kind: string; created_at: string; content: { name?: string; args?: Record<string, unknown>; result?: Record<string, unknown> } };

/** The sensor forecast behind an incident: readings, best-fit line, and when it reaches the limit.
 *  Uses the trend the agents analyzed, or the scenario's sensor while the agents are still working. */
export async function forecastFor(db: SupabaseClient, run: { title: string | null; status: string; created_at: string; property_id?: string | null }, steps: Step[]): Promise<Forecast | null> {
  const step = [...steps].reverse().find((s) => s.kind === "tool" && s.content.name === "detect_trend" && !s.content.result?.error);
  const a = step?.content.args ?? {};
  const fromScenario = scenarioOfRun(run)?.hints.trend;
  const asset = String(a.asset_id ?? fromScenario?.asset_id ?? "");
  const metric = String(a.metric ?? fromScenario?.metric ?? "");
  const limit = Number(a.limit ?? fromScenario?.limit);
  if (!asset || !metric || !Number.isFinite(limit)) return null;

  // This incident's own readings (the history the agents analyzed), or the newest one while they are still working.
  const newest = await latestTag(db, asset, metric);
  const tag = (step?.content.result?.series as string | undefined) ?? newest;
  // Only the newest history keeps receiving live readings, for a few hours after the incident starts.
  if (tag && tag === newest && Date.now() - Date.parse(run.created_at) < 6 * 3_600_000) await tickFeed(db, asset, metric, tag).catch(() => undefined);
  const points = await readSeries(db, asset, metric, 14, tag);
  if (points.length < 3) return null;

  const fit = linearTrend(points.map((p) => ({ t: Date.parse(p.t), value: p.v })));
  const last = points[points.length - 1];
  const hours = fit ? hoursToLimit(fit.fittedLatest, fit.slopePerHour, limit) : null;
  const failing: Forecast["failing"] = fit ? (fit.slopePerHour >= 0 ? "rising" : "falling") : last.v < limit ? "rising" : "falling";
  const r = step?.content.result;
  return {
    asset_id: asset, metric, limit, failing, points,
    fit: fit ? { at: last.t, value: Math.round(fit.fittedLatest * 1000) / 1000, slope_per_hour: fit.slopePerHour, r2: Math.round(fit.r2 * 1000) / 1000 } : null,
    hours_left: hours == null ? null : Math.round(hours * 10) / 10,
    fail_at: hours == null ? null : new Date(Date.parse(last.t) + hours * 3_600_000).toISOString(),
    analysis: step && r ? { at: step.created_at, latest: Number(r.latest), slope_per_day: Number(r.slope_per_day), hours_to_limit: r.hours_to_limit == null ? null : Number(r.hours_to_limit), r2: Number(r.r2) } : null,
  };
}
