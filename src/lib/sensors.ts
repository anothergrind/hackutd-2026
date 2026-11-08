import type { SupabaseClient } from "@supabase/supabase-js";
import { linearTrend } from "@/lib/agent/math";

// The demo sensor feed. Each new incident gets a fresh two-week history that drifts toward a failure
// limit with realistic noise, and a different time to failure every run. While an incident is open,
// one new reading per minute continues the trend, so the forecast moves like a live feed.

/** How a metric fails: it drifts from its normal value toward `limit` (rising or falling). */
export type Sim = { asset_id: string; metric: string; limit: number; failing: "rising" | "falling"; normal: number; hours: [number, number] };

const FEED_MSG = "Sensor feed";
/** Each generated or uploaded history gets its own tag, so every incident keeps its own readings. */
const newTag = () => `${FEED_MSG} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const STEP_H = 3; // one reading every 3 hours of history
const DAYS = 14;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** Normal-ish noise (sum of uniforms), mean 0, standard deviation about `sd`. */
const noise = (sd: number) => (Math.random() + Math.random() + Math.random() - 1.5) * sd * 2;
const round = (v: number, span: number) => Math.round(v * (span < 5 ? 100 : 10)) / (span < 5 ? 100 : 10);

/** A two-week history ending now that reaches `limit` in `hoursLeft` hours. */
export function synthSeries(sim: Sim, hoursLeft: number, now = Date.now()) {
  const span = Math.abs(sim.limit - sim.normal);
  const dir = sim.failing === "rising" ? 1 : -1;
  const slope = span / (hoursLeft + DAYS * 24); // value units per hour
  const sd = span * rand(0.015, 0.035);
  const points: { t: string; v: number }[] = [];
  for (let h = DAYS * 24; h >= 0; h -= STEP_H) {
    const v = sim.limit - dir * slope * (hoursLeft + h) + noise(sd);
    points.push({ t: new Date(now - h * 3_600_000).toISOString(), v: round(v, span) });
  }
  return points;
}

/** Writes a fresh drifting history for the scenario's sensor. Returns the hours left it was built with. */
export async function seedSeries(db: SupabaseClient, sim: Sim): Promise<number> {
  const hoursLeft = Math.round(rand(sim.hours[0], sim.hours[1]) * 10) / 10;
  await writeSeries(db, sim.asset_id, sim.metric, synthSeries(sim, hoursLeft));
  return hoursLeft;
}

/** Writes readings for one asset + metric as a new tagged history (older histories stay with their incidents). */
export async function writeSeries(db: SupabaseClient, assetId: string, metric: string, points: { t: string; v: number }[]) {
  const tag = newTag();
  const rows = points.map((p) => ({ asset_id: assetId, source: "sensor", metric, value: p.v, message: tag, created_at: p.t }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from("telemetry_events").insert(rows.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
  return tag;
}

/** The tag of the newest generated or uploaded history for a metric, or null if there is none
 *  (then all readings are used, e.g. older seed data). Alert rows and post-repair checks are skipped. */
export async function latestTag(db: SupabaseClient, assetId: string, metric: string): Promise<string | null> {
  const { data } = await db.from("telemetry_events").select("message").eq("asset_id", assetId).eq("metric", metric).not("value", "is", null)
    .order("created_at", { ascending: false }).limit(60);
  const row = ((data ?? []) as { message: string | null }[]).find((r) => r.message?.startsWith(`${FEED_MSG} `));
  return row?.message ?? null;
}

/** Readings of one history (by tag, or the newest one), oldest first. */
export async function readSeries(db: SupabaseClient, assetId: string, metric: string, days = DAYS, tag?: string | null) {
  const t = tag ?? (await latestTag(db, assetId, metric));
  let q = db.from("telemetry_events").select("value, created_at, message").eq("asset_id", assetId).eq("metric", metric)
    .gte("created_at", new Date(Date.now() - days * 86_400_000).toISOString());
  if (t) q = q.eq("message", t);
  const { data } = await q.order("created_at", { ascending: false }).limit(400);
  return ((data ?? []) as { value: number | null; created_at: string; message: string | null }[])
    .filter((r) => r.value != null && r.message !== "After repair (simulated)")
    .reverse().map((r) => ({ t: r.created_at, v: Number(r.value) }));
}

const g = globalThis as unknown as { __opscrewFeed?: Map<string, number> };
const lastTick = (g.__opscrewFeed ??= new Map());

/** Adds one live reading (at most once a minute) to a history, continuing its recent trend. Safe to call on every poll. */
export async function tickFeed(db: SupabaseClient, assetId: string, metric: string, tag: string) {
  const key = `${assetId}:${metric}:${tag}`;
  if (Date.now() - (lastTick.get(key) ?? 0) < 60_000) return;
  lastTick.set(key, Date.now());
  const pts = (await readSeries(db, assetId, metric, 3, tag)).slice(-24);
  if (pts.length < 3 || Date.now() - Date.parse(pts[pts.length - 1].t) < 55_000) return;
  const fit = linearTrend(pts.map((p) => ({ t: Date.parse(p.t), value: p.v })));
  if (!fit) return;
  const hours = (Date.now() - Date.parse(pts[pts.length - 1].t)) / 3_600_000;
  const spread = Math.max(...pts.map((p) => p.v)) - Math.min(...pts.map((p) => p.v));
  const v = fit.fittedLatest + fit.slopePerHour * hours + noise(Math.max(spread * 0.08, 1e-3));
  await db.from("telemetry_events").insert({ asset_id: assetId, source: "sensor", metric, value: round(v, Math.max(spread, 1)), message: tag, created_at: new Date().toISOString() });
}

/** Parses pasted or uploaded readings: "timestamp,value" lines, or one value per line (spaced an hour apart, ending now). */
export function parseReadings(text: string): { t: string; v: number }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows = lines.map((l) => l.split(/[,;\t]/).map((c) => c.trim())).filter((c) => c.some((x) => x !== "" && Number.isFinite(Number(x))));
  if (!rows.length) return [];
  const timed = rows.every((c) => c.length >= 2 && !Number.isNaN(Date.parse(c[0])) && Number.isFinite(Number(c[c.length - 1])));
  if (timed) return rows.map((c) => ({ t: new Date(Date.parse(c[0])).toISOString(), v: Number(c[c.length - 1]) })).sort((a, b) => a.t.localeCompare(b.t)).slice(-400);
  const values = rows.map((c) => Number(c[c.length - 1])).filter(Number.isFinite).slice(-400);
  const now = Date.now();
  return values.map((v, i) => ({ t: new Date(now - (values.length - 1 - i) * 3_600_000).toISOString(), v }));
}
